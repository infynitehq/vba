import { test, expect, type Page } from '@playwright/test';

async function nativeUpdates(page: Page, disabled = false) {
  await page.addInitScript(
    ({ disabled }) => {
      if (window !== window.top) return;
      localStorage.setItem('pocket-gba:auto-updates', 'false');
      const callbacks = new Map<number, (event: unknown) => void>();
      const listeners = new Map<number, { event: string; handler: number }>();
      let next = 1;
      let installRequests = 0;
      let status: Record<string, unknown> = {
        phase: disabled ? 'disabled' : 'idle',
        currentVersion: '7.4.2',
        ...(disabled
          ? { reason: 'Updates are unavailable in development builds.' }
          : {}),
      };
      const calls: { command: string; args: Record<string, unknown> }[] = [];
      let finishDownload: ((value: unknown) => void) | undefined;
      const emit = (event: string, payload: unknown) => {
        for (const { event: name, handler } of listeners.values()) {
          if (name === event)
            callbacks.get(handler)?.({ event, id: 1, payload });
        }
      };
      const update = (nextStatus: Record<string, unknown>) => {
        status = nextStatus;
        emit('desktop:update-status', status);
        return status;
      };
      Object.assign(window, {
        updateTest: {
          calls,
          progress: () =>
            update({
              ...status,
              phase: 'downloading',
              downloadedBytes: 25,
              totalBytes: 100,
            }),
          complete: () => {
            const result = update({ ...status, phase: 'downloaded' });
            finishDownload?.(result);
          },
          fail: () =>
            update({
              ...status,
              phase: 'error',
              error: 'Offline. Check your connection and try again.',
            }),
          installFailure: () =>
            update({
              ...status,
              phase: 'error',
              readyToInstall: true,
              error: 'Installer failed. Your downloaded update is still ready.',
            }),
        },
        __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
        __TAURI_INTERNALS__: {
          transformCallback(callback: (event: unknown) => void) {
            const id = next++;
            callbacks.set(id, callback);
            return id;
          },
          unregisterCallback(id: number) {
            callbacks.delete(id);
          },
          async invoke(command: string, args: Record<string, unknown> = {}) {
            calls.push({ command, args });
            if (command === 'plugin:event|listen') {
              const id = next++;
              listeners.set(id, {
                event: args.event as string,
                handler: args.handler as number,
              });
              return id;
            }
            if (command === 'plugin:event|unlisten') {
              listeners.delete(args.eventId as number);
              return;
            }
            if (command === 'desktop_ready') return;
            if (command === 'update_status') return status;
            if (command === 'check_for_update')
              return update({
                currentVersion: '7.4.2',
                phase: 'available',
                updateId: 'native-handle',
                version: '7.5.0',
                notes: '<b>Plain text release notes</b>',
              });
            if (command === 'download_update') {
              update({ ...status, phase: 'downloading' });
              return new Promise((resolve) => {
                finishDownload = resolve;
              });
            }
            if (command === 'cancel_update_download') {
              const result = update({ ...status, phase: 'available' });
              finishDownload?.(result);
              return result;
            }
            if (command === 'install_update') {
              update({ ...status, phase: 'preparing' });
              emit('desktop:close-requested', {
                requestId:
                  ++installRequests === 1
                    ? 'safe-update-close'
                    : `safe-update-close-${installRequests}`,
              });
              return;
            }
            if (command === 'complete_shutdown') {
              update({ ...status, phase: 'installing' });
              return;
            }
            if (command === 'cancel_shutdown' || command === 'open_external')
              return;
            throw new Error(`Unexpected command: ${command}`);
          },
        },
      });
    },
    { disabled },
  );
}

test('desktop update settings show native version, plain notes, cancellation, progress and recoverable errors', async ({
  page,
}) => {
  await nativeUpdates(page);
  await page.goto('/settings');
  await expect(
    page.getByText('Pocket GBA 7.4.2', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('switch', { name: 'Automatically check for updates' }),
  ).not.toBeChecked();
  await page
    .getByRole('button', { name: 'Check for updates', exact: true })
    .click();
  await expect(
    page.getByText('<b>Plain text release notes</b>', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Download update', exact: true })
    .click();
  await expect(
    page.getByRole('progressbar', { name: 'Update download' }),
  ).toBeVisible();
  await expect(page.getByRole('progressbar')).not.toHaveAttribute('value');
  await page.evaluate(() =>
    (
      window as unknown as { updateTest: { progress(): void } }
    ).updateTest.progress(),
  );
  await expect(page.getByText('25% downloaded')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel download' }).click();
  await expect(
    page.getByRole('button', { name: 'Download update', exact: true }),
  ).toBeEnabled();
  await page.evaluate(() =>
    (window as unknown as { updateTest: { fail(): void } }).updateTest.fail(),
  );
  await expect(
    page.getByText('Offline. Check your connection and try again.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Check for updates', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View releases' })).toBeVisible();
});

test('downloaded update requests the safe shutdown handshake', async ({
  page,
}) => {
  await nativeUpdates(page);
  await page.goto('/settings');
  await page
    .getByRole('button', { name: 'Check for updates', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Download update', exact: true })
    .click();
  await expect(
    page.getByRole('progressbar', { name: 'Update download' }),
  ).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { updateTest: { complete(): void } }
    ).updateTest.complete(),
  );
  await page
    .getByRole('button', { name: 'Install and restart', exact: true })
    .click();
  await expect(
    page.getByText('Installing update. Keep the app open…'),
  ).toBeVisible();
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          updateTest: {
            calls: { command: string; args: Record<string, unknown> }[];
          };
        }
      ).updateTest.calls,
  );
  expect(calls).toContainEqual({
    command: 'install_update',
    args: { updateId: 'native-handle' },
  });
  expect(calls).toContainEqual({
    command: 'complete_shutdown',
    args: { requestId: 'safe-update-close' },
  });
  expect(
    calls.some(
      ({ command }) =>
        command.includes('plugin:updater') || command.includes('relaunch'),
    ),
  ).toBe(false);
  await page.evaluate(() =>
    (
      window as unknown as {
        updateTest: { installFailure(): void };
      }
    ).updateTest.installFailure(),
  );
  await expect(
    page.getByText('Installer failed. Your downloaded update is still ready.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry download', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Retry installation', exact: true })
    .click();
  await expect(
    page.getByText('Installing update. Keep the app open…'),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              updateTest: { calls: { command: string }[] };
            }
          ).updateTest.calls.filter(
            ({ command }) => command === 'install_update',
          ).length,
      ),
    )
    .toBe(2);
});

test('disabled builds explain normal availability without a modal', async ({
  page,
}) => {
  await nativeUpdates(page, true);
  await page.goto('/settings');
  await expect(
    page.getByText('Updates are unavailable in development builds.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Check for updates', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('switch', { name: 'Automatically check for updates' }),
  ).toBeDisabled();
  await expect(
    page.getByRole('switch', { name: 'Automatically check for updates' }),
  ).not.toBeChecked();
  await expect(page.getByRole('link', { name: 'View releases' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.getByRole('region', { name: 'Updates', exact: true }).screenshot({
    path: test.info().outputPath('updates-desktop.png'),
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.getByRole('region', { name: 'Updates', exact: true }).screenshot({
    path: test.info().outputPath('updates-mobile.png'),
  });
});

test('automatic update switch supports keyboard input and saves its preference', async ({
  page,
}) => {
  await nativeUpdates(page);
  await page.goto('/settings');
  const toggle = page.getByRole('switch', {
    name: 'Automatically check for updates',
  });
  await toggle.focus();
  await toggle.press('Space');
  await expect(toggle).toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('pocket-gba:auto-updates')),
    )
    .toBe('true');
  await toggle.press('Space');
  await expect(toggle).not.toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('pocket-gba:auto-updates')),
    )
    .toBe('false');
});

test('available updates use a dismissible library banner rather than a modal', async ({
  page,
}) => {
  await nativeUpdates(page);
  await page.goto('/settings');
  await page
    .getByRole('button', { name: 'Check for updates', exact: true })
    .click();
  await expect(
    page.getByRole('complementary', { name: 'App update' }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  const banner = page.getByRole('complementary', { name: 'App update' });
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Later' }).click();
  await expect(banner).toHaveCount(0);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Download update', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
