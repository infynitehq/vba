import React, { lazy, Suspense, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { ToastProvider, useToast } from './components/Toast';
import { InstallProvider } from './components/Install';
import { Pending } from './components/Shell';
import {
  AppErrorBoundary,
  RouteError,
  NotFoundPage,
} from './components/ErrorPage';
import './styles/app.css';
import { installDesktopLifecycle } from './lifecycle/desktop';

const DesktopUpdates =
  import.meta.env.MODE === 'desktop'
    ? lazy(() => import('./updates/DesktopUpdates'))
    : null;

function DesktopLifecycle() {
  const toast = useToast();
  useEffect(() => installDesktopLifecycle(toast), [toast]);
  return null;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: false, refetchOnWindowFocus: true },
  },
});
const router = createRouter({
  routeTree,
  context: { queryClient },
  basepath: import.meta.env.BASE_URL,
  defaultPreload: 'intent',
  defaultPendingComponent: Pending,
  scrollRestoration: true,
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: NotFoundPage,
});
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <InstallProvider>
          <ToastProvider>
            <DesktopLifecycle />
            {DesktopUpdates ? (
              <Suspense fallback={null}>
                <DesktopUpdates router={router} />
              </Suspense>
            ) : null}
            <RouterProvider router={router} />
          </ToastProvider>
        </InstallProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
