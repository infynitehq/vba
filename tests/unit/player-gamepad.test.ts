import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('public/player.js', 'utf8');

function boot(navigator: Record<string, unknown>) {
  const warn = vi.fn();
  runInNewContext(source, {
    URLSearchParams,
    Error,
    navigator,
    console: { warn },
    location: { search: '?desktop=1', origin: 'https://example.com' },
    parent: { postMessage: vi.fn() },
    document: {
      getElementById: () => ({ hidden: true, textContent: '' }),
      addEventListener: vi.fn(),
    },
    window: { addEventListener: vi.fn() },
  });
  return warn;
}

describe('optional gamepad access', () => {
  it.each(['SecurityError', 'NotAllowedError'])(
    'keeps polling after %s and recovers when access becomes available',
    (name) => {
      const controllers = [{ id: 'controller' }];
      const getGamepads = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new DOMException('Permission was denied', name);
        })
        .mockReturnValue(controllers);
      const navigator = { getGamepads };
      const warn = boot(navigator);
      expect(navigator.getGamepads()).toEqual([]);
      expect(navigator.getGamepads()).toBe(controllers);
      expect(getGamepads).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledOnce();
    },
  );

  it('preserves successful results and the native receiver', () => {
    const controllers = [{ id: 'controller' }];
    const navigator = {
      getGamepads: vi.fn(function (this: unknown) {
        expect(this).toBe(navigator);
        return controllers;
      }),
    };
    const warn = boot(navigator);
    expect(navigator.getGamepads()).toBe(controllers);
    expect(warn).not.toHaveBeenCalled();
  });

  it('handles denial on later polls without spamming warnings', () => {
    const navigator = {
      webkitGetGamepads: vi
        .fn()
        .mockReturnValueOnce([])
        .mockImplementation(() => {
          throw new DOMException('Permission was denied', 'SecurityError');
        }),
    };
    const warn = boot(navigator);
    expect(navigator.webkitGetGamepads()).toEqual([]);
    expect(navigator.webkitGetGamepads()).toEqual([]);
    expect(navigator.webkitGetGamepads()).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('does not hide unexpected errors', () => {
    const failure = new TypeError('Unexpected controller failure');
    const navigator = {
      getGamepads: () => {
        throw failure;
      },
    };
    const warn = boot(navigator);
    expect(() => navigator.getGamepads()).toThrow(failure);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not add a gamepad API when one is unavailable', () => {
    const navigator = {};
    boot(navigator);
    expect(navigator).not.toHaveProperty('getGamepads');
    expect(navigator).not.toHaveProperty('webkitGetGamepads');
  });
});
