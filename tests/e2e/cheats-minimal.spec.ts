import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { diagnosticRom } from './fixtures/diagnostic-rom';

test('cheat tiles balance codes and actions in a responsive grid', async ({
  page,
}) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByTestId('game-upload').setInputFiles({
    name: 'FireRed preview.gba',
    mimeType: 'application/octet-stream',
    buffer: diagnosticRom(),
  });
  const notification = page.getByRole('dialog', { name: 'Notification' });
  await notification.getByRole('button', { name: 'Got it' }).click();
  await page
    .getByRole('button', { name: 'Cheats for FireRed preview' })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Cheats', exact: true });
  for (const [label, code] of [
    ['Master Code', 'E6A003D6 8110DDD5\nA47FB2DC 1AF3CA86'],
    ['Anti-DMA', '24C35E88 037C3033\n78DA95DF 44018CB4'],
    ['Rare Candy', 'C12BBBE1 D1ED426C'],
  ]) {
    await sheet.getByRole('button', { name: 'Add cheat', exact: true }).click();
    await sheet.getByLabel('Name', { exact: true }).fill(label);
    await sheet.getByLabel('Cheat code', { exact: true }).fill(code);
    await sheet.getByRole('button', { name: 'Save cheat' }).click();
    await notification.getByRole('button', { name: 'Got it' }).click();
    await sheet.getByRole('checkbox', { name: `Enable ${label}` }).click();
    await expect(
      sheet.getByRole('checkbox', { name: `Enable ${label}` }),
    ).toBeChecked();
  }
  await expect(
    sheet.getByLabel('Code for Master Code', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('menuitem')).toHaveCount(0);
  await sheet
    .getByRole('button', { name: 'Copy code for Master Code', exact: true })
    .click();
  await expect(
    sheet.getByRole('button', {
      name: 'Copied code for Master Code',
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('E6A003D6 8110DDD5\nA47FB2DC 1AF3CA86');
  const more = sheet.getByRole('button', {
    name: 'More options for Master Code',
    exact: true,
  });
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('menuitem', { name: 'Edit Master Code', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeVisible();
  await expect(more).toBeFocused();
  await more.click();
  await page
    .getByRole('menuitem', { name: 'Edit Master Code', exact: true })
    .click();
  await expect(sheet.getByLabel('Name', { exact: true })).toHaveValue(
    'Master Code',
  );
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      expect(
        await sheet.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      const first = (await sheet
        .getByRole('article', { name: 'Master Code', exact: true })
        .boundingBox())!;
      const second = (await sheet
        .getByRole('article', { name: 'Anti-DMA', exact: true })
        .boundingBox())!;
      if (width < 640) {
        expect(second.x).toBe(first.x);
        expect(second.y).toBeGreaterThan(first.y);
      } else {
        expect(second.y).toBe(first.y);
        expect(second.x).toBeGreaterThan(first.x + first.width);
      }
      const code = (await sheet
        .getByLabel('Code for Master Code', { exact: true })
        .boundingBox())!;
      const copy = (await sheet
        .getByRole('button', { name: 'Copy code for Master Code', exact: true })
        .boundingBox())!;
      expect(code.x + code.width).toBeLessThanOrEqual(copy.x);
      const audit = await new AxeBuilder({ page }).analyze();
      expect(
        audit.violations.filter((item) =>
          ['serious', 'critical'].includes(item.impact ?? ''),
        ),
      ).toEqual([]);
      await page.screenshot({
        path: test.info().outputPath(`cheats-grid-${width}-${colorScheme}.png`),
      });
    }
  }
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: () =>
        Promise.reject(
          new DOMException('Permission denied', 'NotAllowedError'),
        ),
    });
  });
  await sheet
    .getByRole('button', { name: 'Copy code for Master Code', exact: true })
    .click();
  await expect(notification).toContainText('Could not copy the code.');
  await notification.getByRole('button', { name: 'Got it' }).click();
  await sheet
    .getByRole('button', { name: 'More options for Rare Candy', exact: true })
    .click();
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('menuitem', { name: 'Delete Rare Candy', exact: true })
    .click();
  await expect(
    sheet.getByRole('heading', { name: 'Rare Candy', exact: true }),
  ).toHaveCount(0);
});
