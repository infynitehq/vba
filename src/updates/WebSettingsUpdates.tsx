import { useWebUpdates } from '../components/WebUpdateContext';
import { Button } from '../components/ui/button';

export function WebSettingsUpdates() {
  const updates = useWebUpdates();
  const supported = updates?.supported ?? false;
  const status = !supported
    ? import.meta.env.DEV
      ? 'Web updates are available in production builds, not the development server.'
      : 'Web updates need HTTPS and a browser with service-worker support.'
    : updates?.error
      ? updates.error
      : updates?.checking
        ? 'Checking for updates…'
        : updates?.available
          ? 'An update is ready. Save your game before reloading.'
          : updates?.checked
            ? 'Update check complete. Any available update will appear here.'
            : 'Check for the latest version of Pocket GBA.';

  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Pocket GBA {__APP_VERSION__}</h3>
          <div
            role="status"
            aria-live="polite"
            className={`mt-1 break-words text-[11px] leading-relaxed ${updates?.error ? 'text-destructive' : 'text-muted'}`}
          >
            {status}
          </div>
        </div>
        <Button
          variant="outline"
          className="max-w-[45vw] whitespace-normal text-right"
          disabled={!supported || updates?.checking}
          onClick={() => void updates?.check()}
        >
          {updates?.checking ? 'Checking…' : 'Check for updates'}
        </Button>
      </div>
      {updates?.available ? (
        <div className="mt-3 flex justify-end">
          <Button onClick={() => void updates.reload()}>
            Reload to update
          </Button>
        </div>
      ) : null}
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs font-medium">Automatic update checks</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          {supported
            ? 'Checks hourly while the app is open and online. Reloading is your choice and ends the current game.'
            : 'Unavailable in this environment.'}
        </p>
      </div>
    </div>
  );
}
