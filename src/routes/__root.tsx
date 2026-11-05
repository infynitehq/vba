import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { Pending } from '../components/Shell';
import { RouteError, NotFoundPage } from '../components/ErrorPage';
import { OfflineProvider } from '../components/Offline';
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: Root,
    pendingComponent: Pending,
    errorComponent: RouteError,
    notFoundComponent: NotFoundPage,
  },
);
function Root() {
  return (
    <OfflineProvider>
      <Outlet />
    </OfflineProvider>
  );
}
