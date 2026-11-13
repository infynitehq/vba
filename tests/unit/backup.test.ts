import { afterEach, expect, it, vi } from 'vitest';
import { data } from '../../src/data/db';
import { exportCheats, importCheats } from '../../src/data/backup';
import { saveFile } from '../../src/platform';

vi.mock('../../src/platform', () => ({ saveFile: vi.fn() }));

const cheat = {
  id: 'cheat',
  gameId: 'game',
  label: 'Own cheat',
  code: '82000000 1234',
  enabled: true,
  createdAt: 1,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(saveFile).mockReset();
});

it('exports a backup that the importer accepts without truncation', async () => {
  vi.spyOn(data, 'cheats').mockResolvedValue([cheat]);
  const imported = vi.spyOn(data, 'importCheats').mockResolvedValue(undefined);
  vi.spyOn(data, 'games').mockResolvedValue([]);
  vi.mocked(saveFile).mockResolvedValue(true);
  expect(await exportCheats('game')).toBe(true);
  const [content, name] = vi.mocked(saveFile).mock.calls[0];
  expect(name).toBe('pocket-gba-game-cheats.json');
  expect(content).toBeInstanceOf(Blob);
  await expect(
    importCheats(new File([content as Blob], name), 'game'),
  ).resolves.toBe(1);
  expect(imported).toHaveBeenCalledWith([cheat]);
});

it.each([undefined, 'game'])(
  'rejects more than 10,000 cheats before any save dialog (%s)',
  async (gameId) => {
    const cheats = Array.from({ length: 10001 }, (_, index) => ({
      ...cheat,
      id: `cheat-${index}`,
    }));
    vi.spyOn(data, 'allCheats').mockResolvedValue(cheats);
    vi.spyOn(data, 'cheats').mockResolvedValue(cheats);
    await expect(exportCheats(gameId)).rejects.toThrow('10,000-cheat');
    expect(saveFile).not.toHaveBeenCalled();
  },
);

it.each([undefined, 'game'])(
  'enforces UTF-8 byte size before any save dialog (%s)',
  async (gameId) => {
    // UTF-16 string length is below 4 MiB, but UTF-8 is above it.
    const cheats = Array.from({ length: 9500 }, (_, index) => ({
      ...cheat,
      id: `cheat-${index}`,
      label: '界'.repeat(100),
    }));
    const content = JSON.stringify(
      { format: 'pocket-gba-cheats', version: 1, cheats },
      null,
      2,
    );
    expect(content.length).toBeLessThan(4 * 1024 * 1024);
    expect(new TextEncoder().encode(content).byteLength).toBeGreaterThan(
      4 * 1024 * 1024,
    );
    vi.spyOn(data, 'allCheats').mockResolvedValue(cheats);
    vi.spyOn(data, 'cheats').mockResolvedValue(cheats);
    await expect(exportCheats(gameId)).rejects.toThrow('exceeds 4 MB');
    expect(saveFile).not.toHaveBeenCalled();
  },
);

it('rejects invalid cheat records before export', async () => {
  vi.spyOn(data, 'allCheats').mockResolvedValue([
    { ...cheat, code: 'invalid' },
  ]);
  await expect(exportCheats()).rejects.toThrow('invalid cheats');
  expect(saveFile).not.toHaveBeenCalled();
});

it('allows exactly 10,000 valid cheats', async () => {
  const cheats = Array.from({ length: 10000 }, (_, index) => ({
    ...cheat,
    id: `cheat-${index}`,
  }));
  vi.spyOn(data, 'allCheats').mockResolvedValue(cheats);
  vi.mocked(saveFile).mockResolvedValue(true);
  expect(await exportCheats()).toBe(true);
  expect(saveFile).toHaveBeenCalledOnce();
});

it('allows exactly 4 MiB but rejects the next encoded byte', async () => {
  const serialize = (id: string) =>
    JSON.stringify(
      {
        format: 'pocket-gba-cheats',
        version: 1,
        cheats: [{ ...cheat, id }],
      },
      null,
      2,
    );
  const baseBytes = new TextEncoder().encode(serialize('')).byteLength;
  const id = 'x'.repeat(4 * 1024 * 1024 - baseBytes);
  const read = vi.spyOn(data, 'allCheats');
  read.mockResolvedValue([{ ...cheat, id }]);
  vi.mocked(saveFile).mockResolvedValue(true);
  expect(await exportCheats()).toBe(true);
  const [blob] = vi.mocked(saveFile).mock.calls[0];
  expect((blob as Blob).size).toBe(4 * 1024 * 1024);
  vi.mocked(saveFile).mockClear();
  read.mockResolvedValue([{ ...cheat, id: `${id}x` }]);
  await expect(exportCheats()).rejects.toThrow('exceeds 4 MB');
  expect(saveFile).not.toHaveBeenCalled();
});
