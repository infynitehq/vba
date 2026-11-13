import { afterEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
import { openExternal, pickFile, saveFile } from '../../src/platform/native';

afterEach(() => vi.resetAllMocks());

describe('native file adapter', () => {
  it('opens approved links using only the scoped Rust command', async () => {
    invoke.mockResolvedValue(undefined);
    await openExternal('https://github.com/infynitehq/vba');
    expect(invoke).toHaveBeenCalledExactlyOnceWith('open_external', {
      url: 'https://github.com/infynitehq/vba',
    });
  });

  it('propagates external URL rejection from the Rust allowlist', async () => {
    invoke.mockRejectedValue(new Error('URL is not approved'));
    await expect(openExternal('https://example.com')).rejects.toThrow(
      'URL is not approved',
    );
  });

  it.each(['rom', 'cheats', 'battery', 'state'] as const)(
    'imports %s through the scoped command',
    async (kind) => {
      invoke.mockResolvedValue({ name: 'game.gba', bytes: [0, 128, 255] });
      const file = await pickFile(kind);
      expect(invoke).toHaveBeenCalledWith('import_file', { kind });
      expect(file?.name).toBe('game.gba');
      expect(Array.from(new Uint8Array(await file!.arrayBuffer()))).toEqual([
        0, 128, 255,
      ]);
    },
  );

  it('returns null when import is cancelled', async () => {
    invoke.mockResolvedValue(null);
    expect(await pickFile('cheats')).toBeNull();
  });

  it('sends bytes and filename, not filesystem paths', async () => {
    invoke.mockResolvedValue(true);
    expect(
      await saveFile(new Blob([new Uint8Array([1, 255])]), 'save.sav'),
    ).toBe(true);
    expect(invoke).toHaveBeenCalledWith('export_file', {
      name: 'save.sav',
      bytes: [1, 255],
    });
  });

  it('preserves byte view boundaries and export cancellation', async () => {
    invoke.mockResolvedValue(false);
    const bytes = new Uint8Array([0, 1, 2, 3]).subarray(1, 3);
    expect(await saveFile(bytes, 'save.state')).toBe(false);
    expect(invoke).toHaveBeenCalledWith('export_file', {
      name: 'save.state',
      bytes: [1, 2],
    });
  });

  it('propagates native errors', async () => {
    invoke.mockRejectedValue(new Error('Permission denied'));
    await expect(pickFile('rom')).rejects.toThrow('Permission denied');
    await expect(saveFile(new Blob(), 'file')).rejects.toThrow(
      'Permission denied',
    );
  });
});
