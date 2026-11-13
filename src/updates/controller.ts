export type UpdateStatus = {
  phase:
    | 'disabled'
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'preparing'
    | 'installing'
    | 'error';
  currentVersion: string;
  updateId?: string;
  version?: string;
  notes?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  error?: string;
  reason?: string;
  readyToInstall?: boolean;
};

export type UpdateAdapter = {
  invoke(command: string, args?: { updateId: string }): Promise<unknown>;
  listen(callback: (status: UpdateStatus) => void): Promise<() => void>;
};

export const automaticUpdatesKey = 'pocket-gba:auto-updates';
type Preferences = Pick<Storage, 'getItem' | 'setItem'>;

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  // Tauri commands returning Result<_, String> reject with a plain string.
  return typeof error === 'string' && error.trim() ? error : fallback;
}

/** Native owns update handles and bytes. This store only retains status snapshots. */
export function createUpdateController(
  native: UpdateAdapter,
  currentVersion: string,
  preferences?: Preferences,
  onInstallFailure?: () => void,
) {
  let automatic = true;
  try {
    automatic = preferences?.getItem(automaticUpdatesKey) !== 'false';
  } catch {
    /* Storage may be unavailable. */
  }
  let snapshot = {
    status: { phase: 'idle', currentVersion } as UpdateStatus,
    automatic,
    pending: false,
    dismissed: false,
  };
  const subscribers = new Set<() => void>();
  let revision = 0;
  let generation = 0;
  let references = 0;
  let detach: (() => void) | undefined;
  let initialized = false;
  let startupChecked = false;
  let startupReady = false;
  let gameActive = false;
  let action = 0;
  let pendingCommand: string | undefined;
  let installId: string | undefined;
  let requestedInstallId: string | undefined;
  const cancelled = new Set<string>();
  const publish = (next: Partial<typeof snapshot>) => {
    snapshot = { ...snapshot, ...next };
    subscribers.forEach((notify) => notify());
  };
  const accept = (status: UpdateStatus, authoritative = false) => {
    const previous = snapshot.status;
    if (
      status.updateId &&
      cancelled.has(status.updateId) &&
      ['downloading', 'downloaded'].includes(status.phase)
    )
      return;
    // Ignore progress/completion for a superseded native handle, or progress after cancellation.
    if (
      status.updateId &&
      previous.updateId &&
      status.updateId !== previous.updateId &&
      !authoritative &&
      !(
        status.phase === 'available' &&
        (pendingCommand === 'check_for_update' ||
          ['idle', 'checking', 'error'].includes(previous.phase))
      )
    )
      return;
    if (
      status.phase === 'downloading' &&
      previous.phase === 'available' &&
      !snapshot.pending
    )
      return;
    if (
      status.phase === 'error' &&
      installId &&
      (!status.updateId || status.updateId === installId)
    ) {
      installId = undefined;
      onInstallFailure?.();
    }
    if (
      status.phase === 'error' &&
      (!status.updateId || status.updateId === requestedInstallId)
    )
      requestedInstallId = undefined;
    if (status.phase === 'preparing' || status.phase === 'installing') {
      installId = status.updateId ?? requestedInstallId;
    } else if (
      ['idle', 'available', 'downloaded', 'disabled'].includes(status.phase)
    ) {
      installId = undefined;
    }
    revision++;
    publish({
      status,
      dismissed:
        previous.updateId === status.updateId ? snapshot.dismissed : false,
    });
  };
  const run = async (command: string, updateId?: string) => {
    if (
      snapshot.pending &&
      (command !== 'cancel_update_download' || pendingCommand === command)
    )
      return;
    const token = ++action;
    const before = revision;
    pendingCommand = command;
    publish({ pending: true });
    try {
      const result = await native.invoke(
        command,
        updateId ? { updateId } : undefined,
      );
      // Event snapshots are newer than the command's initial response.
      if (
        token === action &&
        result &&
        (revision === before ||
          (command === 'download_update' &&
            snapshot.status.phase === 'downloading') ||
          (command === 'check_for_update' &&
            snapshot.status.phase === 'checking') ||
          command === 'cancel_update_download')
      ) {
        const status = result as UpdateStatus;
        if (
          command === 'cancel_update_download' &&
          status.phase === 'downloaded' &&
          updateId
        )
          cancelled.delete(updateId);
        accept(status, command === 'check_for_update');
      }
    } catch (error) {
      if (command === 'cancel_update_download' && updateId)
        cancelled.delete(updateId);
      if (token === action)
        accept({
          ...snapshot.status,
          phase: 'error',
          error: errorMessage(
            error,
            'The update could not be completed. Try again.',
          ),
        });
    } finally {
      if (token === action) {
        pendingCommand = undefined;
        publish({ pending: false });
      }
    }
  };
  const maybeCheck = () => {
    if (
      !initialized ||
      !startupReady ||
      gameActive ||
      startupChecked ||
      !snapshot.automatic ||
      snapshot.pending ||
      snapshot.status.phase !== 'idle'
    )
      return;
    startupChecked = true;
    void run('check_for_update');
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(notify: () => void) {
      subscribers.add(notify);
      return () => {
        subscribers.delete(notify);
      };
    },
    connect() {
      references++;
      if (references === 1) {
        const epoch = ++generation;
        void (async () => {
          const unlisten = await native.listen((status) => {
            if (epoch === generation) accept(status);
          });
          if (epoch !== generation) {
            unlisten();
            return;
          }
          detach = unlisten;
          const before = revision;
          const status = (await native.invoke('update_status')) as UpdateStatus;
          if (epoch !== generation) return;
          if (before === revision) accept(status, true);
          initialized = true;
          maybeCheck();
        })().catch((error: unknown) => {
          if (epoch === generation)
            accept({
              phase: 'error',
              currentVersion,
              error: errorMessage(
                error,
                'Update status is unavailable. Try again.',
              ),
            });
        });
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (--references === 0) {
          generation++;
          detach?.();
          detach = undefined;
        }
      };
    },
    setAutomatic(value: boolean) {
      try {
        preferences?.setItem(automaticUpdatesKey, String(value));
      } catch {
        /* Keep the session preference. */
      }
      publish({ automatic: value });
      maybeCheck();
    },
    uiReady(active: boolean) {
      startupReady = true;
      gameActive = active;
      maybeCheck();
    },
    check: () => {
      if (
        [
          'disabled',
          'checking',
          'downloading',
          'preparing',
          'installing',
        ].includes(snapshot.status.phase)
      )
        return Promise.resolve();
      startupChecked = true;
      return run('check_for_update');
    },
    download: () => {
      const { phase, updateId } = snapshot.status;
      if (!updateId || !['available', 'error'].includes(phase))
        return Promise.resolve();
      cancelled.delete(updateId);
      return run('download_update', updateId);
    },
    cancel: () => {
      const { phase, updateId } = snapshot.status;
      if (!updateId || phase !== 'downloading') return Promise.resolve();
      cancelled.add(updateId);
      return run('cancel_update_download', updateId);
    },
    install: () => {
      const { phase, updateId } = snapshot.status;
      if (
        !updateId ||
        !(
          phase === 'downloaded' ||
          (phase === 'error' && snapshot.status.readyToInstall === true)
        ) ||
        snapshot.pending ||
        requestedInstallId === updateId
      )
        return Promise.resolve();
      requestedInstallId = updateId;
      // This queues IntentUpdate; only complete_shutdown may install after saving.
      return run('install_update', updateId);
    },
    dismiss: () => publish({ dismissed: true }),
  };
}
