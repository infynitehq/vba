import { createContext, useContext } from 'react';

type WebUpdateState = {
  supported: boolean;
  checking: boolean;
  checked: boolean;
  available: boolean;
  error: string;
  check: () => Promise<void>;
  reload: () => Promise<void>;
};

export const WebUpdateContext = createContext<WebUpdateState | null>(null);
export const useWebUpdates = () => useContext(WebUpdateContext);
