import { createContext, useContext } from 'react';

export const OfflineContext = createContext({ ready: false, error: '' });
export const useOffline = () => useContext(OfflineContext);
