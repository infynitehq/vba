import { afterEach, expect, it, vi } from 'vitest';

const {
  browserPick,
  browserSave,
  browserOpen,
  nativePick,
  nativeSave,
  nativeOpen,
} = vi.hoisted(() => ({
  browserPick: vi.fn(),
  browserSave: vi.fn(),
  browserOpen: vi.fn(),
  nativePick: vi.fn(),
  nativeSave: vi.fn(),
  nativeOpen: vi.fn(),
}));
vi.mock('../../src/platform/browser', () => ({
  pickFile: browserPick,
  saveFile: browserSave,
  openExternal: browserOpen,
}));
vi.mock('../../src/platform/native', () => ({
  pickFile: nativePick,
  saveFile: nativeSave,
  openExternal: nativeOpen,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.resetAllMocks();
});

it('routes browser mode to browser file handling', async () => {
  vi.stubEnv('MODE', 'production');
  const platform = await import('../../src/platform');
  browserPick.mockResolvedValue(null);
  browserSave.mockResolvedValue(true);
  expect(platform.isDesktop).toBe(false);
  expect(await platform.pickFile('rom')).toBeNull();
  expect(await platform.saveFile(new Blob(), 'file')).toBe(true);
  await platform.openExternal('https://github.com/infynitehq/vba');
  expect(browserOpen).toHaveBeenCalledWith('https://github.com/infynitehq/vba');
  expect(nativeOpen).not.toHaveBeenCalled();
  expect(nativePick).not.toHaveBeenCalled();
  expect(nativeSave).not.toHaveBeenCalled();
});

it('routes desktop mode to native handling and preserves cancellation', async () => {
  vi.stubEnv('MODE', 'desktop');
  const platform = await import('../../src/platform');
  nativePick.mockResolvedValue(null);
  nativeSave.mockResolvedValue(false);
  expect(platform.isDesktop).toBe(true);
  expect(await platform.pickFile('battery')).toBeNull();
  expect(nativePick).toHaveBeenCalledWith('battery');
  expect(await platform.saveFile(new Blob(), 'save.sav')).toBe(false);
  await platform.openExternal('https://github.com/infynitehq/vba/releases');
  expect(nativeOpen).toHaveBeenCalledWith(
    'https://github.com/infynitehq/vba/releases',
  );
  expect(browserOpen).not.toHaveBeenCalled();
  expect(browserPick).not.toHaveBeenCalled();
  expect(browserSave).not.toHaveBeenCalled();
});
