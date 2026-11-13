import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('public/player.js', 'utf8');

async function boot(blob: unknown, size = 3) {
  const message = { hidden: true, textContent: '' };
  const appendChild = vi.fn();
  const win = {
    addEventListener: vi.fn(),
    PocketToolbar: { options: {} },
    EJS_gameUrl: undefined as Uint8Array | undefined,
  };
  const request = (result: unknown) => {
    const req = { result, onsuccess: undefined as (() => void) | undefined };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  };
  const db = {
    transaction: () => ({
      objectStore: () => ({
        get: () => request({ id: 'game', hash: '12345678', blob, size }),
        index: () => ({ getAll: () => request([]) }),
      }),
    }),
  };
  runInNewContext(source, {
    URL,
    URLSearchParams,
    ArrayBuffer,
    Uint8Array,
    Error,
    navigator: {},
    parent: { postMessage: vi.fn() },
    location: {
      search: '?gameId=game',
      origin: 'https://example.com',
      href: 'https://example.com/player.html',
    },
    indexedDB: { open: () => request(db) },
    document: {
      getElementById: () => message,
      addEventListener: vi.fn(),
      createElement: () => ({}),
      body: { appendChild },
    },
    window: win,
  });
  await vi.waitFor(() =>
    expect(appendChild.mock.calls.length || message.textContent).toBeTruthy(),
  );
  return { message, appendChild, win };
}

describe('stored ROM loading', () => {
  it('passes persisted binary data directly to the emulator', async () => {
    const { win, appendChild } = await boot(new Uint8Array([1, 2, 3]).buffer);
    expect(win.EJS_gameUrl).toEqual(new Uint8Array([1, 2, 3]));
    expect(appendChild).toHaveBeenCalledOnce();
  });

  it('keeps existing readable Blob libraries compatible', async () => {
    const { win } = await boot(new Blob([new Uint8Array([1, 2, 3])]));
    expect(win.EJS_gameUrl).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('explains safe repair when Safari loses the stored Blob backing data', async () => {
    const { message, appendChild } = await boot({
      arrayBuffer: () =>
        Promise.reject(
          new DOMException(
            'The object can not be found here.',
            'NotFoundError',
          ),
        ),
    });
    expect(message.textContent).toContain('select the same original game file');
    expect(message.textContent).toContain('saves and cheats will be kept');
    expect(appendChild).not.toHaveBeenCalled();
  });

  it('rejects incomplete ROM data before loading the emulator', async () => {
    const { message, appendChild } = await boot(new ArrayBuffer(0));
    expect(message.textContent).toContain('stored game file could not be read');
    expect(appendChild).not.toHaveBeenCalled();
  });
});
