// ============================================
// MediCMS Desktop v4.0 - App Router
// ============================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import EditStudent from '@/pages/students/EditStudent';
import StudentLedger from '@/pages/ledger/StudentLedger';
import AddFeeDemand from '@/pages/ledger/AddFeeDemand';
import BulkFeeDemand from '@/pages/ledger/BulkFeeDemand';
import AddCharge from '@/pages/ledger/AddCharge';
import LedgerAdjustment from '@/pages/ledger/LedgerAdjustment';
import FeeTemplates from '@/pages/fee-templates/FeeTemplates';
import ExpensesList from '@/pages/expenses/ExpensesList';
import AddExpense from '@/pages/expenses/AddExpense';
import TagBankWithdrawals from '@/pages/expenses/TagBankWithdrawals';
import BankAccount from '@/pages/bank/BankAccount';
import AddBankTransaction from '@/pages/bank/AddBankTransaction';
import AuditTrail from '@/pages/audit/AuditTrail';
import Approvals from '@/pages/Approvals';
import DataImport from '@/pages/import/DataImport';
import { useAuthStore, canWrite } from '@/stores/authStore';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  return isLoggedIn ? <>{children}</> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const user = useAuthStore((s) => s.user);
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (!canWrite(user?.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="students" element={<StudentList />} />
          <Route path="ledger" element={<Navigate to="/students" replace />} />
          <Route path="admissions/new" element={<AdminRoute><NewAdmission /></AdminRoute>} />
          <Route path="payments/record" element={<AdminRoute><RecordPayment /></AdminRoute>} />
          <Route path="payments/reprint" element={<ReprintReceipt />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="students/:sno" element={<StudentProfile />} />
          <Route path="students/:sno/edit" element={<AdminRoute><EditStudent /></AdminRoute>} />
          <Route path="ledger/:sno" element={<StudentLedger />} />
          <Route path="ledger/bulk-demand" element={<AdminRoute><BulkFeeDemand /></AdminRoute>} />
          <Route path="ledger/:sno/add-demand" element={<AdminRoute><AddFeeDemand /></AdminRoute>} />
          <Route path="ledger/:sno/add-charge" element={<AdminRoute><AddCharge /></AdminRoute>} />
          <Route path="ledger/:sno/adjust" element={<AdminRoute><LedgerAdjustment /></AdminRoute>} />
          <Route path="fee-templates" element={<AdminRoute><FeeTemplates /></AdminRoute>} />
          <Route path="expenses" element={<AdminRoute><ExpensesList /></AdminRoute>} />
          <Route path="expenses/add" element={<AdminRoute><AddExpense /></AdminRoute>} />
          <Route path="expenses/tag-from-bank" element={<AdminRoute><TagBankWithdrawals /></AdminRoute>} />
          <Route path="bank" element={<AdminRoute><BankAccount /></AdminRoute>} />
          <Route path="bank/add" element={<AdminRoute><AddBankTransaction /></AdminRoute>} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="audit" element={<AuditTrail />} />
          <Route path="import" element={<AdminRoute><DataImport /></AdminRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
