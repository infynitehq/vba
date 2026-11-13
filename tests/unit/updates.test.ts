import { describe, expect, it, vi } from 'vitest';
import {
  automaticUpdatesKey,
  createUpdateController,
  type UpdateStatus,
} from '../../src/updates/controller';
import { attachDesktopLifecycle } from '../../src/lifecycle/desktop';
import {
  cancelActivePlayerClose,
  registerPlayerSession,
} from '../../src/player/session';

const idle: UpdateStatus = { phase: 'idle', currentVersion: '1.2.3' };
const available: UpdateStatus = {
  ...idle,
  phase: 'available',
  updateId: 'opaque-native-id',
  version: '1.3.0',
};
const downloaded: UpdateStatus = { ...available, phase: 'downloaded' };
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

function fixture(
  initial = idle,
  automatic?: string,
  onFailure: () => void = vi.fn(),
) {
  const listeners = new Set<(status: UpdateStatus) => void>();
  const unlisten = vi.fn();
  const invoke = vi.fn(async (command: string): Promise<unknown> =>
    command === 'update_status' ? initial : idle,
  );
  const preferences = {
    getItem: vi.fn(() => automatic ?? null),
    setItem: vi.fn(),
  };
  const controller = createUpdateController(
    {
      invoke,
      listen: vi.fn(async (receive) => {
        listeners.add(receive);
        return () => {
          listeners.delete(receive);
          unlisten();
        };
      }),
    },
    '1.2.3',
    preferences,
    onFailure,
  );
  return {
    controller,
    invoke,
    preferences,
    unlisten,
    listeners,
    onFailure,
    emit(status: UpdateStatus) {
      listeners.forEach((receive) => receive(status));
    },
  };
}

describe('desktop updater controller', () => {
  it('preserves actionable plain-string errors returned by native commands', async () => {
    const f = fixture(downloaded, 'false');
    const dispose = f.controller.connect();
    await tick();
    f.invoke.mockRejectedValueOnce(
      'Move Pocket GBA to a writable Applications folder before updating.',
    );
    await f.controller.install();
    expect(f.controller.getSnapshot().status.error).toBe(
      'Move Pocket GBA to a writable Applications folder before updating.',
    );
    dispose();
  });

  it('checks once after UI readiness, defers gameplay and persists the opt-out', async () => {
    const f = fixture();
    const dispose = f.controller.connect();
    f.controller.uiReady(true);
    await tick();
    expect(f.invoke.mock.calls.map(([command]) => command)).toEqual([
      'update_status',
    ]);
    f.controller.uiReady(false);
    await tick();
    f.controller.uiReady(true);
    f.controller.uiReady(false);
    await tick();
    expect(
      f.invoke.mock.calls.filter(([command]) => command === 'check_for_update'),
    ).toHaveLength(1);
    f.controller.setAutomatic(false);
    expect(f.preferences.setItem).toHaveBeenCalledWith(
      automaticUpdatesKey,
      'false',
    );
    dispose();
  });

  it('does not automatically check with a saved opt-out or a disabled build', async () => {
    for (const f of [
      fixture(idle, 'false'),
      fixture({
        ...idle,
        phase: 'disabled',
        reason: 'No signing key configured.',
      }),
    ]) {
      const dispose = f.controller.connect();
      f.controller.uiReady(false);
      await tick();
      expect(f.invoke).toHaveBeenCalledTimes(1);
      dispose();
    }
  });

  it('cleans up delayed subscriptions across StrictMode remounts', async () => {
    const f = fixture();
    const first = f.controller.connect();
    first();
    const second = f.controller.connect();
    await tick();
    expect(f.listeners.size).toBe(1);
    expect(f.unlisten).toHaveBeenCalledTimes(1);
    expect(f.invoke).toHaveBeenCalledTimes(1);
    second();
    second();
    expect(f.listeners.size).toBe(0);
    expect(f.unlisten).toHaveBeenCalledTimes(2);
  });

  it('ignores an initial status response older than a native event', async () => {
    const f = fixture();
    let resolve!: (status: UpdateStatus) => void;
    f.invoke.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const dispose = f.controller.connect();
    await tick();
    f.emit(available);
    resolve(idle);
    await tick();
    expect(f.controller.getSnapshot().status).toEqual(available);
    dispose();
  });

  it('deduplicates actions, retains progress, and accepts a final download response', async () => {
    const f = fixture(available);
    const dispose = f.controller.connect();
    await tick();
    let resolve!: (status: UpdateStatus) => void;
    f.invoke.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = f.controller.download();
    void f.controller.download();
    expect(f.invoke).toHaveBeenLastCalledWith('download_update', {
      updateId: available.updateId,
    });
    expect(f.invoke).toHaveBeenCalledTimes(2);
    f.emit({
      ...available,
      phase: 'downloading',
      downloadedBytes: 12,
      totalBytes: 100,
    });
    expect(f.controller.getSnapshot().status.downloadedBytes).toBe(12);
    f.emit({ ...downloaded, updateId: 'stale-handle' });
    expect(f.controller.getSnapshot().status.phase).toBe('downloading');
    resolve(downloaded);
    await pending;
    expect(f.controller.getSnapshot().status.phase).toBe('downloaded');
    dispose();
  });

  it('cancels an in-flight download and ignores its late response and events', async () => {
    const f = fixture(available);
    const dispose = f.controller.connect();
    await tick();
    let finishDownload!: (status: UpdateStatus) => void;
    f.invoke.mockImplementation((command) =>
      command === 'download_update'
        ? new Promise((resolve) => {
            finishDownload = resolve;
          })
        : Promise.resolve(available),
    );
    const pending = f.controller.download();
    f.emit({ ...available, phase: 'downloading' });
    await f.controller.cancel();
    f.emit(downloaded);
    finishDownload(downloaded);
    await pending;
    expect(f.controller.getSnapshot().status.phase).toBe('available');
    expect(f.controller.getSnapshot().pending).toBe(false);
    dispose();
  });

  it('exposes actionable errors without notifications and permits retry', async () => {
    const f = fixture();
    const dispose = f.controller.connect();
    await tick();
    f.invoke.mockRejectedValueOnce(
      new Error('Offline. Check your connection and retry.'),
    );
    await f.controller.check();
    expect(f.controller.getSnapshot().status.error).toContain(
      'Check your connection',
    );
    expect(f.onFailure).not.toHaveBeenCalled();
    f.invoke.mockResolvedValueOnce(available);
    await f.controller.check();
    expect(f.controller.getSnapshot().status.phase).toBe('available');
    dispose();
  });

  it('only resumes the player for the matching install failure', async () => {
    const f = fixture(downloaded);
    const dispose = f.controller.connect();
    await tick();
    f.invoke.mockResolvedValue(undefined);
    await f.controller.install();
    await f.controller.install();
    expect(f.invoke).toHaveBeenCalledTimes(2);
    f.emit({ ...downloaded, phase: 'preparing' });
    f.emit({
      ...downloaded,
      phase: 'error',
      updateId: 'unrelated',
      error: 'Network issue',
    });
    expect(f.onFailure).not.toHaveBeenCalled();
    f.emit({ ...downloaded, phase: 'error', error: 'Installer failed' });
    expect(f.onFailure).toHaveBeenCalledOnce();
    f.emit({ ...downloaded, phase: 'error', error: 'Installer failed' });
    expect(f.onFailure).toHaveBeenCalledOnce();
    dispose();
  });

  it('does not resume unrelated navigation preparation when an install request is rejected before preparing', async () => {
    const f = fixture(downloaded);
    const dispose = f.controller.connect();
    await tick();
    f.invoke.mockRejectedValueOnce(
      new Error('Another shutdown is already pending.'),
    );
    await f.controller.install();
    expect(f.onFailure).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot().status.phase).toBe('error');
    dispose();
  });

  it('retries installation with native-retained verified bytes after an install failure', async () => {
    const f = fixture(downloaded);
    const dispose = f.controller.connect();
    await tick();
    f.invoke.mockResolvedValue(undefined);
    await f.controller.install();
    f.emit({ ...downloaded, phase: 'preparing' });
    f.emit({ ...downloaded, phase: 'installing' });
    f.emit({
      ...downloaded,
      phase: 'error',
      readyToInstall: true,
      error: 'Installer failed. Your downloaded update is still ready.',
    });
    expect(f.onFailure).toHaveBeenCalledOnce();
    await f.controller.install();
    expect(
      f.invoke.mock.calls.filter(([command]) => command === 'install_update'),
    ).toHaveLength(2);
    expect(f.invoke).toHaveBeenLastCalledWith('install_update', {
      updateId: available.updateId,
    });
    expect(
      f.invoke.mock.calls.some(([command]) => command === 'download_update'),
    ).toBe(false);
    dispose();
  });

  it('cannot install an error status without native-retained bytes', async () => {
    for (const readyToInstall of [false, undefined]) {
      const f = fixture({ ...available, phase: 'error', readyToInstall });
      const dispose = f.controller.connect();
      await tick();
      await f.controller.install();
      expect(f.invoke).toHaveBeenCalledTimes(1);
      expect(f.invoke).toHaveBeenCalledWith('update_status');
      dispose();
    }
  });

  it('accepts a newly checked native handle without requiring a checking event', async () => {
    const f = fixture(available);
    const dispose = f.controller.connect();
    await tick();
    f.invoke.mockResolvedValueOnce({
      ...available,
      updateId: 'new-native-handle',
    });
    await f.controller.check();
    expect(f.controller.getSnapshot().status.updateId).toBe(
      'new-native-handle',
    );
    dispose();
  });
});

it('requests native installation without bypassing the persistence handshake and resumes after an asynchronous failure', async () => {
  const cancelClose = vi.fn();
  let saved!: () => void;
  const unregister = registerPlayerSession({
    prepareClose: () =>
      new Promise<void>((resolve) => {
        saved = resolve;
      }),
    cancelClose,
  });
  const f = fixture(downloaded, 'false', cancelActivePlayerClose);
  const disposeUpdates = f.controller.connect();
  await tick();
  f.invoke.mockResolvedValue(undefined);
  let close!: (event: { payload: { requestId: string } }) => void;
  const invoke = vi.fn().mockResolvedValue(undefined);
  const disposeLifecycle = await attachDesktopLifecycle({
    listen: async (_event, callback) => {
      close = callback;
      return () => {};
    },
    invoke,
  });
  try {
    await f.controller.install();
    expect(f.invoke).toHaveBeenLastCalledWith('install_update', {
      updateId: available.updateId,
    });
    expect(invoke).not.toHaveBeenCalled();
    f.emit({ ...downloaded, phase: 'preparing' });
    close({ payload: { requestId: 'update-shutdown' } });
    expect(invoke).not.toHaveBeenCalled();
    saved();
    await tick();
    expect(invoke).toHaveBeenCalledWith('complete_shutdown', {
      requestId: 'update-shutdown',
    });
    f.emit({ ...downloaded, phase: 'installing' });
    f.emit({
      ...downloaded,
      phase: 'error',
      error: 'Installer exited unsuccessfully',
    });
    expect(cancelClose).toHaveBeenCalledOnce();
  } finally {
    disposeUpdates();
    disposeLifecycle();
    unregister();
  }
});
