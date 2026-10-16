// ============================================
// MediCMS Desktop — Bills Store
//
// The three persisted lists Feature 3 keeps beside the money books: cost
// categories (§24), vendors (§25) and bills (§26). Like the money store this
// does no arithmetic — unpaid, payable, ageing and allocation all live in
// `src/lib/finance/bills.ts`, so no screen can disagree with the books. A bill
// is corrected by reversal, never edited into a new figure (§34); `replaceBill`
// only swaps a bill the pure helpers already produced.
//
// `payments` are the voucher allocations the Pay out screen appends (§29); the
// derived unpaid/payable figures read them, so a bill's status is always
// calculated, never stored (§27).
//
// §78.1: like the money store this seeds the October sample from §13 on a first
// run, so the screens open on figures a reader can check rather than on empty
// tables. A machine that already holds records keeps them — the v2 migration
// only fills lists that are still empty, and never adds anything twice.
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Bill, BillPayment, CostCategory, PaymentVoucher, Vendor } from '@/lib/finance';
import {
  DEFAULT_COST_CATEGORIES,
  DEMO_BILLS,
  DEMO_PAYMENTS,
  DEMO_VENDORS,
  DEMO_VOUCHERS,
  categoryProblems,
  vendorProblems,
} from '@/lib/finance';

interface BillsState {
  /** §24: the two-level list, seeded with the default groups and categories. */
  categories: CostCategory[];
  /** §25: vendors a cost or payment can name. */
  vendors: Vendor[];
  /** §26: every recorded cost. */
  bills: Bill[];
  /** §27: the per-bill amounts the payment vouchers allocated. */
  payments: BillPayment[];
  /** §29: every payment voucher, voids kept and struck through, numbers never reused. */
  vouchers: PaymentVoucher[];

  // Categories (§24 — an Admin edits the list).
  addCategory: (category: CostCategory) => string[];
  renameCategory: (id: string, name: string) => void;
  /** §24: disabled leaves the entry forms but stays in reports. */
  setCategoryDisabled: (id: string, disabled: boolean) => void;

  // Vendors (§25).
  addVendor: (vendor: Vendor) => string[];
  updateVendor: (id: string, patch: Partial<Omit<Vendor, 'id'>>) => string[];
  /** §25: a vendor with bills is never deleted — it is made Inactive. */
  setVendorStatus: (id: string, status: Vendor['status']) => void;

  // Bills (§26, §27, §34).
  /** Append a bill the `recordCost` helper produced. Ids and numbers are never reused. */
  addBill: (bill: Bill) => string[];
  /** Swap a bill the pure cancel/adjust helpers returned; matches by id. */
  replaceBill: (bill: Bill) => void;
  /** §29: record the split a payment voucher applied across bills. */
  addPayments: (payments: readonly BillPayment[]) => void;

  // Payment vouchers (§29, §34).
  /** Append a voucher the `createPaymentVoucher` helper produced. Numbers are never reused. */
  addVoucher: (voucher: PaymentVoucher) => string[];
  /**
   * §34: void a voucher — mark it struck through and withdraw its allocations,
   * so the bills it paid return to unpaid. The money entry (or cheque) reversal
   * is the screen's, posted through the money store in the same action.
   */
  voidVoucher: (no: string, reason: string) => boolean;
}

/** What this store actually keeps — the actions are rebuilt, not restored (§78). */
type PersistedBills = Pick<BillsState, 'categories' | 'vendors' | 'bills' | 'payments' | 'vouchers'>;

export const useBillsStore = create<BillsState>()(
  persist(
    (set, get) => ({
      categories: DEFAULT_COST_CATEGORIES,
      vendors: DEMO_VENDORS,
      bills: DEMO_BILLS,
      payments: DEMO_PAYMENTS,
      vouchers: DEMO_VOUCHERS,

      addCategory: (category) => {
        const problems = categoryProblems(category, get().categories);
        if (problems.length) return problems;
        set((s) => ({ categories: [...s.categories, category] }));
        return [];
      },

      renameCategory: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, name: trimmed } : c)) }));
      },

      setCategoryDisabled: (id, disabled) => {
        set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, disabled } : c)) }));
      },

      addVendor: (vendor) => {
        const state = get();
        const problems: string[] = [];
        if (state.vendors.some((v) => v.id === vendor.id)) {
          problems.push(`Vendor ${vendor.id} already exists — ids are never reused.`);
        }
        problems.push(...vendorProblems(vendor, state.vendors));
        if (problems.length) return problems;
        set((s) => ({ vendors: [...s.vendors, vendor] }));
        return [];
      },

      updateVendor: (id, patch) => {
        const state = get();
        const current = state.vendors.find((v) => v.id === id);
        if (!current) return [`Vendor ${id} does not exist (§25).`];
        const next: Vendor = { ...current, ...patch, id };
        const problems = vendorProblems(next, state.vendors);
        if (problems.length) return problems;
        set((s) => ({ vendors: s.vendors.map((v) => (v.id === id ? next : v)) }));
        return [];
      },

      setVendorStatus: (id, status) => {
        set((s) => ({ vendors: s.vendors.map((v) => (v.id === id ? { ...v, status } : v)) }));
      },

      addBill: (bill) => {
        const state = get();
        const problems: string[] = [];
        if (state.bills.some((b) => b.id === bill.id)) {
          problems.push(`Bill ${bill.id} already exists — ids are never reused.`);
        }
        if (state.bills.some((b) => b.no === bill.no)) {
          problems.push(`Bill ${bill.no} is already issued — numbers are never reused (§26).`);
        }
        if (problems.length) return problems;
        set((s) => ({ bills: [...s.bills, bill] }));
        return [];
      },

      replaceBill: (bill) => {
        set((s) => ({ bills: s.bills.map((b) => (b.id === bill.id ? bill : b)) }));
      },

      addPayments: (payments) => {
        if (!payments.length) return;
        set((s) => ({ payments: [...s.payments, ...payments] }));
      },

      addVoucher: (voucher) => {
        const state = get();
        const problems: string[] = [];
        if (state.vouchers.some((v) => v.id === voucher.id)) {
          problems.push(`Voucher ${voucher.id} already exists — ids are never reused.`);
        }
        if (state.vouchers.some((v) => v.no === voucher.no)) {
          problems.push(`Voucher ${voucher.no} is already issued — numbers are never reused (§29).`);
        }
        if (problems.length) return problems;
        set((s) => ({ vouchers: [...s.vouchers, voucher] }));
        return [];
      },

      voidVoucher: (no, reason) => {
        const state = get();
        const voucher = state.vouchers.find((v) => v.no === no);
        if (!voucher || voucher.voided) return false;
        set((s) => ({
          vouchers: s.vouchers.map((v) => (v.no === no ? { ...v, voided: true, voidReason: reason } : v)),
          // Withdraw exactly the split this voucher applied; the bills return to unpaid (§34).
          payments: s.payments.filter((p) => p.voucherNo !== no),
        }));
        return true;
      },
    }),
    {
      name: 'medicms-bills',
      version: 2,
      partialize: (state) => ({
        categories: state.categories,
        vendors: state.vendors,
        bills: state.bills,
        payments: state.payments,
        vouchers: state.vouchers,
      }),
      // v1 stored the lists empty (§78). Fill back only what is still empty, so
      // a machine with real vendors, bills or vouchers is left alone.
      migrate: (persisted) => {
        const stored = (persisted ?? {}) as Partial<PersistedBills>;
        const keep = <T>(saved: T[] | undefined, demo: T[]): T[] => (saved && saved.length ? saved : demo);
        return {
          categories: keep(stored.categories, DEFAULT_COST_CATEGORIES),
          vendors: keep(stored.vendors, DEMO_VENDORS),
          bills: keep(stored.bills, DEMO_BILLS),
          payments: keep(stored.payments, DEMO_PAYMENTS),
          vouchers: keep(stored.vouchers, DEMO_VOUCHERS),
        };
      },
    },
  ),
);
