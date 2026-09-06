// ============================================
// MediCMS Desktop v4.0 - Settings Store
// Persisted UI preferences (e.g. show test records)
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  setInstitute: (name: string, address: string, phone: string) => void;
  setBank: (name: string, accountNo: string) => void;
  setPaperSize: (v: '80mm' | 'A4') => void;
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
      setInstitute: (instituteName, instituteAddress, institutePhone) =>
        set({ instituteName, instituteAddress, institutePhone }),
      setBank: (bankName, accountNo) => set({ bankName, accountNo }),
      setPaperSize: (paperSize) => set({ paperSize }),
    }),
    { name: 'medicms-settings' }
  )
);
