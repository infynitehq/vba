import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const source = readFileSync('public/player.js', 'utf8');

function boot(navigator: object, search = '') {
  runInNewContext(source, {
    URLSearchParams,
    Error,
    navigator,
    location: { search, origin: 'https://example.com' },
    parent: { postMessage: vi.fn() },
    document: {
      getElementById: () => ({ hidden: true, textContent: '' }),
      addEventListener: vi.fn(),
    },
    window: { addEventListener: vi.fn() },
  });
}

it('leaves desktop wake-lock ownership to the parent shell without calling the core API', () => {
  const request = vi.fn();
  const navigator = Object.create(
    Object.defineProperty({}, 'wakeLock', { get: () => ({ request }) }),
  );
  boot(navigator, '?desktop=1');
  expect(navigator.wakeLock).toBeUndefined();
  expect(request).not.toHaveBeenCalled();
});

it('handles optional wake-lock rejection even with a read-only inherited method', async () => {
  const original = Promise.reject(
    new DOMException('Permission was denied', 'NotAllowedError'),
  );
  const request = vi.fn(() => original);
  const prototype = Object.defineProperty({}, 'request', { value: request });
  const wakeLock = Object.create(prototype);
  const catchSpy = vi.spyOn(original, 'catch');
  boot({ wakeLock });
  expect(wakeLock.request('screen')).toBe(original);
  expect(request).toHaveBeenCalledWith('screen');
  expect(catchSpy).toHaveBeenCalled();
  await expect(original).rejects.toThrow('Permission was denied');
});
