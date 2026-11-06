import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { zipSync } from 'fflate';
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Original test-only ARM program: mode 3, solid screen, A changes the color.
// No copyrighted ROM, Nintendo logo, game code database, or BIOS is used.
function ownRom(title: string, color: number) {
  const bytes = new Uint8Array(1024);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0xea00002e, true); // b 0xc0
  bytes.set(new TextEncoder().encode(title.slice(0, 12)), 0xa0);
  bytes.set(new TextEncoder().encode('TEST00'), 0xac);
  bytes[0xb2] = 0x96;
  bytes.set(new TextEncoder().encode('SRAM_V113'), 0x300);
  const code = [
    0xe3a00301, // mov r0, #0x04000000
    0xe3a01003, // mov r1, #3
    0xe3811c04, // orr r1, r1, #0x400
    0xe1c010b0, // strh r1, [r0]
    0xe3a02406, // mov r2, #0x06000000
    0xe3a03000 | color, // mov r3, #color
    0xe3a07402, // mov r7, #0x02000000
    0xe1c730b0, // strh r3, [r7]
    0xe3a04c96, // mov r4, #38400
    0xe1c230b0, // strh r3, [r2]
    0xe2822002, // add r2, r2, #2
    0xe2544001, // subs r4, r4, #1
    0x1afffffb, // bne fill
    0xe2805c01, // add r5, r0, #0x100
    0xe1d563b0, // ldrh r6, [r5, #0x30]
    0xe3160001, // tst r6, #1
    0x03a0301f, // moveq r3, #31
    0x11d730b0, // ldrhne r3, [r7] (cheat-controlled color)
    0xe3a02406, // mov r2, #0x06000000
    0xe3a04c96, // mov r4, #38400
    0xeafffff3, // b fill
  ];
  code.forEach((word, index) => view.setUint32(0xc0 + index * 4, word, true));
  let checksum = 0;
  for (let i = 0xa0; i <= 0xbc; i++) checksum -= bytes[i];
  bytes[0xbd] = (checksum - 0x19) & 255;
  return Buffer.from(bytes);
}
async function addGame(page: Page, name: string, bytes: Buffer) {
  await page.getByTestId('game-upload').setInputFiles({
    name,
    mimeType: 'application/octet-stream',
    buffer: bytes,
  });
  await expect(
    page.getByRole('heading', {
      name: name.replace(/\.(gba|zip)$/, ''),
      exact: true,
    }),
  ).toBeVisible();
}
test('local library, cheats, two isolated launches, accessibility and offline core', async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  context.on('request', (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).origin !== 'http://localhost:4173'
    )
      externalRequests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Your library' }),
  ).toBeVisible();
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const path of ['/', '/settings']) {
      await page.goto(path);
      const audit = await new AxeBuilder({ page }).analyze();
      expect(
        audit.violations.filter((item) =>
          ['serious', 'critical'].includes(item.impact ?? ''),
        ),
      ).toEqual([]);
    }
  }
  await page.goto('/');
  // No game has ever been launched in this clean browser context.
  // Wait for full emulator precaching, then cold-load and import offline.
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  expect(
    await page.evaluate(async () =>
      (await indexedDB.databases()).some((db) => db.name === 'EmulatorJS-core'),
    ),
  ).toBe(false);
  const network = await context.newCDPSession(page);
  await network.send('Network.clearBrowserCache');
  await context.setOffline(true);
  await page.reload();
  await addGame(page, 'Own adventure.gba', ownRom('POCKET ONE', 224));
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Own adventure', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cheats for Own adventure' }).click();
  await page.getByRole('button', { name: 'Add cheat', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Test code');
  await page.getByLabel('Cheat code', { exact: true }).fill('82000000 1234');
  await page.getByRole('button', { name: 'Save cheat' }).click();
  await page.getByRole('checkbox', { name: 'Enable Test code' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Enable Test code' }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Edit Test code' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Edited code');
  await page.getByRole('button', { name: 'Save cheat' }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const backup = await downloaded;
  const filePath = await backup.path();
  expect(filePath).toBeTruthy();
  await page.getByRole('button', { name: 'Close cheats' }).click();
  await page
    .getByRole('link', { name: 'Play Own adventure', exact: true })
    .click();
  await expect(page).toHaveURL(/\/play\//);
  await page.reload(); // Offline deep links must load the static player too.
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('canvas').first()).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(() =>
      page
        .frames()[1]
        ?.evaluate(() =>
          Boolean(
            (window as unknown as { EJS_emulator?: { started: boolean } })
              .EJS_emulator?.started,
          ),
        ),
    )
    .toBe(true);
  const emulatorFrame = page.frames()[1];
  await expect(
    page.getByRole('button', { name: 'Fast forward', exact: true }),
  ).toHaveCount(0);
  const frameBeforeSpeedChange = await emulatorFrame.evaluate(() => {
    const manager = window.EJS_emulator.gameManager;
    const toggle = manager.toggleFastForward.bind(manager);
    window.pocketSpeedCalls = [];
    manager.toggleFastForward = (value) => {
      window.pocketSpeedCalls.push(value);
      toggle(value);
    };
    return manager.getFrameNum();
  });
  const speed = () =>
    emulatorFrame.evaluate(() => window.EJS_emulator.isFastForward);
  const focusGame = () => frame.locator('#game').focus();
  await focusGame();
  await page.keyboard.down('Space');
  await expect.poll(speed).toBe(true);
  await page.keyboard.down('Space'); // Repeated keydown must not toggle off.
  await expect.poll(speed).toBe(true);
  await page.keyboard.up('Space');
  await expect.poll(speed).toBe(false);
  expect(
    await emulatorFrame.evaluate(() =>
      window.EJS_emulator.getSettingValue('fastForward'),
    ),
  ).toBe('disabled');
  expect(await emulatorFrame.evaluate(() => window.pocketSpeedCalls)).toEqual([
    1, 0,
  ]);
  await expect
    .poll(() =>
      emulatorFrame.evaluate(() =>
        window.EJS_emulator.gameManager.getFrameNum(),
      ),
    )
    .toBeGreaterThan(frameBeforeSpeedChange);
  // Releasing Space must preserve a permanent fast-forward menu preference.
  await page.waitForTimeout(350); // Keep independent holds outside the double-tap window.
  await emulatorFrame.evaluate(() => {
    window.EJS_emulator.changeSettingOption('ff-ratio', '2.0');
    window.EJS_emulator.changeSettingOption('fastForward', 'enabled');
  });
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await expect.poll(speed).toBe(true);
  expect(
    await emulatorFrame.evaluate(() =>
      window.EJS_emulator.getSettingValue('fastForward'),
    ),
  ).toBe('enabled');
  await emulatorFrame.evaluate(() =>
    window.EJS_emulator.changeSettingOption('fastForward', 'disabled'),
  );
  await expect.poll(speed).toBe(false);
  // Losing focus releases the hold even if the browser loses the keyup.
  await page.waitForTimeout(350);
  await page.keyboard.down('Space');
  await expect.poll(speed).toBe(true);
  await page.locator('main').evaluate((element) => {
    element.setAttribute('tabindex', '-1');
    element.focus();
  });
  await expect.poll(speed).toBe(false);
  await page.keyboard.up('Space');
  // The same shortcut works when the parent player page has focus.
  await page.keyboard.down('Space');
  await expect.poll(speed).toBe(true);
  await page.keyboard.up('Space');
  await expect.poll(speed).toBe(false);
  // Space in an actual cheat input remains text, not a speed shortcut.
  await page.getByRole('button', { name: 'Cheats', exact: true }).click();
  await page.getByRole('button', { name: 'Add cheat', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Space');
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Space ');
  await expect.poll(speed).toBe(false);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Close cheats' }).click();
  await focusGame();
  // A rejected native hold reports an error without restarting the game.
  await emulatorFrame.evaluate(() => {
    const manager = window.EJS_emulator.gameManager;
    const toggle = manager.toggleFastForward.bind(manager);
    manager.toggleFastForward = (value) => {
      manager.toggleFastForward = toggle;
      throw new Error(`Test-only speed failure: ${value}`);
    };
  });
  await page.keyboard.down('Space');
  await expect(
    page.getByText('Fast forward could not be changed.', { exact: false }),
  ).toBeVisible();
  await page.keyboard.up('Space');
  await expect.poll(speed).toBe(false);
  expect(await emulatorFrame.evaluate(() => window.EJS_emulator.started)).toBe(
    true,
  );
  // Read the actual rendered frame, not just the existence of a canvas.
  const pixel = async () => {
    const png = await emulatorFrame.evaluate(async () =>
      Array.from(await window.EJS_emulator.gameManager.screenshot()),
    );
    const { data, info } = await sharp(Buffer.from(png))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const center =
      (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) *
      info.channels;
    return Array.from(data.subarray(center, center + 3));
  };
  await expect.poll(pixel).toEqual([165, 138, 33]); // Core's BGR555 -> RGB565 -> RGB8 conversion of 0x1234.
  // Verify the touch A control reaches the emulated KEYINPUT register.
  const touchA = frame
    .locator('.ejs_virtualGamepad_button')
    .filter({ hasText: /^A$/ });
  await expect(touchA).toBeVisible();
  const box = await touchA.boundingBox();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }],
  });
  await expect.poll(pixel).toEqual([255, 0, 0]);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect.poll(pixel).toEqual([165, 138, 33]);
  // An actual .sav import/export through EmulatorJS's supported toolbar.
  while (
    await page.getByRole('button', { name: 'Dismiss notification' }).count()
  )
    await page
      .getByRole('button', { name: 'Dismiss notification' })
      .first()
      .click();
  if (await frame.locator('.ejs_menu_bar_hidden').count())
    await frame.locator('.ejs_virtualGamepad_open').tap();
  const toolbar = frame.getByRole('toolbar', { name: 'Game controls' });
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveCSS('opacity', '1');
  await expect(toolbar.locator('button:visible')).toHaveCount(4);
  expect((await toolbar.boundingBox())!.width).toBeLessThanOrEqual(200);
  await page.screenshot({ path: testInfo.outputPath('minimal-toolbar.png') });
  await toolbar.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(
    toolbar.getByRole('button', { name: 'Resume', exact: true }),
  ).toBeVisible();
  await toolbar.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(
    toolbar.getByRole('button', { name: 'Pause', exact: true }),
  ).toBeVisible();
  await toolbar.getByRole('button', { name: 'Mute', exact: true }).click();
  await expect
    .poll(() => emulatorFrame.evaluate(() => window.EJS_emulator.muted))
    .toBe(true);
  await toolbar.getByRole('button', { name: 'Unmute', exact: true }).click();
  await expect
    .poll(() => emulatorFrame.evaluate(() => window.EJS_emulator.muted))
    .toBe(false);
  await toolbar
    .getByRole('button', { name: 'More options', exact: true })
    .click();
  const moreOptions = frame.getByRole('dialog', {
    name: 'More options',
    exact: true,
  });
  await expect(moreOptions).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('more-options.png') });
  for (const name of [
    'Save state',
    'Load state',
    'Backup saves',
    'Restore saves',
    'Control settings',
    'Emulator settings',
    'Restart game',
    'Exit game',
  ]) {
    await expect(
      moreOptions.getByRole('button', { name, exact: true }),
    ).toBeVisible();
  }
  await expect(
    moreOptions.getByRole('slider', { name: 'Volume' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(moreOptions).not.toBeVisible();
  await toolbar
    .getByRole('button', { name: 'More options', exact: true })
    .click();
  const chooserPromise = page.waitForEvent('filechooser');
  await frame
    .getByRole('button', { name: 'Restore saves', exact: true })
    .click();
  await (
    await chooserPromise
  ).setFiles({
    name: 'own.sav',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(32768, 42),
  });
  await expect
    .poll(() =>
      emulatorFrame.evaluate(
        () => window.EJS_emulator.gameManager.getSaveFile(false)?.[0],
      ),
    )
    .toBe(42);
  const savDownloadPromise = page.waitForEvent('download');
  if (await frame.locator('.ejs_menu_bar_hidden').count())
    await frame
      .getByRole('button', { name: 'Show game controls', exact: true })
      .tap();
  await toolbar
    .getByRole('button', { name: 'More options', exact: true })
    .click();
  await frame
    .getByRole('button', { name: 'Backup saves', exact: true })
    .click();
  const savDownload = await savDownloadPromise;
  expect(savDownload.suggestedFilename()).toBe('Own adventure.sav');
  expect((await readFile((await savDownload.path())!))[0]).toBe(42);
  // Simulate a bridge failure: named toast, still-running emulator.
  await emulatorFrame.evaluate(() => {
    const manager = window.EJS_emulator.gameManager;
    const original = manager.setCheat.bind(manager);
    manager.setCheat = () => {
      manager.setCheat = original;
      throw new Error('Test-only bridge failure');
    };
  });
  await page.getByRole('button', { name: 'Cheats', exact: true }).click();
  const toggle = page.getByRole('checkbox', { name: 'Enable Edited code' });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(
    page.getByText('“Edited code” could not be applied.', { exact: false }),
  ).toBeVisible();
  expect(await emulatorFrame.evaluate(() => window.EJS_emulator.started)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Close cheats' }).click();
  const firstWindow = await page.frames()[1].evaluate(() => {
    (window as unknown as { pocketMarker: string }).pocketMarker = 'first';
    return true;
  });
  expect(firstWindow).toBe(true);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  const exitConfirmation = page.getByRole('dialog', { name: 'Exit game?' });
  await expect(exitConfirmation).toBeVisible();
  await exitConfirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('iframe')).toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await exitConfirmation.getByRole('button', { name: 'Exit game' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your library' }),
  ).toBeVisible();
  expect(page.frames()).toHaveLength(1);
  const playedGame = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Own adventure', exact: true }),
  });
  await expect(playedGame.getByText(/^Last played/)).toBeVisible();
  await expect(playedGame.getByText(/^Saved/)).toBeVisible();
  const zipped = zipSync({ 'Own second.gba': ownRom('POCKET TWO', 16) });
  await addGame(page, 'Own second.zip', Buffer.from(zipped));
  // Filename inside zip is deliberately unambiguous in this fixture.
  await page
    .getByRole('link', { name: 'Play Own second', exact: true })
    .click();
  await expect(
    page.frameLocator('iframe').locator('canvas').first(),
  ).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(() =>
      page
        .frames()[1]
        .evaluate(() => Boolean(window.EJS_emulator?.isFastForward)),
    )
    .toBe(false);
  expect(
    await page
      .frames()[1]
      .evaluate(
        () => (window as unknown as { pocketMarker?: string }).pocketMarker,
      ),
  ).toBeUndefined();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await exitConfirmation.getByRole('button', { name: 'Exit game' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your library' }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Own adventure', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Play Own adventure', exact: true })
    .click();
  await expect(
    page.frameLocator('iframe').locator('canvas').first(),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await exitConfirmation.getByRole('button', { name: 'Exit game' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your library' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cheats for Own adventure' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Enable Edited code' }),
  ).toBeChecked();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Edited code' }).click();
  await expect(page.getByRole('heading', { name: 'Edited code' })).toHaveCount(
    0,
  );
  await page
    .getByRole('dialog')
    .locator('input[type=file]')
    .setInputFiles(filePath!);
  await expect(
    page.getByRole('heading', { name: 'Edited code' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close cheats' }).click();
  await context.setOffline(false);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const allDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all cheats' }).click();
  const allDownload = await allDownloadPromise;
  await page
    .locator('input[type=file]')
    .setInputFiles((await allDownload.path())!);
  await expect(
    page.getByText('Cheats imported.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await page
    .getByRole('link', { name: 'Play Own adventure', exact: true })
    .click();
  await expect(
    page.frameLocator('iframe').locator('canvas').first(),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .frames()[1]
        .evaluate(
          () => window.EJS_emulator.gameManager.getSaveFile(false)?.[0],
        ),
    )
    .toBe(42);
  // Deploy a byte-different SW, preserving the production output afterwards.
  const sw = await readFile('dist/sw.js', 'utf8');
  try {
    await writeFile('dist/sw.js', `${sw}\n// smoke deployment ${Date.now()}\n`);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    await expect(
      page.getByRole('button', { name: 'Reload to update' }),
    ).toBeVisible({ timeout: 15000 });
    expect(
      await page.frames()[1].evaluate(() => window.EJS_emulator.started),
    ).toBe(true);
    await page.getByRole('button', { name: 'Later', exact: true }).click();
    expect(page.url()).toContain('/play/');
  } finally {
    await writeFile('dist/sw.js', sw);
  }
  const lastFrame = page.frameLocator('iframe');
  if (await lastFrame.locator('.ejs_menu_bar_hidden').count())
    await lastFrame
      .getByRole('button', { name: 'Show game controls', exact: true })
      .tap();
  await lastFrame
    .getByRole('button', { name: 'More options', exact: true })
    .click();
  await lastFrame
    .getByRole('button', { name: 'Exit game', exact: true })
    .click();
  await lastFrame
    .getByRole('alertdialog', { name: 'Exit game?' })
    .getByRole('button', { name: 'Exit game' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your library' }),
  ).toBeVisible();
  expect(page.frames()).toHaveLength(1);
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

declare global {
  interface Window {
    pocketSpeedCalls: number[];
    EJS_emulator: {
      started: boolean;
      isFastForward: boolean;
      muted: boolean;
      changeSettingOption(option: string, value: string): void;
      getSettingValue(option: string): string | null;
      gameManager: {
        toggleFastForward(active: number): void;
        getFrameNum(): number;
        setCheat(index: number, enabled: boolean, code: string): void;
        getSaveFile(save?: boolean): Uint8Array | null;
        screenshot(): Promise<Uint8Array>;
      };
    };
  }
}
