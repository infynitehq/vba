import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('public/player.js', 'utf8');

async function boot() {
  const listeners = new Map<string, (event: unknown) => void>();
  const settings: Record<string, string> = { fastForward: 'disabled' };
  let now = 0;
  const parent = { postMessage: vi.fn() };
  const emulator = {
    isFastForward: false,
    isSlowMotion: false,
    settingsMenu: { style: { display: 'none' } },
    isPopupOpen: () => false,
    getSettingValue: (key: string) => settings[key],
    changeSettingOption: (key: string, value: string) => {
      settings[key] = value;
    },
    gameManager: { toggleFastForward: vi.fn(), toggleSlowMotion: vi.fn() },
    on: vi.fn(),
  };
  const request = (result: unknown) => {
    const req = { result, onsuccess: undefined as (() => void) | undefined };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  };
  const win = {
    EJS_emulator: emulator,
    EJS_onGameStart: undefined as (() => void) | undefined,
    PocketToolbar: { options: {}, install: vi.fn() },
    addEventListener: (name: string, listener: (event: unknown) => void) =>
      listeners.set(name, listener),
  };
  runInNewContext(source, {
    URL,
    URLSearchParams,
    Error,
    Element: class {},
    navigator: {},
    parent,
    performance: { now: () => now },
    location: {
      search: '?gameId=game&channel=test',
      origin: 'https://example.com',
      href: 'https://example.com/player.html',
    },
    indexedDB: {
      open: () =>
        request({
          transaction: () => ({
            objectStore: () => ({
              get: () =>
                request({
                  id: 'game',
                  hash: '12345678',
                  blob: new Blob(['rom']),
                }),
              index: () => ({ getAll: () => request([]) }),
            }),
          }),
        }),
    },
    document: {
      getElementById: () => ({}),
      addEventListener: vi.fn(),
      querySelector: () => null,
      createElement: () => ({}),
      body: { appendChild: vi.fn() },
    },
    window: win,
  });
  await vi.waitFor(() => expect(win.EJS_onGameStart).toBeTypeOf('function'));
  win.EJS_onGameStart!();
  const key = (held: boolean, app = false, repeat = false) => {
    if (app)
      listeners.get('message')!({
        origin: 'https://example.com',
        source: parent,
        data: {
          source: 'pocket-gba-app',
          channel: 'test',
          type: 'fast-forward-held',
          held,
        },
      });
    else
      listeners.get(held ? 'keydown' : 'keyup')!({
        code: 'Space',
        repeat,
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      });
  };
  const tap = (app = false) => {
    key(true, app);
    now += 50;
    key(false, app);
    now += 50;
  };
  return {
    emulator,
    settings,
    key,
    tap,
    advance: (ms: number) => {
      now += ms;
    },
    blur: () => listeners.get('blur')!({}),
  };
}

describe('Space speed shortcuts', () => {
  it.each([false, true])(
    'double-tap toggles persistent speed (parent: %s)',
    async (app) => {
      const game = await boot();
      game.tap(app);
      expect(game.emulator.isFastForward).toBe(false);
      game.tap(app);
      expect(game.settings.fastForward).toBe('enabled');
      expect(game.settings['ff-ratio']).toBe('3.0');
      expect(game.emulator.isFastForward).toBe(true);
      game.tap(app);
      game.tap(app);
      expect(game.settings.fastForward).toBe('disabled');
      expect(game.emulator.isFastForward).toBe(false);
    },
  );

  it('keeps long holds, repeats, slow taps, and focus loss from toggling speed', async () => {
    const game = await boot();
    game.key(true);
    game.key(true, false, true);
    expect(game.emulator.isFastForward).toBe(true);
    game.advance(400);
    game.key(false);
    game.tap();
    expect(game.settings.fastForward).toBe('disabled');
    game.advance(400);
    game.tap();
    expect(game.settings.fastForward).toBe('disabled');
    game.blur();
    game.tap();
    expect(game.settings.fastForward).toBe('disabled');
  });
});
