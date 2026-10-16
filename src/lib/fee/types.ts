// ============================================
// MediCMS Desktop - Fee engine: shared types
// FEE_TEMPLATES_AND_ADMISSION_DESIGN.md (Draft 2), sections 5, 13, 24, 25, 26, 27.
//
// This folder is the calculation core the document asks for ("step 1 comes first
// because admission, promotion, the profile and every report depend on those
// calculations being right", §32). It is deliberately dependency-free: no runtime
// import reaches a store, a component or the clock, so every function can be run
// against the §28 sample tables and stay reproducible. Money is always an integer
// number of rupees; only percent rounding introduces a fraction.
// ============================================

/** When a component is billed. §5.3 - the five timing options. */
export type ChargeTiming =
  | 'AtAdmission'
  | 'EveryTerm'
  | 'EveryNewYear'
  | 'OnPromotion'
  | 'LastTermOnly';

/**
 * One line of a fee template (§5.2). `fromTerm`/`toTerm` narrow any timing option,
 * which is how "Clinical training, every term from term 3" is expressed without
 * needing per-term amounts (§10).
 */
export interface FeeComponent {
  id: string;
  name: string;
  /** PKR, zero or more (§19). */
  amount: number;
  charged: ChargeTiming;
  fromTerm?: number;
  toTerm?: number;
  /** §5.2 - security deposit and similar; shown separately in the totals (§8). */
  refundable: boolean;
}

/** How long a concession lasts (§13.4). */
export type TermScope =
  | { mode: 'termOnly'; term: number }
  | { mode: 'remainingTerms'; fromTerm: number }
  | { mode: 'specificTerms'; from: number; to: number };

/** §13.3 - "Set amount" is stored as a fixed amount off equal to the difference. */
export type ConcessionKind = 'waive' | 'fixed' | 'percent' | 'setAmount';

export type ConcessionTarget =
  | { kind: 'component'; componentId: string }
  | { kind: 'plan' };

/**
 * A stored reduction (§13.3). The template amounts stay untouched; the student's
 * figure is always derived from these records, so every reduction has a reason.
 */
export interface ConcessionRecord {
  id: string;
  target: ConcessionTarget;
  kind: ConcessionKind;
  /** Rupees, or percent for kind 'percent'. */
  value: number;
  scope: TermScope;
  reasonCategory: string;
  note: string;
  /** Filled when §13.6 approval was needed. */
  approvedBy?: string | null;
}

/** A fee charge already posted to a ledger (§24). `amount` is the net billed. */
export interface PostedCharge {
  id: string;
  term: number;
  label: string;
  amount: number;
  /** Local ISO date (YYYY-MM-DD). Every charge has one (§24.1). */
  dueDate: string;
  /** Sum of payments already allocated to this charge (§25.1). */
  allocated?: number;
}

/** Which charge a payment paid off (§25). */
export interface Allocation {
  chargeId: string;
  amount: number;
}

/** One component inside a computed term, before concessions. */
export interface TermFeeLine {
  componentId: string;
  name: string;
  amount: number;
  refundable: boolean;
}

export interface TermFee {
  term: number;
  lines: TermFeeLine[];
  total: number;
  /** Refundable part of this term (§8.1). */
  refundable: number;
}

/** A template line as fed to the concession calculator (§13.2 "Template" column). */
export interface TemplateLine {
  componentId: string;
  name: string;
  amount: number;
}
