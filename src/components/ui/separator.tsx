import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';

// ============================================
// Separator — design system §12
// A hairline, and only a hairline. h-px / w-px rather than a spacing step: at a 13px
// root one step is 3.25px, so `h-[0.5]`-style rounding would make a "hairline" two
// rows deep. The utility is an exact 1px and survives the small root size.
// ============================================

export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      decorative={decorative}
      className={cn(
        'shrink-0 border-none bg-hairline',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}
