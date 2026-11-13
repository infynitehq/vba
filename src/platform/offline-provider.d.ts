declare module '@offline-provider' {
  import type { ComponentType, ReactNode } from 'react';

  const OfflineProvider: ComponentType<{ children: ReactNode }>;
  export default OfflineProvider;
}
