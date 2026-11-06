import { test, expect } from '@playwright/test';
import { diagnosticRom } from './fixtures/diagnostic-rom';

test('cheats can be added and toggled during gameplay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByTestId('game-upload').setInputFiles({
    name: 'Display test.gba',
    mimeType: 'application/octet-stream',
    buffer: diagnosticRom(),
  });
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('link', { name: 'Play Display test' }).click();
  const player = page.frameLocator('iframe');
  await expect(
    player.getByRole('toolbar', { name: 'Game controls' }),
  ).toBeAttached({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Cheats', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Cheats', exact: true });
  await sheet.getByRole('button', { name: 'Add cheat', exact: true }).click();
  await sheet.getByLabel('Name', { exact: true }).fill('RAM test');
  await sheet
    .getByLabel('Cheat code', { exact: true })
    .fill('82000000 1234\n82000002 5678');
  await sheet.getByRole('button', { name: 'Save cheat' }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  const toggle = sheet.getByRole('checkbox', { name: 'Enable RAM test' });
  for (let i = 0; i < 4; i++) {
    await toggle.click();
    await expect(toggle).toBeChecked({ checked: i % 2 === 0 });
    await expect(player.locator('#message')).toBeHidden();
  }
  await sheet.getByRole('button', { name: 'Close cheats' }).click();
  // A native state operation verifies that the core is still usable, not just
  // that its last rendered canvas remains visible after a WebAssembly abort.
  const frame = page
    .frames()
    .find((frame) => frame.url().includes('player.html'))!;
  const stateSize = await frame.evaluate(() => {
    const emulator = (
      window as unknown as {
        EJS_emulator: { gameManager: { getState: () => Uint8Array } };
      }
    ).EJS_emulator;
    return emulator.gameManager.getState().length;
  });
  expect(stateSize).toBeGreaterThan(0);
  expect(errors).toEqual([]);

  // Disabled cheats remain in IndexedDB, but must never enter the native
  // startup list: mGBA can execute even unchecked entries before gameStart.
  await page.reload();
  await expect(
    player.getByRole('toolbar', { name: 'Game controls' }),
  ).toBeAttached({ timeout: 45_000 });
  const restarted = page
    .frames()
    .find((frame) => frame.url().includes('player.html'))!;
  expect(
    await restarted.evaluate(
      () => (window as unknown as { EJS_cheats: unknown[] }).EJS_cheats,
    ),
  ).toEqual([]);
  await expect(player.locator('#message')).toBeHidden();
  expect(errors).toEqual([]);
});
