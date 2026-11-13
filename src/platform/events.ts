import { isDesktop } from './index';

// Install only in the library: menu actions elsewhere must not interrupt play.
export function onOpenGame(
  open: () => void,
  onError: (error: unknown) => void,
): () => void {
  if (!isDesktop) return () => {};
  let disposed = false;
  let unlisten: (() => void) | undefined;
  void import('@tauri-apps/api/event')
    .then(({ listen }) =>
      listen('desktop:open-game', () => {
        if (!disposed) open();
      }),
    )
    .then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    })
    .catch((error: unknown) => {
      if (!disposed) onError(error);
    });
  return () => {
    disposed = true;
    unlisten?.();
  };
}
