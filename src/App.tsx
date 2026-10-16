// ============================================
// MediCMS Desktop v4.0 - App Router
// ============================================

import { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import StudentList from '@/pages/students/StudentList';
import StudentProfile from '@/pages/students/StudentProfile';
import NewAdmission from '@/pages/students/NewAdmission';
import RecordPayment from '@/pages/payments/RecordPayment';
import ReprintReceipt from '@/pages/payments/ReprintReceipt';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import Users from '@/pages/settings/Users';
import EditStudent from '@/pages/students/EditStudent';
import StudentLedger from '@/pages/ledger/StudentLedger';
import LedgerHub from '@/pages/ledger/LedgerHub';
import AddFeeDemand from '@/pages/ledger/AddFeeDemand';
import BulkFeeDemand from '@/pages/ledger/BulkFeeDemand';
import AddCharge from '@/pages/ledger/AddCharge';
import LedgerAdjustment from '@/pages/ledger/LedgerAdjustment';
import FeeTemplates from '@/pages/fee-templates/FeeTemplates';
import TagBankWithdrawals from '@/pages/expenses/TagBankWithdrawals';
import AddBankTransaction from '@/pages/bank/AddBankTransaction';
import AuditTrail from '@/pages/audit/AuditTrail';
import DataImport from '@/pages/import/DataImport';
import BatchesTab from '@/pages/academic/BatchesTab';
import BatchPage from '@/pages/academic/BatchPage';
import AcademicSetup from '@/pages/academic/AcademicSetup';
import ProgramsTab from '@/pages/academic/ProgramsTab';
import SessionsTab from '@/pages/academic/SessionsTab';
import PromoteStudent from '@/pages/ledger/PromoteStudent';
import Accounts from '@/pages/finance/Accounts';
import AccountPage from '@/pages/finance/AccountPage';
import MoneyTransfer from '@/pages/finance/MoneyTransfer';
import PettyCash from '@/pages/finance/PettyCash';
import CashDeposit from '@/pages/finance/CashDeposit';
import DayClose from '@/pages/finance/DayClose';
import IssuedCheques from '@/pages/finance/IssuedCheques';
import ChequesInHand from '@/pages/finance/ChequesInHand';
import Refunds from '@/pages/finance/Refunds';
import Bills from '@/pages/finance/Bills';
import RecordCost from '@/pages/finance/RecordCost';
import BillPage from '@/pages/finance/BillPage';
import Vendors from '@/pages/finance/Vendors';
import VendorPage from '@/pages/finance/VendorPage';
import PayOut from '@/pages/finance/PayOut';
import Vouchers from '@/pages/finance/Vouchers';
import VoucherPage from '@/pages/finance/VoucherPage';
import { Toaster } from '@/components/ui/toast';
import { ConfirmDialogHost } from '@/components/ui/confirm-dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { useAuthStore } from '@/stores/authStore';

// Dev-only instrument (docs/DESIGN_SYSTEM.md §13). Tree-shaken out of production
// builds by the DEV guard below together with the import above.
const StyleGuide = lazy(() => import('@/pages/StyleGuide'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  return isLoggedIn ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';
  const Router = isFileProtocol ? HashRouter : BrowserRouter;
  return (
    <Router>
      {/* Mounted above the routes rather than inside AppShell: /login and the dev-only
          /style-guide are siblings of the shell, and a save failure on the login screen
          still needs somewhere to be announced. */}
      <TooltipProvider>
        <Routes>
        <Route path="/login" element={<Login />} />
        {import.meta.env.DEV && (
          <Route
            path="/style-guide"
            element={
              <Suspense fallback={<div className="p-8 text-ink-muted">Loading design system…</div>}>
                <StyleGuide />
              </Suspense>
            }
          />
        )}
        <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="students" element={<StudentList />} />
          <Route path="ledger" element={<LedgerHub />} />
          <Route path="ledger/bulk-demand" element={<RequirePermission perm="ledger.adjust"><BulkFeeDemand /></RequirePermission>} />
          <Route path="ledger/:sno" element={<StudentLedger />} />
          <Route path="admissions/new" element={<RequirePermission perm="student.admit"><NewAdmission /></RequirePermission>} />
          <Route path="payments/record" element={<RequirePermission perm="payment.record"><RecordPayment /></RequirePermission>} />
          <Route path="payments/reprint" element={<RequirePermission perm="payment.reprint"><ReprintReceipt /></RequirePermission>} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<RequirePermission perm="settings.manage"><Settings /></RequirePermission>} />
          <Route path="settings/users" element={<RequirePermission perm="user.manage"><Users /></RequirePermission>} />
          <Route path="students/:sno" element={<StudentProfile />} />
          <Route path="students/:sno/edit" element={<RequirePermission perm="student.edit"><EditStudent /></RequirePermission>} />
          <Route path="ledger/:sno/add-demand" element={<RequirePermission perm="ledger.adjust"><AddFeeDemand /></RequirePermission>} />
          <Route path="ledger/:sno/add-charge" element={<RequirePermission perm="ledger.adjust"><AddCharge /></RequirePermission>} />
          <Route path="ledger/:sno/adjust" element={<RequirePermission perm="ledger.adjust"><LedgerAdjustment /></RequirePermission>} />
          <Route path="ledger/:sno/promote" element={<RequirePermission perm="ledger.adjust"><PromoteStudent /></RequirePermission>} />
          <Route path="batches" element={<Navigate to="/academic/batches" replace />} />
          <Route path="academic" element={<RequirePermission perm="academic.view"><AcademicSetup /></RequirePermission>}>
            <Route index element={<Navigate to="/academic/batches" replace />} />
            <Route path="batches" element={<BatchesTab />} />
            <Route path="batches/:id" element={<BatchPage />} />
            <Route path="programs" element={<ProgramsTab />} />
            <Route path="sessions" element={<SessionsTab />} />
          </Route>
          <Route path="fee-templates" element={<RequirePermission perm="feeTemplate.manage"><FeeTemplates /></RequirePermission>} />
          {/* Finance core §58: the money screens. /bank's old address now lands
              on Accounts; its screens stay reachable below until F3 replaces them. */}
          <Route path="finance/accounts" element={<RequirePermission perm="finance.view"><Accounts /></RequirePermission>} />
          <Route path="finance/accounts/:id" element={<RequirePermission perm="finance.view"><AccountPage /></RequirePermission>} />
          <Route path="finance/transfer" element={<RequirePermission perm="finance.transfer"><MoneyTransfer /></RequirePermission>} />
          {/* Finance §10/§58/§66: the petty float — its voucher, top-up and count. */}
          <Route path="finance/petty-cash" element={<RequirePermission perm="finance.petty"><PettyCash /></RequirePermission>} />
          <Route path="finance/deposit" element={<RequirePermission perm="finance.transfer"><CashDeposit /></RequirePermission>} />
          <Route path="finance/cheques" element={<RequirePermission perm="finance.view"><IssuedCheques /></RequirePermission>} />
          {/* Finance §8/§17/§18: incoming cheques are held until they clear; §33
              refunds are money out under "Student refunds". Both flows now have a
              reachable screen, so the automatic entries have somewhere to come from. */}
          <Route path="finance/cheques-incoming" element={<RequirePermission perm="finance.view"><ChequesInHand /></RequirePermission>} />
          <Route path="finance/refunds" element={<RequirePermission perm="finance.view"><Refunds /></RequirePermission>} />
          {/* Finance §58 bills: Record a cost sits before :id so the path is not
              swallowed by the id route. Its write gate is finance.bills. */}
          <Route path="finance/bills" element={<RequirePermission perm="finance.view"><Bills /></RequirePermission>} />
          <Route path="finance/bills/new" element={<RequirePermission perm="finance.bills"><RecordCost /></RequirePermission>} />
          <Route path="finance/bills/:id" element={<RequirePermission perm="finance.view"><BillPage /></RequirePermission>} />
          <Route path="finance/vendors" element={<RequirePermission perm="finance.view"><Vendors /></RequirePermission>} />
          <Route path="finance/vendors/:id" element={<RequirePermission perm="finance.view"><VendorPage /></RequirePermission>} />
          {/* Finance §58 pay out: a PV covers bills and moves the money in one
              all-or-nothing action (§29). The register reads every voucher. */}
          <Route path="finance/pay" element={<RequirePermission perm="finance.pay"><PayOut /></RequirePermission>} />
          <Route path="finance/vouchers" element={<RequirePermission perm="finance.view"><Vouchers /></RequirePermission>} />
          <Route path="finance/vouchers/:id" element={<RequirePermission perm="finance.view"><VoucherPage /></RequirePermission>} />
          <Route path="finance/day-close" element={<RequirePermission perm="payment.record"><DayClose /></RequirePermission>} />
          {/* Finance §58: the legacy expenses list is gone — the bill register
              answers the same need. The bank-withdrawal tagger stays until
              reconciliation replaces it (F6). */}
          <Route path="expenses" element={<Navigate to="/finance/bills" replace />} />
          <Route path="expenses/add" element={<Navigate to="/finance/bills/new" replace />} />
          <Route path="expenses/tag-from-bank" element={<RequirePermission perm="expense.add"><TagBankWithdrawals /></RequirePermission>} />
          <Route path="bank" element={<Navigate to="/finance/accounts" replace />} />
          <Route path="bank/add" element={<RequirePermission perm="ledger.adjust"><AddBankTransaction /></RequirePermission>} />
          <Route path="audit" element={<RequirePermission perm="audit.view"><AuditTrail /></RequirePermission>} />
          <Route path="import" element={<RequirePermission perm="data.import"><DataImport /></RequirePermission>} />
        </Route>
        </Routes>
        <Toaster />
        <ConfirmDialogHost />
      </TooltipProvider>
    </Router>
  );
}
