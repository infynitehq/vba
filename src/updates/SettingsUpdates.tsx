import { Button } from '../components/ui/button';
import { updates, useUpdates } from './store';
import type { UpdateStatus } from './controller';

function statusText(status: UpdateStatus) {
  switch (status.phase) {
    case 'disabled':
      return (
        status.reason ||
        'Automatic installation is not available for this build. Use the releases below.'
      );
    case 'idle':
      return 'Check for the latest version of Pocket GBA.';
    case 'checking':
      return 'Checking for updates…';
    case 'available':
      return `Version ${status.version ?? ''} is available.`;
    case 'downloading':
      return 'Downloading update… You can keep playing.';
    case 'downloaded':
      return `Version ${status.version ?? ''} is ready. Your game will be saved before restarting.`;
    case 'preparing':
      return 'Saving your game before updating…';
    case 'installing':
      return 'Installing update. Keep the app open…';
    case 'error':
      return (
        status.error ||
        'The update could not be completed. Check your connection and try again.'
      );
  }
}

export default function SettingsUpdates() {
  const { status, automatic, pending } = useUpdates();
  const busy =
    pending ||
    ['checking', 'downloading', 'preparing', 'installing'].includes(
      status.phase,
    );
  const total =
    status.totalBytes && status.totalBytes > 0 ? status.totalBytes : undefined;
  const disabled = status.phase === 'disabled';
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">
            Pocket GBA {status.currentVersion}
          </h3>
          <div
            role="status"
            aria-live="polite"
            className={`mt-1 break-words text-[11px] leading-relaxed ${status.phase === 'error' ? 'text-destructive' : 'text-muted'}`}
          >
            {statusText(status)}
          </div>
        </div>
        <Button
          variant="outline"
          className="max-w-[45vw] whitespace-normal text-right"
          disabled={busy || disabled}
          onClick={() => void updates.check()}
        >
          {status.phase === 'checking' ? 'Checking…' : 'Check for updates'}
        </Button>
      </div>
      {status.phase === 'downloading' ? (
        <div className="mt-3 space-y-2">
          <progress
            aria-label="Update download"
            className="block h-2 w-full accent-ink"
            max={total ?? 1}
            value={
              total ? Math.min(status.downloadedBytes ?? 0, total) : undefined
            }
          />
          {total ? (
            <p className="text-xs text-muted">
              {Math.min(
                100,
                Math.floor(((status.downloadedBytes ?? 0) / total) * 100),
              )}
              % downloaded
            </p>
          ) : null}
        </div>
      ) : null}
      {status.notes ? (
        <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted">
          {status.notes}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 empty:hidden [&:not(:empty)]:mt-3">
        {status.phase === 'available' ||
        (status.phase === 'error' &&
          status.updateId &&
          !status.readyToInstall) ? (
          <Button
            variant="default"
            disabled={pending}
            onClick={() => void updates.download()}
          >
            {status.phase === 'error' ? 'Retry download' : 'Download update'}
          </Button>
        ) : null}
        {status.phase === 'downloading' ? (
          <Button variant="outline" onClick={() => void updates.cancel()}>
            Cancel download
          </Button>
        ) : null}
        {status.phase === 'downloaded' ||
        (status.phase === 'error' && status.readyToInstall) ? (
          <>
            <Button
              variant="default"
              disabled={pending}
              onClick={() => void updates.install()}
            >
              {status.phase === 'error'
                ? 'Retry installation'
                : 'Install and restart'}
            </Button>
            <Button variant="ghost" onClick={updates.dismiss}>
              Later
            </Button>
          </>
        ) : null}
      </div>
      <label
        className={`mt-4 grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t border-line pt-4 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className="min-w-0">
          <span className="block text-xs font-medium">
            Automatically check for updates
          </span>
          <span
            id="automatic-update-description"
            className="mt-1 block max-w-md text-[11px] leading-relaxed text-muted"
          >
            {disabled
              ? 'Unavailable in this build.'
              : 'Between games. Downloads and restarts are your choice.'}
          </span>
        </span>
        <span className="relative inline-flex shrink-0 items-center py-2">
          <input
            type="checkbox"
            role="switch"
            aria-label="Automatically check for updates"
            aria-describedby="automatic-update-description"
            className="peer sr-only"
            checked={automatic && !disabled}
            disabled={disabled}
            onChange={(event) => updates.setAutomatic(event.target.checked)}
          />
          <span
            aria-hidden="true"
            className="h-4.5 w-8 rounded-sm border border-ink/25 bg-ink/5 peer-checked:border-ink peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink peer-disabled:border-line peer-disabled:bg-surface"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0.75 size-3 rounded-[1px] bg-muted transition-transform duration-150 peer-checked:translate-x-3.5 peer-checked:bg-canvas peer-disabled:opacity-60 motion-reduce:transition-none"
          />
        </span>
      </label>
    </div>
  );
}
