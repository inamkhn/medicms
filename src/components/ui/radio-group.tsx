import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { cn } from '@/lib/utils';

// ============================================
// RadioGroup — design system §12
// Seven raw <input type="radio"> pairs exist today, and most of them (AddFeeDemand,
// AddExpense) never set a shared `name`, so the browser did not treat them as a group:
// arrow keys did not move between options and the pair was only two independent
// checkboxes that the page kept mutually exclusive by hand. Radix owns that.
// ============================================

export function RadioGroup(props: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root {...props} />;
}

/** The dot itself, shared by both shapes below so the two can never disagree (P9).
 *  Sizes are px: at a 13px root one spacing step is 3.25px, so `h-4` would render 13px. */
function Dot() {
  return (
    <RadioGroupPrimitive.Indicator className="flex h-full w-full items-center justify-center">
      <span className="h-[8px] w-[8px] rounded-full bg-accent" />
    </RadioGroupPrimitive.Indicator>
  );
}

/** The bare 16px control, for a row that supplies its own accessible name. */
export const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      'flex h-[16px] w-[16px] flex-none items-center justify-center rounded-full border',
      'transition-[background-color,border-color] duration-120 ease-standard',
      'border-hairline-strong bg-panel data-[state=checked]:border-accent',
      'disabled:pointer-events-none disabled:opacity-55',
      className,
    )}
    {...props}
  >
    <Dot />
    {children}
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export interface RadioOptionProps
  extends Omit<React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>, 'children'> {
  /** Rendered beside the control and referenced by aria-labelledby, so the row's
   *  accessible name and its visible text are the same sentence. A <label for=…> could
   *  not do this: the row is a button, and a button is not a labelable element. */
  label: React.ReactNode;
  description?: React.ReactNode;
}

/**
 * Control + text as one clickable row. The row is the only control — a nested
 * RadioGroupItem here would emit a button inside a button and register a second,
 * unnamed radio. A whole-row target matters because these choices sit in dense forms
 * (strike-off reasons, "paid from petty cash or bank") where 16px is easy to miss.
 */
export function RadioOption({ label, description, className, ...props }: RadioOptionProps) {
  const textId = React.useId();
  return (
    <RadioGroupPrimitive.Item
      aria-labelledby={textId}
      className={cn(
        'group flex w-full items-start gap-2.5 rounded-control border border-transparent bg-transparent p-2 text-left',
        'transition-colors duration-120 ease-standard hover:bg-hairline-soft',
        // Selected state is a tint plus a border, not tint alone (P4).
        'data-[state=checked]:border-accent/30 data-[state=checked]:bg-accent-soft',
        'disabled:pointer-events-none disabled:opacity-55',
        className,
      )}
      {...props}
    >
      <span className="flex h-[16px] w-[16px] flex-none items-center justify-center rounded-full border border-hairline-strong bg-panel transition-colors duration-120 group-data-[state=checked]:border-accent">
        <Dot />
      </span>
      <span id={textId} className="min-w-0 flex-1">
        <span className="block text-body text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-meta text-ink-muted">{description}</span> : null}
      </span>
    </RadioGroupPrimitive.Item>
  );
}
