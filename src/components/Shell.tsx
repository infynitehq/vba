import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Classic } from 'loading-dev';
import { Icon } from './Icon';
import { AppLogo } from './AppLogo';
export { RouteError } from './ErrorPage';
const navLink =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-transparent px-3 text-xs font-medium text-ink/75 transition-colors hover:bg-surface hover:text-ink data-[status=active]:border-line data-[status=active]:bg-canvas data-[status=active]:text-ink data-[status=active]:shadow-sm sm:min-h-9';

export function Shell({
  children,
  fitViewport = false,
}: {
  children: ReactNode;
  fitViewport?: boolean;
}) {
  return (
    <div
      className={`mx-auto flex max-w-3xl flex-col px-5 pb-[env(safe-area-inset-bottom)] sm:px-8 ${fitViewport ? 'h-dvh' : 'min-h-dvh'}`}
    >
      <a
        className="fixed -top-20 left-4 z-50 rounded-md bg-ink px-4 py-3 text-canvas focus:top-4"
        href="#main"
      >
        Skip to content
      </a>
      <header className="shrink-0 border-b border-line pt-[env(safe-area-inset-top)]">
        <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:py-5">
          <Link
            to="/"
            className="inline-flex min-h-11 w-fit items-center gap-3 rounded-md"
          >
            <span className="inline-flex -translate-y-1 text-primary">
              <AppLogo size={40} />
            </span>
            <span className="text-xl font-semibold tracking-tight">
              Pocket <span className="text-muted">GBA</span>
            </span>
          </Link>
          <nav
            className="grid grid-cols-2 gap-0.5 rounded-lg border border-line bg-surface/50 p-0.5 sm:flex"
            aria-label="Main navigation"
          >
            <Link to="/" activeOptions={{ exact: true }} className={navLink}>
              <Icon name="library" size={15} />
              <span>Library</span>
            </Link>
            <Link to="/settings" className={navLink}>
              <Icon name="settings" size={15} />
              <span>Settings</span>
            </Link>
          </nav>
        </div>
      </header>
      <main
        id="main"
        className={
          fitViewport
            ? 'flex min-h-0 flex-1 flex-col py-4 sm:py-6'
            : 'flex-1 py-6 sm:py-10'
        }
      >
        {children}
      </main>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line py-4 text-[10px] leading-relaxed text-muted sm:text-xs">
        <span>© {new Date().getFullYear()} infynite</span>
        <p className="text-right">Not affiliated with Nintendo.</p>
      </footer>
    </div>
  );
}
export function Pending() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div
        className="flex flex-col items-center gap-4 text-muted"
        role="status"
      >
        <Classic size={32} />
        <p className="text-xs">Loading…</p>
      </div>
    </main>
  );
}
