// ============================================
// MediCMS Desktop v4.0 - Stores Index
// ============================================

export { useAuthStore, hasPermission, canWrite } from './authStore';
export { useSyncStore, getSyncIndicator } from './syncStore';
export { useUIStore } from './uiStore';
export { useStudentStore, getNextSno } from './studentStore';
export { useLedgerStore, getNextTxnNo } from './ledgerStore';
export { useAuditStore } from './auditStore';
export { useSettingsStore } from './settingsStore';
export { useReceiptBookStore } from './receiptBookStore';
export { useBankStore, getNextBankSno } from './bankStore';
export { useExpenseStore } from './expenseStore';
export { useBudgetStore } from './budgetStore';
export { useBatchStore } from './batchStore';
