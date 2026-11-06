import { test, expect } from '@playwright/test';

test('landscape More prompts for rotation and reveals options in portrait', async ({
  page,
}) => {
  await page.setViewportSize({ width: 740, height: 280 });
  await page.goto('/mobile-layout');
  const preview = page.frameLocator('iframe');
  await preview
    .getByRole('button', { name: 'More options', exact: true })
    .tap();
  const prompt = preview.getByText(
    'Rotate your phone to portrait to view options.',
  );
  await expect(prompt).toBeVisible();
  await expect(
    preview.getByRole('button', { name: 'Joystick', exact: true }),
  ).toBeHidden();
  await page.setViewportSize({ width: 390, height: 664 });
  await expect(prompt).toBeHidden();
  await expect(
    preview.getByRole('button', { name: 'Joystick', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 740, height: 280 });
  await expect(prompt).toBeVisible();
  await preview.getByRole('button', { name: 'Close more options' }).tap();
  await expect(prompt).toBeHidden();
});

test('landscape utilities hide when idle and can be restored', async ({
  page,
}) => {
  await page.clock.install();
  await page.setViewportSize({ width: 740, height: 280 });
  await page.goto('/mobile-layout');
  const preview = page.frameLocator('iframe');
  const more = preview.getByRole('button', {
    name: 'More options',
    exact: true,
  });
  const reveal = preview.getByRole('button', { name: 'Show game controls' });
  await expect(more).toBeVisible();
  await page.clock.fastForward(4000);
  await expect(more).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Library', exact: true }),
  ).toBeHidden();
  await expect(preview.locator('.b_a')).toBeVisible();
  await reveal.tap();
  await expect(more).toBeVisible();
  await more.tap();
  await page.clock.fastForward(8000);
  await expect(reveal).toBeHidden();
  await preview.getByRole('button', { name: 'Close more options' }).tap();
  await page.clock.fastForward(4000);
  await expect(reveal).toBeVisible();
  await page.setViewportSize({ width: 390, height: 664 });
  await expect(more).toBeVisible();
  await expect(reveal).toBeHidden();
  await page.clock.fastForward(4000);
  await expect(more).toBeVisible();
});

test('mobile layout preview works without a ROM and uses the player controls', async ({
  page,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/mobile-layout');
  const preview = page.frameLocator('iframe');
  await expect(
    preview.getByRole('heading', { name: 'Game screen' }),
  ).toBeVisible();
  const speed = preview.getByRole('button', { name: /^Game speed:/ });
  await expect(speed).toHaveText('1×');
  for (const label of ['3×', '0.5×', '1×']) {
    await speed.tap();
    await expect(speed).toHaveText(label);
  }
  await preview.getByRole('button', { name: 'A', exact: true }).tap();
  await expect(preview.getByRole('status')).toHaveText('A pressed');
  await preview.locator('.b_dpad').tap({ position: { x: 110, y: 65 } });
  await expect(preview.getByRole('status')).toHaveText('Right pressed');
  await preview.getByRole('button', { name: 'Pause', exact: true }).tap();
  await expect(preview.getByRole('status')).toHaveText('Paused');
  await preview.getByRole('button', { name: 'Mute', exact: true }).tap();
  await expect(preview.getByRole('status')).toHaveText('Sound off');
  await preview
    .getByRole('button', { name: 'More options', exact: true })
    .tap();
  const menu = preview.getByRole('dialog', { name: 'More options' });
  await expect(
    menu.getByRole('button', { name: 'Save state', exact: true }),
  ).toBeDisabled();
  await menu.getByRole('button', { name: 'Close more options' }).tap();
  await expect(
    preview.locator('.pocket-toolbar [aria-keyshortcuts="f"]'),
  ).toBeHidden();
  await preview
    .getByRole('button', { name: 'More options', exact: true })
    .tap();
  await menu.getByRole('button', { name: 'Joystick', exact: true }).tap();
  await expect(
    menu.getByRole('button', { name: 'Joystick', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await menu.getByRole('button', { name: 'Close more options' }).tap();
  const stick = preview.getByRole('button', { name: 'Virtual joystick' });
  await expect(stick).toBeVisible();
  await stick.tap({ position: { x: 110, y: 65 } });
  await expect(preview.getByRole('status')).toHaveText('Right pressed');
  await expect(stick).not.toHaveClass(/is-held/);
  await page.getByRole('button', { name: 'Reset', exact: true }).tap();
  await expect(preview.getByRole('status')).toHaveText('Ready to test');
  await expect(speed).toHaveText('1×');
  await expect(stick).toBeVisible();
  await page.reload();
  await expect(stick).toBeVisible();
  await preview
    .getByRole('button', { name: 'More options', exact: true })
    .tap();
  await expect(
    menu.getByRole('button', { name: 'Joystick', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await menu.getByRole('button', { name: 'D-pad', exact: true }).tap();
  await menu.getByRole('button', { name: 'Close more options' }).tap();
  await page.reload();
  await expect(stick).toBeHidden();

  for (const [width, height] of [
    [320, 568],
    [390, 664],
    [430, 800],
    [844, 390],
    [667, 375],
    [740, 280],
  ]) {
    await page.setViewportSize({ width, height });
    const boxes = await Promise.all(
      ['.b_l', '.b_select', '.b_start', '.b_r'].map((selector) =>
        preview.locator(selector).boundingBox(),
      ),
    );
    if (height > width) {
      boxes.forEach((box, index) => {
        expect(box!.y).toBe(boxes[0]!.y);
        if (index)
          expect(
            boxes[index - 1]!.x + boxes[index - 1]!.width,
          ).toBeLessThanOrEqual(box!.x);
      });
    } else {
      const b = (await preview.locator('.b_b').boundingBox())!;
      expect(boxes[1]!.x).toBeGreaterThan(width / 2);
      expect(boxes[1]!.y).toBeGreaterThan(b.y + b.height);
      expect(boxes[1]!.width).toBe(64);
      expect(boxes[1]!.x + boxes[1]!.width).toBeLessThan(boxes[2]!.x);
      expect(boxes[2]!.y).toBe(boxes[1]!.y);
    }
    for (const selector of ['.b_dpad', '.b_a', '.b_b']) {
      const box = (await preview.locator(selector).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    if (width > height) {
      const screen = (await preview
        .locator('.ejs_canvas_parent')
        .boundingBox())!;
      expect(screen.width).toBe(width);
      expect(screen.height).toBe(height);
      await page.getByRole('button', { name: 'Reset', exact: true }).tap();
      await expect(preview.getByRole('status')).toHaveText('Ready to test');
      await preview
        .getByRole('button', { name: 'More options', exact: true })
        .tap();
      await menu.getByRole('button', { name: 'Close more options' }).tap();
      await speed.tap();
      await expect(speed).toHaveText('3×');
      await speed.tap();
      await speed.tap();
      await expect(speed).toHaveText('1×');
    }
    await page.screenshot({ path: `test-results/mobile-layout-${width}.png` });
  }
  expect(
    requests.filter((url) =>
      /\.(wasm|gba|data)(\?|$)|\/loader\.js|\/player\.js/.test(url),
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
  await page.reload();
  await expect(
    preview.getByRole('heading', { name: 'Game screen' }),
  ).toBeVisible();
});

test('desktop preview stays phone-width and accepts mouse input', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    hasTouch: false,
    isMobile: false,
  });
  try {
    const page = await context.newPage();
    await page.goto('http://localhost:4173/mobile-layout');
    const preview = page.frameLocator('iframe');
    await expect(
      preview.getByRole('heading', { name: 'Game screen' }),
    ).toBeVisible();
    expect((await page.locator('iframe').boundingBox())!.width).toBe(430);
    const a = preview.getByRole('button', { name: 'A', exact: true });
    await a.click();
    await expect(preview.getByRole('status')).toHaveText('A pressed');
    await expect(a).not.toHaveClass(/ejs_virtualGamepad_button_down/);
    await preview.locator('.b_dpad').click({ position: { x: 110, y: 65 } });
    await expect(preview.getByRole('status')).toHaveText('Right pressed');
    await expect(preview.locator('.ejs_dpad_main')).not.toHaveClass(
      /ejs_dpad_right_pressed/,
    );
    const speed = preview.getByRole('button', { name: /^Game speed:/ });
    await speed.focus();
    await page.keyboard.press('Enter');
    await expect(speed).toHaveText('3×');
    await page.screenshot({ path: 'test-results/mobile-layout-desktop.png' });
  } finally {
    await context.close();
  }
});
