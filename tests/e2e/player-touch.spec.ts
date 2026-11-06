import { test, expect } from '@playwright/test';
import { diagnosticRom } from './fixtures/diagnostic-rom';

test('touch controls fit the handheld in portrait and landscape and keep native inputs', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('game-upload').setInputFiles({
    name: 'Touch test.gba',
    mimeType: 'application/octet-stream',
    buffer: diagnosticRom(),
  });
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('link', { name: 'Play Touch test' }).click();
  const player = page.frameLocator('iframe');
  const pad = player.locator('.ejs_virtualGamepad_parent');
  await expect(pad).toBeVisible({ timeout: 45_000 });
  const bar = player.getByRole('toolbar', { name: 'Game controls' });
  const canvas = player.locator('.ejs_canvas_parent');
  const targets = [
    '.b_dpad',
    '.b_a',
    '.b_b',
    '.b_l',
    '.b_r',
    '.b_start',
    '.b_select',
  ];

  for (const [width, height] of [
    [320, 568],
    [390, 664],
    [430, 800],
    [844, 390],
    [667, 375],
    [740, 280],
  ]) {
    await page.setViewportSize({ width, height });
    // A hidden native menu must still leave the dedicated portrait strip visible.
    await player
      .locator('.pocket-toolbar')
      .evaluate((element) => element.classList.add('ejs_menu_bar_hidden'));
    for (const selector of targets) {
      const box = (await player.locator(selector).boundingBox())!;
      expect(box.x, selector).toBeGreaterThanOrEqual(0);
      expect(box.y, selector).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, selector).toBeLessThanOrEqual(width);
      expect(box.y + box.height, selector).toBeLessThanOrEqual(height);
      expect(box.width, selector).toBeGreaterThanOrEqual(44);
      expect(box.height, selector).toBeGreaterThanOrEqual(44);
      expect(
        await player.locator(selector).evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          );
          return hit === element || element.contains(hit);
        }),
        `${selector} is not covered`,
      ).toBe(true);
    }
    const l = (await player.locator('.b_l').boundingBox())!;
    const r = (await player.locator('.b_r').boundingBox())!;
    const select = (await player.locator('.b_select').boundingBox())!;
    const start = (await player.locator('.b_start').boundingBox())!;
    if (height > width) {
      expect(select.y).toBe(l.y);
      expect(start.y).toBe(r.y);
      expect(l.x + l.width).toBeLessThanOrEqual(select.x);
      expect(select.x + select.width).toBeLessThanOrEqual(start.x);
      expect(start.x + start.width).toBeLessThanOrEqual(r.x);
      await expect(bar).toBeVisible();
      const screen = (await canvas.boundingBox())!;
      const utilities = (await bar.boundingBox())!;
      const deck = (await pad.boundingBox())!;
      expect(screen.y + screen.height).toBeLessThanOrEqual(utilities.y);
      expect(utilities.y + utilities.height).toBeLessThanOrEqual(deck.y);
      expect(utilities.x).toBeGreaterThanOrEqual(0);
      expect(utilities.x + utilities.width).toBeLessThanOrEqual(width);
      await expect(player.locator('.b_speed_slow')).toBeHidden();
      await expect(player.locator('.b_speed_fast')).toBeHidden();
      for (const button of await player
        .locator('.pocket-toolbar [aria-keyshortcuts="f"]')
        .all())
        await expect(button).toBeHidden();
      const speed = bar.getByRole('button', { name: /^Game speed:/ });
      await expect(speed).toBeVisible();
      await expect(speed).toHaveText('1×');
      expect((await speed.boundingBox())!.width).toBeGreaterThanOrEqual(44);
      const secondary = await Promise.all(
        ['.b_select', '.b_start'].map((selector) =>
          player.locator(selector).boundingBox(),
        ),
      );
      secondary.forEach((box, index) => {
        expect(box!.y).toBe(secondary[0]!.y);
        if (index > 0)
          expect(
            secondary[index - 1]!.x + secondary[index - 1]!.width,
          ).toBeLessThanOrEqual(box!.x);
      });
      for (const selector of ['.b_dpad', '.b_a', '.b_b']) {
        const primary = (await player.locator(selector).boundingBox())!;
        expect(primary.y).toBeGreaterThan(
          secondary[0]!.y + secondary[0]!.height,
        );
      }
      await page.screenshot({ path: `test-results/handheld-${width}.png` });
    } else {
      await expect(bar).toBeVisible();
      const screen = (await canvas.boundingBox())!;
      const utilities = (await bar.boundingBox())!;
      const playerFrame = (await page.locator('iframe').boundingBox())!;
      expect(screen.x).toBe(playerFrame.x);
      expect(screen.y).toBe(playerFrame.y);
      expect(screen.width).toBe(playerFrame.width);
      expect(screen.height).toBe(playerFrame.height);
      expect(screen.height).toBeGreaterThanOrEqual(height - 1);
      expect(select.y).toBeGreaterThan(screen.y);
      expect(utilities.y + utilities.height).toBeLessThanOrEqual(
        screen.y + screen.height,
      );
      // Transparent space between targets must not intercept the game canvas.
      expect(
        await canvas.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2,
            ),
          );
        }),
      ).toBe(true);
      const margin = Math.max(0, (width - height * 1.5) / 2);
      const rail = Math.max(156, margin);
      const overlayTargets = [
        ...targets,
        '.pocket-toolbar [aria-label="Pause"]',
        '.pocket-toolbar [aria-label="Mute"]',
        '.pocket-speed',
        '.pocket-toolbar .pocket-icon-button',
      ];
      const boxes = await Promise.all(
        overlayTargets.map((selector) =>
          player.locator(selector).boundingBox(),
        ),
      );
      for (const name of ['Library', 'Cheats']) {
        overlayTargets.push(`Header ${name}`);
        boxes.push(
          await page.getByRole('button', { name, exact: true }).boundingBox(),
        );
      }
      boxes.forEach((box, index) => {
        const bounds = box!;
        if (['.b_select', '.b_start'].includes(overlayTargets[index])) {
          expect(bounds.y).toBe(height - 52);
          return;
        }
        if (index >= targets.length) {
          expect(bounds.y).toBe(8);
          expect(bounds.x).toBeGreaterThanOrEqual(l.x + l.width);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(r.x);
          return;
        }
        // Primary controls stay along the side edges.
        const edge = rail;
        expect(
          bounds.x + bounds.width <= edge + 1 || bounds.x >= width - edge - 1,
          overlayTargets[index],
        ).toBe(true);
      });
      expect(l.y).toBe(8);
      expect(r.y).toBe(8);
      expect(l.x).toBeCloseTo(Math.max(8, margin / 2 - 36));
      expect(r.x + r.width).toBeCloseTo(width - l.x);
      const moreBounds = (await player
        .locator('.pocket-toolbar .pocket-icon-button')
        .boundingBox())!;
      expect(moreBounds.x + moreBounds.width / 2).toBe(width / 2);
      expect((select.x + start.x + start.width) / 2).toBe(width - rail / 2);
      for (let a = 0; a < boxes.length; a++) {
        for (let b = a + 1; b < boxes.length; b++) {
          const first = boxes[a]!;
          const second = boxes[b]!;
          const overlap =
            first.x < second.x + second.width &&
            second.x < first.x + first.width &&
            first.y < second.y + second.height &&
            second.y < first.y + first.height;
          expect(
            overlap,
            `${overlayTargets[a]} overlaps ${overlayTargets[b]}`,
          ).toBe(false);
        }
      }
      await page.screenshot({
        path: `test-results/handheld-landscape-${width}.png`,
      });
    }
  }

  await page.setViewportSize({ width: 390, height: 664 });
  const frame = page
    .frames()
    .find((item) => item.url().includes('/player.html'))!;
  const speed = bar.getByRole('button', { name: /^Game speed:/ });
  const speedFlags = () =>
    frame.evaluate(() => {
      const emulator = (
        window as unknown as {
          EJS_emulator: { isFastForward: boolean; isSlowMotion: boolean };
        }
      ).EJS_emulator;
      return [Boolean(emulator.isSlowMotion), Boolean(emulator.isFastForward)];
    });
  await expect(speed).toHaveText('1×');
  await speed.tap();
  await expect(speed).toHaveText('3×');
  expect(await speedFlags()).toEqual([false, true]);
  await speed.tap();
  await expect(speed).toHaveText('0.5×');
  expect(await speedFlags()).toEqual([true, false]);
  expect(
    await frame.evaluate(() => {
      const emulator = (
        window as unknown as {
          EJS_emulator: { getSettingValue(name: string): string };
        }
      ).EJS_emulator;
      return [
        emulator.getSettingValue('ff-ratio'),
        emulator.getSettingValue('sm-ratio'),
      ];
    }),
  ).toEqual(['3.0', '2.0']);
  // The existing hold-to-fast-forward shortcut temporarily overrides Slow.
  await canvas.tap();
  await page.keyboard.down('Space');
  await expect.poll(speedFlags).toEqual([false, true]);
  await page.keyboard.up('Space');
  await expect.poll(speedFlags).toEqual([true, false]);
  await expect(speed).toHaveText('0.5×');
  await speed.tap();
  await expect(speed).toHaveText('1×');
  expect(await speedFlags()).toEqual([false, false]);
  await frame.evaluate(() => {
    (
      window as unknown as {
        EJS_emulator: {
          changeSettingOption(name: string, value: string): void;
        };
      }
    ).EJS_emulator.changeSettingOption('fastForward', 'enabled');
  });
  await expect(speed).toHaveText('3×');
  await speed.tap();
  await speed.tap();
  await expect(speed).toHaveText('1×');
  await frame.evaluate(() => {
    const w = window as unknown as {
      inputs: number[][];
      EJS_emulator: { gameManager: { simulateInput(...args: number[]): void } };
    };
    w.inputs = [];
    const manager = w.EJS_emulator.gameManager;
    const original = manager.simulateInput.bind(manager);
    manager.simulateInput = (...args) => {
      w.inputs.push(args);
      original(...args);
    };
  });
  for (const selector of [
    '.b_a',
    '.b_b',
    '.b_l',
    '.b_r',
    '.b_start',
    '.b_select',
  ]) {
    await player.locator(selector).tap();
  }
  for (const [x, y] of [
    [108, 65],
    [12, 65],
    [65, 12],
    [65, 118],
    [108, 12],
  ]) {
    await player.locator('.b_dpad').tap({ position: { x, y } });
  }
  await expect
    .poll(() =>
      frame.evaluate(
        () => (window as unknown as { inputs: number[][] }).inputs,
      ),
    )
    .toEqual(
      expect.arrayContaining([
        [0, 8, 1],
        [0, 8, 0],
        [0, 0, 1],
        [0, 0, 0],
        [0, 10, 1],
        [0, 11, 1],
        [0, 3, 1],
        [0, 2, 1],
        [0, 7, 1],
        [0, 7, 0],
        [0, 6, 1],
        [0, 6, 0],
        [0, 4, 1],
        [0, 4, 0],
        [0, 5, 1],
        [0, 5, 0],
      ]),
    );
  await bar.getByRole('button', { name: 'More options', exact: true }).tap();
  await expect(
    player.getByRole('dialog', { name: 'More options' }),
  ).toBeVisible();
});
