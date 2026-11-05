import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('navigation is responsive and identifies the current page', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const library = nav.getByRole('link', { name: 'Library', exact: true });
  const settings = nav.getByRole('link', { name: 'Settings', exact: true });
  await expect(library).toHaveAttribute('aria-current', 'page');
  await settings.click();
  await expect(settings).toHaveAttribute('aria-current', 'page');
  await expect(library).not.toHaveAttribute('aria-current', 'page');

  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(library).toBeVisible();
    await expect(settings).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      const audit = await new AxeBuilder({ page }).include('header').analyze();
      expect(audit.violations).toEqual([]);
    }
  }
  await page
    .getByRole('banner')
    .getByRole('link', { name: 'Pocket GBA' })
    .click();
  await expect(library).toHaveAttribute('aria-current', 'page');
});
