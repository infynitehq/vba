import type { ReactNode } from 'react';
import { OfflineContext } from './OfflineContext';

const desktopStatus = { ready: true, error: '' };

export default function DesktopOfflineProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <OfflineContext.Provider value={desktopStatus}>
      {children}
    </OfflineContext.Provider>
  );
}
