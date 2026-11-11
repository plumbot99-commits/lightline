import type { ComponentProps } from 'react';

import { cn } from '@/lib/resolve-class-name';

export type ButtonProps = ComponentProps<'button'>;

export function Button({ className, ...props }: ButtonProps) {
  return <button className={cn('media-button', className)} {...props} />;
}
