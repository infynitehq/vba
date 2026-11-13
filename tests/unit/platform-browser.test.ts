import { afterEach, expect, it, vi } from 'vitest';
import { openExternal, pickFile, saveFile } from '../../src/platform/browser';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('opens browser external links without granting an opener reference', async () => {
  const open = vi.fn();
  vi.stubGlobal('window', { open });
  await openExternal('https://github.com/infynitehq/vba');
  expect(open).toHaveBeenCalledExactlyOnceWith(
    'https://github.com/infynitehq/vba',
    '_blank',
    'noopener,noreferrer',
  );
});

it('keeps the browser download behavior and revokes its object URL', async () => {
  vi.useFakeTimers();
  const anchor = { href: '', download: '', click: vi.fn() };
  vi.stubGlobal('document', { createElement: () => anchor });
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const blob = new Blob(['backup']);
  expect(await saveFile(blob, 'cheats.json')).toBe(true);
  expect(create).toHaveBeenCalledWith(blob);
  expect(anchor.download).toBe('cheats.json');
  expect(anchor.href).toBe('blob:test');
  expect(anchor.click).toHaveBeenCalledOnce();
  vi.runAllTimers();
  expect(revoke).toHaveBeenCalledWith('blob:test');
});

it('resolves browser picker cancellation without importing anything', async () => {
  const listeners = new Map<string, () => void>();
  const input = {
    type: '',
    hidden: false,
    accept: '',
    remove: vi.fn(),
    addEventListener: (name: string, handler: () => void) =>
      listeners.set(name, handler),
    click: () => listeners.get('cancel')!(),
  };
  vi.stubGlobal('document', {
    createElement: () => input,
    body: { append: vi.fn() },
  });
  expect(await pickFile('cheats')).toBeNull();
  expect(input.accept).toBe('.json,application/json');
  expect(input.remove).toHaveBeenCalledOnce();
});
