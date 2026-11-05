import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('empty library renders the handheld, supports hover, and cleans up on navigation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const stage = page.locator('.handheld-illustration');
  const drawing = stage.locator('svg > g:not(.handheld-fallback)');
  await expect(drawing).toHaveCount(1);
  await expect(stage).toHaveAttribute('aria-hidden', 'true');
  const restingHighlight = await stage.locator('.hi').getAttribute('d');
  // No autoplay under reduced motion; a deliberate hover still shows its final pose.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(stage.locator('.hi')).toHaveAttribute('d', restingHighlight!);
  const box = (await stage.boundingBox())!;
  await page.mouse.move(
    box.x + (box.width * 163) / 400,
    box.y + (box.height * 177) / 320,
  );
  await expect(stage.locator('.hi')).not.toHaveAttribute(
    'd',
    restingHighlight!,
  );
  await page.mouse.move(0, 0);
  await expect(stage.locator('.hi')).toHaveAttribute('d', restingHighlight!);

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const audit = await new AxeBuilder({ page }).analyze();
    expect(
      audit.violations.filter((item) =>
        ['serious', 'critical'].includes(item.impact ?? ''),
      ),
    ).toEqual([]);
  }
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Settings' })
      .click();
    await expect(stage).toHaveCount(0);
    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Library' })
      .click();
    await expect(drawing).toHaveCount(1);
  }
  await expect(page.locator('script[src*="kernel"]')).toHaveCount(1);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(stage.locator('.hi')).not.toHaveAttribute(
    'd',
    restingHighlight!,
  );
  await page.screenshot({ path: 'test-results/empty-library.png' });
  expect(errors).toEqual([]);
});

test('an unavailable illustration engine does not block the library', async ({
  page,
}) => {
  await page.route('**/*kernel*.js*', (route) => route.abort());
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'No games yet' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add a game', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('.handheld-fallback')).toBeVisible();
});

test('the empty state fits small, large, and landscape viewports without scrolling', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [1440, 900],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByRole('heading', { name: 'No games yet' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add a game', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeInViewport();
    expect(
      await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth > innerWidth,
        vertical: document.documentElement.scrollHeight > innerHeight,
      })),
    ).toEqual({ horizontal: false, vertical: false });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'test-results/empty-library-desktop.png' });
});
