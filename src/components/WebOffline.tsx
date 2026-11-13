import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import files from '../../emulator-files.json';
import { primaryButton, textButton } from './ui';
import { Button } from './ui/button';
import { OfflineContext } from './OfflineContext';
import { WebUpdateContext } from './WebUpdateContext';

async function isEmulatorCached() {
  const responses = await Promise.all(
    files.map((file) =>
      caches.match(
        new URL(
          `${import.meta.env.BASE_URL}emulatorjs/${file}`,
          location.origin,
        ).href,
        { ignoreSearch: true },
      ),
    ),
  );
  return responses.every((response) => response?.ok);
}

export default function WebOfflineProvider({
  children,
}: {
  children: ReactNode;
}) {
  const unsupported = !('serviceWorker' in navigator) || !('caches' in window);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(
    undefined,
  );
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      setUpdateError('Update setup failed. Reload the page to try again.');
      setError(
        error instanceof Error
          ? error.message
          : 'Offline setup could not finish.',
      );
    },
    onRegisteredSW(_url, registration) {
      registrationRef.current = registration;
      if (registration)
        setInterval(
          () => {
            if (navigator.onLine) void registration.update().catch(() => {});
          },
          60 * 60 * 1000,
        );
    },
  });
  async function checkForUpdates() {
    if (checking) return;
    setChecking(true);
    setUpdateError('');
    try {
      const registration = registrationRef.current;
      if (!registration)
        throw new Error('Updates are still getting ready. Try again shortly.');
      await registration.update();
      setChecked(true);
      setDismissed(false);
    } catch (error) {
      setUpdateError(
        error instanceof Error
          ? error.message
          : 'Could not check for updates. Check your connection and try again.',
      );
    } finally {
      setChecking(false);
    }
  }
  async function reloadToUpdate() {
    if (
      !confirm(
        'Reload to update? Save your game first. This ends the current session.',
      )
    )
      return;
    try {
      await updateServiceWorker(true);
    } catch {
      setUpdateError('Could not apply the update. Please try again.');
    }
  }
  useEffect(() => {
    if (
      import.meta.env.DEV ||
      !('serviceWorker' in navigator) ||
      !('caches' in window)
    )
      return;
    let disposed = false;
    const check = async () => {
      try {
        const cached = await isEmulatorCached();
        if (!disposed) setReady(cached);
      } catch {
        if (!disposed)
          setError(
            'Browser storage is unavailable. Offline play could not be prepared.',
          );
      }
    };
    void navigator.serviceWorker.ready.then(check);
    navigator.serviceWorker.addEventListener('controllerchange', check);
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener('controllerchange', check);
    };
  }, [offlineReady]);
  return (
    <OfflineContext.Provider
      value={{
        ready,
        error: unsupported
          ? 'Offline play needs HTTPS and a browser with service-worker storage.'
          : error,
      }}
    >
      <WebUpdateContext.Provider
        value={{
          supported: !unsupported && !import.meta.env.DEV,
          checking,
          checked,
          available: needRefresh,
          error: updateError,
          check: checkForUpdates,
          reload: reloadToUpdate,
        }}
      >
        {children}
      </WebUpdateContext.Provider>
      {needRefresh && !dismissed && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-lg flex-wrap items-center gap-2 rounded-lg border border-line bg-canvas p-4 shadow-sm"
        >
          <p className="w-full text-sm">
            An update is ready. Reloading ends your current game.
          </p>
          <Button
            className={primaryButton}
            onClick={() => void reloadToUpdate()}
          >
            Reload to update
          </Button>
          <Button className={textButton} onClick={() => setDismissed(true)}>
            Later
          </Button>
        </div>
      )}
    </OfflineContext.Provider>
  );
}
