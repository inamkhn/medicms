// ============================================
// MediCMS Desktop v4.0 - Settings Store
// Persisted UI preferences (e.g. show test records)
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProgramCode } from '@/types';
import { DEFAULT_FINANCE_LIMITS, type FinanceLimits } from '@/lib/finance';
import { DEFAULT_PAYROLL_SETTINGS, type PayrollSettings } from '@/lib/payroll';

interface SettingsState {
  showTestRecords: boolean;
  setShowTestRecords: (v: boolean) => void;
  toggleShowTestRecords: () => void;
  instituteName: string;
  instituteAddress: string;
  institutePhone: string;
  bankName: string;
  accountNo: string;
  paperSize: '80mm' | 'A4';
  /**
   * §5.4 - how many terms make one academic year, per program. Absent means "use the
   * value derived from the course system", so this only stores what the institute set.
   */
  termsPerYearByProgram: Partial<Record<ProgramCode, number>>;
  /**
   * §77: the entry limits, from their defaults. Each screen that owns one
   * (pay out, petty vouchers, bill images, cash warnings) checks this value —
   * the Settings page is the only place that changes it.
   */
  financeLimits: FinanceLimits;
  /**
   * §60: the payroll prefixes and screen defaults. Each mint or form that owns
   * one reads it at create time — nothing stored rewrites an approved record.
   */
  payrollSettings: PayrollSettings;
  setInstitute: (name: string, address: string, phone: string) => void;
  setBank: (name: string, accountNo: string) => void;
  setPaperSize: (v: '80mm' | 'A4') => void;
  setFinanceLimits: (patch: Partial<FinanceLimits>) => void;
  setPayrollSettings: (patch: Partial<PayrollSettings>) => void;
  /** null or 0 clears the override and falls back to the derived value. */
  setTermsPerYear: (program: ProgramCode, termsPerYear: number | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      showTestRecords: false,
      setShowTestRecords: (v) => set({ showTestRecords: v }),
      toggleShowTestRecords: () => set((s) => ({ showTestRecords: !s.showTestRecords })),
      instituteName: 'Paramedical Institute',
      instituteAddress: 'Saidu Sharif, Swat',
      institutePhone: '0946-XXXXXXX',
      bankName: 'Bank Al Habib Limited Islamic',
      accountNo: '5533-0081-000190-01-1',
      paperSize: '80mm',
      termsPerYearByProgram: {},
      financeLimits: DEFAULT_FINANCE_LIMITS,
      payrollSettings: DEFAULT_PAYROLL_SETTINGS,
      setInstitute: (instituteName, instituteAddress, institutePhone) =>
        set({ instituteName, instituteAddress, institutePhone }),
      setBank: (bankName, accountNo) => set({ bankName, accountNo }),
      setPaperSize: (paperSize) => set({ paperSize }),
      setFinanceLimits: (patch) => set((s) => ({
        financeLimits: {
          ...s.financeLimits,
          ...Object.fromEntries(
            Object.entries(patch).filter(([, v]) => Number.isInteger(v) && (v as number) >= 0),
          ),
        },
      })),
      // §60 a prefix keeps letters/digits/one trailing dash; a rejected or blank
      // input leaves the previous value in place rather than minting odd numbers.
      setPayrollSettings: (patch) => set((s) => {
        const withDash = (v: string, fallback: string) => {
          const cleaned = v.trim().replace(/[^A-Za-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-/, '');
          if (!cleaned) return fallback;
          return cleaned.endsWith('-') ? cleaned : `${cleaned}-`;
        };
        const p = s.payrollSettings;
        return {
          payrollSettings: {
            ...p,
            ...(patch.staffPrefix !== undefined ? { staffPrefix: withDash(patch.staffPrefix, p.staffPrefix) } : {}),
            ...(patch.runPrefix !== undefined ? { runPrefix: withDash(patch.runPrefix, p.runPrefix) } : {}),
            ...(patch.batchPrefix !== undefined ? { batchPrefix: withDash(patch.batchPrefix, p.batchPrefix) } : {}),
            ...(patch.advancePrefix !== undefined ? { advancePrefix: withDash(patch.advancePrefix, p.advancePrefix) } : {}),
            ...(patch.generationDefaultMonth !== undefined ? { generationDefaultMonth: patch.generationDefaultMonth } : {}),
            ...(patch.startingRecoveryMonth !== undefined ? { startingRecoveryMonth: patch.startingRecoveryMonth } : {}),
            ...(patch.recoveryPolicy !== undefined ? { recoveryPolicy: patch.recoveryPolicy } : {}),
          },
        };
      }),
      setTermsPerYear: (program, termsPerYear) => set((s) => {
        const next = { ...s.termsPerYearByProgram };
        if (!termsPerYear || termsPerYear < 1) delete next[program];
        else next[program] = Math.trunc(termsPerYear);
        return { termsPerYearByProgram: next };
      }),
    }),
    {
      name: 'medicms-settings',
      // A copy saved before a new §77 limit existed carries only the keys known
      // then; rehydrating it must not leave the newer limits undefined, so the
      // finance limits are merged over their defaults while every other
      // preference keeps the shallow replace-on-key behaviour. The §60 payroll
      // settings get the same re-basing for the same reason.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...saved,
          financeLimits: { ...DEFAULT_FINANCE_LIMITS, ...(saved.financeLimits ?? {}) },
          payrollSettings: { ...DEFAULT_PAYROLL_SETTINGS, ...(saved.payrollSettings ?? {}) },
        };
      },
    }
  )
);
