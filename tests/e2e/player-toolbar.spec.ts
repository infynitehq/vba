import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('game menu groups native actions without leaking emulator tooltip styles', async ({
  page,
}) => {
  // Exercise the adapter against the pinned emulator CSS without booting a ROM.
  await page.goto('/player-toolbar.css');
  await page.setContent(`<!doctype html><html lang="en"><head><title>Game menu test</title><meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/emulatorjs/emulator.min.css">
    <link rel="stylesheet" href="/player-toolbar.css">
    <style>html,body{height:100%;margin:0}#game{height:100%;background:#191715}</style>
    </head><body><div id="game" class="ejs_parent ejs_big_screen"></div></body></html>`);
  await page.addScriptTag({ url: '/player-toolbar.js' });
  await page.evaluate(() => {
    const api = (
      window as unknown as {
        PocketToolbar: {
          options: Record<string, { icon: string; displayName: string }>;
          install(
            emulator: unknown,
            callbacks: { onOpen(): void; onExit(): void },
          ): void;
        };
      }
    ).PocketToolbar;
    const game = document.getElementById('game')!;
    const bar = document.createElement('div');
    bar.className = 'ejs_menu_bar';
    game.append(bar);
    const bottomBar: Record<string, HTMLButtonElement[]> = {};
    for (const [name, option] of [
      ['pause', 'pause'],
      ['mute', 'mute'],
      ['fullscreen', 'enterFullscreen'],
      ['saveState', 'saveState'],
      ['loadState', 'loadState'],
      ['saveSavFiles', 'saveSavFiles'],
      ['loadSavFiles', 'loadSavFiles'],
      ['gamepad', 'gamepad'],
      ['settings', 'settings'],
      ['restart', 'restart'],
      ['exit', 'exitEmulation'],
      ['contextMenu', 'settings'],
    ]) {
      const button = document.createElement('button');
      button.className = 'ejs_menu_button';
      button.type = 'button';
      button.innerHTML = `${api.options[option].icon}<span class="ejs_menu_text">${api.options[option].displayName}</span>`;
      button.addEventListener('click', () => {
        game.dataset.lastAction = name;
      });
      bar.append(button);
      bottomBar[name] = [button];
    }
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.dataset.range = 'volume';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.01';
    slider.value = '0.5';
    slider.setAttribute('aria-label', 'Volume');
    bar.append(slider);
    api.install(
      { elements: { menu: bar, bottomBar, parent: game } },
      {
        onOpen: () => {
          game.dataset.opened = 'true';
        },
        onExit: () => {
          game.dataset.exited = 'true';
        },
      },
    );
  });
  const panel = page.getByRole('dialog', { name: 'More options' });
  const open = page.getByRole('button', { name: 'More options', exact: true });
  await open.click();
  for (const name of ['Save states', 'Save files', 'Preferences', 'Session']) {
    await expect(
      panel.getByRole('region', { name, exact: true }),
    ).toBeVisible();
  }
  const text = panel
    .getByRole('button', { name: 'Save state', exact: true })
    .locator('.ejs_menu_text');
  await expect(text).toHaveCSS('color', 'rgb(238, 234, 227)');
  expect(
    await text.evaluate(
      (element) => getComputedStyle(element, '::before').display,
    ),
  ).toBe('none');
  await expect(panel.locator('.pocket-volume-value')).toHaveText('50%');
  await panel.getByRole('slider', { name: 'Volume' }).focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(panel.locator('.pocket-volume-value')).toHaveText('1%');

  for (const [width, height] of [
    [320, 700],
    [1280, 800],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('#game').evaluate((game, small) => {
      game.classList.toggle('ejs_small_screen', small);
      game.classList.toggle('ejs_big_screen', !small);
    }, width < 575);
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    const audit = await new AxeBuilder({ page }).analyze();
    expect(
      audit.violations.filter((item) =>
        ['serious', 'critical'].includes(item.impact ?? ''),
      ),
    ).toEqual([]);
  }
  await page.setViewportSize({ width: 600, height: 800 });
  await page.screenshot({ path: 'test-results/player-control-panel.png' });
  await panel.getByRole('button', { name: 'Save state', exact: true }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.locator('#game')).toHaveAttribute(
    'data-last-action',
    'saveState',
  );
  await open.click();
  await panel
    .getByRole('button', { name: 'Restart game', exact: true })
    .click();
  const confirmation = page.getByRole('alertdialog', { name: 'Restart game?' });
  await expect(confirmation).toBeVisible();
  await expect(
    confirmation.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeFocused();
  await confirmation
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(confirmation).not.toBeVisible();
  await expect(panel).toBeVisible();
  await panel
    .getByRole('button', { name: 'Restart game', exact: true })
    .click();
  await page.keyboard.press('Escape');
  await expect(confirmation).not.toBeVisible();
  await expect(panel).toBeVisible();
  await expect(page.locator('#game')).toHaveAttribute(
    'data-last-action',
    'saveState',
  );
  await panel
    .getByRole('button', { name: 'Restart game', exact: true })
    .click();
  const restartAudit = await new AxeBuilder({ page }).analyze();
  expect(
    restartAudit.violations.filter((item) =>
      ['serious', 'critical'].includes(item.impact ?? ''),
    ),
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/restart-confirmation.png' });
  await confirmation
    .getByRole('button', { name: 'Restart game', exact: true })
    .click();
  await expect(confirmation).not.toBeVisible();
  await expect(panel).not.toBeVisible();
  await expect(page.locator('#game')).toHaveAttribute(
    'data-last-action',
    'restart',
  );
  await open.click();
  await panel.getByRole('button', { name: 'Exit game', exact: true }).click();
  const exitConfirmation = page.getByRole('alertdialog', {
    name: 'Exit game?',
  });
  await expect(exitConfirmation).toBeVisible();
  await expect(page.locator('#game')).not.toHaveAttribute('data-exited');
  await exitConfirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Exit game', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(exitConfirmation).not.toBeVisible();
  await expect(page.locator('#game')).not.toHaveAttribute('data-exited');
  await panel.getByRole('button', { name: 'Exit game', exact: true }).click();
  await exitConfirmation.getByRole('button', { name: 'Exit game' }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.locator('#game')).toHaveAttribute('data-exited', 'true');
});

test('redesigned controls open and exit correctly inside the real emulator', async ({
  page,
}) => {
  // Original test-only ARM program: set mode 3, then loop. No commercial ROM.
  const bytes = Buffer.alloc(1024);
  bytes.writeUInt32LE(0xea00002e, 0);
  for (const [index, word] of [
    0xe3a00301, 0xe3a01003, 0xe1c010b0, 0xeafffffe,
  ].entries()) {
    bytes.writeUInt32LE(word, 0xc0 + index * 4);
  }
  bytes.write('POCKET MENU', 0xa0);
  bytes[0xb2] = 0x96;
  let checksum = 0;
  for (let index = 0xa0; index <= 0xbc; index++) checksum -= bytes[index];
  bytes[0xbd] = (checksum - 0x19) & 255;
  await page.goto('/');
  await page.getByTestId('game-upload').setInputFiles({
    name: 'Menu test.gba',
    mimeType: 'application/octet-stream',
    buffer: bytes,
  });
  await page
    .getByRole('dialog', { name: 'Notification' })
    .getByRole('button', { name: 'Got it' })
    .click();
  await page.getByRole('link', { name: 'Play Menu test', exact: true }).click();
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('canvas').first()).toBeVisible({
    timeout: 60_000,
  });
  const more = frame.getByRole('button', { name: 'More options', exact: true });
  const toggle = frame.getByRole('button', {
    name: 'Show game controls',
    exact: true,
  });
  await expect
    .poll(async () => (await more.isVisible()) || (await toggle.isVisible()))
    .toBe(true);
  const focusGame = () =>
    frame.locator('#game').evaluate((element) => {
      element.tabIndex = -1;
      element.focus();
    });
  const muted = () =>
    frame.locator('#game').evaluate(() => window.EJS_emulator.muted);
  const fullscreen = () =>
    frame.locator('#game').evaluate(() => Boolean(document.fullscreenElement));
  await focusGame();
  await page.keyboard.down('m');
  await expect.poll(muted).toBe(true);
  await page.keyboard.down('m'); // A held key must not repeatedly toggle audio.
  await expect.poll(muted).toBe(true);
  await page.keyboard.up('m');
  await page.keyboard.press('m');
  await expect.poll(muted).toBe(false);
  await page.keyboard.press('Control+m');
  await expect.poll(muted).toBe(false);
  await page.keyboard.press('f');
  await expect.poll(fullscreen).toBe(true);
  await page.keyboard.press('f');
  await expect.poll(fullscreen).toBe(false);
  // The same commands work when the outer React player has keyboard focus.
  await page.locator('main').evaluate((element) => {
    element.tabIndex = -1;
    element.focus();
  });
  await page.keyboard.press('m');
  await expect.poll(muted).toBe(true);
  await page.keyboard.press('m');
  await expect.poll(muted).toBe(false);
  await page.keyboard.press('f');
  await expect.poll(fullscreen).toBe(true);
  await page.keyboard.press('f');
  await expect.poll(fullscreen).toBe(false);
  await page.getByRole('button', { name: 'Cheats', exact: true }).click();
  const cheats = page.getByRole('dialog', { name: 'Cheats', exact: true });
  await cheats.getByRole('button', { name: 'Add cheat', exact: true }).click();
  await cheats.getByLabel('Name', { exact: true }).fill('Shortcuts ');
  await page.keyboard.type('fm');
  await expect(cheats.getByLabel('Name', { exact: true })).toHaveValue(
    'Shortcuts fm',
  );
  await expect.poll(muted).toBe(false);
  await expect.poll(fullscreen).toBe(false);
  await cheats.getByRole('button', { name: 'Cancel', exact: true }).click();
  await cheats
    .getByRole('button', { name: 'Close cheats', exact: true })
    .click();
  if (!(await more.isVisible())) await toggle.click();
  await more.click();
  const panel = frame.getByRole('dialog', {
    name: 'More options',
    exact: true,
  });
  await expect(panel).toBeVisible();
  await page.keyboard.press('m');
  await page.keyboard.press('f');
  await expect.poll(muted).toBe(false);
  await expect.poll(fullscreen).toBe(false);
  await expect(
    panel.getByRole('region', { name: 'Save states', exact: true }),
  ).toBeVisible();
  await expect(
    panel
      .getByRole('button', { name: 'Save state', exact: true })
      .locator('.ejs_menu_text'),
  ).toHaveCSS('color', 'rgb(238, 234, 227)');
  await page.screenshot({ path: 'test-results/player-control-panel-live.png' });
  await panel.getByRole('button', { name: 'Load state', exact: true }).click();
  const missingState = page.getByRole('dialog', { name: 'Notification' });
  await expect(missingState).toContainText(
    'There is no saved state yet. Save a state first.',
  );
  await missingState.getByRole('button', { name: 'Got it' }).click();
  await expect(frame.locator('#message')).toBeHidden();
  await expect(
    frame.getByText('Unsupported data type', { exact: true }),
  ).toHaveCount(0);
  // A real saved state must still load successfully after the missing-state error.
  if (!(await more.isVisible())) await toggle.click();
  await more.click();
  await panel.getByRole('button', { name: 'Save state', exact: true }).click();
  await expect(frame.locator('.ejs_message')).toHaveText(
    'SAVE SAVED TO BROWSER',
  );
  if (!(await more.isVisible())) await toggle.click();
  await more.click();
  await panel.getByRole('button', { name: 'Load state', exact: true }).click();
  await expect(frame.locator('.ejs_message')).toHaveText(
    'SAVE LOADED FROM BROWSER',
  );
  await expect(frame.locator('#message')).toBeHidden();
  if (!(await more.isVisible())) await toggle.click();
  await more.click();
  await panel
    .getByRole('button', { name: 'Restart game', exact: true })
    .click();
  const restart = frame.getByRole('alertdialog', { name: 'Restart game?' });
  await restart
    .getByRole('button', { name: 'Restart game', exact: true })
    .click();
  await expect(restart).not.toBeVisible();
  await expect(frame.locator('canvas').first()).toBeVisible();
  if (!(await more.isVisible())) await toggle.click();
  await more.click();
  await panel
    .getByRole('button', { name: 'Control settings', exact: true })
    .click();
  const controls = frame.getByRole('dialog', {
    name: 'Control Settings',
    exact: true,
  });
  await expect(controls).toBeVisible();
  await expect(
    controls.getByRole('textbox', {
      name: 'A gamepad binding, player 1',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(controls.locator('.ejs_control_body')).toHaveCSS(
    'scrollbar-width',
    'thin',
  );
  const keyboardA = controls.getByRole('textbox', {
    name: 'A keyboard binding, player 1',
    exact: true,
  });
  await expect(keyboardA).toHaveValue('z');
  await expect(keyboardA).toHaveCSS(
    'background-color',
    'rgba(255, 255, 255, 0.02)',
  );
  await controls.getByRole('tab', { name: 'Player 2', exact: true }).click();
  await expect(
    controls.getByRole('tab', { name: 'Player 2', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(
    controls.getByRole('tab', { name: 'Player 1', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await controls
    .getByRole('button', { name: 'Change A binding', exact: true })
    .click();
  await expect(frame.locator('.pocket-control-capture')).toBeVisible();
  await page.keyboard.press('c');
  await expect(keyboardA).toHaveValue('c');
  await controls
    .getByRole('button', { name: 'Change A binding', exact: true })
    .click();
  await page.keyboard.press('Escape');
  await expect(controls).toBeVisible();
  await expect(keyboardA).toHaveValue('escape');
  await controls.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(keyboardA).toHaveValue('z');
  const controlAudit = await new AxeBuilder({ page }).analyze();
  expect(
    controlAudit.violations.filter((item) =>
      ['serious', 'critical'].includes(item.impact ?? ''),
    ),
  ).toEqual([]);
  for (const [width, height] of [
    [320, 700],
    [1280, 800],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const box = (await controls.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'test-results/control-settings-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/control-settings-mobile.png' });
  await controls.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(controls).not.toBeVisible();
  if (!(await more.isVisible())) await toggle.click();
  await more.click();
  await panel
    .getByRole('button', { name: 'Emulator settings', exact: true })
    .click();
  const settings = frame.getByRole('dialog', {
    name: 'Emulator settings',
    exact: true,
  });
  await expect(settings).toBeVisible();
  await settings
    .getByRole('button', { name: 'Graphics Settings', exact: true })
    .click();
  await settings.getByRole('button', { name: 'FPS', exact: true }).click();
  await expect(
    settings.getByRole('button', { name: /^hide$/i }),
  ).toHaveAttribute('aria-pressed', 'true');
  await settings.getByRole('button', { name: /^show$/i }).click();
  await expect(
    settings.getByRole('button', { name: 'FPS', exact: true }),
  ).toHaveAttribute('aria-description', /Current value: show/i);
  await settings.getByRole('button', { name: 'FPS', exact: true }).click();
  await settings.getByRole('button', { name: /^hide$/i }).click();
  await settings
    .getByRole('button', { name: 'Back from Graphics Settings', exact: true })
    .click();
  await expect(
    settings.getByRole('button', { name: 'Graphics Settings', exact: true }),
  ).toBeVisible();
  await expect(settings.locator('.ejs_settings_transition')).toHaveCSS(
    'scrollbar-width',
    'thin',
  );
  for (const [width, height] of [
    [320, 700],
    [1280, 800],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const box = (await settings.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const settingsAudit = await new AxeBuilder({ page }).analyze();
  expect(
    settingsAudit.violations.filter((item) =>
      ['serious', 'critical'].includes(item.impact ?? ''),
    ),
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/emulator-settings-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/emulator-settings-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(settings).not.toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  const libraryConfirmation = page.getByRole('dialog', { name: 'Exit game?' });
  await expect(libraryConfirmation).toBeVisible();
  await expect(
    libraryConfirmation.getByRole('button', { name: 'Cancel' }),
  ).toBeFocused();
  await libraryConfirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('iframe')).toBeVisible();
  if (!(await more.isVisible())) await toggle.click();
  await more.click();
  await panel.getByRole('button', { name: 'Exit game', exact: true }).click();
  await frame
    .getByRole('alertdialog', { name: 'Exit game?' })
    .getByRole('button', { name: 'Exit game' })
    .click();
  await expect(
    page.getByRole('heading', { name: /Your library/ }),
  ).toBeVisible();
});
