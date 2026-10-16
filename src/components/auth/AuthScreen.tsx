import * as React from 'react';
import { cn } from '@/lib/utils';

// ============================================
// AuthScreen — shared panel for Login / Setup / Lock (Feature 1 §5)
// One centered card so the three entry screens cannot drift apart visually: same
// monogram, same width, same chrome. Only the body differs.
// ============================================

interface AuthScreenProps {
  instituteName: string;
  instituteLine?: string;
  heading: string;
  subheading?: string;
  children: React.ReactNode;
  className?: string;
}

export function AuthScreen({
  instituteName,
  instituteLine,
  heading,
  subheading,
  children,
  className,
}: AuthScreenProps) {
  return (
    <div className="grid min-h-screen place-items-center bg-surface p-6">
      <div
        className={cn(
          'w-full max-w-[420px] rounded-card border border-hairline bg-panel p-8 shadow-raised',
          className,
        )}
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-[56px] w-[56px] items-center justify-center rounded-card bg-accent text-page font-bold text-white">
            M
          </div>
          <h1 className="text-title font-semibold tracking-tight text-ink">{instituteName}</h1>
          {instituteLine ? <p className="mt-1 text-meta text-ink-muted">{instituteLine}</p> : null}
        </div>

        <div className="mb-5 text-center">
          <h2 className="text-section font-semibold text-ink">{heading}</h2>
          {subheading ? <p className="mt-1 text-meta text-ink-muted">{subheading}</p> : null}
        </div>

        {children}
      </div>
    </div>
  );
}
