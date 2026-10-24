// ============================================
// MediCMS Desktop v4.0 - App Router
// ============================================

import { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import StudentList from '@/pages/students/StudentList';
import StudentProfile from '@/pages/students/StudentProfile';
import NewAdmission from '@/pages/students/NewAdmission';
import RecordPayment from '@/pages/payments/RecordPayment';
import Receipts from '@/pages/receipts/Receipts';
import ReceiptRegister from '@/pages/receipts/ReceiptRegister';
import ReceiptBooks from '@/pages/settings/ReceiptBooks';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import Users from '@/pages/settings/Users';
import EditStudent from '@/pages/students/EditStudent';
import StudentLedger from '@/pages/ledger/StudentLedger';
import LedgerHub from '@/pages/ledger/LedgerHub';
import LedgerCheck from '@/pages/ledger/LedgerCheck';
import DayBook from '@/pages/ledger/DayBook';
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
import Overview from '@/pages/finance/Overview';
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
import StatementImport from '@/pages/finance/StatementImport';
import Reconcile from '@/pages/finance/Reconcile';
import Budgets from '@/pages/finance/Budgets';
import MonthClose from '@/pages/finance/MonthClose';
import FinanceReports from '@/pages/finance/Reports';
import FinanceReportPage from '@/pages/finance/ReportPage';
import StaffDirectory from '@/pages/staff/StaffDirectory';
import StaffProfile from '@/pages/staff/StaffProfile';
import WorkInputs from '@/pages/staff/WorkInputs';
import Advances from '@/pages/staff/Advances';
import PayRuns from '@/pages/staff/PayRuns';
import RunDetail from '@/pages/staff/RunDetail';
import PayoutPlanner from '@/pages/staff/PayoutPlanner';
import Payouts from '@/pages/staff/Payouts';
import PayoutBatchPage from '@/pages/staff/PayoutBatchPage';
import StaffOverview from '@/pages/staff/StaffOverview';
import StaffReports from '@/pages/staff/StaffReports';
import StaffReportDetail from '@/pages/staff/StaffReportDetail';
import Payslip from '@/pages/staff/Payslip';
import StaffPayrollSettings from '@/pages/staff/StaffPayrollSettings';
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

/** §16: the dashboard's "Expenses this month" tile carries ?month=this — keep it. */
function ExpensesRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: '/finance/bills', search: location.search }} replace />;
}

/**
 * PAYMENTS_RECEIPTS_LEDGER_DESIGN §50/§63: reprinting a receipt is a row action on
 * the receipts list, not a screen of its own. The old address keeps working and
 * keeps its `?sno=` so a link from a student profile still lands on that student.
 */
function ReceiptsRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: '/receipts', search: location.search }} replace />;
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
          {/* §63: the ledger check is Admin-only and sits before :sno or it would be
              read as a student number (§7.3). */}
          <Route path="ledger/check" element={<RequirePermission perm="ledger.check"><LedgerCheck /></RequirePermission>} />
          <Route path="ledger/bulk-demand" element={<RequirePermission perm="ledger.adjust"><BulkFeeDemand /></RequirePermission>} />
          <Route path="ledger/:sno" element={<StudentLedger />} />
          <Route path="admissions/new" element={<RequirePermission perm="student.admit"><NewAdmission /></RequirePermission>} />
          <Route path="payments/record" element={<RequirePermission perm="payment.record"><RecordPayment /></RequirePermission>} />
          {/* §50/§63: the receipts list and one book's register. Every role reads
              them; a counter's rows are scoped to its own book inside the screen. */}
          <Route path="payments/reprint" element={<RequirePermission perm="payment.reprint"><ReceiptsRedirect /></RequirePermission>} />
          <Route path="receipts" element={<RequirePermission perm="receipts.view"><Receipts /></RequirePermission>} />
          <Route path="receipts/books/:id" element={<RequirePermission perm="receipts.view"><ReceiptRegister /></RequirePermission>} />
          {/* §58/§63: the cheque register — the same screen the money area reaches,
              addressed by the payments doc's own route. */}
          <Route path="cheques" element={<RequirePermission perm="cheques.view"><ChequesInHand /></RequirePermission>} />
          <Route path="day-book" element={<RequirePermission perm="daybook.view"><DayBook /></RequirePermission>} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<RequirePermission perm="settings.manage"><Settings /></RequirePermission>} />
          <Route path="settings/users" element={<RequirePermission perm="user.manage"><Users /></RequirePermission>} />
          {/* §57: receipt books are Admin-only — a typed URL from another role fails
              exactly like the hidden link would (§3). */}
          <Route path="settings/receipt-books" element={<RequirePermission perm="receipts.manage"><ReceiptBooks /></RequirePermission>} />
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
              on Accounts; its screens stay reachable below until F3 replaces them.
              The overview is /finance's own index (§59) and the reports hub is
              §70.1 — both read the same derived figures as the screens (§56). */}
          <Route path="finance" element={<RequirePermission perm="finance.view"><Overview /></RequirePermission>} />
          <Route path="finance/accounts" element={<RequirePermission perm="finance.view"><Accounts /></RequirePermission>} />
          <Route path="finance/accounts/:id" element={<RequirePermission perm="finance.view"><AccountPage /></RequirePermission>} />
          {/* §40/§42: a statement is imported for one account and matched a
              month at a time; the bare /finance/reconcile picks an account. */}
          <Route path="finance/bank/:accountId/import" element={<RequirePermission perm="finance.reconcile"><StatementImport /></RequirePermission>} />
          <Route path="finance/reconcile" element={<RequirePermission perm="finance.reconcile"><Reconcile /></RequirePermission>} />
          <Route path="finance/reconcile/:accountId/:month" element={<RequirePermission perm="finance.reconcile"><Reconcile /></RequirePermission>} />
          <Route path="finance/budgets" element={<RequirePermission perm="finance.view"><Budgets /></RequirePermission>} />
          <Route path="finance/month-close" element={<RequirePermission perm="finance.view"><MonthClose /></RequirePermission>} />
          <Route path="finance/reports" element={<RequirePermission perm="finance.view"><FinanceReports /></RequirePermission>} />
          <Route path="finance/reports/:name" element={<RequirePermission perm="finance.view"><FinanceReportPage /></RequirePermission>} />
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
          {/* Staff & Payroll §47: the register. The directory and each profile read
              staff.directory.view; the Add/Edit drawer inside them is gated further on
              staff.manage, so a non-Admin views but cannot change (§43, §48). */}
          <Route path="staff/directory" element={<RequirePermission perm="staff.directory.view"><StaffDirectory /></RequirePermission>} />
          {/* Staff & Payroll §50/§43: monthly work inputs are Admin-only — a direct URL
              from another role fails exactly like the hidden nav item would. Placed
              before staff/:id so the static segment is not swallowed by the id route. */}
          <Route path="staff/work-inputs" element={<RequirePermission perm="payroll.inputs.manage"><WorkInputs /></RequirePermission>} />
          {/* Staff & Payroll §51/§43: salary advances are Admin-only and are never
              exposed through Finance Core aggregate permissions. */}
          <Route path="staff/advances" element={<RequirePermission perm="payroll.advances.view"><Advances /></RequirePermission>} />
          {/* Staff & Payroll §52/§54: the pay-run register and review. The list and detail
              read payroll.summary.view (an Accountant sees aggregates only — the projection
              drops named lines); generation and the lifecycle actions gate further on
              payroll.run.manage inside the pages. Static segments sit before staff/:id. */}
          <Route path="staff/payroll" element={<RequirePermission perm="payroll.summary.view"><PayRuns /></RequirePermission>} />
          <Route path="staff/payroll/:id" element={<RequirePermission perm="payroll.summary.view"><RunDetail /></RequirePermission>} />
          {/* Staff & Payroll §55/§56: the payout planner is Admin-only (payroll.payout.manage)
              and sits before staff/:id; the register and batch page read payroll.payout.summary
              (the Accountant gets aggregates — the projection drops named recipients). Money
              is only moved at execution, which Finance Core posts in P14. */}
          <Route path="staff/payroll/:id/payouts" element={<RequirePermission perm="payroll.payout.manage"><PayoutPlanner /></RequirePermission>} />
          <Route path="staff/payouts" element={<RequirePermission perm="payroll.payout.summary"><Payouts /></RequirePermission>} />
          <Route path="staff/payouts/:id" element={<RequirePermission perm="payroll.payout.summary"><PayoutBatchPage /></RequirePermission>} />
          {/* Staff & Payroll §45–§46: the module landing page — a getting-started checklist
              or the derived status/payment position, all read through the report core. */}
          <Route path="staff" element={<RequirePermission perm="staff.view"><StaffOverview /></RequirePermission>} />
          {/* Staff & Payroll §58: payroll reports. Aggregates read payroll.reports.view; a
              named-compensation report is masked again inside the core for a non-Admin (§43). */}
          <Route path="staff/reports" element={<RequirePermission perm="payroll.reports.view"><StaffReports /></RequirePermission>} />
          <Route path="staff/reports/:name" element={<RequirePermission perm="payroll.reports.view"><StaffReportDetail /></RequirePermission>} />
          {/* Staff & Payroll §59.1: a payslip is Admin-only (payroll.compensation.view) — a
              typed URL from another role fails exactly like the hidden link would (§43). */}
          <Route path="staff/payslip/:lineId" element={<RequirePermission perm="payroll.compensation.view"><Payslip /></RequirePermission>} />
          {/* Staff & Payroll §60: payroll-owned Settings — number prefixes and
              screen defaults; Admin only, and changes never touch approved runs. */}
          <Route path="staff/settings" element={<RequirePermission perm="payroll.settings.manage"><StaffPayrollSettings /></RequirePermission>} />
          <Route path="staff/:id" element={<RequirePermission perm="staff.directory.view"><StaffProfile /></RequirePermission>} />
          {/* Finance §58: the legacy expenses list is gone — the bill register
              answers the same need. The bank-withdrawal tagger stays until
              reconciliation replaces it (F6). */}
          <Route path="expenses" element={<ExpensesRedirect />} />
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
