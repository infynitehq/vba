import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('public/player.js', 'utf8');
async function boot(start = true) {
  const indexedDB = new IDBFactory();
  const open = indexedDB.open('pocket-gba', 1);
  open.onupgradeneeded = () => {
    open.result.createObjectStore('games', { keyPath: 'id' });
    open.result
      .createObjectStore('cheats', { keyPath: 'id' })
      .createIndex('gameId', 'gameId');
  };
  const db = await new Promise<IDBDatabase>((resolve) => {
    open.onsuccess = () => resolve(open.result);
  });
  const tx = db.transaction('games', 'readwrite');
  tx.objectStore('games').put({
    id: 'game',
    hash: '12345678',
    blob: new Blob(['rom']),
    size: 3,
  });
  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
  });
  const listeners = new Map<string, (event: unknown) => Promise<void>>();
  const parent = { postMessage: vi.fn() };
  const checkpoints = {
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    offerResume: vi.fn().mockResolvedValue(true),
  };
  const manager = {
    saveSaveFiles: vi.fn(),
    getState: vi.fn(() => new Uint8Array([42])),
    loadState: vi.fn(),
    FS: {
      syncfs: vi.fn((_populate: boolean, done: (error?: Error) => void) =>
        done(),
      ),
    },
  };
  const events = new Map<
    string,
    (payload?: { state: Uint8Array }) => Promise<void>
  >();
  const emulator = {
    paused: false,
    gameManager: manager,
    on: vi.fn(
      (
        name: string,
        callback: (payload?: { state: Uint8Array }) => Promise<void>,
      ) => events.set(name, callback),
    ),
    getSettingValue: vi.fn(),
    saveInBrowserSupported: vi.fn(() => true),
    getBaseFileName: vi.fn(() => 'game'),
    localization: vi.fn((message: string) => message),
    storage: {
      states: {
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(new Uint8Array([7])),
      },
    },
    changeSettingOption: vi.fn(),
    displayMessage: vi.fn(),
    pause: vi.fn(() => {
      emulator.paused = true;
    }),
    play: vi.fn(() => {
      emulator.paused = false;
    }),
  };
  const win = {
    PocketCheckpoints: checkpoints,
    PocketToolbar: { options: {}, install: vi.fn() },
    EJS_emulator: emulator,
    EJS_onGameStart: undefined as undefined | (() => void),
    addEventListener: (
      name: string,
      listener: (event: unknown) => Promise<void>,
    ) => listeners.set(name, listener),
  };
  runInNewContext(source, {
    window: win,
    parent,
    indexedDB,
    URL,
    URLSearchParams,
    Uint8Array,
    ArrayBuffer,
    crypto,
    setTimeout,
    clearTimeout,
    navigator: {},
    location: {
      search: '?gameId=game&channel=secret&desktop=1',
      origin: 'https://app.test',
      href: 'https://app.test/player.html',
    },
    document: {
      getElementById: () => ({ hidden: true, textContent: '' }),
      addEventListener: vi.fn(),
      createElement: () => ({}),
      body: { appendChild: vi.fn() },
    },
  });
  await vi.waitFor(() => expect(win.EJS_onGameStart).toBeTypeOf('function'));
  const startGame = async () => {
    win.EJS_onGameStart!();
    await Promise.resolve();
    await Promise.resolve();
  };
  if (start) await startGame();
  const send = (type: string, requestId = 'close-1', overrides = {}) =>
    listeners.get('message')!({
      origin: 'https://app.test',
      source: parent,
      data: {
        source: 'pocket-gba-app',
        channel: 'secret',
        type,
        requestId,
        ...overrides,
      },
    });
  const messages = (type: string) =>
    parent.postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === type);
  return {
    db,
    emulator,
    manager,
    checkpoints,
    send,
    messages,
    startGame,
    events,
  };
}

describe('player desktop prepare-close', () => {
  it('acknowledges only after both durable writes and never navigates', async () => {
    const app = await boot();
    let commit!: () => void;
    app.checkpoints.save.mockReturnValue(
      new Promise<void>((resolve) => {
        commit = resolve;
      }),
    );
    const closing = app.send('prepare-close');
    await vi.waitFor(() => expect(app.checkpoints.save).toHaveBeenCalledOnce());
    expect(app.messages('close-prepared')).toHaveLength(0);
    expect(app.emulator.paused).toBe(true);
    commit();
    await closing;
    expect(app.messages('close-prepared')[0].requestId).toBe('close-1');
    expect(app.messages('request-exit')).toHaveLength(0);
    await app.send('prepare-close', 'close-2');
    expect(app.checkpoints.save).toHaveBeenCalledOnce();
    await app.send('cancel-close', 'close-2');
    expect(app.emulator.paused).toBe(false);
    app.db.close();
  });

  it('reports persistence failure, resumes, and allows a retry', async () => {
    const app = await boot();
    app.checkpoints.save.mockRejectedValueOnce(new Error('Disk full'));
    await app.send('prepare-close');
    expect(app.messages('close-failed')).toHaveLength(1);
    expect(app.messages('close-prepared')).toHaveLength(0);
    expect(app.emulator.paused).toBe(false);
    await app.send('prepare-close', 'retry');
    expect(app.messages('close-prepared')).toHaveLength(1);
    app.db.close();
  });

  it('safely acknowledges before the emulator has started', async () => {
    const app = await boot(false);
    await app.send('prepare-close');
    expect(app.messages('close-prepared')).toHaveLength(1);
    expect(app.manager.getState).not.toHaveBeenCalled();
    expect(app.manager.FS.syncfs).not.toHaveBeenCalled();
    app.db.close();
  });

  it('cancels a pending resume without overwriting the stored snapshot', async () => {
    const app = await boot(false);
    let resume!: (value: boolean) => void;
    app.checkpoints.load.mockResolvedValue({ state: new Uint8Array([99]) });
    app.checkpoints.offerResume.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resume = resolve;
      }),
    );
    await app.startGame();
    const closing = app.send('prepare-close');
    await app.send('cancel-close');
    expect(app.manager.getState).not.toHaveBeenCalled();
    resume(true);
    await closing;
    expect(app.checkpoints.save).not.toHaveBeenCalled();
    expect(app.messages('close-prepared')).toHaveLength(0);
    expect(app.emulator.paused).toBe(false);
    await app.send('prepare-close', 'retry-after-prompt');
    expect(app.messages('close-prepared')).toHaveLength(1);
    app.db.close();
  });

  it('immediately resumes on timeout cancellation, even if disk writes hang', async () => {
    const app = await boot();
    let sync!: () => void;
    app.manager.FS.syncfs.mockImplementation((_populate, done) => {
      sync = done;
    });
    const closing = app.send('prepare-close');
    await vi.waitFor(() => expect(app.emulator.paused).toBe(true));
    await app.send('cancel-close');
    expect(app.emulator.paused).toBe(false);
    sync();
    await closing;
    expect(app.messages('close-prepared')).toHaveLength(0);
    app.db.close();
  });

  it('rejects wrong channels and malformed request ids', async () => {
    const app = await boot();
    await app.send('prepare-close', 'close', { channel: 'wrong' });
    await app.send('prepare-close', '');
    await app.send('prepare-close', 'x'.repeat(201));
    expect(app.checkpoints.save).not.toHaveBeenCalled();
    expect(app.messages('close-prepared')).toHaveLength(0);
    app.db.close();
  });
});

describe('desktop manual states', () => {
  it('awaits the local browser slot before confirming save', async () => {
    const app = await boot();
    app.emulator.getSettingValue.mockReturnValue('browser');
    let commit!: () => void;
    app.emulator.storage.states.put.mockReturnValue(
      new Promise<void>((resolve) => {
        commit = resolve;
      }),
    );
    const state = new Uint8Array([1, 2]);
    const saving = app.events.get('saveState')!({ state });
    expect(app.emulator.storage.states.put).toHaveBeenCalledWith(
      'game.state',
      state,
    );
    expect(app.emulator.displayMessage).not.toHaveBeenCalled();
    expect(app.messages('export-file')).toHaveLength(0);
    commit();
    await saving;
    expect(app.emulator.displayMessage).toHaveBeenCalledWith(
      'SAVE SAVED TO BROWSER',
    );
    app.db.close();
  });

  it('restores the existing local slot without opening a native picker', async () => {
    const app = await boot();
    app.emulator.getSettingValue.mockReturnValue('browser');
    await app.events.get('loadState')!();
    expect(app.emulator.storage.states.get).toHaveBeenCalledWith('game.state');
    expect(app.manager.loadState).toHaveBeenCalledWith(new Uint8Array([7]));
    expect(app.emulator.displayMessage).toHaveBeenCalledWith(
      'SAVE LOADED FROM BROWSER',
    );
    expect(app.messages('import-file')).toHaveLength(0);
    app.db.close();
  });

  it('reports an absent local slot rather than silently cancelling or opening a picker', async () => {
    const app = await boot();
    app.emulator.getSettingValue.mockReturnValue('browser');
    app.emulator.storage.states.get.mockResolvedValue(undefined);
    await app.events.get('loadState')!();
    expect(app.messages('error').at(-1)?.message).toContain('no saved state');
    expect(app.messages('import-file')).toHaveLength(0);
    app.db.close();
  });

  it('uses native files only for file location or unsupported browser storage', async () => {
    const app = await boot();
    app.emulator.getSettingValue.mockReturnValue('file');
    const saving = app.events.get('saveState')!({ state: new Uint8Array([8]) });
    const exported = app.messages('export-file')[0];
    expect(exported.name).toBe('game.state');
    await app.send('export-result', exported.requestId, { ok: true });
    await saving;
    app.emulator.getSettingValue.mockReturnValue('browser');
    app.emulator.saveInBrowserSupported.mockReturnValue(false);
    const loading = app.events.get('loadState')!();
    const imported = app.messages('import-file')[0];
    expect(imported.kind).toBe('state');
    await app.send('import-result', imported.requestId, {
      ok: true,
      bytes: new Uint8Array([9]),
    });
    await loading;
    expect(app.manager.loadState).toHaveBeenCalledWith(new Uint8Array([9]));
    expect(app.emulator.storage.states.get).not.toHaveBeenCalled();
    expect(app.emulator.storage.states.put).not.toHaveBeenCalled();
    app.db.close();
  });
});
