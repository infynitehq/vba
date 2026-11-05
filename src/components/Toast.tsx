import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { iconButton } from './ui';
import { Icon } from './Icon';
import { AppLogo } from './AppLogo';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<string[]>([]);
  const toast = useCallback((text: string) => {
    // Keep the active message in place; show queued notifications one at a time.
    // Error reporting must also work on local HTTP, without secure crypto APIs.
    setMessages((items) => [...items.slice(0, 3), text]);
  }, []);
  const message = messages[0];
  const dismiss = () => setMessages((items) => items.slice(1));
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <Dialog
        open={Boolean(message)}
        onOpenChange={(open) => {
          if (!open) dismiss();
        }}
      >
        <DialogContent
          className="max-w-sm p-6 sm:p-6"
          backdropClassName="bg-black/45 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex text-primary">
              <AppLogo size={32} />
            </span>
            <Button
              className={iconButton}
              aria-label="Dismiss notification"
              onClick={dismiss}
            >
              <Icon name="close" size={16} />
            </Button>
          </div>
          <DialogTitle className="mt-4 text-lg">Notification</DialogTitle>
          <DialogDescription className="mt-3 break-words leading-7">
            {message}
          </DialogDescription>
          <div className="mt-6 flex justify-end">
            <Button
              variant="outline"
              className="min-h-11 px-5"
              onClick={dismiss}
            >
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ToastContext.Provider>
  );
}
