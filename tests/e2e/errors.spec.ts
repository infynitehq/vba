import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('error handheld presses its restart control and returns to rest', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/missing-page');
  const illustration = page.locator('.error-illustration');
  const face = illustration.locator('path.nf.hi');
  await expect(face).toHaveCount(1);
  const bounds = (await illustration.boundingBox())!;
  await page.mouse.move(
    bounds.x + (196 / 400) * bounds.width,
    bounds.y + (230 / 320) * bounds.height,
  );
  await expect(illustration.locator('path.sil.hi')).toHaveCount(1);
  await expect(face).toHaveCount(0);
  await page.mouse.move(0, 0);
  await expect(face).toHaveCount(1);
  await expect(illustration.locator('path.sil.hi')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(
    bounds.x + (196 / 400) * bounds.width,
    bounds.y + (230 / 320) * bounds.height,
  );
  await expect(illustration.locator('path.sil.hi')).toHaveCount(1);
});

test('missing pages offer a safe way back to the library', async ({ page }) => {
  await page.goto('/missing-page');
  await expect(
    page.getByRole('heading', { name: 'This level doesn’t exist.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to library' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your library' }),
  ).toBeVisible();
});

test('storage errors show a recovery screen instead of a stack trace', async ({
  page,
}) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new Error('Test storage unavailable');
    };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          sessionStorage.setItem('copied-error', text);
        },
      },
    });
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Let’s get you back in the game.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
  for (const viewport of [
    { width: 375, height: 667 },
    { width: 1440, height: 900 },
    { width: 1024, height: 600 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight,
      ),
    ).toBe(true);
  }
  await expect(
    page.getByText('Test storage unavailable', { exact: true }),
  ).not.toBeVisible();
  await page.getByText('Technical details', { exact: true }).click();
  await expect(page.locator('pre')).toContainText('Test storage unavailable');
  await page.getByRole('button', { name: 'Copy technical details' }).click();
  await expect(page.getByRole('status')).toHaveText('Copied to clipboard.');
  await expect(page.getByRole('status')).toHaveClass('sr-only');
  expect(
    await page.evaluate(() => sessionStorage.getItem('copied-error')),
  ).toBe(await page.locator('pre').textContent());
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error('Clipboard blocked');
    };
  });
  await page.getByRole('button', { name: 'Copy technical details' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Couldn’t copy. Select and copy the message.',
  );
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const audit = await new AxeBuilder({ page }).analyze();
    expect(
      audit.violations.filter((item) =>
        ['serious', 'critical'].includes(item.impact ?? ''),
      ),
    ).toEqual([]);
  }
  // A persistent failure must stay recoverable rather than crash on retry.
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Let’s get you back in the game.' }),
  ).toBeVisible();
});
