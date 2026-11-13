import { useSyncExternalStore } from 'react';
import { cancelActivePlayerClose } from '../player/session';
import { createUpdateController } from './controller';
import type { UpdateStatus } from './controller';

let preferences: Storage | undefined;
try {
  preferences = localStorage;
} catch {
  /* The in-memory preference still works. */
}

export const updates = createUpdateController(
  {
    async invoke(command, args) {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke(command, args);
    },
    async listen(callback) {
      const { listen } = await import('@tauri-apps/api/event');
      return listen<UpdateStatus>('desktop:update-status', ({ payload }) =>
        callback(payload),
      );
    },
  },
  __APP_VERSION__,
  preferences,
  cancelActivePlayerClose,
);

export function useUpdates() {
  return useSyncExternalStore(
    updates.subscribe,
    updates.getSnapshot,
    updates.getSnapshot,
  );
}
