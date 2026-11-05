// Adapted from shadcn/ui's base-nova Button for Pocket GBA's compact style.
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm text-xs font-medium whitespace-nowrap disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border border-primary bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-line text-ink hover:bg-surface',
        ghost: 'text-muted hover:bg-surface hover:text-ink',
        primary:
          'text-accent-foreground hover:bg-primary/10 hover:text-accent-foreground',
        destructive: 'text-ink hover:bg-destructive/10',
      },
      size: {
        default: 'min-h-9 px-3 py-1.5',
        xs: 'min-h-8 px-2 py-1',
        icon: 'size-9 p-0',
        'icon-xs': 'size-8 p-0',
      },
    },
    // Quiet controls are the app default; primary actions opt into color.
    defaultVariants: { variant: 'ghost', size: 'default' },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
