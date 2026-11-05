import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('settings groups device controls and shows developer information', async ({
  page,
}) => {
  await page.goto('/settings');
  for (const name of ['Storage', 'Backups', 'Reset']) {
    await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
  }
  await expect(
    page.getByRole('region', { name: 'App', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'For the games you never outgrew.' }),
  ).toBeVisible();
  const portrait = page.getByRole('button', {
    name: 'Toggle original portrait of Soham Datta',
  });
  await expect(portrait).toBeVisible();
  await portrait.hover({ position: { x: 6, y: 6 } });
  await expect(portrait).toHaveAttribute('data-revealing', '');
  const tiles = portrait.locator('.portrait-tile');
  await expect(tiles).toHaveCount(256);
  await expect(tiles.first()).toHaveCSS('transition-delay', '0s');
  await expect(tiles.last()).toHaveCSS('transition-delay', '0.48s');
  await expect(tiles.last()).toHaveCSS('opacity', '1');
  await page.mouse.move(0, 0);
  await expect(portrait).not.toHaveAttribute('data-revealing');
  await expect(tiles.first()).toHaveCSS('transition-delay', '0.48s');
  await expect(tiles.last()).toHaveCSS('transition-delay', '0s');
  await expect(tiles.first()).toHaveCSS('opacity', '0');
  const portraitBox = (await portrait.boundingBox())!;
  // Entry from the opposite corner must reverse which tiles lead the wave.
  await portrait.hover({ position: { x: portraitBox.width - 6, y: 6 } });
  await expect(tiles.nth(15)).toHaveCSS('transition-delay', '0s');
  await expect(tiles.nth(240)).toHaveCSS('transition-delay', '0.48s');
  await page.mouse.move(0, 0);
  await portrait.hover({ position: { x: 6, y: portraitBox.height - 6 } });
  await expect(tiles.nth(240)).toHaveCSS('transition-delay', '0s');
  await expect(tiles.nth(15)).toHaveCSS('transition-delay', '0.48s');
  await page.mouse.move(0, 0);
  await portrait.hover({
    position: { x: portraitBox.width - 6, y: portraitBox.height - 6 },
  });
  await expect(tiles.last()).toHaveCSS('transition-delay', '0s');
  await expect(tiles.first()).toHaveCSS('transition-delay', '0.48s');
  await page.mouse.move(0, 0);
  await portrait.dblclick();
  await expect(portrait).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(0, 0);
  await expect(portrait.locator('.portrait-tile').first()).toHaveCSS(
    'opacity',
    '1',
  );
  await portrait.dblclick();
  await expect(portrait).toHaveAttribute('aria-pressed', 'false');
  await portrait.focus();
  await page.keyboard.press('Enter');
  await expect(portrait).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(portrait).toHaveAttribute('aria-pressed', 'false');
  await expect(
    page.getByText('EmulatorJS 4.2.3 / mGBA.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Say hello' })).toHaveAttribute(
    'href',
    'mailto:dattasoham805@gmail.com',
  );

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all cheats' }).click();
  const backup = await download;
  expect(backup.suggestedFilename()).toBe('pocket-gba-all-cheats.json');
  await page.locator('input[type=file]').setInputFiles((await backup.path())!);
  await expect(
    page.getByText('Cheats imported.', { exact: true }),
  ).toBeVisible();
  const notification = page.getByRole('dialog', { name: 'Notification' });
  await expect(notification).toBeVisible();
  const notificationBox = (await notification.boundingBox())!;
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  expect(
    Math.abs(
      notificationBox.x + notificationBox.width / 2 - viewport.width / 2,
    ),
  ).toBeLessThan(2);
  expect(
    Math.abs(
      notificationBox.y + notificationBox.height / 2 - viewport.height / 2,
    ),
  ).toBeLessThan(2);
  await expect(page.locator('[data-slot="dialog-backdrop"]')).toHaveCSS(
    'backdrop-filter',
    'blur(8px)',
  );
  const notificationAudit = await new AxeBuilder({ page }).analyze();
  expect(
    notificationAudit.violations.filter((item) =>
      ['serious', 'critical'].includes(item.impact ?? ''),
    ),
  ).toEqual([]);
  await notification.getByRole('button', { name: 'Got it' }).click();
  await expect(notification).toHaveCount(0);
  await page.locator('input[type=file]').setInputFiles((await backup.path())!);
  await expect(notification).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(notification).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh usage' }).click();

  await page.getByRole('button', { name: 'Clear all data' }).click();
  const clearDialog = page.getByRole('dialog', {
    name: 'Clear all local data?',
  });
  await expect(clearDialog).toBeVisible();
  await expect(
    clearDialog.getByRole('button', { name: 'Clear all data' }),
  ).toBeEnabled();
  await clearDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(clearDialog).toHaveCount(0);
  await expect(
    page.getByText('All local game data was cleared.', { exact: true }),
  ).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      const portrait = page.getByRole('button', {
        name: 'Toggle original portrait of Soham Datta',
      });
      await expect(portrait).toBeVisible();
      const colors = await portrait.evaluate((element) => ({
        ink: getComputedStyle(element, '::before').backgroundColor,
        text: getComputedStyle(document.body).color,
        canvas: getComputedStyle(element).backgroundColor,
        background: getComputedStyle(document.body).backgroundColor,
        mask: getComputedStyle(element, '::before').maskImage,
      }));
      expect(colors.ink).toBe(colors.text);
      expect(colors.canvas).toBe(colors.background);
      expect(colors.mask).toContain(`photo-mask-${colorScheme}.png`);
      const audit = await new AxeBuilder({ page }).analyze();
      expect(
        audit.violations.filter((item) =>
          ['serious', 'critical'].includes(item.impact ?? ''),
        ),
      ).toEqual([]);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: 'test-results/settings-desktop.png',
    fullPage: true,
  });
});

test('clearing local data uses a simple confirmation in the app dialog', async ({
  page,
}) => {
  page.on('dialog', (dialog) => {
    throw new Error(`Unexpected native dialog: ${dialog.message()}`);
  });
  await page.goto('/settings');
  const trigger = page.getByRole('button', {
    name: 'Clear all data',
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Clear all local data?' });
  const confirm = dialog.getByRole('button', { name: 'Clear all data' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expect(confirm).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await trigger.click();
  await expect(confirm).toBeEnabled();
  const audit = await new AxeBuilder({ page }).analyze();
  expect(
    audit.violations.filter((item) =>
      ['serious', 'critical'].includes(item.impact ?? ''),
    ),
  ).toEqual([]);
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('dialog', { name: 'Notification' }),
  ).toContainText('All local game data was cleared.');
});
