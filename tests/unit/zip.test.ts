import { afterEach, expect, it, vi } from 'vitest';
import { zipSync, unzip, type UnzipOptions } from 'fflate';
import { MAX_ROM_BYTES, readGameFile } from '../../src/lib/zip';

vi.mock('fflate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fflate')>();
  return { ...actual, unzip: vi.fn(actual.unzip) };
});

afterEach(() => vi.clearAllMocks());

function archive(entries: Record<string, Uint8Array>) {
  return new File([zipSync(entries)], 'game.zip');
}

it('rejects many highly compressed ROMs in a non-inflating preflight', async () => {
  const file = archive({
    'one.gba': new Uint8Array(1024 * 1024),
    'two.gba': new Uint8Array(1024 * 1024),
    'three.gba': new Uint8Array(1024 * 1024),
  });
  expect(file.size).toBeLessThan(4096);
  await expect(readGameFile(file)).rejects.toThrow('exactly one .gba');
  expect(unzip).toHaveBeenCalledOnce();
  const options = vi.mocked(unzip).mock.calls[0][1] as unknown as UnzipOptions;
  expect(
    options.filter!({
      name: 'another.gba',
      size: 100,
      originalSize: MAX_ROM_BYTES,
      compression: 8,
    }),
  ).toBe(false);
});

it('imports a single ROM and ignores unrelated entries and macOS metadata', async () => {
  const bytes = new Uint8Array([0, 128, 255]);
  const result = await readGameFile(
    archive({
      'folder/own.GBA': bytes,
      '__MACOSX/own.gba': new Uint8Array([1]),
      'readme.txt': new Uint8Array([2]),
    }),
  );
  expect(result.filename).toBe('own.GBA');
  expect(new Uint8Array(result.buffer)).toEqual(bytes);
  expect(unzip).toHaveBeenCalledTimes(2);
});

it('rejects oversized declared ROMs before decompression', async () => {
  const bytes = zipSync({ 'own.gba': new Uint8Array([1]) });
  const view = new DataView(bytes.buffer);
  for (let offset = 0; offset < bytes.length - 24; offset++) {
    if (view.getUint32(offset, true) === 0x02014b50) {
      view.setUint32(offset + 24, MAX_ROM_BYTES + 1, true);
      break;
    }
  }
  await expect(
    readGameFile(new File([bytes], 'oversized.zip')),
  ).rejects.toThrow('exceeds 64 MB');
  expect(unzip).toHaveBeenCalledOnce();
});

it('preserves the inclusive 64 MiB input limit', async () => {
  const buffer = new Uint8Array([1]).buffer;
  const accepted = {
    name: 'own.gba',
    size: MAX_ROM_BYTES,
    arrayBuffer: async () => buffer,
  } as File;
  expect((await readGameFile(accepted)).buffer).toBe(buffer);
  await expect(
    readGameFile({ ...accepted, size: MAX_ROM_BYTES + 1 } as File),
  ).rejects.toThrow('smaller than 64 MB');
});

it('rejects archives without a ROM and malformed archives', async () => {
  await expect(
    readGameFile(archive({ 'readme.txt': new Uint8Array([1]) })),
  ).rejects.toThrow('exactly one .gba');
  await expect(
    readGameFile(new File(['not a zip'], 'broken.zip')),
  ).rejects.toThrow('could not be read');
});
