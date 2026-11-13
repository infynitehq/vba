export type PlayerSession = {
  prepareClose(): Promise<void>;
  cancelClose?(): void;
};

let active: PlayerSession | undefined;
const listeners = new Set<() => void>();

export const hasActivePlayer = () => active !== undefined;
export function subscribeActivePlayer(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function registerPlayerSession(session: PlayerSession) {
  active = session;
  listeners.forEach((listener) => listener());
  return () => {
    if (active === session) {
      active = undefined;
      listeners.forEach((listener) => listener());
    }
  };
}

export async function prepareActivePlayer() {
  await active?.prepareClose();
}

export function cancelActivePlayerClose() {
  active?.cancelClose?.();
}

/** Only the matching frame/channel may acknowledge a persisted checkpoint. */
export function createCloseHandshake(
  frame: Window,
  channel: string,
  timeoutMs = 15_000,
) {
  let pending: Promise<void> | undefined;
  let disposeRequest: (() => void) | undefined;
  let lastRequestId: string | undefined;
  return {
    prepareClose(): Promise<void> {
      if (pending) return pending;
      const requestId = crypto.randomUUID();
      lastRequestId = requestId;
      const send = (type: string) =>
        frame.postMessage(
          { source: 'pocket-gba-app', channel, type, requestId },
          location.origin,
        );
      pending = new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          clearTimeout(timer);
          window.removeEventListener('message', receive);
          disposeRequest = undefined;
          if (error) {
            send('cancel-close');
            reject(error);
          } else resolve();
        };
        const receive = (event: MessageEvent) => {
          if (
            event.origin !== location.origin ||
            event.source !== frame ||
            event.data?.source !== 'pocket-gba-player' ||
            event.data.channel !== channel ||
            event.data.requestId !== requestId
          )
            return;
          if (event.data.type === 'close-prepared') finish();
          if (event.data.type === 'close-failed')
            finish(
              new Error(
                'Progress could not be saved. Your game is still open.',
              ),
            );
        };
        const timer = setTimeout(
          () =>
            finish(
              new Error(
                'Saving timed out. Your game is still open. Try again.',
              ),
            ),
          timeoutMs,
        );
        disposeRequest = () =>
          finish(new Error('Player closed before saving completed.'));
        window.addEventListener('message', receive);
        send('prepare-close');
      }).finally(() => {
        pending = undefined;
      });
      return pending;
    },
    cancelClose() {
      frame.postMessage(
        {
          source: 'pocket-gba-app',
          channel,
          type: 'cancel-close',
          requestId: lastRequestId,
        },
        location.origin,
      );
    },
    dispose() {
      disposeRequest?.();
    },
  };
}
