import {
  cancelActivePlayerClose,
  prepareActivePlayer,
} from '../player/session';

type ClosePayload = { requestId: string };
type NativeLifecycle = {
  listen: (
    event: string,
    callback: (event: { payload: ClosePayload }) => void,
  ) => Promise<() => void>;
  invoke: (command: string, args?: { requestId: string }) => Promise<unknown>;
};

/** Exported separately to exercise the native contract without a webview. */
export async function attachDesktopLifecycle(
  native: NativeLifecycle,
  prepare = prepareActivePlayer,
  onError?: (message: string) => void,
) {
  let disposed = false;
  const requests = new Set<string>();
  const completed = new Set<string>();
  const unlisten = await native.listen(
    'desktop:close-requested',
    ({ payload }) => {
      const requestId = payload?.requestId;
      if (
        typeof requestId !== 'string' ||
        !requestId ||
        requestId.length > 200 ||
        disposed ||
        requests.has(requestId) ||
        completed.has(requestId)
      )
        return;
      requests.add(requestId);
      void (async () => {
        try {
          await prepare();
          if (disposed) throw new Error('Lifecycle disposed');
          await native.invoke('complete_shutdown', { requestId });
          completed.add(requestId);
          requests.delete(requestId);
          // Keep recent completed ids idempotent without retaining them forever.
          if (completed.size > 128)
            completed.delete(completed.values().next().value!);
        } catch (error) {
          cancelActivePlayerClose();
          await native.invoke('cancel_shutdown', { requestId }).catch(() => {});
          // A failed native attempt may retry with the same id after cancellation.
          requests.delete(requestId);
          if (!disposed)
            onError?.(
              `The window was kept open. ${
                error instanceof Error
                  ? error.message
                  : typeof error === 'string' && error.trim()
                    ? error
                    : 'Progress could not be saved. Try again before closing.'
              }`,
            );
        }
      })();
    },
  );
  return () => {
    disposed = true;
    unlisten();
  };
}

/** Install only in the app frame; browser builds never load Tauri modules. */
export function installDesktopLifecycle(
  onError?: (message: string) => void,
): () => void {
  if (import.meta.env.MODE !== 'desktop' || window.top !== window)
    return () => {};
  let disposed = false;
  let cleanup: (() => void) | undefined;
  void Promise.all([
    import('@tauri-apps/api/event'),
    import('@tauri-apps/api/core'),
  ])
    .then(async ([{ listen }, { invoke }]) => {
      if (disposed) return;
      const detach = await attachDesktopLifecycle(
        { listen, invoke },
        prepareActivePlayer,
        onError,
      );
      if (disposed) detach();
      else {
        cleanup = detach;
        await invoke('desktop_ready');
      }
    })
    .catch((error) => {
      console.error(
        'Desktop shutdown protection could not be installed.',
        error,
      );
      if (!disposed)
        onError?.(
          'Desktop shutdown protection could not be installed. Keep the app open and back up your progress.',
        );
    });
  return () => {
    disposed = true;
    cleanup?.();
  };
}
