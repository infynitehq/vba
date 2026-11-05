import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { gameQuery, cheatsQuery, useDataMutation } from '../data/queries';
import { data } from '../data/db';
import { Pending, RouteError } from '../components/Shell';
import { CheatSheet } from '../components/CheatSheet';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { textButton } from '../components/ui';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';

export const Route = createFileRoute('/play/$gameId')({
  validateSearch: z.object({}),
  loader: async ({ context, params }) => {
    const [game] = await Promise.all([
      context.queryClient.ensureQueryData(gameQuery(params.gameId)),
      context.queryClient.ensureQueryData(cheatsQuery(params.gameId)),
    ]);
    return game;
  },
  pendingComponent: Pending,
  errorComponent: RouteError,
  component: Player,
});
function Player() {
  const { gameId } = Route.useParams();
  const game = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const toast = useToast();
  const client = useQueryClient();
  const iframe = useRef<HTMLIFrameElement>(null);
  const [channel] = useState(() => crypto.randomUUID());
  const [ready, setReady] = useState(false);
  const [showCheats, setShowCheats] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const { data: cheats = [] } = useQuery(cheatsQuery(gameId));
  const played = useDataMutation(data.played);
  const markPlayed = useRef(played.mutate);
  const send = (type: string, payload: Record<string, unknown> = {}) =>
    iframe.current?.contentWindow?.postMessage(
      { source: 'pocket-gba-app', channel, type, ...payload },
      location.origin,
    );
  useEffect(() => {
    markPlayed.current(gameId);
  }, [gameId]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== iframe.current?.contentWindow ||
        event.data?.source !== 'pocket-gba-player' ||
        event.data.channel !== channel
      )
        return;
      if (event.data.type === 'ready') setReady(true);
      if (event.data.type === 'saved')
        void client.invalidateQueries({ queryKey: ['games'] });
      if (event.data.type === 'error') toast(event.data.message);
      if (event.data.type === 'speed-error') {
        toast(event.data.message);
      }
      if (event.data.type === 'cheat-error')
        toast(
          `“${event.data.label}” could not be applied. Your game is still running. Try a code for ${game.gameCode} v${game.version}.`,
        );
      if (event.data.type === 'request-exit') void navigate({ to: '/' });
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [channel, client, game.gameCode, game.version, navigate, toast]);
  useEffect(() => {
    if (ready)
      iframe.current?.contentWindow?.postMessage(
        { source: 'pocket-gba-app', channel, type: 'apply-cheats', cheats },
        location.origin,
      );
  }, [channel, cheats, ready]);
  useEffect(() => {
    if (!ready || showCheats || confirmExit) return;
    let held = false;
    const update = (next: boolean) => {
      if (held === next) return;
      held = next;
      iframe.current?.contentWindow?.postMessage(
        { source: 'pocket-gba-app', channel, type: 'fast-forward-held', held },
        location.origin,
      );
    };
    const release = () => update(false);
    const keydown = (event: KeyboardEvent) => {
      if (
        event.code !== 'Space' ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, button, a, summary, [contenteditable], [role="button"]',
        )
      )
        return;
      event.preventDefault();
      if (!event.repeat) update(true);
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code === 'Space' && held) {
        event.preventDefault();
        release();
      }
    };
    const visibility = () => {
      if (document.hidden) release();
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      release();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [channel, ready, showCheats, confirmExit]);
  useEffect(() => {
    if (!ready || showCheats) return;
    const held = new Set<string>();
    const keydown = (event: KeyboardEvent) => {
      if (
        !['KeyF', 'KeyM'].includes(event.code) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, [contenteditable], [role="textbox"]',
        )
      )
        return;
      if (
        document.querySelector(
          'dialog[open], [role="dialog"], [role="alertdialog"]',
        )
      )
        return;
      if (event.repeat) {
        if (held.has(event.code)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      // A synchronous call retains the user activation required by fullscreen.
      const player = iframe.current?.contentWindow as
        | (Window & {
            PocketToolbar?: { runShortcut(code: string): boolean };
          })
        | null;
      if (player?.PocketToolbar?.runShortcut(event.code)) {
        held.add(event.code);
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (held.delete(event.code)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const release = () => held.clear();
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('keyup', keyup, true);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('keyup', keyup, true);
      window.removeEventListener('blur', release);
    };
  }, [ready, showCheats]);
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    let disposed = false;
    async function acquire() {
      try {
        if ('wakeLock' in navigator && !document.hidden) {
          const next = await navigator.wakeLock.request('screen');
          if (disposed) await next.release();
          else lock = next;
        }
      } catch {
        /* Optional on browsers and in low-power mode. */
      }
    }
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, []);
  const url = new URL(
    `${import.meta.env.BASE_URL}player.html`,
    location.origin,
  );
  url.searchParams.set('gameId', gameId);
  url.searchParams.set('channel', channel);
  return (
    <main className="fixed inset-0 flex flex-col bg-[#191715] pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-[#eeeae3]">
      <div className="flex min-h-16 shrink-0 items-center justify-between gap-1 px-2 sm:gap-3">
        <Button
          className={`${textButton} text-[#eeeae3] hover:bg-[#22201d] hover:text-white`}
          onClick={() => setConfirmExit(true)}
        >
          <Icon name="back" size={16} />
          <span>Library</span>
        </Button>
        <span className="hidden min-w-0 truncate text-xs text-[#a9a39b] sm:block">
          {game.name}
        </span>
        <Button
          className={`${textButton} text-[#eeeae3] hover:bg-[#22201d] hover:text-white`}
          onClick={() => setShowCheats(true)}
        >
          <Icon name="cheats" size={16} />
          Cheats
        </Button>
      </div>
      <iframe
        key={gameId}
        ref={iframe}
        title={`Play ${game.name}`}
        src={url.href}
        allow="autoplay; fullscreen; gamepad; screen-wake-lock"
        className="min-h-0 w-full flex-1 border-0"
      />
      {showCheats && (
        <CheatSheet game={game} onClose={() => setShowCheats(false)} />
      )}
      <Dialog open={confirmExit} onOpenChange={setConfirmExit}>
        <DialogContent backdropClassName="bg-black/45 backdrop-blur-sm">
          <DialogTitle>Exit game?</DialogTitle>
          <DialogDescription>
            Any unsaved progress will be lost. Return to your library?
          </DialogDescription>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmExit(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmExit(false);
                send('exit');
              }}
            >
              Exit game
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
