import { test, expect, devices } from '@playwright/test';
import { diagnosticRom } from './fixtures/diagnostic-rom';

test('iOS preloads the core but starts it only after a tap inside the player', async ({
  browser,
}) => {
  // Exercise the iOS path even when the default suite uses Chromium.
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:4173');
    await page.getByTestId('game-upload').setInputFiles({
      name: 'Display test.gba',
      mimeType: 'application/octet-stream',
      buffer: diagnosticRom(),
    });
    await page.getByRole('button', { name: 'Got it' }).click();
    await page.getByRole('link', { name: 'Play Display test' }).click();
    const player = page.frameLocator('iframe');
    const start = player.getByRole('button', { name: 'Tap to play' });
    await expect(start).toBeVisible({ timeout: 45_000 });
    const frame = (await page.locator('iframe').elementHandle())!;
    const content = (await frame.contentFrame())!;
    expect(
      await content.evaluate(
        () =>
          (window as unknown as { EJS_emulator: { started: boolean } })
            .EJS_emulator.started,
      ),
    ).toBeFalsy();
    await start.tap();
    await expect(start).toBeHidden();
    await expect(
      player.getByRole('toolbar', { name: 'Game controls' }),
    ).toBeAttached();
    await expect(player.locator('canvas')).toBeVisible();
    expect(
      await content.evaluate(
        () =>
          (window as unknown as { EJS_emulator: { started: boolean } })
            .EJS_emulator.started,
      ),
    ).toBe(true);
    await expect(
      page.getByRole('dialog', { name: 'Notification' }),
    ).toBeHidden();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
