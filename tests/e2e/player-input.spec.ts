import { test, expect } from '@playwright/test';
import { diagnosticRom } from './fixtures/diagnostic-rom';

test('joystick supports diagonals, simultaneous A, cancellation, and automatic rotation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByTestId('game-upload').setInputFiles({
    name: 'Joystick test.gba',
    mimeType: 'application/octet-stream',
    buffer: diagnosticRom(),
  });
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('link', { name: 'Play Joystick test' }).click();
  const player = page.frameLocator('iframe');
  const more = player.getByRole('button', {
    name: 'More options',
    exact: true,
  });
  await expect(more).toBeVisible({ timeout: 45_000 });
  await more.tap();
  const menu = player.getByRole('dialog', { name: 'More options' });
  await expect(
    menu.getByRole('button', { name: 'D-pad', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await menu.getByRole('button', { name: 'Joystick', exact: true }).tap();
  await menu.getByRole('button', { name: 'Close more options' }).tap();
  const stick = player.getByRole('button', { name: 'Virtual joystick' });
  await expect(stick).toBeVisible();
  await expect(player.locator('.ejs_dpad_main')).toBeHidden();
  const frame = page
    .frames()
    .find((item) => item.url().includes('/player.html'))!;
  await frame.evaluate(() => {
    const w = window as unknown as {
      heldInputs: Record<number, number>;
      EJS_emulator: { gameManager: { simulateInput(...args: number[]): void } };
    };
    w.heldInputs = {};
    const manager = w.EJS_emulator.gameManager;
    const original = manager.simulateInput.bind(manager);
    manager.simulateInput = (...args) => {
      w.heldInputs[args[1]] = args[2];
      original(...args);
    };
  });
  const held = () =>
    frame.evaluate(() => {
      const inputs = (
        window as unknown as { heldInputs: Record<number, number> }
      ).heldInputs;
      return [4, 5, 6, 7, 8].map((id) => inputs[id] ?? 0);
    });
  const cdp = await page.context().newCDPSession(page);
  const box = (await stick.boundingBox())!;
  const point = (dx = 0, dy = 0) => ({
    x: box.x + box.width / 2 + dx,
    y: box.y + box.height / 2 + dy,
    id: 1,
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point()],
  });
  expect(await held()).toEqual([0, 0, 0, 0, 0]); // Center deadzone.
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [point(40)],
  });
  await expect.poll(held).toEqual([0, 0, 0, 1, 0]);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [point(35, -35)],
  });
  await expect.poll(held).toEqual([1, 0, 0, 1, 0]);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [point(0, -40)],
  });
  await expect.poll(held).toEqual([1, 0, 0, 0, 0]);
  const a = (await player.locator('.b_a').boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      point(0, -40),
      { x: a.x + a.width / 2, y: a.y + a.height / 2, id: 2 },
    ],
  });
  await expect.poll(held).toEqual([1, 0, 0, 0, 1]);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [{ x: a.x + a.width / 2, y: a.y + a.height / 2, id: 2 }],
  });
  await expect.poll(held).toEqual([1, 0, 0, 0, 0]);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect.poll(held).toEqual([0, 0, 0, 0, 0]);
  await expect(stick).not.toHaveClass(/is-held/);
  expect(
    await stick.evaluate((element) =>
      element.style.getPropertyValue('--stick-x'),
    ),
  ).toBe('0px');

  await stick.focus();
  await page.keyboard.down('ArrowRight');
  await expect.poll(held).toEqual([0, 0, 0, 1, 0]);
  await page.keyboard.up('ArrowRight');
  await expect.poll(held).toEqual([0, 0, 0, 0, 0]);
  // Defocus before testing native multi-touch again.
  await player.locator('.ejs_canvas_parent').tap();

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(-40)],
  });
  await expect.poll(held).toEqual([0, 0, 1, 0, 0]);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  await expect.poll(held).toEqual([0, 0, 0, 0, 0]);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(0, 40)],
  });
  await expect.poll(held).toEqual([0, 1, 0, 0, 0]);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(held).toEqual([0, 0, 0, 0, 0]);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect(stick).toBeVisible();
  const landscape = (await stick.boundingBox())!;
  const screen = (await player.locator('.ejs_canvas_parent').boundingBox())!;
  expect(landscape.x).toBeGreaterThanOrEqual(screen.x);
  expect(landscape.x + landscape.width).toBeLessThanOrEqual(
    screen.x + screen.width,
  );
  expect(landscape.y + landscape.height).toBeLessThanOrEqual(
    screen.y + screen.height,
  );
  await page.screenshot({ path: 'test-results/joystick-landscape.png' });
  await page.setViewportSize({ width: 390, height: 664 });
  await expect(stick).toBeVisible();
  await more.tap();
  await menu.getByRole('button', { name: 'D-pad', exact: true }).tap();
  await menu.getByRole('button', { name: 'Close more options' }).tap();
  await expect(stick).toBeHidden();
  await expect(player.locator('.ejs_dpad_main')).toBeVisible();
  expect(errors).toEqual([]);
  await cdp.detach();
});
