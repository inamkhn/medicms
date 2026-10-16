import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// Checkbox — design system §12 (P4)
// Replaces the raw <input type="checkbox"> that StudentList used for row selection,
// which could not express the indeterminate state — the header box was "checked" or
// "not", never "some of these", so a bulk action looked fully selected when it was not.
// ============================================

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      // 16px written in px: at a 13px root a spacing step is 3.25px, so `h-4` renders
      // 13px and the box is a third smaller than its label.
      // `group` is what lets the two glyphs below be chosen by Radix's own data-state
      // rather than by reading a `checked` prop, which would only exist for controlled
      // use and would show a tick on an uncontrolled indeterminate box.
      'group peer flex h-[16px] w-[16px] flex-none items-center justify-center rounded-[3px] border',
      'transition-[background-color,border-color] duration-120 ease-standard',
      'border-hairline-strong bg-panel',
      'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
      'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
      'disabled:pointer-events-none disabled:opacity-55',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-white">
      {/* Two different glyphs, not one colour: a screen reader and a colour-blind
          user both need to tell "all" from "some" (P4). */}
      <Check size={12} strokeWidth={3} aria-hidden="true" className="group-data-[state=indeterminate]:hidden" />
      <Minus size={12} strokeWidth={3} aria-hidden="true" className="hidden group-data-[state=indeterminate]:block" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;
