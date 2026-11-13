import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachDesktopLifecycle,
  installDesktopLifecycle,
} from '../../src/lifecycle/desktop';
import {
  createCloseHandshake,
  prepareActivePlayer,
  registerPlayerSession,
} from '../../src/player/session';

const tauri = vi.hoisted(() => ({ listen: vi.fn(), invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: tauri.listen }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: tauri.invoke }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it('announces desktop readiness only after attaching the native close listener', async () => {
  vi.stubEnv('MODE', 'desktop');
  const mainFrame = {};
  Object.assign(mainFrame, { top: mainFrame });
  vi.stubGlobal('window', mainFrame);
  let attached!: (cleanup: () => void) => void;
  tauri.listen.mockReturnValue(
    new Promise<() => void>((resolve) => {
      attached = resolve;
    }),
  );
  tauri.invoke.mockResolvedValue(undefined);
  const detach = vi.fn();
  const cleanup = installDesktopLifecycle();
  await vi.waitFor(() =>
    expect(tauri.listen).toHaveBeenCalledWith(
      'desktop:close-requested',
      expect.any(Function),
    ),
  );
  expect(tauri.invoke).not.toHaveBeenCalled();
  attached(detach);
  await vi.waitFor(() =>
    expect(tauri.invoke).toHaveBeenCalledWith('desktop_ready'),
  );
  cleanup();
  expect(detach).toHaveBeenCalledOnce();
});

function transport(timeout = 100) {
  const listeners = new Set<(event: unknown) => void>();
  vi.stubGlobal('location', { origin: 'https://app.test' });
  vi.stubGlobal('window', {
    addEventListener: (_: string, listener: (event: unknown) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: unknown) => void) =>
      listeners.delete(listener),
  });
  const frame = { postMessage: vi.fn() };
  const session = createCloseHandshake(
    frame as unknown as Window,
    'channel',
    timeout,
  );
  const reply = (type: string, overrides = {}, source: unknown = frame) => {
    const requestId = frame.postMessage.mock.calls[0][0].requestId;
    for (const receive of listeners)
      receive({
        origin: 'https://app.test',
        source,
        data: {
          source: 'pocket-gba-player',
          channel: 'channel',
          type,
          requestId,
          ...overrides,
        },
      });
  };
  return { session, frame, reply, listeners };
}

describe('desktop player persistence handshake', () => {
  it('deduplicates in-flight requests and accepts only the matching frame/channel/id', async () => {
    const { session, frame, reply, listeners } = transport();
    const pending = session.prepareClose();
    expect(session.prepareClose()).toBe(pending);
    reply('close-prepared', {}, {});
    reply('close-prepared', { channel: 'other' });
    reply('close-prepared', { requestId: 'other' });
    expect(listeners.size).toBe(1);
    reply('close-prepared');
    await pending;
    expect(frame.postMessage).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
  });

  it('rejects a failed save and cancels the paused player', async () => {
    const { session, frame, reply } = transport();
    const pending = session.prepareClose();
    const result = expect(pending).rejects.toThrow('could not be saved');
    reply('close-failed');
    await result;
    expect(frame.postMessage.mock.calls.at(-1)?.[0].type).toBe('cancel-close');
  });

  it('times out, ignores late acknowledgements and permits retry', async () => {
    vi.useFakeTimers();
    const { session, frame, reply } = transport();
    const pending = session.prepareClose();
    const result = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(100);
    await result;
    expect(frame.postMessage.mock.calls.at(-1)?.[0].type).toBe('cancel-close');
    reply('close-prepared');
    const retry = session.prepareClose();
    session.dispose();
    await expect(retry).rejects.toThrow('closed before saving');
  });
});

describe('native lifecycle contract', () => {
  function native() {
    let emit!: (event: { payload: { requestId: string } }) => void;
    const unlisten = vi.fn();
    return {
      listen: vi.fn(async (_event: string, callback: typeof emit) => {
        emit = callback;
        return unlisten;
      }),
      invoke: vi.fn().mockResolvedValue(undefined),
      emit: (requestId: string) => emit({ payload: { requestId } }),
      unlisten,
    };
  }

  it('waits for persistence, then completes exactly once for duplicate native events', async () => {
    const api = native();
    let saved!: () => void;
    const prepare = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          saved = resolve;
        }),
    );
    const cleanup = await attachDesktopLifecycle(api, prepare);
    api.emit('close-1');
    api.emit('close-1');
    expect(api.invoke).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledOnce();
    saved();
    await vi.waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('complete_shutdown', {
        requestId: 'close-1',
      }),
    );
    api.emit('close-1');
    expect(prepare).toHaveBeenCalledOnce();
    cleanup();
    expect(api.unlisten).toHaveBeenCalledOnce();
  });

  it('cancels native shutdown and resumes the session on persistence failure', async () => {
    const api = native();
    const cancelClose = vi.fn();
    const unregister = registerPlayerSession({
      prepareClose: vi.fn().mockRejectedValue(new Error('Disk full')),
      cancelClose,
    });
    const cleanup = await attachDesktopLifecycle(api);
    api.emit('close-2');
    await vi.waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('cancel_shutdown', {
        requestId: 'close-2',
      }),
    );
    expect(cancelClose).toHaveBeenCalledOnce();
    unregister();
    cleanup();
  });

  it('allows shutdown without an active game and does not unregister a newer session', async () => {
    const old = registerPlayerSession({ prepareClose: vi.fn() });
    const prepareClose = vi.fn().mockResolvedValue(undefined);
    const current = registerPlayerSession({ prepareClose });
    old();
    await prepareActivePlayer();
    expect(prepareClose).toHaveBeenCalledOnce();
    current();
    const api = native();
    const cleanup = await attachDesktopLifecycle(api);
    api.emit('library');
    await vi.waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('complete_shutdown', {
        requestId: 'library',
      }),
    );
    cleanup();
  });

  it('cancels if the native completion command fails', async () => {
    const api = native();
    api.invoke.mockRejectedValueOnce(new Error('Native refused'));
    const onError = vi.fn();
    const cleanup = await attachDesktopLifecycle(api, async () => {}, onError);
    api.emit('close-3');
    await vi.waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('cancel_shutdown', {
        requestId: 'close-3',
      }),
    );
    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        'The window was kept open. Native refused',
      ),
    );
    cleanup();
  });

  it('surfaces a timeout only after cancellation and permits retrying the same id', async () => {
    const api = native();
    let cancelled!: () => void;
    api.invoke.mockImplementation((command: string) =>
      command === 'cancel_shutdown'
        ? new Promise<void>((resolve) => {
            cancelled = resolve;
          })
        : Promise.resolve(),
    );
    const onError = vi.fn();
    const prepare = vi
      .fn()
      .mockRejectedValueOnce(new Error('Saving timed out. Try again.'))
      .mockResolvedValue(undefined);
    const cleanup = await attachDesktopLifecycle(api, prepare, onError);
    api.emit('retry-id');
    await vi.waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('cancel_shutdown', {
        requestId: 'retry-id',
      }),
    );
    expect(onError).not.toHaveBeenCalled();
    api.emit('retry-id');
    expect(prepare).toHaveBeenCalledOnce();
    cancelled();
    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        'The window was kept open. Saving timed out. Try again.',
      ),
    );
    expect(api.invoke).not.toHaveBeenCalledWith('complete_shutdown', {
      requestId: 'retry-id',
    });
    api.emit('retry-id');
    await vi.waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('complete_shutdown', {
        requestId: 'retry-id',
      }),
    );
    expect(prepare).toHaveBeenCalledTimes(2);
    cleanup();
  });
});
