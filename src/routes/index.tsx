import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { z } from 'zod';
import { gamesQuery, useDataMutation } from '../data/queries';
import { data, friendlyError, type Game } from '../data/db';
import { readGameFile } from '../lib/zip';
import { parseRomHeader } from '../lib/rom-header';
import { hashRom } from '../lib/hash';
import { Shell, Pending, RouteError } from '../components/Shell';
import { Icon } from '../components/Icon';
import { EmptyLibraryIllustration } from '../components/EmptyLibraryIllustration';
import { compactButton } from '../components/ui';
import { Button } from '../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '../components/ui/dropdown-menu';
import { CheatSheet } from '../components/CheatSheet';
import { useToast } from '../components/Toast';

export const Route = createFileRoute('/')({
  validateSearch: z.object({ cheats: z.string().optional() }),
  loader: ({ context }) => context.queryClient.ensureQueryData(gamesQuery),
  pendingComponent: Pending,
  errorComponent: RouteError,
  component: Library,
});
export const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const formatActivity = (timestamp: number) =>
  new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
function Library() {
  const { data: games = [] } = useQuery(gamesQuery);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [cheatGame, setCheatGame] = useState<Game | null>(null);
  const add = useDataMutation(async (file: File) => {
    const { buffer, filename } = await readGameFile(file);
    const header = parseRomHeader(buffer);
    if (
      !header.validFixedByte &&
      !confirm(
        'This file’s GBA header looks different. Some homebrew games and hacks do this. Only continue if you trust your own file. Add it anyway?',
      )
    )
      return;
    const hash = await hashRom(buffer);
    const duplicate = await client.fetchQuery({
      queryKey: ['games', 'duplicate', hash],
      queryFn: () => data.duplicate(hash),
    });
    if (duplicate) {
      toast(
        `“${duplicate.name}” is already in your library. The same file wasn’t added twice.`,
      );
      return;
    }
    const game: Game = {
      id: hash,
      hash,
      name: filename.replace(/\.gba$/i, '').replace(/[_]/g, ' '),
      filename,
      blob: new Blob([buffer]),
      size: buffer.byteLength,
      gameCode: header.gameCode,
      makerCode: header.makerCode,
      version: header.version,
      addedAt: Date.now(),
      lastPlayedAt: null,
    };
    await data.addGame(game);
    if (!games.length) {
      try {
        const persistent = await navigator.storage?.persist?.();
        toast(
          persistent
            ? 'Game added. Persistent storage is enabled.'
            : 'Game added. Back up your saves: your browser may reclaim storage.',
        );
      } catch {
        toast('Game added. You can check storage in Settings.');
      }
    } else toast(`“${game.name}” added to your pocket.`);
  });
  const remove = useDataMutation(data.removeGame);
  const openCheats = (game: Game) => setCheatGame(game);
  const activeCheat =
    cheatGame ?? games.find((game) => game.id === search.cheats);
  return (
    <Shell fitViewport={!games.length}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <h1
          id="library-heading"
          className="inline-flex items-center gap-2 text-lg font-medium tracking-tight"
        >
          Your library
          {games.length > 0 && (
            <span className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full border border-primary/45 px-1.5 text-xs leading-none font-medium text-accent-foreground">
              {games.length}
            </span>
          )}
        </h1>
        <Button
          variant="primary"
          size="xs"
          className="border border-primary/25 hover:border-primary/40"
          onClick={() => input.current?.click()}
          disabled={add.isPending}
        >
          <span className="text-primary">
            <Icon name="plus" size={14} />
          </span>
          {add.isPending ? 'Adding your game…' : 'Add a game'}
        </Button>
      </div>
      <input
        data-testid="game-upload"
        ref={input}
        type="file"
        // iOS can disable unknown extensions such as .gba when accept is set.
        // Keep the picker unrestricted; readGameFile validates the selection.
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file)
            add.mutate(file, {
              onError: (error) => toast(friendlyError(error)),
            });
          event.target.value = '';
        }}
      />
      <section
        className={games.length ? 'mt-6' : 'mt-4 flex min-h-0 flex-1 flex-col'}
        aria-labelledby="library-heading"
      >
        {games.length ? (
          <div className="divide-y divide-line border-y border-line">
            {games.map((game) => (
              <article
                key={game.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4"
              >
                <div className="min-w-0 flex-1 basis-40">
                  <h2 className="text-sm font-medium break-words">
                    {game.name}
                  </h2>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] leading-4 text-muted">
                    <p>
                      {game.lastPlayedAt ? (
                        <>
                          Last played{' '}
                          <time
                            dateTime={new Date(game.lastPlayedAt).toISOString()}
                          >
                            {formatActivity(game.lastPlayedAt)}
                          </time>
                        </>
                      ) : (
                        'Not played yet'
                      )}
                    </p>
                    <p>
                      {game.lastSavedAt ? (
                        <>
                          Saved{' '}
                          <time
                            dateTime={new Date(game.lastSavedAt).toISOString()}
                          >
                            {formatActivity(game.lastSavedAt)}
                          </time>
                        </>
                      ) : (
                        'No save recorded'
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    className={`${compactButton} text-accent-foreground hover:bg-primary/10 hover:text-accent-foreground`}
                    to="/play/$gameId"
                    params={{ gameId: game.id }}
                  >
                    <span className="text-primary">
                      <Icon name="play" size={14} />
                    </span>
                    Play<span className="sr-only"> {game.name}</span>
                  </Link>
                  <Button
                    size="icon-xs"
                    title="Cheats"
                    onClick={() => openCheats(game)}
                  >
                    <Icon name="cheats" size={16} />
                    <span className="sr-only">Cheats for {game.name}</span>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button size="icon-xs" />}
                      title="More"
                    >
                      <Icon name="more" size={16} />
                      <span className="sr-only">More about {game.name}</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="flex items-center justify-between gap-3">
                          <span>
                            {game.gameCode || 'Unknown'} · v{game.version}
                          </span>
                          <span className="shrink-0">
                            {formatSize(game.size)}
                          </span>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="data-highlighted:bg-destructive/10 data-highlighted:text-ink"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (
                              confirm(
                                `Remove “${game.name}”? Its game file and cheats will be deleted from this device. Emulator saves are kept.`,
                              )
                            )
                              remove.mutate(game.id, {
                                onError: (error) => toast(friendlyError(error)),
                              });
                          }}
                        >
                          <span className="text-destructive">
                            <Icon name="trash" size={14} />
                          </span>
                          Remove<span className="sr-only"> {game.name}</span>
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
            <EmptyLibraryIllustration />
            <h2 className="shrink-0 text-base font-medium">No games yet</h2>
            <p className="mt-2 max-w-xs shrink-0 text-sm leading-relaxed text-muted">
              Add a game file from your device to start playing.
            </p>
          </div>
        )}
      </section>
      {activeCheat && (
        <CheatSheet
          game={activeCheat}
          onClose={() => {
            setCheatGame(null);
            if (search.cheats) void navigate({ search: {} });
          }}
        />
      )}
    </Shell>
  );
}
