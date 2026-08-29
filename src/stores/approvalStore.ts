// ============================================
// MediCMS Desktop v4.0 - Approval Store
// Pending discount / adjustment approvals (Principal)
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ApprovalType = 'Discount' | 'Adjustment' | 'OverPayment';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRequest {
  id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  studentSno: number;
  studentName: string;
  amount: number;
  discountAmount?: number;
  receiptNo?: string | null;
  reason: string;
  details: string;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  payload?: any; // ledger payload to create on approval
}

interface ApprovalState {
  requests: ApprovalRequest[];
  addRequest: (req: Omit<ApprovalRequest, 'id' | 'requestedAt' | 'status'>) => string;
  decide: (id: string, status: ApprovalStatus, decidedBy: string) => ApprovalRequest | undefined;
}

export const useApprovalStore = create<ApprovalState>()(
  persist(
    (set, get) => ({
      requests: [],
      addRequest: (req) => {
        const id = `appr-${Date.now()}-${Math.random().toString(36).slice(2,4)}`;
        const entry: ApprovalRequest = { ...req, id, requestedAt: new Date().toISOString(), status: 'pending' };
        set({ requests: [entry, ...get().requests] });
        return id;
      },
      decide: (id, status, decidedBy) => {
        let found: ApprovalRequest | undefined;
        set({
          requests: get().requests.map(r => {
            if (r.id === id) {
              found = { ...r, status, decidedBy, decidedAt: new Date().toISOString() };
              return found;
            }
            return r;
          }),
        });
        return found;
      },
    }),
    { name: 'medicms-approvals' }
  )
);

export const DISCOUNT_APPROVAL_THRESHOLD = 5000;
export const ADJUSTMENT_APPROVAL_THRESHOLD = 5000;
