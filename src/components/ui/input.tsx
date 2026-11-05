import { Input as InputPrimitive } from '@base-ui/react/input';
import { cn } from '../../lib/utils';
import { fieldInput } from '../ui';

export function Input({ className, ...props }: InputPrimitive.Props) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(fieldInput, className)}
      {...props}
    />
  );
}
