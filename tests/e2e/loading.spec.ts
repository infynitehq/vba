import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('application loader centers the Classic spinner above its label', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) {
      const request = open.apply(this, args);
      // Keep the library query pending without a timer or a fake loader route.
      request.addEventListener('success', (event) =>
        event.stopImmediatePropagation(),
      );
      return request;
    };
  });
  await page.goto('/');
  const status = page.getByRole('status').filter({ hasText: 'Loading…' });
  await expect(status).toBeVisible();
  const spinner = status.locator('.ld-classic');
  await expect(spinner.locator('.ld-classic-bar')).toHaveCount(12);
  for (const viewport of [
    { width: 375, height: 667 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const group = (await status.boundingBox())!;
    const graphic = (await spinner.boundingBox())!;
    const label = (await status.locator('p').boundingBox())!;
    expect(
      Math.abs(group.x + group.width / 2 - viewport.width / 2),
    ).toBeLessThan(2);
    expect(
      Math.abs(group.y + group.height / 2 - viewport.height / 2),
    ).toBeLessThan(2);
    expect(label.y).toBeGreaterThan(graphic.y + graphic.height);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(spinner.locator('.ld-classic-bar').first()).toHaveCSS(
    'animation-name',
    'none',
  );
  const audit = await new AxeBuilder({ page }).analyze();
  expect(
    audit.violations.filter((item) =>
      ['serious', 'critical'].includes(item.impact ?? ''),
    ),
  ).toEqual([]);
});
