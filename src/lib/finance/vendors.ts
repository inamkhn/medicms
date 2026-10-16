// ============================================
// MediCMS Desktop — Finance core: payees and vendors (§25)
// A vendor is a payee a cost or a payment names. Vendors are added here; a
// Staff payee comes from the staff register (read-only) and a Student payee is
// made for a refund, so neither is a vendor record. A vendor with bills is
// never deleted — it is made inactive (§25).
// Pure: the rules and the id generator; the list is data the store keeps.
// ============================================

/** §25: the vendor kinds the app offers when one is added. */
export type VendorType = 'Vendor' | 'Landlord' | 'Hospital' | 'Utility' | 'Other';

export const VENDOR_TYPE_LABELS: Record<VendorType, string> = {
  Vendor: 'Vendor',
  Landlord: 'Landlord',
  Hospital: 'Hospital or clinical site',
  Utility: 'Utility company',
  Other: 'Other',
};

export interface Vendor {
  /** `v-<n>` — stable and never reused, like every finance id (§7.1 spirit). */
  id: string;
  /** Unique among vendors (§25). */
  name: string;
  type: VendorType;
  phone?: string;
  address?: string;
  notes?: string;
  /** §25: payment terms in days; a bill's due date defaults to bill date + these. */
  termsDays: number;
  /** §25 / §78: the payable carried in at go-live. */
  openingPayable?: number;
  /** §25: a vendor with bills is never deleted, only made Inactive. */
  status: 'Active' | 'Inactive';
}

/** Ids count up from 1 and never come back, as money entries and cheques do. */
export function nextVendorId(vendors: readonly Vendor[]): string {
  let max = 0;
  for (const v of vendors) {
    const parsed = /^v-(\d+)$/.exec(v.id);
    if (parsed && Number(parsed[1]) > max) max = Number(parsed[1]);
  }
  return `v-${max + 1}`;
}

/**
 * The §25 checks for one vendor: a name that no other vendor already holds,
 * and a whole number of payment-terms days. `hasBills` is passed by the caller
 * so deactivation stays allowed while deletion is refused elsewhere.
 */
export function vendorProblems(vendor: Vendor, existing: readonly Vendor[]): string[] {
  const problems: string[] = [];
  if (!vendor.name.trim()) problems.push('A vendor needs a name (§25).');
  if (existing.some((v) => v !== vendor && v.name.trim().toLowerCase() === vendor.name.trim().toLowerCase())) {
    problems.push(`A vendor called "${vendor.name.trim()}" already exists — names are unique (§25).`);
  }
  if (!Number.isInteger(vendor.termsDays) || vendor.termsDays < 0) {
    problems.push('Payment terms are a whole number of days, default 30 (§25).');
  }
  if (vendor.openingPayable !== undefined && (!Number.isInteger(vendor.openingPayable) || vendor.openingPayable < 0)) {
    problems.push('An opening payable is in whole rupees, never negative (§25).');
  }
  return problems;
}
