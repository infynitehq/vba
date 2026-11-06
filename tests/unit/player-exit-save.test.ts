import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('public/player.js', 'utf8');
const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
};

async function boot({
  enabled = true,
  checkpoint = null as unknown,
  resume = Promise.resolve(true),
} = {}) {
  const indexedDB = new IDBFactory();
  const open = indexedDB.open('pocket-gba', 1);
  open.onupgradeneeded = () => {
    open.result.createObjectStore('games', { keyPath: 'id' });
    open.result
      .createObjectStore('cheats', { keyPath: 'id' })
      .createIndex('gameId', 'gameId');
  };
  const db = await request(open);
  await request(
    db
      .transaction('games', 'readwrite')
      .objectStore('games')
      .put({
        id: 'game',
        hash: '12345678',
        blob: new Blob(['rom']),
        autoSaveOnExit: enabled,
      }),
  );
  const listeners = new Map<string, (event?: unknown) => Promise<void>>();
  const documentListeners = new Map<string, () => void>();
  const native = new Map<string, (data?: unknown) => unknown>();
  const postMessage = vi.fn();
  const parent = { postMessage };
  const checkpoints = {
    load: vi.fn().mockResolvedValue(checkpoint),
    save: vi.fn().mockResolvedValue(undefined),
    offerResume: vi.fn().mockReturnValue(resume),
  };
  const manager = {
    saveSaveFiles: vi.fn(),
    getState: vi.fn(() => new Uint8Array([1, 2, 3])),
    loadState: vi.fn(),
    FS: {
      syncfs: vi.fn((_populate: boolean, done: (error?: Error) => void) =>
        done(),
      ),
    },
  };
  const emulator = {
    paused: false,
    isFastForward: false,
    isSlowMotion: false,
    getSettingValue: vi.fn(),
    changeSettingOption: vi.fn(),
    on: (name: string, callback: (data?: unknown) => unknown) =>
      native.set(name, callback),
    gameManager: manager,
    pause: vi.fn(() => (emulator.paused = true)),
    play: vi.fn(() => (emulator.paused = false)),
    displayMessage: vi.fn(),
  };
  const install = vi.fn();
  const win = {
    PocketCheckpoints: checkpoints,
    PocketToolbar: { options: {}, install },
    EJS_emulator: emulator,
    EJS_onGameStart: undefined as (() => void) | undefined,
    EJS_Buttons: undefined as
      { exitEmulation: { callback: () => Promise<void> } } | undefined,
    addEventListener: (
      name: string,
      callback: (event?: unknown) => Promise<void>,
    ) => listeners.set(name, callback),
  };
  const document = {
    hidden: false,
    getElementById: () => ({ hidden: true, textContent: '' }),
    addEventListener: (name: string, callback: () => void) =>
      documentListeners.set(name, callback),
    createElement: () => ({}),
    body: { appendChild: vi.fn() },
  };
  runInNewContext(source, {
    window: win,
    document,
    indexedDB,
    parent,
    URL,
    URLSearchParams,
    Uint8Array,
    navigator: {},
    location: {
      search: '?gameId=game&channel=test',
      origin: 'https://example.com',
      href: 'https://example.com/player.html',
    },
  });
  await vi.waitFor(() => expect(win.EJS_onGameStart).toBeTypeOf('function'));
  win.EJS_onGameStart!();
  // Allow an empty checkpoint read to settle, without awaiting an open prompt.
  await Promise.resolve();
  await Promise.resolve();
  const exit = () =>
    listeners.get('message')!({
      origin: 'https://example.com',
      source: parent,
      data: {
        source: 'pocket-gba-app',
        channel: 'test',
        type: 'exit',
      },
    });
  const messages = (type: string) =>
    postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === type);
  const background = () => {
    document.hidden = true;
    documentListeners.get('visibilitychange')!();
  };
  return {
    db,
    manager,
    emulator,
    checkpoints,
    install,
    win,
    exit,
    messages,
    background,
    listeners,
    native,
  };
}

describe('exit saves', () => {
  it('waits for both battery persistence and checkpoint commit before exiting', async () => {
    const app = await boot();
    const saved = deferred<void>();
    let sync!: (error?: Error) => void;
    app.checkpoints.save.mockReturnValue(saved.promise);
    app.manager.FS.syncfs.mockImplementation((_populate, done) => {
      sync = done;
    });
    const exiting = app.exit();
    await vi.waitFor(() => expect(app.checkpoints.save).toHaveBeenCalledOnce());
    expect(app.messages('request-exit')).toHaveLength(0);
    saved.resolve();
    await Promise.resolve();
    expect(app.messages('request-exit')).toHaveLength(0);
    sync();
    await exiting;
    expect(app.messages('request-exit')).toHaveLength(1);
    expect(app.emulator.paused).toBe(true);
    app.db.close();
  });

  it('keeps the game open on checkpoint failure and allows retry', async () => {
    const app = await boot();
    app.checkpoints.save.mockRejectedValueOnce(new Error('Quota exceeded'));
    await app.exit();
    expect(app.messages('request-exit')).toHaveLength(0);
    expect(app.messages('error').at(-1)?.message).toContain('still open');
    expect(app.emulator.paused).toBe(false);
    await app.exit();
    expect(app.messages('request-exit')).toHaveLength(1);
    app.db.close();
  });

  it('still saves the snapshot if the battery filesystem fails', async () => {
    const app = await boot();
    app.manager.FS.syncfs.mockImplementation((_populate, done) => {
      done(new Error('Disk full'));
    });
    await app.exit();
    expect(app.checkpoints.save).toHaveBeenCalledOnce();
    expect(app.messages('request-exit')).toHaveLength(0);
    app.db.close();
  });

  it('still flushes battery data if state capture throws', async () => {
    const app = await boot();
    app.manager.getState.mockImplementation(() => {
      throw new Error('State unsupported');
    });
    await app.exit();
    expect(app.manager.FS.syncfs).toHaveBeenCalledOnce();
    expect(app.checkpoints.save).not.toHaveBeenCalled();
    expect(app.messages('request-exit')).toHaveLength(0);
    app.db.close();
  });

  it('respects the per-game opt-out while still saving battery data', async () => {
    const app = await boot({ enabled: false });
    await app.exit();
    expect(app.manager.getState).not.toHaveBeenCalled();
    expect(app.checkpoints.load).not.toHaveBeenCalled();
    expect(app.checkpoints.save).not.toHaveBeenCalled();
    expect(app.manager.FS.syncfs).toHaveBeenCalledOnce();
    expect(app.messages('request-exit')).toHaveLength(1);
    app.db.close();
  });

  it('uses the same awaited save for the native and More-menu exits', async () => {
    const app = await boot();
    const options = app.install.mock.calls[0][1];
    expect(options.onExit).toBe(app.win.EJS_Buttons!.exitEmulation.callback);
    await options.onExit();
    expect(app.checkpoints.save).toHaveBeenCalledOnce();
    expect(app.messages('request-exit')).toHaveLength(1);
    app.db.close();
  });

  it('does not replace a checkpoint while the resume prompt is pending', async () => {
    const pending = deferred<boolean>();
    const app = await boot({
      checkpoint: { version: 1, state: new Uint8Array([42]), savedAt: 1 },
      resume: pending.promise,
    });
    app.background();
    expect(app.manager.getState).not.toHaveBeenCalled();
    expect(app.checkpoints.save).not.toHaveBeenCalled();
    expect(app.emulator.paused).toBe(true);
    pending.resolve(true);
    await vi.waitFor(() =>
      expect(app.manager.loadState).toHaveBeenCalledOnce(),
    );
    expect(app.manager.loadState).toHaveBeenCalledWith(new Uint8Array([42]));
    expect(app.checkpoints.save).not.toHaveBeenCalled();
    app.db.close();
  });

  it('persists the toggle without changing other game fields', async () => {
    const app = await boot();
    const options = app.install.mock.calls[0][1];
    await options.onAutoSaveChange(false);
    const game = await request(
      app.db.transaction('games').objectStore('games').get('game'),
    );
    expect(game.autoSaveOnExit).toBe(false);
    expect(game.hash).toBe('12345678');
    await app.exit();
    expect(app.checkpoints.save).not.toHaveBeenCalled();
    app.db.close();
  });
});
