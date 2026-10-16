// ============================================
// MediCMS Desktop — Finance core: cost categories (§24)
// Costs carry two levels — a group and a category — and reports key off the
// ID so renaming never breaks history (§24). The Staff group is reserved for
// payroll: a cost typed into it by hand is blocked. A category can be
// disabled — it then leaves the entry forms but stays in reports.
// Pure: the list is data the store keeps; these are the rules and the seed.
// ============================================

/** The §24 groups. `staff` is the reserved payroll group. */
export type CostGroupId =
  | 'staff'
  | 'premises'
  | 'academic'
  | 'equipment'
  | 'marketing'
  | 'student'
  | 'operations'
  | 'differences'
  | 'other';

export const COST_GROUP_LABELS: Record<CostGroupId, string> = {
  staff: 'Staff',
  premises: 'Premises',
  academic: 'Academic',
  equipment: 'Equipment',
  marketing: 'Marketing',
  student: 'Student related',
  operations: 'Operations',
  differences: 'Differences',
  other: 'Other',
};

/**
 * One leaf category (§24). The `id` is stable and is what reports and money
 * entries reference — `name` may be renamed freely without touching history.
 */
export interface CostCategory {
  /** Stable id, e.g. `cat-rent`. Reports and entries store this (§24). */
  id: string;
  group: CostGroupId;
  /** The display name; renaming does not break history (§24). */
  name: string;
  /** §24: a Staff-group category is posted only by payroll — hand entry is blocked. */
  payrollOnly?: boolean;
  /** §24 "automatic": some categories are made by a flow, never typed by hand. */
  automatic?: boolean;
  /** §24: disabled leaves the entry forms but stays in reports. */
  disabled?: boolean;
}

/** §24's table, exactly. Ids are stable; the name may change. */
export const DEFAULT_COST_CATEGORIES: CostCategory[] = [
  // Staff — reserved for payroll (§24).
  { id: 'cat-sal-teaching', group: 'staff', name: 'Salaries: Teaching', payrollOnly: true },
  { id: 'cat-sal-admin', group: 'staff', name: 'Salaries: Administration', payrollOnly: true },
  { id: 'cat-sal-support', group: 'staff', name: 'Salaries: Support', payrollOnly: true },
  { id: 'cat-hon-visiting', group: 'staff', name: 'Honoraria: Visiting faculty', payrollOnly: true },
  { id: 'cat-hon-clinical', group: 'staff', name: 'Honoraria: Clinical instructors and doctors', payrollOnly: true },
  // Premises.
  { id: 'cat-rent', group: 'premises', name: 'Rent' },
  { id: 'cat-utilities-electric', group: 'premises', name: 'Utilities: Electricity' },
  { id: 'cat-utilities-gas-water', group: 'premises', name: 'Utilities: Gas and water' },
  { id: 'cat-utilities-internet', group: 'premises', name: 'Utilities: Internet and phone' },
  { id: 'cat-maintenance', group: 'premises', name: 'Maintenance and repairs' },
  { id: 'cat-security-cleaning', group: 'premises', name: 'Security and cleaning' },
  // Academic.
  { id: 'cat-clinical-training', group: 'academic', name: 'Clinical training' },
  { id: 'cat-lab-consumables', group: 'academic', name: 'Lab and consumables' },
  { id: 'cat-books-stationery', group: 'academic', name: 'Books and stationery' },
  { id: 'cat-exam-expenses', group: 'academic', name: 'Exam expenses' },
  { id: 'cat-idcards-printing', group: 'academic', name: 'ID cards and printing' },
  // Equipment.
  { id: 'cat-furniture', group: 'equipment', name: 'Furniture' },
  { id: 'cat-electronic-equipment', group: 'equipment', name: 'Electronic equipment' },
  // Marketing.
  { id: 'cat-advertisement', group: 'marketing', name: 'Advertisement' },
  // Student related — a refund is made by the Payments flow, not typed (§24, §33).
  { id: 'cat-student-refunds', group: 'student', name: 'Student refunds', automatic: true },
  // Operations.
  { id: 'cat-food-hospitality', group: 'operations', name: 'Food and hospitality' },
  { id: 'cat-travel-conveyance', group: 'operations', name: 'Travel and conveyance' },
  { id: 'cat-legal-professional', group: 'operations', name: 'Legal and professional' },
  { id: 'cat-bank-charges', group: 'operations', name: 'Bank charges' },
  // Differences — a count difference is made by day closing, not typed (§11, §24).
  { id: 'cat-cash-differences', group: 'differences', name: 'Cash differences', automatic: true },
  // Other.
  { id: 'cat-other', group: 'other', name: 'Other' },
];

export function findCategory(categories: readonly CostCategory[], id: string): CostCategory | undefined {
  return categories.find((c) => c.id === id);
}

/** §24: a category belongs to the Staff group and may only be posted by payroll. */
export function isPayrollCategory(category: CostCategory): boolean {
  return category.group === 'staff' || category.payrollOnly === true;
}

/**
 * Whether a category may be chosen in a hand-entry form. A disabled category
 * leaves the form (§24); an `automatic` one is made only by a flow. A Staff one
 * is still *shown* — greyed with "Paid through payroll" (§61) — so the form
 * reads it as present but not selectable via `manualCostBlockReason`.
 */
export function showsInEntryForm(category: CostCategory): boolean {
  return !category.disabled;
}

/** The groups in §24's order, for a two-level picker. */
export function categoryGroups(categories: readonly CostCategory[]): CostGroupId[] {
  const order: CostGroupId[] = [
    'staff', 'premises', 'academic', 'equipment', 'marketing', 'student', 'operations', 'differences', 'other',
  ];
  const present = new Set(categories.map((c) => c.group));
  return order.filter((g) => present.has(g));
}

export function categoriesInGroup(categories: readonly CostCategory[], group: CostGroupId): CostCategory[] {
  return categories.filter((c) => c.group === group);
}

/**
 * The §24 sentence shown when a Staff category is picked in a manual form —
 * undefined means the category is open to hand entry. This is the single place
 * the payroll rule is phrased, so the picker and the save check agree (§79.21).
 */
export function manualCostBlockReason(category: CostCategory): string | undefined {
  if (isPayrollCategory(category)) return 'Salaries are paid through payroll.';
  if (category.automatic) return `${category.name} is made automatically by a flow, not typed here (§24).`;
  if (category.disabled) return `${category.name} is disabled and no longer takes new costs (§24).`;
  return undefined;
}

/**
 * The §24 checks for one category as an Admin edits the list: it needs a name,
 * a known group and an id nobody else already holds. Renaming is fine; a fresh
 * hand-made category cannot be a Staff one, since that group is reserved.
 */
export function categoryProblems(
  category: CostCategory,
  existing: readonly CostCategory[],
): string[] {
  const problems: string[] = [];
  if (!category.name.trim()) problems.push('A category needs a name (§24).');
  if (!(category.group in COST_GROUP_LABELS)) problems.push('A category belongs to a known group (§24).');
  if (existing.some((c) => c.id === category.id && c !== category)) {
    problems.push(`Category ${category.id} already exists — ids are never reused (§24).`);
  }
  if (
    existing.some((c) => c !== category && c.group === category.group && c.name.trim().toLowerCase() === category.name.trim().toLowerCase())
  ) {
    problems.push(`"${category.name.trim()}" already exists in the ${COST_GROUP_LABELS[category.group]} group (§24).`);
  }
  return problems;
}
