import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('local HTTP crypto restrictions show a useful error instead of failing silently', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    // Localhost is secure in browsers; simulate the APIs absent on LAN HTTP.
    Object.defineProperty(crypto, 'subtle', { value: undefined });
    Object.defineProperty(crypto, 'randomUUID', { value: undefined });
  });
  await page.goto('/');
  const rom = Buffer.alloc(1024);
  rom[0xb2] = 0x96;
  await page.getByTestId('game-upload').setInputFiles({
    name: 'My game.gba',
    mimeType: 'application/octet-stream',
    buffer: rom,
  });
  const dialog = page.getByRole('dialog', { name: 'Notification' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    'Adding games requires a secure connection (HTTPS).',
  );
  await expect(dialog).toContainText('use an HTTPS tunnel');
  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a game' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('unrestricted game picker rejects unsupported files in a dialog and allows retry', async ({
  page,
}) => {
  await page.goto('/');
  const upload = page.getByTestId('game-upload');
  await expect(upload).not.toHaveAttribute('accept');

  // The same rejected file can be selected again after dismissing the error.
  for (let attempt = 0; attempt < 2; attempt++) {
    await upload.setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Not a game'),
    });
    const dialog = page.getByRole('dialog', { name: 'Notification' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      'Unsupported file type. Choose your own .gba file, or a .zip containing one .gba file.',
    );
    await dialog.getByRole('button', { name: 'Got it' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(upload).toHaveValue('');
  }

  const rom = Buffer.alloc(1024);
  rom[0xb2] = 0x96;
  await upload.setInputFiles({
    name: 'My game.gba',
    mimeType: 'application/octet-stream',
    buffer: rom,
  });
  await page
    .getByRole('dialog', { name: 'Notification' })
    .getByRole('button', { name: 'Got it' })
    .click();
  await expect(
    page.getByRole('article').getByRole('heading', { name: 'My game' }),
  ).toBeVisible();
});

test('minimal library keeps game actions and file details accessible', async ({
  page,
}) => {
  // Audit settled colors rather than an intermediate theme-transition frame.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'No games yet' }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.fonts.check('400 14px "Ioskeley Mono"')),
  ).toBe(true);
  await expect(page.locator('body')).toHaveCSS(
    'font-family',
    '"Ioskeley Mono", monospace',
  );

  const rom = Buffer.alloc(1024);
  rom[0xb2] = 0x96;
  await page.getByTestId('game-upload').setInputFiles({
    name: 'My game.gba',
    mimeType: 'application/octet-stream',
    buffer: rom,
  });
  await page
    .getByRole('dialog', { name: 'Notification' })
    .getByRole('button', { name: 'Got it' })
    .click();

  const game = page.getByRole('article');
  await expect(game.getByText('No save recorded')).toBeVisible();
  await expect(game.getByText('Not played yet')).toBeVisible();
  await expect(game.getByRole('heading', { name: 'My game' })).toBeVisible();
  await expect(game.getByRole('link', { name: 'Play My game' })).toBeVisible();
  await expect(
    game.getByRole('button', { name: 'Cheats for My game' }),
  ).toBeVisible();
  await expect(
    page.getByRole('menuitem', { name: 'Remove My game' }),
  ).toBeHidden();
  const more = game.getByRole('button', { name: 'More about My game' });
  await more.click();
  await expect(page.getByRole('menu').getByText(/1 KB/)).toBeVisible();
  await expect(
    page.getByRole('menuitem', { name: 'Remove My game' }),
  ).toBeVisible();

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const audit = await new AxeBuilder({ page }).analyze();
    expect(
      audit.violations.filter((item) =>
        ['serious', 'critical'].includes(item.impact ?? ''),
      ),
    ).toEqual([]);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(more).toBeFocused();
  await more.click();
  await expect(page.getByRole('menu')).not.toHaveAttribute(
    'data-starting-style',
  );
  const heading = await page
    .getByRole('heading', { name: 'Your library' })
    .boundingBox();
  await page.touchscreen.tap(heading!.x + 4, heading!.y + 4);
  await expect(page.getByRole('menu')).toBeHidden();
  await more.focus();
  await page.keyboard.press('ArrowDown');
  await expect(
    page.getByRole('menuitem', { name: 'Remove My game' }),
  ).toBeFocused();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('menuitem', { name: 'Remove My game' }).click();
  await expect(
    page.getByRole('heading', { name: 'No games yet' }),
  ).toBeVisible();
});
