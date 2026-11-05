import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('public/player.js', 'utf8');

function boot(wakeLock?: { request: (...args: unknown[]) => unknown }) {
  const listeners = new Map<string, (event: unknown) => void>();
  const message = { hidden: true, textContent: '' };
  const postMessage = vi.fn();
  runInNewContext(source, {
    URLSearchParams,
    Error,
    navigator: { wakeLock },
    location: { search: '', origin: 'https://example.com' },
    parent: { postMessage },
    document: { getElementById: () => message, addEventListener: vi.fn() },
    window: {
      addEventListener: (name: string, listener: (event: unknown) => void) =>
        listeners.set(name, listener),
    },
  });
  return { listeners, message, postMessage };
}

describe('player wake lock', () => {
  it('handles Safari denial at the request without changing the returned promise', async () => {
    const denial = new DOMException('Permission was denied', 'NotAllowedError');
    const result = Promise.reject(denial);
    const catchRejection = vi.spyOn(result, 'catch');
    const wakeLock = {
      request: vi.fn(function (this: unknown, type: unknown) {
        expect(this).toBe(wakeLock);
        expect(type).toBe('screen');
        return result;
      }),
    };
    boot(wakeLock);
    expect(wakeLock.request('screen')).toBe(result);
    expect(catchRejection).toHaveBeenCalledOnce();
    await expect(result).rejects.toBe(denial);
  });

  it('preserves successful requests', async () => {
    const sentinel = { release: vi.fn() };
    const wakeLock = { request: () => Promise.resolve(sentinel) };
    boot(wakeLock);
    await expect(wakeLock.request()).resolves.toBe(sentinel);
  });

  it('does not swallow unrelated permission errors', () => {
    const { listeners, message } = boot();
    listeners.get('unhandledrejection')!({
      reason: new Error('Permission was denied'),
    });
    expect(message.hidden).toBe(false);
    expect(message.textContent).toBe('Permission was denied');
  });
});
