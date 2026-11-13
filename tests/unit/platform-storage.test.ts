import { afterEach, expect, it, vi } from 'vitest';
import { clearEmulatorStorage } from '../../src/lib/storage';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('uses only known database names when enumeration is unavailable', async () => {
  vi.stubGlobal('indexedDB', {
    deleteDatabase: indexedDB.deleteDatabase.bind(indexedDB),
  });
  const deleted = vi.spyOn(indexedDB, 'deleteDatabase');
  await clearEmulatorStorage();
  expect(deleted.mock.calls.map(([name]) => name)).toEqual([
    'EmulatorJS-roms',
    'EmulatorJS-bios',
    'EmulatorJS-core',
    'EmulatorJS-states',
    '/data/saves',
    'pocket-gba-checkpoints',
  ]);
});

it('does not delete unrelated stores even with a similar prefix', async () => {
  vi.spyOn(indexedDB, 'databases').mockResolvedValue([
    { name: 'EmulatorJS-roms' },
    { name: 'EmulatorJS-another-app' },
    { name: 'unrelated' },
    { name: 'pocket-gba' },
  ]);
  const deleted = vi.spyOn(indexedDB, 'deleteDatabase');
  await clearEmulatorStorage();
  expect(deleted.mock.calls.map(([name]) => name)).toEqual(['EmulatorJS-roms']);
});

it('falls back safely if enumeration rejects', async () => {
  vi.spyOn(indexedDB, 'databases').mockRejectedValue(new Error('Unsupported'));
  const deleted = vi.spyOn(indexedDB, 'deleteDatabase');
  await clearEmulatorStorage();
  expect(deleted).toHaveBeenCalledTimes(6);
});
