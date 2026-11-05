import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { Shell, Pending, RouteError } from '../components/Shell';
import { useToast } from '../components/Toast';
import { storageStatus, clearAllData } from '../lib/storage';
import { useDataMutation } from '../data/queries';
import { exportCheats, importCheats } from '../data/backup';
import { friendlyError } from '../data/db';
import { pageTitle } from '../components/ui';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import { About } from '../components/About';

const storageQuery = { queryKey: ['storage'], queryFn: storageStatus };
export const Route = createFileRoute('/settings')({
  validateSearch: z.object({}),
  loader: ({ context }) => context.queryClient.ensureQueryData(storageQuery),
  pendingComponent: Pending,
  errorComponent: RouteError,
  component: Settings,
});
const size = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MB`;
function Settings() {
  const toast = useToast();
  const { data: storage, refetch } = useQuery(storageQuery);
  const importInput = useRef<HTMLInputElement>(null);
  const exported = useDataMutation(() => exportCheats());
  const imported = useDataMutation((file: File) => importCheats(file));
  const clear = useDataMutation(clearAllData);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const persist = useDataMutation(async () => {
    const granted = await navigator.storage?.persist?.();
    await refetch();
    toast(
      granted
        ? 'Persistent storage is enabled.'
        : 'Your browser did not grant persistent storage. Install the app and keep backups.',
    );
  });
  const canPersist = typeof navigator.storage?.persist === 'function';
  return (
    <Shell>
      <h1 className={pageTitle}>Settings</h1>
      <div className="mt-7 space-y-7">
        <SettingsGroup title="Storage" id="storage-settings">
          <SettingsRow
            title="Device storage"
            description={
              storage?.quota
                ? `${size(storage.usage)} of ${size(storage.quota)} browser quota`
                : 'Storage estimates aren’t available in this browser.'
            }
            action={
              <Button
                variant="outline"
                disabled={storage === undefined}
                onClick={() => void refetch()}
              >
                Refresh usage
              </Button>
            }
          >
            {Boolean(storage?.quota) && (
              <meter
                className="mt-3 block h-1.5 w-full accent-ink"
                aria-label="Browser storage usage"
                value={storage?.usage ?? 0}
                max={storage?.quota || 1}
              />
            )}
          </SettingsRow>
          <SettingsRow
            title="Protect local storage"
            description={
              storage?.persistent
                ? 'Your browser has granted persistent storage.'
                : canPersist
                  ? 'Ask your browser to keep games and saves on this device.'
                  : 'Persistent storage isn’t supported by this browser.'
            }
            action={
              <Button
                variant="outline"
                disabled={
                  persist.isPending || storage?.persistent || !canPersist
                }
                onClick={() =>
                  persist.mutate(undefined, {
                    onError: (error) => toast(friendlyError(error)),
                  })
                }
              >
                {storage?.persistent
                  ? 'Enabled'
                  : persist.isPending
                    ? 'Requesting…'
                    : 'Enable protection'}
              </Button>
            }
          />
          <p className="px-4 py-3 text-[11px] leading-relaxed text-muted">
            Protection isn’t a backup. Clearing browser data can still remove
            games and saves.
          </p>
        </SettingsGroup>

        <SettingsGroup title="Backups" id="backup-settings">
          <SettingsRow
            title="Export cheats"
            description="Download all your cheats as a JSON file."
            action={
              <Button
                variant="outline"
                disabled={exported.isPending}
                onClick={() =>
                  exported.mutate(undefined, {
                    onError: (error) => toast(friendlyError(error)),
                  })
                }
              >
                Export all cheats
              </Button>
            }
          />
          <SettingsRow
            title="Import cheats"
            description="Merge a JSON backup into your library."
            action={
              <Button
                variant="outline"
                disabled={imported.isPending}
                onClick={() => importInput.current?.click()}
              >
                Import cheats
              </Button>
            }
          />
          <input
            ref={importInput}
            hidden
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file)
                imported.mutate(file, {
                  onSuccess: () => toast('Cheats imported.'),
                  onError: (error) => toast(friendlyError(error)),
                });
              event.target.value = '';
            }}
          />
        </SettingsGroup>

        <SettingsGroup title="Reset" id="reset-settings">
          <SettingsRow
            title="Clear local data"
            description="Permanently delete all games, cheats, saves, and save states."
            action={
              <Button
                variant="outline"
                className="border-destructive/40 text-ink hover:bg-destructive/10"
                disabled={clear.isPending}
                onClick={() => {
                  setClearDialogOpen(true);
                }}
              >
                {clear.isPending ? 'Clearing…' : 'Clear all data'}
              </Button>
            }
          />
        </SettingsGroup>
      </div>
      <Dialog
        open={clearDialogOpen}
        onOpenChange={(open) => {
          if (!clear.isPending) setClearDialogOpen(open);
        }}
      >
        <DialogContent backdropClassName="bg-black/45 backdrop-blur-sm">
          <DialogTitle>Clear all local data?</DialogTitle>
          <DialogDescription>
            This permanently removes ALL games, cheats, emulator saves and save
            states. This cannot be undone.
          </DialogDescription>
          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (clear.isPending) return;
              clear.mutate(undefined, {
                onSuccess: () => {
                  setClearDialogOpen(false);
                  toast('All local game data was cleared.');
                  void refetch();
                },
                onError: (error) => {
                  setClearDialogOpen(false);
                  toast(friendlyError(error));
                },
              });
            }}
          >
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={clear.isPending}
                onClick={() => setClearDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="outline"
                className="border-destructive/40 text-ink hover:bg-destructive/10"
                disabled={clear.isPending}
              >
                {clear.isPending ? 'Clearing…' : 'Clear all data'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <About />
    </Shell>
  );
}

function SettingsGroup({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className="mb-3 text-xs font-medium uppercase tracking-widest text-muted"
      >
        {title}
      </h2>
      <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface/15">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {description}
          </p>
        </div>
        {action && (
          <div className="shrink-0 self-start sm:self-center">{action}</div>
        )}
      </div>
      {children}
    </div>
  );
}
