import { test, expect, type Frame, type Page } from '@playwright/test';
import type { UpdateStatus } from '../../src/updates/controller';
import { diagnosticRom } from '../e2e/fixtures/diagnostic-rom';

type NativeCall = {
  command: string;
  args: Record<string, unknown>;
  checkpointBytesAtCall?: number;
};
type UpdateSavingHarness = {
  calls: NativeCall[];
  status: UpdateStatus;
  checkpointSaveStarted: boolean;
  checkpointCommittedBytes: number;
  requestInstall(requestId: string): Promise<void>;
};
type UpdateSavingWindow = Window & { updateSavingTest: UpdateSavingHarness };
type PlayerWindow = Window & {
  EJS_emulator: { gameManager: { getFrameNum(): number } };
  PocketCheckpoints: {
    save(gameId: string, state: Uint8Array): Promise<void>;
    load(gameId: string): Promise<{ state: Uint8Array } | null>;
  };
  releaseUpdateSave?: () => void;
};

/** Native transport only: the emulator, player handshake and IndexedDB are real. */
async function mockUpdateTransport(page: Page) {
  await page.addInitScript(
    ({ bytes }) => {
      if (window !== window.top) return;
      localStorage.setItem('pocket-gba:auto-updates', 'false');
      const callbacks = new Map<number, (event: unknown) => void>();
      const listeners = new Map<number, { event: string; handler: number }>();
      let nextId = 1;
      let pendingRequestId: string | undefined;
      const emit = (event: string, payload: unknown) => {
        for (const [id, listener] of listeners) {
          if (listener.event === event)
            callbacks.get(listener.handler)?.({ event, id, payload });
        }
      };
      const update = (phase: UpdateStatus['phase']) => {
        harness.status = {
          ...harness.status,
          phase,
          readyToInstall: phase === 'downloaded',
        };
        emit('desktop:update-status', harness.status);
        return harness.status;
      };
      const invoke = async (
        command: string,
        args: Record<string, unknown> = {},
      ): Promise<unknown> => {
        harness.calls.push({
          command,
          args,
          ...(command === 'complete_shutdown'
            ? { checkpointBytesAtCall: harness.checkpointCommittedBytes }
            : {}),
        });
        switch (command) {
          case 'plugin:event|listen': {
            if (
              typeof args.event !== 'string' ||
              typeof args.handler !== 'number'
            )
              throw new Error('Invalid event subscription');
            const id = nextId++;
            listeners.set(id, { event: args.event, handler: args.handler });
            return id;
          }
          case 'plugin:event|unlisten':
            listeners.delete(args.eventId as number);
            return;
          case 'desktop_ready':
            return;
          case 'update_status':
            return harness.status;
          case 'import_file':
            return args.kind === 'rom'
              ? { name: 'Update saving diagnostic.gba', bytes }
              : null;
          case 'install_update':
            if (args.updateId !== harness.status.updateId || !pendingRequestId)
              throw new Error(
                'Unknown update handle or missing shutdown request',
              );
            update('preparing');
            emit('desktop:close-requested', { requestId: pendingRequestId });
            return;
          case 'complete_shutdown':
          case 'cancel_shutdown':
            if (args.requestId !== pendingRequestId)
              throw new Error(
                'Shutdown acknowledgement did not match the update',
              );
            update(
              command === 'complete_shutdown' ? 'installing' : 'downloaded',
            );
            return;
          default:
            throw new Error(`Unexpected native command: ${command}`);
        }
      };
      const harness: UpdateSavingHarness = {
        calls: [],
        status: {
          phase: 'downloaded',
          currentVersion: '0.2.0',
          updateId: 'verified-native-update',
          version: '0.3.0',
          readyToInstall: true,
        },
        checkpointSaveStarted: false,
        checkpointCommittedBytes: 0,
        async requestInstall(requestId) {
          pendingRequestId = requestId;
          await invoke('install_update', { updateId: harness.status.updateId });
        },
      };
      Object.assign(window, {
        updateSavingTest: harness,
        __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
        __TAURI_INTERNALS__: {
          transformCallback(callback: (event: unknown) => void) {
            const id = nextId++;
            callbacks.set(id, callback);
            return id;
          },
          unregisterCallback(id: number) {
            callbacks.delete(id);
          },
          invoke,
        },
      });
    },
    { bytes: Array.from(diagnosticRom()) },
  );
}

async function launchDiagnostic(page: Page): Promise<Frame> {
  await mockUpdateTransport(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Add a game', exact: true }).click();
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  await page
    .getByRole('link', { name: 'Play Update saving diagnostic', exact: true })
    .click();
  await expect(page.frameLocator('iframe').locator('canvas')).toBeVisible({
    timeout: 45_000,
  });
  const frame = await (await page
    .locator('iframe')
    .elementHandle())!.contentFrame();
  if (!frame) throw new Error('The real player frame was not mounted');
  await expect.poll(() => frameNumber(frame)).toBeGreaterThan(10);
  await expect(
    page.getByRole('complementary', { name: 'App update' }),
  ).toHaveCount(0);
  return frame;
}

const frameNumber = (frame: Frame) =>
  frame.evaluate(
    () =>
      (
        window as unknown as PlayerWindow
      ).EJS_emulator?.gameManager?.getFrameNum() ?? 0,
  );
const nativeCalls = (page: Page) =>
  page.evaluate(
    () => (window as unknown as UpdateSavingWindow).updateSavingTest.calls,
  );
const expectNoDirectInstallation = (calls: NativeCall[]) => {
  expect(
    calls.some(({ command }) =>
      /plugin:(updater|process)|relaunch/.test(command),
    ),
  ).toBe(false);
};

test('an update waits for the real active-player checkpoint before completing matching shutdown', async ({
  page,
}) => {
  const frame = await launchDiagnostic(page);
  await frame.evaluate(() => {
    const player = window as unknown as PlayerWindow;
    const harness = (window.parent as UpdateSavingWindow).updateSavingTest;
    const save = player.PocketCheckpoints.save;
    player.PocketCheckpoints.save = async (gameId, state) => {
      harness.checkpointSaveStarted = true;
      await new Promise<void>((resolve) => {
        player.releaseUpdateSave = resolve;
      });
      await save(gameId, state);
      // load() reads the real, committed IndexedDB checkpoint, not synthetic bytes.
      const checkpoint = await player.PocketCheckpoints.load(gameId);
      harness.checkpointCommittedBytes = checkpoint?.state.byteLength ?? 0;
    };
  });
  await page.evaluate(() =>
    (window as unknown as UpdateSavingWindow).updateSavingTest.requestInstall(
      'update-save-success',
    ),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as UpdateSavingWindow).updateSavingTest
            .checkpointSaveStarted,
      ),
    )
    .toBe(true);
  expect(
    (await nativeCalls(page)).some(
      ({ command }) => command === 'complete_shutdown',
    ),
  ).toBe(false);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as UpdateSavingWindow).updateSavingTest
          .checkpointCommittedBytes,
    ),
  ).toBe(0);
  await expect(
    page.getByRole('complementary', { name: 'App update' }),
  ).toHaveCount(0);
  await frame.evaluate(() =>
    (window as unknown as PlayerWindow).releaseUpdateSave?.(),
  );
  await expect
    .poll(
      async () =>
        (await nativeCalls(page)).filter(
          ({ command }) => command === 'complete_shutdown',
        ).length,
    )
    .toBe(1);
  const calls = await nativeCalls(page);
  const completed = calls.find(
    ({ command }) => command === 'complete_shutdown',
  )!;
  expect(completed.args).toEqual({ requestId: 'update-save-success' });
  expect(completed.checkpointBytesAtCall).toBeGreaterThan(1000);
  expect(calls.some(({ command }) => command === 'cancel_shutdown')).toBe(
    false,
  );
  expectNoDirectInstallation(calls);
});

test('a failed active-player checkpoint cancels the update and resumes real emulator frames', async ({
  page,
}) => {
  const frame = await launchDiagnostic(page);
  await frame.evaluate(() => {
    (window as unknown as PlayerWindow).PocketCheckpoints.save = async () => {
      throw new Error('Simulated disk-full update checkpoint failure');
    };
  });
  await page.evaluate(() =>
    (window as unknown as UpdateSavingWindow).updateSavingTest.requestInstall(
      'update-save-failure',
    ),
  );
  await expect
    .poll(
      async () =>
        (await nativeCalls(page)).filter(
          ({ command, args }) =>
            command === 'cancel_shutdown' &&
            args.requestId === 'update-save-failure',
        ).length,
    )
    .toBe(1);
  const resumedAt = await frameNumber(frame);
  await expect.poll(() => frameNumber(frame)).toBeGreaterThan(resumedAt + 10);
  const calls = await nativeCalls(page);
  expect(calls.some(({ command }) => command === 'complete_shutdown')).toBe(
    false,
  );
  expectNoDirectInstallation(calls);
  const status = await page.evaluate(
    () => (window as unknown as UpdateSavingWindow).updateSavingTest.status,
  );
  expect(status).toMatchObject({
    phase: 'downloaded',
    updateId: 'verified-native-update',
    readyToInstall: true,
  });
  await expect(page.locator('iframe')).toBeAttached();
  await expect(
    page.getByRole('complementary', { name: 'App update' }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Progress could not be saved/).first(),
  ).toBeVisible();
});
