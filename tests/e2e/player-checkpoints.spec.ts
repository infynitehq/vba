import { test, expect, type Frame, type Page } from '@playwright/test';
import { diagnosticRom } from './fixtures/diagnostic-rom';

type PlayerWindow = Window & {
  EJS_emulator: {
    paused: boolean;
    getBaseFileName(): string;
    gameManager: { getFrameNum(): number; getState(): Uint8Array };
    storage: {
      states: {
        get(key: string): Promise<Uint8Array | undefined>;
        put(key: string, data: Uint8Array): Promise<void>;
      };
    };
  };
  PocketCheckpoints: {
    load(
      gameId: string,
    ): Promise<{ state: Uint8Array; savedAt: number } | null>;
    save(gameId: string, state: Uint8Array): Promise<void>;
  };
};

async function launch(page: Page) {
  await page.getByRole('link', { name: 'Play Checkpoint test' }).click();
  const locator = page.frameLocator('iframe');
  await expect(
    locator.getByRole('toolbar', { name: 'Game controls' }),
  ).toBeVisible({ timeout: 45_000 });
  return (await (await page
    .locator('iframe')
    .elementHandle())!.contentFrame())!;
}

async function openMore(page: Page) {
  const player = page.frameLocator('iframe');
  const show = player.getByRole('button', { name: 'Show game controls' });
  if (await show.isVisible()) await show.click();
  await player
    .getByRole('button', { name: 'More options', exact: true })
    .click();
}

async function exitThroughToolbar(page: Page) {
  const player = page.frameLocator('iframe');
  await openMore(page);
  await player
    .getByRole('dialog', { name: 'More options', exact: true })
    .getByRole('button', { name: 'Exit game', exact: true })
    .click();
  await player
    .getByRole('alertdialog', { name: 'Exit game?', exact: true })
    .getByRole('button', { name: 'Exit game', exact: true })
    .click();
}

const frameNumber = (frame: Frame) =>
  frame.evaluate(() =>
    (window as unknown as PlayerWindow).EJS_emulator.gameManager.getFrameNum(),
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('game-upload').setInputFiles({
    name: 'Checkpoint test.gba',
    mimeType: 'application/octet-stream',
    buffer: diagnosticRom(),
  });
  await page.getByRole('button', { name: 'Got it' }).click();
});

test('exit checkpoint resumes real core state, preserves manual state, and can be disabled', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let frame = await launch(page);
  await expect.poll(() => frameNumber(frame)).toBeGreaterThan(120);
  const gameId = new URL(page.url()).pathname.split('/').at(-1)!;
  const beforeExit = await frameNumber(frame);
  await frame.evaluate(async () => {
    const emulator = (window as unknown as PlayerWindow).EJS_emulator;
    // Keep an unmistakable manual-state sentinel: automatic saves must never
    // touch this slot, even while the checkpoint contains a real mGBA state.
    await emulator.storage.states.put(
      `${emulator.getBaseFileName()}.state`,
      new Uint8Array([42, 43, 44]),
    );
  });
  await exitThroughToolbar(page);
  await expect(
    page.getByRole('link', { name: 'Play Checkpoint test' }),
  ).toBeVisible();
  frame = await launch(page);
  const player = page.frameLocator('iframe');
  const resume = player.getByRole('dialog', {
    name: 'Resume last checkpoint?',
    exact: true,
  });
  await expect(resume).toBeVisible();
  expect(
    await frame.evaluate(
      () => (window as unknown as PlayerWindow).EJS_emulator.paused,
    ),
  ).toBe(true);
  const savedAt = await frame.evaluate(
    async (id) =>
      (await (window as unknown as PlayerWindow).PocketCheckpoints.load(id))!
        .savedAt,
    gameId,
  );
  await resume.getByRole('button', { name: 'Resume checkpoint' }).click();
  await expect(resume).toBeHidden();
  await expect
    .poll(() => frameNumber(frame))
    .toBeGreaterThanOrEqual(beforeExit);
  expect(
    await frame.evaluate(async () => {
      const emulator = (window as unknown as PlayerWindow).EJS_emulator;
      return Array.from(
        (await emulator.storage.states.get(
          `${emulator.getBaseFileName()}.state`,
        ))!,
      );
    }),
  ).toEqual([42, 43, 44]);

  await openMore(page);
  const toggle = player.getByRole('checkbox', {
    name: /Save checkpoint on exit/,
  });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(toggle).toBeEnabled();
  await page.keyboard.press('Escape');
  await exitThroughToolbar(page);
  await expect(
    page.getByRole('link', { name: 'Play Checkpoint test' }),
  ).toBeVisible();
  frame = await launch(page);
  await expect(resume).toBeHidden();
  expect(
    await frame.evaluate(
      async (id) =>
        (await (window as unknown as PlayerWindow).PocketCheckpoints.load(id))!
          .savedAt,
      gameId,
    ),
  ).toBe(savedAt);
  await openMore(page);
  await expect(toggle).not.toBeChecked();
  expect(errors).toEqual([]);
});

test('a failed automatic save leaves the real game running instead of navigating away', async ({
  page,
}) => {
  const frame = await launch(page);
  await frame.evaluate(() => {
    (window as unknown as PlayerWindow).PocketCheckpoints.save = async () => {
      throw new Error('Simulated quota failure');
    };
  });
  await exitThroughToolbar(page);
  await expect(page.locator('iframe')).toBeVisible();
  await expect(page.getByText(/Progress could not be saved/)).toBeVisible();
  const before = await frameNumber(frame);
  await expect.poll(() => frameNumber(frame)).toBeGreaterThan(before);
});
