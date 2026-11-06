import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('public/player.js', 'utf8');
const master = {
  label: 'Master',
  code: 'E6A003D6 8110DDD5\nA47FB2DC 1AF3CA86',
  enabled: true,
  createdAt: 0,
};
const ram = {
  label: 'RAM',
  code: '82000000 1234',
  enabled: true,
  createdAt: 1,
};

async function boot(cheats: (typeof master)[]) {
  const listeners = new Map<string, (event: unknown) => void>();
  const postMessage = vi.fn();
  const parent = { postMessage };
  const manager = { resetCheat: vi.fn(), setCheat: vi.fn() };
  const win = {
    addEventListener: (name: string, listener: (event: unknown) => void) =>
      listeners.set(name, listener),
    PocketToolbar: { options: {}, install: vi.fn() },
    EJS_emulator: {
      gameManager: manager,
      on: vi.fn(),
      changeSettingOption: vi.fn(),
    },
    EJS_onGameStart: undefined as (() => void) | undefined,
    EJS_cheats: undefined,
  };
  const request = (result: unknown) => {
    const req = { result, onsuccess: undefined as (() => void) | undefined };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  };
  const db = {
    transaction: (store: string) => ({
      objectStore: () => ({
        get: () =>
          request({ id: 'game', hash: '12345678', blob: new Blob(['rom']) }),
        index: () => ({
          getAll: () => request(store === 'cheats' ? [...cheats] : []),
        }),
      }),
    }),
  };
  runInNewContext(source, {
    URL,
    URLSearchParams,
    Error,
    navigator: {},
    parent,
    location: {
      search: '?gameId=game&channel=test',
      origin: 'https://example.com',
      href: 'https://example.com/player.html',
    },
    indexedDB: { open: () => request(db) },
    document: {
      getElementById: () => ({ hidden: true }),
      addEventListener: vi.fn(),
      createElement: () => ({}),
      body: { appendChild: vi.fn() },
    },
    window: win,
  });
  await vi.waitFor(() => expect(win.EJS_onGameStart).toBeTypeOf('function'));
  win.EJS_onGameStart!();
  const update = (next: (typeof master)[]) =>
    listeners.get('message')!({
      origin: 'https://example.com',
      source: parent,
      data: {
        source: 'pocket-gba-app',
        channel: 'test',
        type: 'apply-cheats',
        cheats: next,
      },
    });
  const pending = () =>
    postMessage.mock.calls
      .map(([payload]) => payload)
      .filter((payload) => payload.type === 'cheats-pending')
      .at(-1)?.pending;
  return { manager, win, update, pending };
}

describe('player cheat session safety', () => {
  it('submits all enabled lines once and never sends disabled codes to the core', async () => {
    const { manager, win, update, pending } = await boot([
      master,
      ram,
      { ...ram, code: '82000002 5678', enabled: false },
    ]);
    expect(win.EJS_cheats).toEqual([]);
    expect(manager.setCheat).toHaveBeenCalledExactlyOnceWith(
      0,
      true,
      'E6A003D6 8110DDD5+A47FB2DC 1AF3CA86+82000000 1234',
    );
    update([master, ram]);
    expect(pending()).toBe(false);
    update([{ ...master, enabled: false }, ram]);
    expect(pending()).toBe(true);
    update([master, ram]);
    expect(pending()).toBe(false);
    expect(manager.setCheat).toHaveBeenCalledOnce();
    expect(manager.resetCheat).not.toHaveBeenCalled();
  });

  it('queues new enabled codes until a new session, even when none launched', async () => {
    const { manager, update, pending } = await boot([]);
    update([master]);
    expect(pending()).toBe(true);
    update([{ ...master, enabled: false }]);
    expect(pending()).toBe(false);
    expect(manager.setCheat).not.toHaveBeenCalled();
    expect(manager.resetCheat).not.toHaveBeenCalled();
  });

  it('does not treat label changes as native changes', async () => {
    const { manager, update, pending } = await boot([ram]);
    update([{ ...ram, label: 'Renamed' }]);
    expect(pending()).toBe(false);
    expect(manager.setCheat).toHaveBeenCalledOnce();
  });
});
