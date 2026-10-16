// ============================================
// MediCMS Desktop v4.0 - Stores Index
// ============================================

export { useAuthStore } from './authStore';
export { useUserStore } from './userStore';
export { can, canWrite, ROLE_PERMISSIONS } from '@/lib/permissions';
export { useSyncStore, getSyncIndicator } from './syncStore';
export { useUIStore } from './uiStore';
export { useStudentStore, getNextSno } from './studentStore';
export { useLedgerStore } from './ledgerStore';
export type { PostOutcome } from './ledgerStore';
export { useMoneyStore } from './moneyStore';
export type { MoneyPostOutcome } from './moneyStore';
export { useBillsStore } from './billsStore';
export { useAuditStore } from './auditStore';
export { useSettingsStore } from './settingsStore';
export { useReceiptBookStore } from './receiptBookStore';
export { useBankStore, getNextBankSno } from './bankStore';
export { useExpenseStore } from './expenseStore';
export { useBudgetStore } from './budgetStore';
export { useBatchStore } from './batchStore';
export { useAcademicStore } from './academicStore';
export type { ProgramFilter, BatchFilter } from './academicStore';
export { useFeeTemplateStore } from './feeTemplateStore';
export type { TemplateSaveResult } from './feeTemplateStore';
export { useDirectoryStore } from './directoryStore';
export type { SavedView } from './directoryStore';
