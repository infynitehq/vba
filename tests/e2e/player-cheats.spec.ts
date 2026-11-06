import { test, expect, type Page } from '@playwright/test';
import { diagnosticRom, cheatHookRom } from './fixtures/diagnostic-rom';

const contentFrame = (page: Page) =>
  page.frames().find((frame) => frame.url().includes('player.html'))!;

for (const [format, code] of [
  ['CodeBreaker', '82000000 1234\n82000002 5678'],
  ['Action Replay master', 'E6A003D6 8110DDD5\nA47FB2DC 1AF3CA86'],
]) {
  test(`${format} changes wait for a fresh launch without resetting live hooks`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByTestId('game-upload').setInputFiles({
      name: 'Display test.gba',
      mimeType: 'application/octet-stream',
      buffer: format === 'CodeBreaker' ? diagnosticRom() : cheatHookRom(),
    });
    await page.getByRole('button', { name: 'Got it' }).click();
    await page.getByRole('link', { name: 'Play Display test' }).click();
    const player = page.frameLocator('iframe');
    const toolbar = player.getByRole('toolbar', { name: 'Game controls' });
    await expect(toolbar).toBeAttached({ timeout: 45_000 });
    await page.getByRole('button', { name: 'Cheats', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Cheats', exact: true });
    await sheet.getByRole('button', { name: 'Add cheat', exact: true }).click();
    await sheet.getByLabel('Name', { exact: true }).fill('RAM test');
    await sheet.getByLabel('Cheat code', { exact: true }).fill(code);
    await sheet.getByRole('button', { name: 'Save cheat' }).click();
    await page.getByRole('button', { name: 'Got it' }).click();
    const toggle = sheet.getByRole('checkbox', { name: 'Enable RAM test' });
    await toggle.click();
    await expect(toggle).toBeChecked();
    const pending = page
      .getByRole('status', { includeHidden: true })
      .filter({ hasText: 'Cheat changes apply next launch' });
    await expect(pending).toBeVisible();

    // The next player starts with the selected code already enabled. Unlike a
    // generic ROM, cheatHookRom actually executes the master-code hook address.
    await page.reload();
    await expect(toolbar).toBeAttached({ timeout: 45_000 });
    await expect(pending).toBeHidden();
    const frame = contentFrame(page);
    await frame.evaluate(() => {
      const win = window as unknown as {
        cheatCalls: string[];
        EJS_emulator: {
          gameManager: {
            resetCheat: () => void;
            setCheat: (...args: unknown[]) => void;
          };
        };
      };
      win.cheatCalls = [];
      const manager = win.EJS_emulator.gameManager;
      const reset = manager.resetCheat.bind(manager);
      const set = manager.setCheat.bind(manager);
      manager.resetCheat = () => {
        win.cheatCalls.push('reset');
        reset();
      };
      manager.setCheat = (...args) => {
        win.cheatCalls.push('set');
        set(...args);
      };
    });
    await page.getByRole('button', { name: 'Cheats', exact: true }).click();
    for (let i = 0; i < 4; i++) {
      await test.step(`toggle ${i + 1}`, async () => {
        await toggle.click();
        await expect(toggle).toBeChecked({ checked: i % 2 === 1 });
        if (i % 2 === 0) await expect(pending).toBeVisible();
        else await expect(pending).toBeHidden();
        await expect(player.locator('#message')).toBeHidden();
      });
    }
    await sheet.getByRole('button', { name: 'Close cheats' }).click();
    expect(
      await frame.evaluate(
        () => (window as unknown as { cheatCalls: string[] }).cheatCalls,
      ),
    ).toEqual([]);
    const frameCount = () =>
      frame.evaluate(() =>
        (
          window as unknown as {
            EJS_emulator: {
              gameManager: { functions: { getFrameNum: () => number } };
            };
          }
        ).EJS_emulator.gameManager.functions.getFrameNum(),
      );
    const before = await frameCount();
    await expect.poll(frameCount).toBeGreaterThan(before);
    expect(
      await frame.evaluate(
        () =>
          (
            window as unknown as {
              EJS_emulator: { gameManager: { getState: () => Uint8Array } };
            }
          ).EJS_emulator.gameManager.getState().length,
      ),
    ).toBeGreaterThan(0);
    expect(
      await frame.evaluate(
        () => (window as unknown as { EJS_cheats: unknown[] }).EJS_cheats,
      ),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
}
