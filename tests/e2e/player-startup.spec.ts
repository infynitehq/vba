import { test, expect, devices } from '@playwright/test';
import { diagnosticRom } from './fixtures/diagnostic-rom';

test.use({ userAgent: devices['iPhone 13'].userAgent });

test('iOS preloads the core but starts it only after a tap inside the player', async ({
  browser,
}) => {
  // Exercise the iOS path even when the default suite uses Chromium.
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  try {
    const page = await context.newPage();
    // iOS standalone can fail to fetch local blob URLs. ROM loading must use
    // in-memory bytes, not depend on fetching an object URL in the player.
    await page.addInitScript(() => {
      const romUrls = new Set<string>();
      const createObjectURL = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (object) => {
        const url = createObjectURL(object);
        // Keep the core's JS/WASM object URLs working; only simulate failure
        // for a local ROM, identified by its GBA header-sized minimum length.
        if (
          object instanceof Blob &&
          object.size >= 192 &&
          (!object.type || object.type === 'application/octet-stream')
        )
          romUrls.add(url);
        return url;
      };
      const original = window.fetch;
      window.fetch = (input, init) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (romUrls.has(url))
          return Promise.reject(new TypeError('Failed to fetch blob URL'));
        return original(input, init);
      };
    });
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
    await expect(player.locator('#game')).toHaveCSS(
      'background-color',
      'rgb(25, 23, 21)',
    );
    expect(
      await content.evaluate(
        () =>
          (window as unknown as { EJS_gameUrl: unknown }).EJS_gameUrl instanceof
          Uint8Array,
      ),
    ).toBe(true);
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

test('startup errors retain the player theme and accessible settings', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('game-upload').setInputFiles({
    name: 'Startup theme.gba',
    mimeType: 'application/octet-stream',
    buffer: diagnosticRom(),
  });
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('link', { name: 'Play Startup theme' }).click();
  const player = page.frameLocator('iframe');
  await expect(player.getByRole('button', { name: 'Tap to play' })).toBeVisible(
    {
      timeout: 45_000,
    },
  );
  const frame = await (await page
    .locator('iframe')
    .elementHandle())!.contentFrame();
  await frame!.evaluate(() => {
    const emulator = (
      window as unknown as {
        EJS_emulator: { startGameError(message: string): void };
      }
    ).EJS_emulator;
    emulator.startGameError('Network Error');
  });
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(player.locator('#message')).toHaveText('Network Error');
  await expect(player.locator('.ejs_error_text')).toBeHidden();
  const settings = player.getByRole('button', {
    name: 'Emulator settings',
    exact: true,
  });
  await expect(settings).toHaveCSS('background-color', 'rgb(25, 23, 21)');
  await expect(settings).toHaveCSS('color', 'rgb(238, 234, 227)');
  await settings.click();
  const dialog = player.getByRole('dialog', { name: 'Emulator settings' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('background-color', 'rgb(25, 23, 21)');
  await dialog.getByRole('button', { name: 'Close emulator settings' }).click();
  await expect(dialog).toBeHidden();
});
