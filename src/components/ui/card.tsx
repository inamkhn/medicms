import * as React from 'react';
import { cn } from '@/lib/utils';

// ============================================
// Card — design system §6
// rounded-2xl (16px) retired for rounded-card (8px): whitespace is a cost in a
// counter app, not politeness (P1). Colour, radius and elevation come from tokens
// only. Padding is deliberately left on its existing scale steps — normalising it
// to the 4px rhythm changes every card in the app at once and belongs to the
// Phase 4 pattern pass, judged against a layout diff, not this colour-only swap.
// ============================================

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /**
   * Shortcut for the common "titled panel" shape. Renders CardHeader + CardTitle
   * (+ optional CardDescription) above `children`. Do not combine with a manual
   * CardHeader — pick one form.
   *
   * This shadows the native `title` tooltip attribute on purpose (no call site was
   * using it). For a tooltip use a real Tooltip component, not an attribute.
   */
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned actions in the title row, e.g. a Button or a PaperToggle. */
  actions?: React.ReactNode;
  footer?: React.ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, title, description, actions, footer, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-card border border-hairline bg-panel shadow-card', className)}
      {...props}
    >
      {title !== undefined && (
        <div className="flex items-start justify-between gap-3 p-6">
          {/* CardHeader stays a vertical stack: pages put CardTitle and
              CardDescription inside it and expect them stacked. The row layout for
              `actions` lives out here so the manual usage is untouched. */}
          <CardHeader className="min-w-0 flex-1 p-0">
            <CardTitle>{title}</CardTitle>
            {description !== undefined && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          {actions !== undefined && <div className="flex flex-none items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
      {footer !== undefined && <CardFooter>{footer}</CardFooter>}
    </div>
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-section font-semibold leading-none tracking-tight text-ink', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-meta text-ink-muted', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center justify-end gap-2 border-t border-hairline-soft px-6 py-4', className)}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';
