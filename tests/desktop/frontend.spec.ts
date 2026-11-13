import { test, expect, type Page } from '@playwright/test';
import { diagnosticRom } from '../e2e/fixtures/diagnostic-rom';

type NativeTestWindow = Window & {
  desktopTest: {
    calls: { command: string; args: Record<string, unknown> }[];
    emit(event: string, payload: unknown): void;
  };
};

async function mockNative(page: Page) {
  await page.addInitScript(
    ({ bytes }) => {
      if (window !== window.top) return;
      const callbacks = new Map<number, (event: unknown) => void>();
      const listeners = new Map<string, number>();
      let nextId = 1;
      const calls: { command: string; args: Record<string, unknown> }[] = [];
      Object.assign(window, {
        desktopTest: {
          calls,
          emit(event: string, payload: unknown) {
            const handler = listeners.get(event);
            if (handler) callbacks.get(handler)?.({ event, id: 1, payload });
          },
        },
        __TAURI_EVENT_PLUGIN_INTERNALS__: {
          unregisterListener() {},
        },
        __TAURI_INTERNALS__: {
          transformCallback(callback: (event: unknown) => void) {
            const id = nextId++;
            callbacks.set(id, callback);
            return id;
          },
          unregisterCallback(id: number) {
            callbacks.delete(id);
          },
          async invoke(command: string, args: Record<string, unknown> = {}) {
            calls.push({ command, args });
            if (command === 'plugin:event|listen') {
              listeners.set(args.event as string, args.handler as number);
              return nextId++;
            }
            if (command === 'plugin:event|unlisten') return;
            if (command === 'update_status')
              return {
                phase: 'disabled',
                currentVersion: '0.2.0',
                reason: 'Updates are not configured for this test build.',
              };
            if (command === 'import_file') {
              if (args.kind === 'rom')
                return { name: 'Desktop diagnostic.gba', bytes };
              return null;
            }
            if (command === 'export_file') return true;
            if (
              [
                'complete_shutdown',
                'cancel_shutdown',
                'desktop_ready',
                'frontend_ready',
              ].includes(command)
            )
              return;
            throw new Error(`Unexpected native command: ${command}`);
          },
        },
      });
    },
    { bytes: Array.from(diagnosticRom()) },
  );
}

async function importGame(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add a game', exact: true }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(
    page.getByRole('link', { name: 'Play Desktop diagnostic' }),
  ).toBeVisible();
}

async function waitForCore(page: Page) {
  await expect(page.frameLocator('iframe').locator('canvas')).toBeVisible({
    timeout: 45_000,
  });
  const frame = await (await page
    .locator('iframe')
    .elementHandle())!.contentFrame();
  await expect
    .poll(() =>
      frame!.evaluate(
        () =>
          (
            window as unknown as {
              EJS_emulator?: {
                gameManager?: { getFrameNum(): number };
              };
            }
          ).EJS_emulator?.gameManager?.getFrameNum() ?? 0,
      ),
    )
    .toBeGreaterThan(10);
  return frame!;
}

test.beforeEach(async ({ page }) => mockNative(page));

test('a denied gamepad permission does not prevent desktop gameplay', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (window === window.top) return;
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      writable: true,
      value: () => {
        throw new DOMException('Permission was denied', 'SecurityError');
      },
    });
  });
  await importGame(page);
  await page.getByRole('link', { name: 'Play Desktop diagnostic' }).click();
  await expect(page.getByRole('dialog', { name: 'Notification' })).toBeHidden();
  await waitForCore(page);
  await expect(
    page.frameLocator('iframe').getByRole('toolbar', { name: 'Game controls' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Notification' })).toBeHidden();
});

test('desktop import, native export, persistence, and no service worker', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await importGame(page);
  await page.reload();
  await expect(
    page.getByRole('link', { name: 'Play Desktop diagnostic' }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope),
    ),
  ).toEqual([]);
  await page.goto('/settings');
  await expect(page.getByText(/needs HTTPS/)).toBeHidden();
  await page.getByRole('button', { name: 'Export all cheats' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as NativeTestWindow).desktopTest.calls.some(
          (call) => call.command === 'export_file',
        ),
      ),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test('native close persists a real core checkpoint before acknowledging', async ({
  page,
}) => {
  await importGame(page);
  await page.getByRole('link', { name: 'Play Desktop diagnostic' }).click();
  await waitForCore(page);
  const gameId = new URL(page.url()).pathname.split('/').at(-1)!;
  await page.evaluate(() =>
    (window as unknown as NativeTestWindow).desktopTest.emit(
      'desktop:close-requested',
      {
        requestId: 'native-close-test',
      },
    ),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as NativeTestWindow).desktopTest.calls.some(
          (call) =>
            call.command === 'complete_shutdown' &&
            call.args.requestId === 'native-close-test',
        ),
      ),
    )
    .toBe(true);
  const checkpoint = await page.evaluate(
    (id) =>
      new Promise<boolean>((resolve, reject) => {
        const request = indexedDB.open('pocket-gba-checkpoints', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction('checkpoints')
            .objectStore('checkpoints')
            .get(id);
          read.onsuccess = () => {
            resolve(Boolean(read.result?.current?.state?.byteLength));
            db.close();
          };
          read.onerror = () => reject(read.error);
        };
      }),
    gameId,
  );
  expect(checkpoint).toBe(true);
});

test('native close stays open and reports a failed checkpoint', async ({
  page,
}) => {
  await importGame(page);
  await page.getByRole('link', { name: 'Play Desktop diagnostic' }).click();
  const frame = await waitForCore(page);
  await frame.evaluate(() => {
    const player = window as unknown as {
      PocketCheckpoints: { save(): Promise<void> };
    };
    player.PocketCheckpoints.save = async () => {
      throw new Error('Simulated disk-full failure');
    };
  });
  await page.evaluate(() =>
    (window as unknown as NativeTestWindow).desktopTest.emit(
      'desktop:close-requested',
      { requestId: 'native-close-failure' },
    ),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as NativeTestWindow).desktopTest.calls.some(
          (call) =>
            call.command === 'cancel_shutdown' &&
            call.args.requestId === 'native-close-failure',
        ),
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() =>
      (window as unknown as NativeTestWindow).desktopTest.calls.some(
        (call) => call.command === 'complete_shutdown',
      ),
    ),
  ).toBe(false);
  await expect(page.locator('iframe')).toBeAttached();
  await expect(
    page.getByText(/Progress could not be saved/).first(),
  ).toBeVisible();
});

test('desktop keeps the default manual state local instead of opening a file dialog', async ({
  page,
}) => {
  await importGame(page);
  await page.getByRole('link', { name: 'Play Desktop diagnostic' }).click();
  const frame = await waitForCore(page);
  const player = page.frameLocator('iframe');
  const show = player.getByRole('button', { name: 'Show game controls' });
  if (await show.isVisible()) await show.click();
  await player
    .getByRole('button', { name: 'More options', exact: true })
    .click();
  await player
    .getByRole('dialog', { name: 'More options', exact: true })
    .getByRole('button', { name: 'Save state', exact: true })
    .click();
  await expect
    .poll(() =>
      frame.evaluate(async () => {
        const emulator = (
          window as unknown as {
            EJS_emulator: {
              getBaseFileName(): string;
              storage: {
                states: { get(name: string): Promise<Uint8Array | undefined> };
              };
            };
          }
        ).EJS_emulator;
        return (
          (
            await emulator.storage.states.get(
              `${emulator.getBaseFileName()}.state`,
            )
          )?.byteLength ?? 0
        );
      }),
    )
    .toBeGreaterThan(1000);
  expect(
    await page.evaluate(() =>
      (window as unknown as NativeTestWindow).desktopTest.calls.some(
        (call) => call.command === 'export_file',
      ),
    ),
  ).toBe(false);
});
