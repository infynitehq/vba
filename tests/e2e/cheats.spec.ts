import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('cheats dialog supports editing, toggling, backups, and nested notifications', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const rom = Buffer.alloc(1024);
  rom[0xb2] = 0x96;
  await page.getByTestId('game-upload').setInputFiles({
    name: 'Test game.gba',
    mimeType: 'application/octet-stream',
    buffer: rom,
  });
  const notification = page.getByRole('dialog', { name: 'Notification' });
  await notification.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('button', { name: 'Cheats for Test game' }).click();
  const sheet = page.getByRole('dialog', { name: 'Cheats', exact: true });
  await expect(
    sheet.getByRole('heading', { name: 'No cheats yet' }),
  ).toBeVisible();
  await sheet.getByRole('button', { name: 'Add cheat', exact: true }).click();
  await sheet.getByLabel('Name', { exact: true }).fill('Extra lives');
  await sheet.getByLabel('Cheat code', { exact: true }).fill('82000000 1234');
  await sheet.getByRole('button', { name: 'Save cheat' }).click();
  await expect(notification).toContainText('Cheat saved.');
  await notification.getByRole('button', { name: 'Got it' }).click();
  await expect(
    sheet.getByRole('heading', { name: 'Extra lives' }),
  ).toBeVisible();
  await sheet.getByRole('checkbox', { name: 'Enable Extra lives' }).click();
  await expect(
    sheet.getByRole('checkbox', { name: 'Enable Extra lives' }),
  ).toBeChecked();
  await expect(sheet.getByText('1 active', { exact: true })).toBeVisible();
  await sheet
    .getByRole('button', { name: 'More options for Extra lives' })
    .click();
  await page.getByRole('menuitem', { name: 'Edit Extra lives' }).click();
  await expect(sheet.getByLabel('Name', { exact: true })).toHaveValue(
    'Extra lives',
  );
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();

  const download = page.waitForEvent('download');
  await sheet.getByRole('button', { name: 'Export JSON' }).click();
  const backup = await download;
  await sheet.locator('input[type=file]').setInputFiles((await backup.path())!);
  await expect(notification).toContainText('Cheats imported.');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeVisible();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      const audit = await new AxeBuilder({ page }).analyze();
      expect(
        audit.violations.filter((item) =>
          ['serious', 'critical'].includes(item.impact ?? ''),
        ),
      ).toEqual([]);
    }
    const box = (await sheet.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  await page.screenshot({ path: 'test-results/cheats-dialog.png' });
  page.once('dialog', (dialog) => dialog.accept());
  await sheet
    .getByRole('button', { name: 'More options for Extra lives' })
    .click();
  await page.getByRole('menuitem', { name: 'Delete Extra lives' }).click();
  await expect(
    sheet.getByRole('heading', { name: 'No cheats yet' }),
  ).toBeVisible();
  await sheet.getByRole('button', { name: 'Close cheats' }).click();
  await expect(sheet).toHaveCount(0);
  expect(errors).toEqual([]);
});
