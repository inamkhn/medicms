// ============================================
// /style-guide — dev-only design-system instrument
//docs/DESIGN_SYSTEM.md §13
//
// Not a brochure. Every row reads the COMPUTED style of a hidden probe element,
// so a token that is declared in @theme but never generated as a utility shows
// up as "not generated" instead of looking like a correct swatch. This is the
// visual-diff instrument for the re-tokening migration: there is no test runner,
// so this page is what a phase is checked against before it is merged.
//
// It deliberately contains no hex literal and no text-[Npx]: it is inside the
// src/pages/** tree that scripts/check-design.mjs polices, and colour values are
// read back out of the CSS rather than typed a second time.
// ============================================

import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ConfirmDialog, ConfirmWithReasonDialog } from '@/components/ui/confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem, RadioOption } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DisableHint, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toastError, toastSuccess } from '@/lib/toast';
import { confirmDialog, confirmWithReason } from '@/lib/confirm';

type Probe = {
  /** token name as declared in src/index.css */
  token: string;
  /** the utility the token must generate */
  utility: string;
  /** classes applied to the probe — must be literal so Tailwind's scanner sees them */
  cls: string;
  /** computed property read back to prove the utility compiled */
  prop: string;
  /** literal expected value, for utilities not backed by a named CSS variable */
  expect?: string;
};

const BACKGROUND_PROBES: Probe[] = [
  { token: '--color-brand-50', utility: 'bg-brand-50', cls: 'bg-brand-50', prop: 'backgroundColor' },
  { token: '--color-brand-100', utility: 'bg-brand-100', cls: 'bg-brand-100', prop: 'backgroundColor' },
  { token: '--color-brand-200', utility: 'bg-brand-200', cls: 'bg-brand-200', prop: 'backgroundColor' },
  { token: '--color-brand-300', utility: 'bg-brand-300', cls: 'bg-brand-300', prop: 'backgroundColor' },
  { token: '--color-brand-400', utility: 'bg-brand-400', cls: 'bg-brand-400', prop: 'backgroundColor' },
  { token: '--color-brand-500', utility: 'bg-brand-500', cls: 'bg-brand-500', prop: 'backgroundColor' },
  { token: '--color-brand-600', utility: 'bg-brand-600', cls: 'bg-brand-600', prop: 'backgroundColor' },
  { token: '--color-brand-700', utility: 'bg-brand-700', cls: 'bg-brand-700', prop: 'backgroundColor' },
  { token: '--color-brand-800', utility: 'bg-brand-800', cls: 'bg-brand-800', prop: 'backgroundColor' },
  { token: '--color-accent', utility: 'bg-accent', cls: 'bg-accent', prop: 'backgroundColor' },
  { token: '--color-accent-hover', utility: 'bg-accent-hover', cls: 'bg-accent-hover', prop: 'backgroundColor' },
  { token: '--color-accent-soft', utility: 'bg-accent-soft', cls: 'bg-accent-soft', prop: 'backgroundColor' },
  { token: '--color-cleared', utility: 'bg-cleared', cls: 'bg-cleared', prop: 'backgroundColor' },
  { token: '--color-cleared-soft', utility: 'bg-cleared-soft', cls: 'bg-cleared-soft', prop: 'backgroundColor' },
  { token: '--color-dues', utility: 'bg-dues', cls: 'bg-dues', prop: 'backgroundColor' },
  { token: '--color-dues-soft', utility: 'bg-dues-soft', cls: 'bg-dues-soft', prop: 'backgroundColor' },
  { token: '--color-struckoff', utility: 'bg-struckoff', cls: 'bg-struckoff', prop: 'backgroundColor' },
  { token: '--color-struckoff-soft', utility: 'bg-struckoff-soft', cls: 'bg-struckoff-soft', prop: 'backgroundColor' },
  { token: '--color-credit', utility: 'bg-credit', cls: 'bg-credit', prop: 'backgroundColor' },
  { token: '--color-credit-soft', utility: 'bg-credit-soft', cls: 'bg-credit-soft', prop: 'backgroundColor' },
  { token: '--color-danger', utility: 'bg-danger', cls: 'bg-danger', prop: 'backgroundColor' },
  { token: '--color-danger-hover', utility: 'bg-danger-hover', cls: 'bg-danger-hover', prop: 'backgroundColor' },
  { token: '--color-danger-soft', utility: 'bg-danger-soft', cls: 'bg-danger-soft', prop: 'backgroundColor' },
  { token: '--color-ink', utility: 'bg-ink', cls: 'bg-ink', prop: 'backgroundColor' },
  { token: '--color-ink-secondary', utility: 'bg-ink-secondary', cls: 'bg-ink-secondary', prop: 'backgroundColor' },
  { token: '--color-ink-muted', utility: 'bg-ink-muted', cls: 'bg-ink-muted', prop: 'backgroundColor' },
  { token: '--color-ink-subtle', utility: 'bg-ink-subtle', cls: 'bg-ink-subtle', prop: 'backgroundColor' },
  { token: '--color-hairline-strong', utility: 'bg-hairline-strong', cls: 'bg-hairline-strong', prop: 'backgroundColor' },
  { token: '--color-hairline', utility: 'bg-hairline', cls: 'bg-hairline', prop: 'backgroundColor' },
  { token: '--color-hairline-soft', utility: 'bg-hairline-soft', cls: 'bg-hairline-soft', prop: 'backgroundColor' },
  { token: '--color-surface', utility: 'bg-surface', cls: 'bg-surface', prop: 'backgroundColor' },
  { token: '--color-surface-sunken', utility: 'bg-surface-sunken', cls: 'bg-surface-sunken', prop: 'backgroundColor' },
  { token: '--color-panel', utility: 'bg-panel', cls: 'bg-panel', prop: 'backgroundColor' },
];

const TEXT_PROBES: Probe[] = [
  { token: '--color-accent', utility: 'text-accent', cls: 'text-accent', prop: 'color' },
  { token: '--color-cleared', utility: 'text-cleared', cls: 'text-cleared', prop: 'color' },
  { token: '--color-dues', utility: 'text-dues', cls: 'text-dues', prop: 'color' },
  { token: '--color-struckoff', utility: 'text-struckoff', cls: 'text-struckoff', prop: 'color' },
  { token: '--color-credit', utility: 'text-credit', cls: 'text-credit', prop: 'color' },
  { token: '--color-danger', utility: 'text-danger', cls: 'text-danger', prop: 'color' },
  { token: '--color-ink', utility: 'text-ink', cls: 'text-ink', prop: 'color' },
  { token: '--color-ink-secondary', utility: 'text-ink-secondary', cls: 'text-ink-secondary', prop: 'color' },
  { token: '--color-ink-muted', utility: 'text-ink-muted', cls: 'text-ink-muted', prop: 'color' },
  { token: '--color-ink-subtle', utility: 'text-ink-subtle', cls: 'text-ink-subtle', prop: 'color' },
];

const BORDER_PROBES: Probe[] = [
  { token: '--color-hairline', utility: 'border-hairline', cls: 'border border-hairline', prop: 'borderTopColor' },
  { token: '--color-hairline-strong', utility: 'border-hairline-strong', cls: 'border border-hairline-strong', prop: 'borderTopColor' },
  { token: '--color-accent', utility: 'border-accent', cls: 'border border-accent', prop: 'borderTopColor' },
];

const TYPE_PROBES: Probe[] = [
  { token: '--text-micro', utility: 'text-micro', cls: 'text-micro', prop: 'fontSize' },
  { token: '--text-meta', utility: 'text-meta', cls: 'text-meta', prop: 'fontSize' },
  { token: '--text-body', utility: 'text-body', cls: 'text-body', prop: 'fontSize' },
  { token: '--text-ui', utility: 'text-ui', cls: 'text-ui', prop: 'fontSize' },
  { token: '--text-section', utility: 'text-section', cls: 'text-section', prop: 'fontSize' },
  { token: '--text-title', utility: 'text-title', cls: 'text-title', prop: 'fontSize' },
  { token: '--text-page', utility: 'text-page', cls: 'text-page', prop: 'fontSize' },
  { token: '--text-stat', utility: 'text-stat', cls: 'text-stat', prop: 'fontSize' },
];

const SHAPE_PROBES: Probe[] = [
  { token: '(default sm)', utility: 'rounded-sm', cls: 'rounded-sm', prop: 'borderTopLeftRadius', expect: '.25rem' },
  { token: '--radius-control', utility: 'rounded-control', cls: 'rounded-control', prop: 'borderTopLeftRadius' },
  { token: '(default lg)', utility: 'rounded-lg', cls: 'rounded-lg', prop: 'borderTopLeftRadius', expect: '.5rem' },
  { token: '--radius-card', utility: 'rounded-card', cls: 'rounded-card', prop: 'borderTopLeftRadius' },
  { token: '--radius-pill', utility: 'rounded-pill', cls: 'rounded-pill', prop: 'borderTopLeftRadius' },
  { token: '--shadow-card', utility: 'shadow-card', cls: 'shadow-card', prop: 'boxShadow' },
  { token: '--shadow-raised', utility: 'shadow-raised', cls: 'shadow-raised', prop: 'boxShadow' },
  { token: '--shadow-overlay', utility: 'shadow-overlay', cls: 'shadow-overlay', prop: 'boxShadow' },
];

/** No @theme namespace exists for these in Tailwind v4 — they are @utility definitions. */
const MECHANIC_PROBES: Probe[] = [
  { token: '--z-dropdown', utility: 'z-dropdown', cls: 'z-dropdown', prop: 'zIndex' },
  { token: '--z-sticky', utility: 'z-sticky', cls: 'z-sticky', prop: 'zIndex' },
  { token: '--z-overlay', utility: 'z-overlay', cls: 'z-overlay', prop: 'zIndex' },
  { token: '--z-modal', utility: 'z-modal', cls: 'z-modal', prop: 'zIndex' },
  { token: '--z-toast', utility: 'z-toast', cls: 'z-toast', prop: 'zIndex' },
  { token: '--z-tooltip', utility: 'z-tooltip', cls: 'z-tooltip', prop: 'zIndex' },
  // The overlay keyframes are @utility definitions in index.css, so "declared but never
  // generated" is a real failure mode here — a typo in an animation name compiles clean.
  { token: '(overlay fade)', utility: 'animate-overlay-in', cls: 'animate-overlay-in', prop: 'animationName', expect: 'overlay-in' },
  { token: '(panel scale)', utility: 'animate-panel-in', cls: 'animate-panel-in', prop: 'animationName', expect: 'panel-in' },
  { token: '(toast slide)', utility: 'animate-toast-in', cls: 'animate-toast-in', prop: 'animationName', expect: 'toast-in' },
  // Proves the dialog animation draws its timing from --dur-base rather than a literal.
  { token: '--dur-base', utility: 'animate-panel-in', cls: 'animate-panel-in', prop: 'animationDuration', expect: '180ms' },
  { token: '(P2 money cell)', utility: 'num', cls: 'num', prop: 'textAlign', expect: 'right' },
  { token: '(P2 tabular)', utility: 'num', cls: 'num', prop: 'fontVariantNumeric', expect: 'tabular-nums' },
  { token: '(P4 print-safe dot)', utility: 'status-dot', cls: 'status-dot', prop: 'display', expect: 'inline-block' },
  { token: '--dur-fast', utility: 'duration-120', cls: 'transition-all duration-120', prop: 'transitionDuration' },
  { token: '--dur-base', utility: 'duration-180', cls: 'transition-all duration-180', prop: 'transitionDuration' },
  { token: '--dur-slow', utility: 'duration-240', cls: 'transition-all duration-240', prop: 'transitionDuration' },
];

/* Physical heights. `h-8` is included deliberately: at a 13px root a spacing step
   is 3.25px, so h-8 measures 26px — which is why P1's 28/32/40 are px utilities. */
const HEIGHT_PROBES: Probe[] = [
  { token: '(P1 sm)', utility: 'h-control-sm', cls: 'h-control-sm', prop: 'height', expect: '28px' },
  { token: '(P1 md)', utility: 'h-control-md', cls: 'h-control-md', prop: 'height', expect: '32px' },
  { token: '(P1 lg)', utility: 'h-control-lg', cls: 'h-control-lg', prop: 'height', expect: '40px' },
  { token: '(P1 table row)', utility: 'h-row', cls: 'h-row', prop: 'height', expect: '28px' },
  { token: '(rem-based)', utility: 'h-8', cls: 'h-8', prop: 'height', expect: '2rem' },
  { token: '(rem-based)', utility: 'h-10', cls: 'h-10', prop: 'height', expect: '2.5rem' },
];

/** What the spacing rhythm actually measures under the 13px root. */
const SPACING_PROBES: Probe[] = [
  { token: '--spacing ×1', utility: 'p-1', cls: 'p-1', prop: 'paddingLeft', expect: '.25rem' },
  { token: '--spacing ×2', utility: 'p-2', cls: 'p-2', prop: 'paddingLeft', expect: '.5rem' },
  { token: '--spacing ×3', utility: 'p-3', cls: 'p-3', prop: 'paddingLeft', expect: '.75rem' },
  { token: '--spacing ×4', utility: 'p-4', cls: 'p-4', prop: 'paddingLeft', expect: '1rem' },
  { token: '--spacing ×6', utility: 'p-6', cls: 'p-6', prop: 'paddingLeft', expect: '1.5rem' },
  { token: '--spacing ×8', utility: 'p-8', cls: 'p-8', prop: 'paddingLeft', expect: '2rem' },
  { token: '--spacing ×12', utility: 'p-12', cls: 'p-12', prop: 'paddingLeft', expect: '3rem' },
];

const ALL_PROBES = [
  ...BACKGROUND_PROBES,
  ...TEXT_PROBES,
  ...BORDER_PROBES,
  ...TYPE_PROBES,
  ...SHAPE_PROBES,
  ...MECHANIC_PROBES,
  ...HEIGHT_PROBES,
  ...SPACING_PROBES,
];

/** utility|prop -> resolved comparison */
type ProbeResult = { computed: string; expected: string; matches: boolean };

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function matchesExpected(prop: string, computed: string, expected: string): boolean {
  if (!expected || !computed) return false;
  // Tailwind's shadow utilities emit the declared shadow alongside transparent
  // placeholder ring layers, so the token value is a substring, not the whole value.
  if (prop === 'boxShadow') return computed.includes(expected);
  return computed === expected;
}

/**
 * Resolve a value the way the browser will, so expected and computed are directly
 * comparable: `#2451b8` and `rgb(36, 81, 184)` are the same colour, `120ms` and
 * `0.12s` the same duration. Without this, every comparison would be a false negative.
 */
function normalizeValue(prop: string, value: string): string {
  const el = document.createElement('div');
  (el.style as unknown as Record<string, string>)[prop] = value;
  document.body.appendChild(el);
  const out = String((getComputedStyle(el) as unknown as Record<string, string>)[prop] ?? '');
  el.remove();
  return out;
}

function ProbeGrid({ probes, results }: { probes: Probe[]; results: Record<string, ProbeResult> }) {
  return (
    <div className="grid gap-2">
      {probes.map((p) => {
        const key = p.utility + '|' + p.prop;
        const r = results[key];
        const declared = p.token.startsWith('--') ? readToken(p.token) : p.expect ?? '';
        // A border probe must not also be handed a default border: two competing
        // border utilities in one class list make the swatch a coin flip.
        const isBorderProbe = p.prop === 'borderTopColor';
        return (
          <div key={key} className="flex items-center gap-3">
            <div
              className={`h-7 w-24 flex-none rounded-control ${isBorderProbe ? '' : 'border border-hairline'} ${p.cls}`}
              title={p.cls}
            />
            <code className="w-40 flex-none text-meta text-ink">{p.utility}</code>
            <code className="w-44 flex-none text-meta text-ink-muted">{p.token}</code>
            <span className="w-28 flex-none truncate text-micro text-ink-subtle" title={declared}>
              {declared || '—'}
            </span>
            {r ? (
              r.matches ? (
                <span className="text-micro text-cleared">{r.computed}</span>
              ) : (
                <span className="text-micro font-semibold text-danger">
                  {r.computed ? 'MISMATCH' : 'NOT GENERATED'} · got “{r.computed}” want “{r.expected}”
                </span>
              )
            ) : (
              <span className="text-micro text-ink-subtle">measuring…</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Renders every probe off-screen and compares its computed value to the value the
 * token declares. A utility that silently failed to compile, or that compiles to the
 * wrong number, is reported — which a swatch grid cannot see, because a bare element
 * inherits the very colour the token is supposed to set.
 */
function useProbeReport() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [results, setResults] = useState<Record<string, ProbeResult>>({});

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;

    // Measured after layout: reading computed styles during the effect body would
    // be the wrong moment anyway, and setState would cascade a render.
    const measure = () => {
      if (cancelled) return;
      const computed = new Map<string, string>();
      root.querySelectorAll<HTMLElement>('[data-probe]').forEach((el) => {
        const prop = el.dataset.prop || 'color';
        computed.set(
          `${el.dataset.probe}|${prop}`,
          String((getComputedStyle(el) as unknown as Record<string, string>)[prop] ?? ''),
        );
      });

      const next: Record<string, ProbeResult> = {};
      ALL_PROBES.forEach((p) => {
        const key = `${p.utility}|${p.prop}`;
        const raw = p.expect ?? (p.token.startsWith('--') ? readToken(p.token) : '');
        const expected = raw ? normalizeValue(p.prop, raw) : '';
        const got = computed.get(key) ?? '';
        next[key] = { computed: got, expected, matches: matchesExpected(p.prop, got, expected) };
      });
      setResults(next);
    };

    const frame = requestAnimationFrame(measure);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  const grid = (
    <div aria-hidden style={{ position: 'absolute', left: -9999, top: 0 }} ref={rootRef}>
      {ALL_PROBES.map((p) => (
        <div
          key={p.utility + p.prop}
          data-probe={p.utility}
          data-prop={p.prop}
          className={p.cls}
          // Never size the axis under test: an inline height would outrank the very
          // h-* utility the row exists to verify.
          style={{ width: p.prop === 'width' ? undefined : 8, height: p.prop === 'height' ? undefined : 8 }}
        />
      ))}
    </div>
  );

  return { grid, results };
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {note && <CardDescription>{note}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

const SPACE_STEPS = [
  { utility: 'p-1', use: 'icon-to-label' },
  { utility: 'p-2', use: 'control padding' },
  { utility: 'p-3', use: 'dense panel' },
  { utility: 'p-4', use: 'card padding' },
  { utility: 'p-6', use: 'between cards' },
  { utility: 'p-8', use: 'page block' },
  { utility: 'p-12', use: 'section separation' },
];

const TYPE_ROLES = [
  { utility: 'text-micro', role: 'receipt fine print' },
  { utility: 'text-meta', role: 'hints, timestamps, captions' },
  { utility: 'text-body', role: 'default — table cells, form text' },
  { utility: 'text-ui', role: 'buttons, inputs, nav' },
  { utility: 'text-section', role: 'card titles' },
  { utility: 'text-title', role: 'page title' },
  { utility: 'text-page', role: 'wizard step title' },
  { utility: 'text-stat', role: 'dashboard figure' },
];

const STATUS_ROWS = [
  { label: 'Cleared', cls: 'text-cleared', dot: 'bg-cleared', meaning: 'nothing outstanding' },
  { label: 'Dues', cls: 'text-dues', dot: 'bg-dues', meaning: 'amount outstanding' },
  { label: 'Struck off', cls: 'text-struckoff', dot: 'bg-struckoff', meaning: 'student inactive' },
  { label: 'Credit', cls: 'text-credit', dot: 'bg-credit', meaning: 'owed to the student' },
  { label: 'Danger', cls: 'text-danger', dot: 'bg-danger', meaning: 'destructive action only' },
];

export default function StyleGuide() {
  const { grid, results } = useProbeReport();
  const failed = Object.entries(results).filter(([, r]) => !r.matches);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [selectState, setSelectState] = useState<boolean | 'indeterminate'>('indeterminate');
  const [paidFrom, setPaidFrom] = useState('petty');
  const [showTerms, setShowTerms] = useState(true);

  return (
    <div className="min-h-screen bg-surface p-6">
      {grid}
      <div className="mx-auto max-w-4xl space-y-4 print-area">
        <header className="flex items-baseline justify-between gap-4 border-b border-hairline pb-4">
          <div>
            <h1 className="text-title font-semibold text-ink">Design system — token reference</h1>
            <p className="text-meta text-ink-muted">
              dev-only · docs/DESIGN_SYSTEM.md · every utility below is verified against its computed style
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            Print sample
          </Button>
        </header>

        {failed.length > 0 && (
          <div className="rounded-card border border-danger bg-danger-soft p-3 text-meta text-danger">
            {failed.length} utility(ies) do not resolve to their declared value:{' '}
            {failed.map(([k]) => k.split('|')[0]).join(', ')}
          </div>
        )}

        <Section title="Brand" note="Hue-locked ramp around the brand value — components use the accent aliases, never the ramp.">
          <ProbeGrid probes={BACKGROUND_PROBES.slice(0, 12)} results={results} />
        </Section>

        <Section title="Status" note="Five reserved meanings (P3). Credit is violet so a money state is never the interactive colour; danger red is destructive actions only.">
          <ProbeGrid probes={BACKGROUND_PROBES.slice(12, 23)} results={results} />
        </Section>

        <Section title="Neutrals" note="Mapped 1:1 off the slate ramp so re-tokening is visually neutral. `border` alone already resolves to hairline.">
          <ProbeGrid probes={BACKGROUND_PROBES.slice(23)} results={results} />
          <ProbeGrid probes={TEXT_PROBES} results={results} />
          <ProbeGrid probes={BORDER_PROBES} results={results} />
        </Section>

        <Section title="Typography" note="Eight role-named steps replacing 160 arbitrary sizes. Base is 13px — density is the product (P1).">
          <div className="space-y-1">
            {TYPE_ROLES.map((t) => (
              <div key={t.utility} className="flex items-baseline gap-3">
                <code className="w-32 flex-none text-meta text-ink-muted">{t.utility}</code>
                <span className={`w-20 flex-none text-meta num text-ink-subtle`}>{results[t.utility + '|fontSize']?.computed ?? '…'}</span>
                <span className={t.utility}>The quick brown fox 4,500.00 — {t.role}</span>
              </div>
            ))}
          </div>
          <ProbeGrid probes={TYPE_PROBES} results={results} />
        </Section>

        <Section title="Space" note="4px rhythm by intent — but the root is 13px and --spacing is .25rem, so one step measures 3.25px. The measured column is the truth; physical sizes are pinned with px utilities instead.">
          <div className="flex flex-wrap items-end gap-4">
            {SPACE_STEPS.map((s) => (
              <div key={s.utility} className="text-center">
                <div className={`inline-block border border-brand-200 bg-accent-soft ${s.utility}`}>
                  <div className="h-6 w-6 bg-accent" />
                </div>
                <div className="mt-1 text-meta text-ink">{s.utility}</div>
                <div className="text-micro text-ink-subtle">{s.use}</div>
              </div>
            ))}
          </div>
          <ProbeGrid probes={SPACING_PROBES} results={results} />
        </Section>

        <Section title="Control heights (P1)" note="28 / 32 / 40 exactly. h-8 and h-10 are shown beside them because at this root h-8 is 26px — which is why the heights are px utilities, not scale steps.">
          <div className="flex flex-wrap items-end gap-2">
            {['h-control-sm', 'h-control-md', 'h-control-lg', 'h-8', 'h-10'].map((h) => (
              <div key={h} className={`flex items-center justify-center border border-hairline-strong bg-panel px-2 text-micro text-ink-muted ${h}`} style={{ width: 68 }} title={h}>
                {h.replace('h-control-', '')}
              </div>
            ))}
          </div>
          <ProbeGrid probes={HEIGHT_PROBES} results={results} />
        </Section>

        <Section title="Radius & elevation" note="4 / 6 / 8 / pill and exactly three shadows. rounded-xl, rounded-2xl and coloured shadows do not ship.">
          <div className="flex flex-wrap items-center gap-4">
            {['rounded-sm', 'rounded-control', 'rounded-lg', 'rounded-card', 'rounded-pill'].map((r) => (
              <div key={r} className={`h-14 w-14 bg-panel border border-hairline ${r}`} title={r} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-6 bg-surface-sunken p-4">
            {['shadow-card', 'shadow-raised', 'shadow-overlay'].map((s) => (
              <div key={s} className={`h-14 w-24 bg-panel ${s}`} title={s} />
            ))}
          </div>
          <ProbeGrid probes={SHAPE_PROBES} results={results} />
        </Section>

        <Section title="Layering, money, motion" note="z-index and .num have no @theme namespace in v4 — they are @utility definitions, and duration-* must resolve as bare values.">
          <ProbeGrid probes={MECHANIC_PROBES} results={results} />
        </Section>

        <Section title="Money (P2)" note="Tabular, right-aligned, explicitly signed, never colour alone.">
          <div className="rounded-card border border-hairline bg-panel p-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Narration</TableHead>
                  <TableHead className="num">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-body">Fee demand — Term 3</TableCell>
                  <TableCell className="num text-body text-dues">+12,500</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-body">Payment — receipt 4471</TableCell>
                  <TableCell className="num text-body text-cleared">−8,000</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-body">Scholarship discount</TableCell>
                  <TableCell className="num text-body text-cleared">−2,000</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-body">Overpayment credit</TableCell>
                  <TableCell className="num text-body font-semibold text-credit">−2,500</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Section>

        <Section title="Status representation (P4)" note="Dot + label + sign. The dot is a bordered ring so it survives the print flattening rule that forces all text to black — compare with the Badge, which is a fill.">
          <div className="space-y-2">
            {STATUS_ROWS.map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <span className={`status-dot ${s.cls}`} />
                <span className={`text-body font-medium ${s.cls}`}>{s.label}</span>
                <span className="text-meta text-ink-muted">— {s.meaning}</span>
                <span className={`ml-auto h-3 w-3 rounded-sm ${s.dot}`} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="default">default</Badge>
            <Badge variant="outline">outline</Badge>
            <Badge variant="secondary">secondary</Badge>
            <Badge variant="cleared">cleared</Badge>
            <Badge variant="dues">dues</Badge>
            <Badge variant="credit">credit</Badge>
            <Badge variant="struckoff">struckoff</Badge>
            <Badge variant="danger">danger</Badge>
            <span className="text-micro text-ink-subtle">
              ← deprecated for student status: a fill carries meaning by colour alone (P4)
              and `.print-area [class*=bg-]` forces it transparent (P8)
            </span>
          </div>
        </Section>

        <Section title="Primitives (Phase 2: re-tokened)" note="Heights are px-exact via h-control-*, not scale steps. No gradient, no per-component focus ring — focus comes from the base layer only (P9).">
          <div className="flex flex-wrap items-center gap-2">
            <Button>default</Button>
            <Button variant="outline">outline</Button>
            <Button variant="ghost">ghost</Button>
            <Button variant="subtle">subtle</Button>
            <Button variant="link">link</Button>
            <Button variant="destructive">destructive</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">sm 28</Button>
            <Button size="md">md 32</Button>
            <Button size="lg">lg 40</Button>
            <Button size="icon" aria-label="More">
              ···
            </Button>
            <Button loading>loading</Button>
            <Button disabled>disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button className="h-7 w-7" size="icon" aria-label="override">
              ↵
            </Button>
            <span className="text-micro text-ink-subtle">
              ↑ proves the override still works: `h-7 w-7` must beat `h-control-md w-[32px]`.
              If this renders 32px, the token is missing from tailwind-merge's `h` group in
              lib/utils.ts — see DESIGN_SYSTEM.md §1.1.
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="sg-name">Student name</Label>
              <Input id="sg-name" placeholder="Ali Raza" />
            </div>
            <div>
              <Label htmlFor="sg-amount">Amount</Label>
              <Input id="sg-amount" num defaultValue="12500" />
            </div>
            <div>
              <Label htmlFor="sg-bad">Invalid</Label>
              <Input id="sg-bad" invalid defaultValue="03" />
            </div>
          </div>
          <p className="text-micro text-ink-subtle">
            Focus any control above: exactly one ring, 2px accent, 2px offset (P9).
          </p>
        </Section>

        <Section title="Overlay primitives (Phase 3)" note="Dialog, ConfirmDialog, Toast, Tabs, DropdownMenu, Checkbox, RadioGroup, Separator, Tooltip — all Radix underneath, so focus trap, Escape, aria-modal and the roving tab index are not reimplemented anywhere (P10).">
          <div className="flex flex-wrap items-center gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Fee template</DialogTitle>
                  <DialogDescription>Non-blocking panel: Escape and backdrop click dismiss it.</DialogDescription>
                </DialogHeader>
                <DialogBody>
                  Anything that neither destroys data nor moves money can be dismissed by accident.
                </DialogBody>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Close</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button
              variant="outline"
              onClick={() => setConfirmOpen(true)}
            >
              ConfirmDialog
            </Button>
            <Button variant="outline" onClick={() => setReasonOpen(true)}>
              With reason
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: 'Strike off SNO 214',
                  effect: 'SNO 214 stops appearing in the directory and a Struck Off entry is written to the audit log. Their outstanding balance of PKR 8,000 is left untouched.',
                  tone: 'destructive',
                  confirmLabel: 'Strike off',
                });
                if (ok) toastSuccess({ title: 'Struck off', description: 'SNO 214 marked inactive.' });
              }}
            >
              Imperative confirm
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                const out = await confirmWithReason({
                  title: 'Import 214 rows',
                  effect: '214 students will be added and 3 existing records overwritten. This cannot be undone in bulk.',
                  tone: 'money',
                  confirmLabel: 'Import',
                  reason: { label: 'Why is this import running?', minLength: 10, placeholder: 'e.g. Term 3 batch from the district office spreadsheet' },
                });
                if (out.confirmed) toastSuccess({ title: 'Import queued', description: `Reason recorded: ${out.reason}` });
              }}
            >
              Imperative + reason
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => toastSuccess('Term 3 demand posted')}>
              toast: success
            </Button>
            <Button variant="ghost" onClick={() => toastError({ title: 'Could not record payment', description: 'Ledger write failed — the amount was not charged.' })}>
              toast: error
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                toastSuccess({
                  title: 'Student marked struck off',
                  // P7: undo is offered only because this action genuinely reverses.
                  action: { label: 'Undo', onClick: () => toastSuccess('Reversal written to the audit log') },
                })
              }
            >
              toast: with undo
            </Button>
          </div>

          <Tabs defaultValue="ledger">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="ledger">Ledger</TabsTrigger>
              <TabsTrigger value="receipts">Receipts</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="text-body text-ink-muted">
              Arrow keys move between tabs, Home/End jump to the ends. This is the shape the §24 six-tab profile needs.
            </TabsContent>
            <TabsContent value="ledger" className="text-body text-ink-muted">Ledger panel.</TabsContent>
            <TabsContent value="receipts" className="text-body text-ink-muted">Receipts panel.</TabsContent>
          </Tabs>

          <div className="flex flex-wrap items-center gap-6">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>SNO 214</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => toastSuccess('Opened ledger')}>Open ledger</DropdownMenuItem>
                <DropdownMenuCheckboxItem checked={showTerms} onSelect={(e) => e.preventDefault()} onCheckedChange={setShowTerms}>
                  Show term breakdown
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => setReasonOpen(true)}>
                  Strike off…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-2">
              <Checkbox id="sg-sel" checked={selectState} onCheckedChange={setSelectState} />
              <Label htmlFor="sg-sel" className="cursor-pointer">
                {selectState === 'indeterminate' ? 'indeterminate — the state a raw <input> could not express' : 'checked'}
              </Label>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="link">hover me</Button>
              </TooltipTrigger>
              <TooltipContent>Tooltips open on focus too, so the keyboard user gets the same text.</TooltipContent>
            </Tooltip>

            <DisableHint disabled reason="A payment cannot be recorded while the student is struck off.">
              <Button variant="outline" disabled>
                Record payment
              </Button>
            </DisableHint>
          </div>

          <Separator />

          <RadioGroup value={paidFrom} onValueChange={setPaidFrom} className="gap-1">
            <RadioOption value="petty" label="Petty cash" description="Not linked to a bank account" />
            <RadioOption value="bank" label="Bank account" description="Writes a bank withdrawal beside the expense" />
            <div className="flex items-center gap-2 px-2 pt-1">
              <RadioGroupItem value="other" id="sg-other" />
              <Label htmlFor="sg-other" className="cursor-pointer">
                Bare item, named by an adjacent label
              </Label>
            </div>
          </RadioGroup>

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Post fee demand for 3 students?"
            effect="Adds a Term 3 demand of PKR 12,500 to each of 3 ledgers and writes one bulk audit entry. The students are billed immediately."
            tone="money"
            confirmLabel="Post demand"
            onConfirm={() => toastSuccess({ title: 'Demand posted', description: '3 ledgers updated.' })}
          />
          <ConfirmWithReasonDialog
            open={reasonOpen}
            onOpenChange={setReasonOpen}
            title="Strike off SNO 214"
            effect="SNO 214 leaves the active directory. The outstanding PKR 8,000 stays on the ledger."
            tone="destructive"
            confirmLabel="Strike off"
            reasonLabel="Reason for strike-off"
            reasonPlaceholder="Required for the audit log"
            changes={[{ field: 'Status', before: 'Active', after: 'Struck off' }]}
            onConfirm={(reason) => toastSuccess({ title: 'Struck off', description: reason })}
          />
        </Section>

        <Section title="Print documents (P8)" note="80mm thermal and CR80 card are physical outputs — screen styling must not leak into them.">
          <div className="thermal-receipt rounded-card border border-hairline bg-panel p-3">
            <div className="text-center text-ui font-bold">PARAMEDICAL INSTITUTE</div>
            <div className="text-center text-micro text-ink-muted">Fee receipt · thermal 80mm</div>
            <div className="my-2 border-t border-hairline" />
            <div className="flex justify-between text-meta">
              <span>SNO 214 — Ali Raza</span>
              <span className="num">4,500</span>
            </div>
            <div className="flex justify-between text-meta">
              <span>Term 3 demand</span>
              <span className="num">+12,500</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-hairline pt-1 text-ui font-bold">
              <span>Balance</span>
              <span className="num">8,000</span>
            </div>
          </div>
          <div className="id-card-cr80 rounded-card border border-hairline-strong bg-panel p-2">
            <div className="text-micro font-bold text-ink">PARAMEDICAL INSTITUTE</div>
            <div className="text-micro text-ink-muted">Ali Raza · SNO 214 · D.Pharm 2nd yr</div>
            <div className="mt-1 text-micro text-ink-subtle">Valid till 31 Dec 2027</div>
          </div>
        </Section>
      </div>
    </div>
  );
}
