import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// DropdownMenu — design system §12, for the profile's "More ⌄" (§24)
// Replaces the row-action popover pattern that would otherwise be hand-assembled from
// a div and a click-outside listener. Radix gives typeahead, a roving focus that skips
// separators, and Escape that returns focus to the trigger. Submenus are available from
// the primitive but are not wrapped here — nothing in the app has a second level yet.
// ============================================

export function DropdownMenu(props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root {...props} />;
}

export function DropdownMenuTrigger(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>,
) {
  return <DropdownMenuPrimitive.Trigger {...props} />;
}

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // z-dropdown(30) rather than z-sticky: a menu opened from a table row action
        // must clear the sticky header it is scrolled under.
        'z-dropdown min-w-[10rem] rounded-control border border-hairline bg-panel p-1 shadow-raised',
        'data-[state=open]:animate-panel-in data-[state=closed]:animate-panel-out',
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean }
>(({ className, destructive = false, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'flex cursor-pointer select-none items-center gap-2 rounded-control px-2.5 py-1.5 text-body outline-none',
      // data-[highlighted], not hover:: pointer focus and keyboard focus both set it,
      // whereas hover: leaves the keyboard user looking at an unmarked menu (P4).
      'transition-colors duration-120 data-[highlighted]:bg-hairline-soft data-[highlighted]:text-ink',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-55',
      // Destructive items stay red at rest and only get the tint on highlight, so the
      // warning does not depend on the pointer being over it (P3).
      destructive ? 'text-danger data-[highlighted]:bg-danger-soft' : 'text-ink-secondary',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

export const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    checked={checked}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-control py-1.5 pl-7 pr-2.5 text-body outline-none',
      'transition-colors duration-120 data-[highlighted]:bg-hairline-soft',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-55 text-ink-secondary',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-[16px] w-[16px] items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check size={14} strokeWidth={2.5} className="text-accent" aria-hidden="true" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName;

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('px-2.5 py-1.5 text-meta font-semibold text-ink-muted', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-hairline', className)} {...props} />;
}

export function DropdownMenuGroup(props: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return <DropdownMenuPrimitive.Group {...props} />;
}
