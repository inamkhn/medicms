import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

// ============================================
// Tabs — design system §12, and the student profile's six sections (§24)
// Radix supplies the roving tab index: Arrow keys move between tabs, Home/End jump to
// the ends, and the panel follows focus. Tab buttons are not links, so they must not
// carry href or pretend to navigate.
// ============================================

export function Tabs(props: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root {...props} />;
}

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('flex items-end gap-1 border-b border-hairline', className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

/**
 * The active tab is marked by an underline *and* ink colour, never colour alone (P4).
 * The underline sits on the list's own border row, so adding a tab never shifts the
 * content below it.
 */
export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'relative -mb-px inline-flex h-control-md items-center gap-1.5 border-b-2 border-transparent px-3',
      'text-body text-ink-muted transition-colors duration-120 ease-standard',
      'hover:text-ink data-[state=active]:border-accent data-[state=active]:text-accent',
      'data-[state=active]:font-semibold disabled:pointer-events-none disabled:opacity-55',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

/** Padding is deliberately not baked in: a tab panel is whatever the screen puts in it
 *  — a table, a form, a print area — and a default p-4 fights all three. */
export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-4 outline-none', className)} {...props} />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
