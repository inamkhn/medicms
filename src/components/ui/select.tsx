import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// Select — design system §10
// Already the only correctly-built primitive (real Radix, real keyboard model).
// Only the hardcoded palette came out: focus is the single base-layer outline,
// and the popup sits at z-dropdown(30), which is above the sticky table header at
// z-sticky(20), so a select opened over a table is never hidden by it.
// ============================================

// Re-exporting Radix's components as `const Select = SelectPrimitive.Root` makes
// react-refresh treat them as non-component exports, which disables fast refresh
// for every file that imports this module. Declaring them as functions keeps the
// boundary refreshable — a headless Root renders no DOM, so the wrapper costs
// nothing.
export function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

export function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value {...props} />;
}

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-control-md w-full items-center justify-between gap-2 rounded-control border border-hairline bg-panel px-3 text-body text-ink',
      'transition-[border-color,box-shadow] duration-120 ease-standard data-[state=open]:border-accent',
      'disabled:pointer-events-none disabled:opacity-55',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 flex-none text-ink-subtle" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        'relative z-dropdown min-w-[8rem] overflow-hidden rounded-control border border-hairline bg-panel shadow-raised',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-control px-2.5 py-1.5 text-body outline-none',
      'transition-colors duration-120 data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-55',
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;
