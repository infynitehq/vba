import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import files from '../../emulator-files.json';
import { primaryButton, textButton } from './ui';
import { Button } from './ui/button';

const OfflineContext = createContext({ ready: false, error: '' });
export const useOffline = () => useContext(OfflineContext);

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

export function OfflineProvider({ children }: { children: ReactNode }) {
  const unsupported = !('serviceWorker' in navigator) || !('caches' in window);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Offline setup could not finish.',
      );
    },
    onRegisteredSW(_url, registration) {
      if (registration)
        setInterval(
          () => {
            if (navigator.onLine) void registration.update().catch(() => {});
          },
          60 * 60 * 1000,
        );
    },
  });
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
      {children}
      {needRefresh && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-lg flex-wrap items-center gap-2 rounded-lg border border-line bg-canvas p-4 shadow-sm"
        >
          <p className="w-full text-sm">
            An update is ready. Reloading ends your current game.
          </p>
          <Button
            className={primaryButton}
            onClick={() => {
              if (
                confirm(
                  'Reload to update? Save your game first. This ends the current session.',
                )
              )
                void updateServiceWorker(true);
            }}
          >
            Reload to update
          </Button>
          <Button className={textButton} onClick={() => setNeedRefresh(false)}>
            Later
          </Button>
        </div>
      )}
    </OfflineContext.Provider>
  );
}
