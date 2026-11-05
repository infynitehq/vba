import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';
import { fieldInput } from '../ui';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldInput, 'resize-y', className)}
      {...props}
    />
  );
}
