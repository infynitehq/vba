// Shared shadcn button variants also style semantic router links.
import { buttonVariants } from './ui/button';
export const button = buttonVariants({ variant: 'outline' });
export const primaryButton = buttonVariants({ variant: 'default' });
export const textButton = buttonVariants({ variant: 'ghost' });
export const iconButton = buttonVariants({ variant: 'ghost', size: 'icon' });
export const compactButton = buttonVariants({ variant: 'ghost', size: 'xs' });
export const fieldInput =
  'w-full min-h-11 rounded-md border border-line bg-canvas px-3 py-2.5 text-sm placeholder:text-muted aria-invalid:border-destructive';
export const pageTitle = 'text-2xl font-semibold tracking-tight';
export const sectionTitle = 'text-sm font-semibold';
