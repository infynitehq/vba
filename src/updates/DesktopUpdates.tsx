import { useEffect, useSyncExternalStore } from 'react';
import type { AnyRouter } from '@tanstack/react-router';
import { hasActivePlayer, subscribeActivePlayer } from '../player/session';
import { Button } from '../components/ui/button';
import { updates, useUpdates } from './store';

export default function DesktopUpdates({ router }: { router: AnyRouter }) {
  const state = useUpdates();
  const active = useSyncExternalStore(subscribeActivePlayer, hasActivePlayer);
  const pathname = useSyncExternalStore(
    (notify) => router.subscribe('onResolved', notify),
    () => router.state.location.pathname,
  );
  useEffect(() => updates.connect(), []);
  useEffect(() => {
    updates.uiReady(
      active || pathname.includes('/play') || pathname.includes('/game'),
    );
  }, [active, pathname]);
  const { status, dismissed, pending } = state;
  // Never overlay gameplay, including the interval before its player registers.
  if (
    active ||
    pathname.includes('/play') ||
    pathname.includes('/game') ||
    pathname.includes('/settings') ||
    dismissed ||
    !['available', 'downloaded'].includes(status.phase)
  )
    return null;
  return (
    <aside
      aria-label="App update"
      className="fixed bottom-5 left-1/2 z-40 w-[min(92vw,32rem)] -translate-x-1/2 rounded-lg border border-line bg-surface p-4 shadow-lg"
    >
      <p role="status" className="mb-3 text-xs">
        Pocket GBA {status.version}{' '}
        {status.phase === 'downloaded'
          ? 'is ready to install.'
          : 'is available.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            void (status.phase === 'downloaded'
              ? updates.install()
              : updates.download())
          }
        >
          {status.phase === 'downloaded'
            ? 'Install and restart'
            : 'Download update'}
        </Button>
        <Button variant="ghost" onClick={updates.dismiss}>
          Later
        </Button>
      </div>
    </aside>
  );
}
