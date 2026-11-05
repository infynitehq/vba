import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { button } from './ui';
import { Button } from './ui/button';
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
const InstallContext = createContext<InstallPrompt | null>(null);
export function InstallProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const installed = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  return (
    <InstallContext.Provider value={prompt}>{children}</InstallContext.Provider>
  );
}
export function InstallButton() {
  const prompt = useContext(InstallContext);
  const [used, setUsed] = useState(false);
  return prompt && !used ? (
    <Button
      className={`${button} text-ink`}
      onClick={async () => {
        await prompt.prompt();
        await prompt.userChoice;
        setUsed(true);
      }}
    >
      Install app
    </Button>
  ) : null;
}
