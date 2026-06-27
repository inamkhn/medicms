# MediCMS Desktop v4.0 - Complete Application Documentation

## 1. Project Overview

**MediCMS Desktop** is an offline-first college management system built for the **Paramedical Institute, Saidu Sharif, Swat**. It manages student admissions, fee collection, ledger accounting, bank reconciliation, expense tracking, and audit logging for a paramedical institute offering 9 diploma programs.

- **Version:** 4.0.0
- **Architecture:** Desktop-first, offline-first with cloud sync capability
- **Target Users:** Admin (full access), Principal (read-only)

---

## 2. Technology Stack

| Layer            | Technology                        | Version     |
|-----------------|-----------------------------------|-------------|
| Framework       | React                             | 19.2.4      |
| Language        | TypeScript                        | 5.9.3       |
| Build Tool      | Vite                              | 8.0.1       |
| Styling         | Tailwind CSS                      | 4.2.2       |
| State Mgmt      | Zustand (with persist middleware)  | 5.0.12      |
| Routing         | react-router-dom                  | 7.13.2      |
| UI Components   | Radix UI (Select, Label, Slot, etc.) | various  |
| Icons           | lucide-react                      | 1.7.0       |
| Date Handling   | date-fns                          | 4.1.0       |
| CSS Utilities   | clsx + tailwind-merge (cn helper) | latest      |
| Form Validation | Zod + react-hook-form             | 4.3.6 / 7.72|
| Dev Server Port | 5173 (strict)                     | —           |
| Path Alias      | `@` → `./src`                     | —           |

---

## 3. Project Structure

```
medicms-desktop/
├── public/                    # Static assets (favicon, icons)
├── src/
│   ├── assets/                # Images (hero.png, react.svg, vite.svg)
│   ├── components/
│   │   ├── layout/            # AppShell, Header, Sidebar, StatusBar
│   │   ├── shared/            # GlobalSearch, StudentDrawer, OfflineBanner, SyncIndicator, StruckOffModal
│   │   └── ui/                # Primitives: Button, Badge, Card, Input, Label, Select, Table
│   ├── lib/
│   │   ├── constants.ts       # All app-wide constants, config, rules
│   │   ├── mockData.ts        # Mock data (replaces SQLite in dev)
│   │   └── utils.ts           # Utility functions (formatting, computation)
│   ├── pages/
│   │   ├── Login.tsx          # Authentication page
│   │   ├── Dashboard.tsx      # Main dashboard with stats
│   │   ├── Reports.tsx        # Report catalog (25+ reports)
│   │   ├── Settings.tsx       # Server, sync, printer, backup settings
│   │   ├── students/          # StudentList, NewAdmission, EditStudent
│   │   ├── ledger/            # StudentLedger, AddFeeDemand, AddCharge, LedgerAdjustment
│   │   ├── payments/          # RecordPayment, ReprintReceipt
│   │   ├── fee-templates/     # FeeTemplates (CRUD)
│   │   ├── expenses/          # ExpensesList, AddExpense, TagBankWithdrawals
│   │   ├── bank/              # BankAccount, AddBankTransaction
│   │   ├── audit/             # AuditTrail
│   │   └── import/            # DataImport (5-step wizard)
│   ├── stores/
│   │   ├── authStore.ts       # Authentication + role-based access
│   │   ├── syncStore.ts       # Sync status management
│   │   ├── uiStore.ts         # UI state (drawer, search, sidebar)
│   │   └── index.ts           # Re-exports
│   ├── types/
│   │   └── index.ts           # All TypeScript types and interfaces
│   ├── App.tsx                # Root router + ProtectedRoute
│   ├── main.tsx               # Entry point (React 19 createRoot)
│   ├── index.css              # Tailwind + CSS variables
│   └── App.css                # (unused)
├── docs/                      # Architecture specification documents
├── package.json
├── vite.config.ts
└── tsconfig files
```

**Total:** 47 TypeScript/TSX source files

---

## 4. Type System (`types/index.ts` — 233 lines)

### Core Entity Types

| Type | Description |
|------|-------------|
| `UserRole` | `'Admin'` or `'Principal'` |
| `User` | Logged-in user (id, username, name, role) |
| `ProgramCode` | 9 programs: Health, Surgical, Pharmacy, Radiology, Pathology, Cardiology, Anaesthesia, Dental, Dialysis |
| `BatchName` | 17 batches: 1st through 17th Batch |
| `Semester` | `'1st'`, `'2nd'`, `'3rd'`, `'4th'` |
| `Student` | Full student record with SNO (primary key), personal info, program, struck-off status |
| `FeeTemplate` | Fee structure per program/semester/batch/session (8 fee components) |
| `LedgerTransaction` | Financial transaction (Demand, Pay, Disc, Exam, CT, Adj, Refund) |
| `ComputedBalance` | Derived balance (never stored): fees - discount - payment + charges |
| `BalanceState` | Three-state: `dues` (>0), `cleared` (=0), `credit` (<0) |
| `Expense` | Expense record with category, amount, bank link |
| `BankTransaction` | Bank ledger entry (deposit/withdrawal/balance) |
| `AuditLog` | Immutable audit record with before/after change tracking |
| `ImportStep` | Data import wizard step status |
| `StudentBadgeType` | 6 badge states combining struck-off + balance |
| `StudentWithBalance` | Student + computedBalance + badge |

### Transaction Types

| Type | Purpose |
|------|---------|
| `Demand` | Fee demand (increases balance) |
| `Pay` | Payment received (decreases balance) |
| `Disc` | Discount/waiver (decreases balance) |
| `Exam` | Exam fee charge |
| `CT` | Clinical Training fee |
| `Adj` | Ledger adjustment |
| `Refund` | Refund to student |

### Expense Categories (14)

SAL, FOOD, UTIL, BLDG, CT, DR, FAC, REFUND, FURN, ELEC, IDCARD, STAT, ADV, OTHER

---

## 5. State Management (Zustand Stores)

### 5.1 Auth Store (`authStore.ts`)
- **Persisted:** Yes (localStorage key: `medicms-auth`)
- **State:** `isLoggedIn`, `user`, `lastOnlineLogin`
- **Actions:** `login()`, `logout()`, `canLoginOffline()` (7-day cache window)
- **Exports:** `hasPermission(role, module)`, `canWrite(role)` — Admin has `['*']`, Principal has read-only access to dashboard/students/ledger/reports/audit

### 5.2 Sync Store (`syncStore.ts`)
- **Persisted:** No
- **State:** `status` (online/syncing/offline/error), `lastSync`, `pendingCount`, `error`
- **Actions:** `setOnline()`, `setOffline()`, `setSyncing()`, `setError()`, `syncComplete()`, `incrementPending()`, `decrementPending()`
- **Exports:** `getSyncIndicator(status)` — returns emoji dot + label

### 5.3 UI Store (`uiStore.ts`)
- **Persisted:** No
- **State:** `drawerStudent`, `drawerOpen`, `searchOpen`, `searchQuery`, `sidebarCollapsed`
- **Actions:** `openDrawer()`, `closeDrawer()`, `openSearch()`, `closeSearch()`, `setSearchQuery()`, `toggleSidebar()`

---

## 6. Routing (`App.tsx` — 68 lines)

### Route Map (22 routes)

| Path | Component | Description |
|------|-----------|-------------|
| `/login` | Login | Authentication (no protection) |
| `/` | ProtectedRoute → AppShell | Root redirects to /dashboard |
| `/dashboard` | Dashboard | Stats, quick actions, today's payments |
| `/students` | StudentList | Filterable student table with pagination |
| `/ledger` | Redirects to /students | No standalone ledger page |
| `/admissions/new` | NewAdmission | 3-step admission wizard |
| `/payments/record` | RecordPayment | 4-step payment flow |
| `/payments/reprint` | ReprintReceipt | Search and reprint receipts |
| `/reports` | Reports | 25+ report catalog |
| `/settings` | Settings | Server, sync, printer, backup config |
| `/students/:sno/edit` | EditStudent | Edit student info (audit logged) |
| `/ledger/:sno` | StudentLedger | Per-student fee ledger |
| `/ledger/:sno/add-demand` | AddFeeDemand | Add semester fee demand |
| `/ledger/:sno/add-charge` | AddCharge | Add exam/CT/special charges |
| `/ledger/:sno/adjust` | LedgerAdjustment | Reverse/correct ledger entries |
| `/fee-templates` | FeeTemplates | CRUD for fee structures |
| `/expenses` | ExpensesList | Expense list with category filter |
| `/expenses/add` | AddExpense | Add expense (petty cash or bank) |
| `/expenses/tag-from-bank` | TagBankWithdrawals | Link bank withdrawals to expenses |
| `/bank` | BankAccount | Bank ledger with deposit/withdrawal |
| `/bank/add` | AddBankTransaction | Record bank deposit/withdrawal |
| `/audit` | AuditTrail | Immutable audit log viewer |
| `/import` | DataImport | 5-step data migration wizard |

### ProtectedRoute
- Wraps all authenticated routes
- Checks `isLoggedIn` from authStore
- Redirects to `/login` if not authenticated

---

## 7. Layout Components

### 7.1 AppShell (`AppShell.tsx` — 104 lines)
- Main application layout container
- Contains `useGlobalShortcuts()` hook (inside Router context)
- Renders: Header + OfflineBanner + Sidebar + main Outlet + StatusBar + GlobalSearch overlay + StudentDrawer
- **Keyboard shortcuts:**
  - `Esc` — Close student drawer
  - `F3` — Open global search
  - `F5` — Sync now (simulated)
  - `Ctrl+N` — Navigate to new admission
  - `Ctrl+P` — Navigate to record payment
  - `Ctrl+D` — Navigate to reports
  - `Ctrl+R` — Navigate to reprint receipt

### 7.2 Header (`Header.tsx` — 58 lines)
- MediCMS logo + institute name
- Search bar (opens GlobalSearch on click, shows F3 shortcut)
- SyncIndicator + user name/role + logout button

### 7.3 Sidebar (`Sidebar.tsx` — 115 lines)
- 5 navigation sections: Main, Finance, Operations, Reports, System
- Active link highlighting with blue accent
- Admin-only items hidden for Principal role
- User info + logout at bottom

**Navigation Items:**
| Section | Items |
|---------|-------|
| Main | Dashboard, Students, New Admission (Ctrl+N) |
| Finance | Fee Ledger, Payments (Ctrl+P), Fee Templates (admin) |
| Operations | Expenses (admin), Bank Account (admin) |
| Reports | Reports, Audit Trail |
| System | Data Import (admin), Settings |

### 7.4 StatusBar (`StatusBar.tsx` — 37 lines)
- Footer bar showing: sync status indicator, last sync time, pending count, version number

---

## 8. Shared Components

### 8.1 GlobalSearch (`GlobalSearch.tsx` — 166 lines)
- Full-screen search overlay (F3)
- Searches: students (name, SNO, father name, contact), receipts
- Arrow key navigation + Enter to select
- Student results open StudentDrawer, receipt results navigate to reprint
- Esc to close

### 8.2 StudentDrawer (`StudentDrawer.tsx` — 190 lines)
- Right-side slide-out panel (360px wide)
- Shows: student info, contact details, live balance, struck-off status
- Actions: View Ledger, Record Payment, Edit Info, Print Statement, Add Fee Demand, Add Charge
- Admin-only: Edit, Struck Off button
- Opens StruckOffModal for marking students

### 8.3 StruckOffModal (`StruckOffModal.tsx` — 133 lines)
- Modal dialog for marking a student as struck off
- Fields: Reason (5 predefined options), Details (optional), Date (editable)
- Shows outstanding balance warning if student has dues
- Auto-fills admin name

### 8.4 OfflineBanner (`OfflineBanner.tsx` — 34 lines)
- Amber banner shown when sync status is offline
- Shows pending record count + Sync Now button

### 8.5 SyncIndicator (`SyncIndicator.tsx` — 19 lines)
- Small dot + label in header showing sync status
- States: 🟢 Online, 🔄 Syncing..., 🔴 Offline, 🟡 Sync Error

---

## 9. Page Components

### 9.1 Login (`Login.tsx` — 130 lines)
- Username/password form with show/hide toggle
- Demo credentials: `admin/admin` (Admin role), `principal/principal` (Principal role)
- 500ms simulated delay
- Offline note: "Works offline — cached credentials (7-day window)"
- On success: stores user in authStore, navigates to /dashboard

### 9.2 Dashboard (`Dashboard.tsx` — 192 lines)
- **Stats cards:** Active Students (484), Struck Off (35), Total Dues (PKR 482,000), Pending Sync (3)
- **Quick Actions:** New Admission, Record Payment, Find Student, Daily Report, Fee Defaulters, Sync Now
- **Today's Payments:** List of 3 mock payments with total
- **Fee Defaulters:** Top 5 students with highest dues (computed live from ledger)
- Warning note about balance computation source

### 9.3 StudentList (`StudentList.tsx` — 258 lines)
- Table with SNO, Name, Program, Batch, Status columns
- **Filters:** Search (name/SNO/father), Program, Batch, Session, Semester, Status
- **Status filter options:** All, Active, Struck Off, With Dues, Credit Balance
- Pagination (20 per page)
- Stats summary: Active count, Struck Off count, Credit Balance count
- Row click opens StudentDrawer
- StatusBadge component showing 6 badge types

### 9.4 NewAdmission (`NewAdmission.tsx` — 352 lines)
- **3-step wizard:**
  1. Personal Info: Name, Father, Contact, CNIC (with nil/na normalization), Address, Reg Date
  2. Program & Batch: Program select, Semester (fixed 1st), Batch, Session
  3. Review & Submit: Summary + auto-loaded fee template breakdown
- Duplicate name detection (mock)
- Fee template auto-loads based on program + 1st semester
- Progress bar indicator

### 9.5 EditStudent (`EditStudent.tsx` — 233 lines)
- Editable fields: Name, Father, Contact, CNIC, Address
- Locked fields: Program, Batch, Session (set at admission)
- Semester correction (with note about ledger-derived value)
- **Mandatory reason field** for audit trail
- Success message with auto-redirect

### 9.6 StudentLedger (`StudentLedger.tsx` — 191 lines)
- Per-student fee ledger with running balance
- **Balance Summary:** Live Balance, Total Demanded, Discounts, Total Paid, Charges
- **Table columns:** Txn#, Date, Type, Fees, Charges, Disc/Adj, Paid, Balance
- Transaction type badges with color coding (7 types)
- Running balance formula: `fees + charges - discount - payment`
- Charges displayed in purple (extracted from negative discount values)
- Action buttons: Add Fee Demand, Add Charge, Adjust, Record Payment (admin only)
- Print Statement button

### 9.7 AddFeeDemand (`AddFeeDemand.tsx` — 244 lines)
- Semester & Session selection
- Auto-loads matching fee template
- **8 fee components:** Admission, Tuition, ID Card, Annual, Security, Enrollment, Diploma, Clinical
- Semester rule warnings (Annual Sem 3+, Clinical Sem 3, Diploma Sem 4)
- Narration field (auto-filled, editable)
- Option to update student's current semester

### 9.8 AddCharge (`AddCharge.tsx` — 153 lines)
- **Charge types:** Exam Fee, Clinical Training, Annual Charges, Late Payment Fine, Library Fine, Equipment Damage, Other/Custom
- Default narrations per type
- Amount, Date, Receipt No, Narration fields
- Preview: shows how charge affects balance (charge increases balance)
- Charge stored as negative discount in ledger

### 9.9 LedgerAdjustment (`LedgerAdjustment.tsx` — 195 lines)
- **Adjustment types:** Reverse wrong entry, Grace marks waiver, Write-off/waiver, Refund to student, Other correction
- Amount + Effect direction (reduce/increase balance)
- Reference field (original Txn#)
- **Mandatory reason**
- Approval note: Principal required if > PKR 5,000
- Live balance preview

### 9.10 RecordPayment (`RecordPayment.tsx` — 329 lines)
- **4-step flow:**
  1. Search: Find student by name/SNO/father
  2. Confirm: Verify student identity
  3. Payment: Amount, Discount, Discount Reason, Receipt No, Narration
  4. Success: Confirmation with Print Receipt option
- Pre-selects student from URL param (`?sno=xxx`)
- **Credit guard:** Blocks if balance would go below -PKR 10,000
- Live balance preview during entry
- Auto-fills "Received by" from logged-in user
- Uses `useMemo` for stable student list reference

### 9.11 ReprintReceipt (`ReprintReceipt.tsx` — 135 lines)
- Search receipts by number or student name
- Receipt preview in printable format (dashed border)
- Shows institute header, receipt details, signature line
- `window.print()` for actual printing

### 9.12 Reports (`Reports.tsx` — 114 lines)
- Catalog of 25+ reports organized in 6 categories:
  - **Daily:** Daily Cash Collection, Fee Register
  - **Fee:** Active Defaulters, Struck Off with Dues, Credit Balance, Full Statement, Program Summary, Discount Summary
  - **Student:** Program-wise List, Struck Off, Admission Register
  - **Expense:** Category Summary, Monthly Report
  - **Bank:** Statement, Personal Transactions
  - **Sync:** Pending Sync Log
- Each report has Print and Download buttons (UI only)

### 9.13 FeeTemplates (`FeeTemplates.tsx` — 318 lines)
- List view with Program/Semester filters
- Table: Program, Sem, Session, Adm Fee, Tuit Fee, Total, Edit
- **Editor mode:** Full CRUD for all 8 fee components
- Semester warnings (soft — can override)
- Business rules displayed at bottom

### 9.14 ExpensesList (`ExpensesList.tsx` — 156 lines)
- Table: ID, Category, Amount, Date, Given By, Bank Link
- Category filter + text search
- Bank link badge: green for bank-linked, gray for petty cash
- Warning banner about untagged bank withdrawals
- Link to TagBankWithdrawals page

### 9.15 AddExpense (`AddExpense.tsx` — 168 lines)
- Category, Amount, Date, Time, Given By, Details
- **Paid From:** Petty Cash or Bank Account
- Bank payment auto-creates linked withdrawal (prevents double-counting)

### 9.16 TagBankWithdrawals (`TagBankWithdrawals.tsx` — 289 lines)
- Side-by-side: Untagged Withdrawals vs Unlinked Expenses
- Select one from each side to tag together
- Mark withdrawal as Personal option
- Tagged pairs summary table
- Prevents double-counting in reports

### 9.17 BankAccount (`BankAccount.tsx` — 205 lines)
- **Summary cards:** Current Balance, Total Deposits, Total Withdrawals, Untagged Withdrawals
- Bank info header (Bank Al Habib, Saidu Sharif, A/C number)
- Table: #, Date, Narration, Deposit, Withdrawal, Balance, Status
- Status badges: Deposit, Tagged, Untagged, Personal
- Toggle: Show/hide personal transactions
- Untagged withdrawal warning with "Tag Now" link

### 9.18 AddBankTransaction (`AddBankTransaction.tsx` — 200 lines)
- Transaction type: Deposit or Withdrawal (visual toggle)
- Date, Amount, Narration, Personal checkbox
- Balance preview with negative balance warning
- Personal transactions excluded from operational reports

### 9.19 AuditTrail (`AuditTrail.tsx` — 308 lines)
- **14 action types:** Payment, Fee Demand, Charge Added, Ledger Adjustment, New Admission, Student Edit, Struck Off, Struck Off Reversed, Bank Entry, Expense Added, Fee Template Change, Sync Event, Login, Data Import
- Filters: Search, Action type, User, Sort (newest/oldest)
- Expandable rows showing field-level before/after changes
- Color-coded action badges with icons
- INSERT-ONLY: audit records cannot be edited or deleted

### 9.20 DataImport (`DataImport.tsx` — 431 lines)
- **6-step wizard:**
  1. Import Students (100 records)
  2. Import Fee Templates (48 records)
  3. Map Ledger → Students (87 records, 11 unmatched warnings)
  4. Import Bank Ledger (24 records)
  5. Import Expenses (5 records)
  6. Verify & Confirm
- Progress bar with step status colors
- Step navigation sidebar
- Per-step descriptions and details
- Completion screen with summary stats
- Warning review panel

### 9.21 Settings (`Settings.tsx` — 308 lines)
- **Server Connection:** URL, API key, Test Connection button
- **Sync Status:** Current status, last sync, pending records, device ID, Sync Now
- **Institute Info:** Name, Address, Phone (editable, used on receipts)
- **Bank Account:** Bank name, Account number (editable)
- **Printer Settings:** Default printer, Paper size (A4/A5/Thermal 80mm)
- **Data Management:** Show test records toggle, Recalculate balances, Rename unknown expense categories
- **Backup & Restore:** Auto-backup schedule, manual backup/restore, backup folder
- **About:** Version 4.0.0, Check for Updates

---

## 10. Utility Functions (`utils.ts` — 156 lines)

| Function | Purpose |
|----------|---------|
| `cn(...inputs)` | Merge Tailwind classes (clsx + twMerge) |
| `formatPKR(amount)` | Format as `PKR X,XXX` |
| `formatDate(date)` | Format as `dd MMM yyyy` |
| `formatDateTime(date)` | Format as `dd MMM yyyy HH:mm` |
| `formatTime(date)` | Format as `HH:mm` |
| `computeBalanceState(balance)` | Returns BalanceState (dues/cleared/credit) |
| `getStudentBadge(struckOff, balance)` | Returns 6-state StudentBadgeType |
| `formatBalanceDisplay(balance)` | Returns label + color class |
| `formatCNIC(cnic)` | Format as `XXXXX-XXXXXXX-X` |
| `isValidCNIC(cnic)` | Validates 13-digit CNIC |
| `normalizeCNIC(value)` | Converts "nil"/"n/a" etc. to null |
| `getSemesterLabel(semester)` | Returns "Xth Semester" |
| `batchToSession(batch)` | Approximate batch-to-year mapping |
| `generateReceiptNumber(block, current)` | Generates `#N` receipt number |
| `computeFeeTemplateTotal(template)` | Sums all 8 fee components |
| `getFeeWarnings(semester, feeType, amount)` | Semester rule validation |
| `highlightMatch(text, query)` | Search result highlighting |
| `pluralize(count, singular, plural)` | Word pluralization |

---

## 11. Constants (`constants.ts` — 117 lines)

| Constant | Value |
|----------|-------|
| `PROGRAM_OPTIONS` | 9 programs with value/label pairs |
| `BATCH_OPTIONS` | 17 batches (1st through 17th) |
| `SEMESTER_OPTIONS` | 4 semesters (1st-4th) |
| `SESSION_OPTIONS` | 12 years (2017-2028) |
| `EXPENSE_CATEGORY_OPTIONS` | 14 expense categories |
| `STRUCK_OFF_REASONS` | 5 reasons (Non-payment, Disciplinary, Withdrawn, Shortage, Other) |
| `CHARGE_TYPES` | 7 charge types with default narrations |
| `ADJUSTMENT_TYPES` | 5 adjustment types |
| `INSTITUTE_INFO` | Paramedical Institute, Saidu Sharif, Swat |
| `BANK_INFO` | Bank Al Habib Limited Islamic, Saidu Sharif, A/C 5533-0081-000190-01-1 |
| `KEYBOARD_SHORTCUTS` | 8 keyboard shortcuts |
| `FEE_RULES` | Annual Sem 3+, Clinical Sem 3, Diploma Sem 4, Credit guard -10,000 |

---

## 12. Mock Data (`mockData.ts` — 459 lines)

### Students (10 records)
- SNOs: 41, 42, 57, 63, 76, 87, 99, 114, 139, 146
- Programs: Pathology, Health, Pharmacy, Surgical, Anaesthesia, Dental
- Batches: 1st, 2nd, 3rd
- Sessions: 2017, 2019
- Struck off: 3 students (SNO 42, 63, 114)
- Test record: SNO 146 (Director Sb)
- Balance range: -20,000 (credit) to +27,000 (dues)

### Ledger Transactions (4 records for SNO 76 — Sana Ali)
- 2 Demands + 2 Payments
- Registration balance: PKR 33,700
- Net balance: PKR 23,100

### Fee Templates (3 records)
- Health Sem 1 (2017): Total PKR 35,200
- Health Sem 3 (2018): Total PKR 27,000
- Anaesthesia Sem 1 (2019): Total PKR 45,000

### Expenses (3 records)
- SAL: PKR 54,500 (bank-linked)
- FOOD: PKR 11,060 (petty cash)
- UTIL: PKR 4,990 (petty cash)

### Bank Transactions (6 records)
- Deposits and withdrawals
- 1 personal transaction (SNO 5)
- Running balance up to PKR 1,325,540

### Audit Logs (4 records)
- Payment, Student Edit, New Admission, Struck Off actions

### Import Steps (6 steps)
- Mock wizard progress state

### Dashboard Stats
- 484 active, 35 struck off, PKR 482,000 total dues, 3 pending sync
- 3 today payments, 5 top defaulters

---

## 13. UI Components (Primitives)

| Component | File | Variants/Sizes |
|-----------|------|----------------|
| Button | `button.tsx` (38 lines) | default, destructive, outline, secondary, ghost, link / default, sm, lg, icon |
| Badge | `badge.tsx` (21 lines) | default, secondary, destructive, outline |
| Card | `card.tsx` (37 lines) | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter |
| Input | `input.tsx` (18 lines) | Standard HTML input wrapper |
| Label | `label.tsx` (15 lines) | Radix Label primitive |
| Select | `select.tsx` (57 lines) | Radix Select: Trigger, Content, Item, Value, Separator, Group, Label |
| Table | `table.tsx` (42 lines) | Table, Header, Body, Footer, Row, Head, Cell, Caption |

---

## 14. Key Business Rules

### Balance Computation
- **Formula:** `balance = SUM(fees) + SUM(charges) - SUM(discounts) - SUM(payments)`
- Charges stored as **negative discount** in Exam/CT transactions
- Balance is **always computed from ledger** — never read from a stored "Dues" column
- Three display states: Dues (positive), Cleared (zero), Credit (negative)

### Credit Guard
- Balance cannot go below **-PKR 10,000** without Principal approval
- Prevents accidental over-payment

### Semester Fee Rules
- **Annual Charges:** Apply Sem 3+ only (0 in Sem 1 & 2)
- **Clinical Charges:** Apply Sem 3 only
- **Diploma Fee:** Apply Sem 4 only
- **Security Fee:** Always 0 (never used)
- **Admission Fee, Enrollment Fee, ID Card Fee:** Sem 1 only
- **Tuition Fee:** Every semester

### Role-Based Access
- **Admin:** Full read/write access to all modules
- **Principal:** Read-only access to dashboard, students, ledger, reports, audit
- Admin-only sidebar items: Fee Templates, Expenses, Bank Account, Data Import
- Write actions (edit, add, delete) blocked for Principal via `canWrite()`

### Audit Trail
- Every action is logged with: user, timestamp, action type, student SNO, details
- Field-level changes tracked (before/after values)
- **INSERT-ONLY** — audit records cannot be edited or deleted

### Expense-Bank Linking
- Expenses paid from bank auto-create a linked bank withdrawal
- Untagged bank withdrawals must be manually linked via TagBankWithdrawals
- Prevents double-counting in reports (withdrawal = expense, not both)
- Personal/non-operational transactions flagged separately

### CNIC Handling
- Stored as `null` if not entered (never "nil", "n/a", etc.)
- `normalizeCNIC()` converts invalid strings to null
- Display format: `XXXXX-XXXXXXX-X`

### Test Records
- Records like "Director Sb" (SNO 146) flagged with `isTestRecord: true`
- Filtered out from student lists and search results by default
- Toggle in Settings to show/hide

---

## 15. Styling & CSS

- **Tailwind CSS 4** via `@tailwindcss/vite` plugin
- CSS variables in `index.css` for theming (background, foreground, primary, muted, border, destructive, radius)
- Global base styles: border-color, box-sizing, body background/color, font-family
- All components use Tailwind utility classes
- Responsive design: grid layouts with `md:` and `lg:` breakpoints
- Color coding throughout: green (payments/deposits), red (struck off/withdrawals), amber (dues/warnings), blue (credit/info), teal (discounts), purple (charges)

---

## 16. Build & Configuration

### Vite Config
- Plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`
- Base: `./` (relative for desktop deployment)
- Path alias: `@` → `./src`
- Dev server: port 5173, strictPort: true

### TypeScript Config
- `tsconfig.json` — project references (app + node)
- `tsconfig.app.json` — app source compilation
- `tsconfig.node.json` — vite config compilation

### Scripts
| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (port 5173) |
| `npm run build` | TypeScript check + Vite production build |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production build |

---

## 17. Architecture Patterns

1. **Offline-First:** All data operations work locally. Mock data simulates SQLite backend. Sync is simulated with setTimeout.

2. **INSERT-ONLY Payments:** Payment records are never edited or deleted. Corrections use adjustment entries.

3. **Live Balance Computation:** Balance is always derived from ledger transactions, never stored or cached in a "dues" column.

4. **Audit Everything:** Every mutation is logged with user, timestamp, and before/after values.

5. **Component Architecture:** Layout (shell/header/sidebar) → Shared (drawer/search/modals) → Pages → UI primitives.

6. **State Separation:** Auth (persisted) → Sync (runtime) → UI (runtime). No global data store — pages consume mock data directly (will be SQLite queries in production).

7. **Role-Based UI:** Sidebar items and action buttons conditionally rendered based on `canWrite()` and `hasPermission()`.
