# MediCMS Desktop — Current Application Scope

**Application version:** 4.0.0  
**Reviewed on:** 9 October 2026  
**Purpose:** Document the features and workflows currently present in the application, including their implementation limits.

This document describes the current source code. It distinguishes implemented frontend behavior from demonstrations and unfinished functionality. It is not a statement that all workflows have passed end-to-end testing or are ready for production use.

## 1. Application overview

MediCMS Desktop is a college administration application focused on medical, nursing, paramedical, and related educational programs. It supports student admission and records, fee accounting, payment receipts, academic promotion, expenses, bank transactions, and administrative oversight.

The primary user is an institute administrator or counter operator. The current application has one user role: **Admin**.

The application includes a browser interface and desktop wrappers for Electron and Tauri. Its interface is designed mainly for desktop use, with dense tables, search, keyboard shortcuts, and printable documents.

### Feature status definitions

| Status | Meaning |
| --- | --- |
| Implemented frontend | The interface contains logic that reads or updates application state. This does not imply durable database storage or complete validation. |
| Partially implemented | Some behavior works, but related functionality or integration is missing. |
| Demonstration / placeholder | The screen or control exists, but the intended operation is simulated or has no implementation. |
| Not implemented | No corresponding application workflow was found in the reviewed source. |

## 2. Module summary

| Module | Current scope | Status |
| --- | --- | --- |
| Login and access | Demo administrator login, logout, protected routes | Partially implemented |
| Dashboard | Student counts, dues, payments, bank balance, expenses, shortcuts | Implemented frontend |
| Student directory | Search, filters, sorting, pagination, selection, CSV import/export | Implemented frontend |
| Admissions | Four-step admission, fee lock, initial demand, optional payment | Implemented frontend |
| Student profile and editing | Identity details, academic information, balance, history, edits | Implemented frontend |
| Student status | Strike-off, reinstatement, bulk strike-off | Implemented frontend |
| Student ledger | Transaction history, running balances, demands, charges, adjustments | Implemented frontend |
| Promotion | Individual promotion and batch demand posting | Implemented frontend; known build issue |
| Payments and receipts | Payment posting, discounts, receipt numbering, print and reprint | Implemented frontend; known limitations |
| Fee templates | Browse and edit fee structures on screen | Partially implemented; saving is simulated |
| Batches | Create, rename, enable, and disable program-specific batches | Implemented frontend |
| Expenses and budgets | Expense entry, bank linkage, bill images, monthly budgets | Implemented frontend |
| Banking | Deposits, withdrawals, CSV import/export, expense tagging | Implemented frontend |
| Audit trail | Searchable activity history and field-level change details | Partially implemented; memory-only storage |
| Reports | Catalog of 16 report types | Demonstration / placeholder |
| Legacy data migration | Six-stage import wizard | Demonstration / placeholder |
| Settings | Institute, bank, receipt, budget, and display preferences | Partially implemented |
| Offline sync and backup | Status displays and administrative controls | Demonstration / placeholder |

## 3. Supported courses and academic structure

Students are organized by course, program, batch, session year, and current term. The interface changes term labels according to the course system: semester, year, or term.

| Course | Programs | Academic structure in code |
| --- | --- | --- |
| Paramedics | Health, Surgical, Pharmacy Tech, Radiology, Pathology, Cardiology, Anaesthesia, Dental, Dialysis | Four semesters |
| Pharmacy B / Category B | Pharmacy Cat-B | Two annual terms |
| PNC | LHV, CMW, CNA | Two annual terms |
| BS Nursing | BSN | Eight semesters |
| Homeopathic Council | DHMS | Four annual terms |
| Ultrasound | Ultrasound 6 Months, Ultrasound 1 Year | One term and two terms respectively |

The current session selector lists years from 2017 through 2028. Batches belong to individual programs and carry a session year and active/disabled status.

## 4. Login, navigation, and search

### Login and access

- Administrator login using hardcoded demo credentials: `admin / admin`.
- Password visibility toggle and invalid-credentials feedback.
- Login state stored in browser local storage.
- Logout available from the header and sidebar.
- Protected application routes redirect unauthenticated users to login.
- Permission helpers and UI checks for the Admin role.

**Limits:** There is no authentication server, user management, password reset, or implemented multi-role access model. The seven-day offline-login helper exists but is not enforced by the login flow. The `AdminRoute` wrapper currently checks login state rather than a separate role restriction.

### Application shell

- Collapsible sidebar grouped into Main, Finance, Operations, Reports, and System.
- Header with institute branding, search, user identity, sync indicator, and logout.
- Status bar with sync status, pending count, last sync time, user, and shortcut hints.
- Offline banner shown when the sync store is set to offline.

### Global search

- Search overlay with automatic input focus.
- Search for students by identifiers, names, contact details, academic details, and other profile fields.
- Receipt-number search.
- Quick navigation commands for common modules.
- Grouped results for actions, students, and receipts.
- Arrow-key navigation, Enter to select, and Escape to close.

Receipt search results open the reprint page; they do not currently select the matching receipt automatically.

### Keyboard shortcuts

| Shortcut | Current action |
| --- | --- |
| F3 | Open global search |
| Ctrl+K / Command+K | Open global search |
| F5 | Run simulated sync |
| Ctrl+N | Open new admission |
| Ctrl+P | Open record payment |
| Ctrl+R | Open receipt reprint |
| Ctrl+D | Open reports catalog |
| Escape | Close global search; profile-specific back/modal behavior |

Most navigation shortcuts are suppressed while typing in input, textarea, or select elements. Escape behavior is not implemented uniformly across every modal.

## 5. Dashboard

The dashboard derives its main figures from the current application stores:

- Active student count.
- Struck-off student count.
- Total student count.
- Outstanding dues for active students.
- Pending sync count from the sync store.
- Latest stored bank balance.
- Current-month expense total.
- Today's payment list and total.
- Top five active fee defaulters, ordered by outstanding balance.
- Quick actions for admission, payment, search, reports, batch promotion, batches, and sync.
- Browser print action for the dashboard.

**Limits:** Sync figures do not represent a working synchronization queue. Some dashboard links open a general module rather than a prefiltered view. Date grouping frequently uses UTC dates through `toISOString()`.

## 6. Student management

### Student record fields

| Category | Fields |
| --- | --- |
| Identity | Global student number (SNO), name, father's name, CNIC/B-Form |
| Personal details | Photo, date of birth, gender, domicile |
| Contact | Phone, address, emergency contact |
| Academic placement | Course, program, batch, session, current semester/year/term |
| Admission | Registration date, locked fee total, recurring fee, fee breakdown |
| Status | Strike-off flag, date, reason, test-record flag, sync flag |

The SNO is generated from the highest existing student number plus one. This is local application behavior; it is not coordinated across devices.

### Student directory

- Search by SNO, student name, father's name, CNIC, phone, address, domicile, emergency contact, gender, course/program labels, batch, and session.
- Search input debounce of 150 milliseconds.
- Filters for course, program, batch, session, term, and status.
- Status tabs with counts: All, Active, With Dues, Credit, and Struck Off.
- Sorting by SNO, name, and balance.
- Default balance-descending sort when selecting the dues tab.
- Pagination with 20, 50, or 100 rows per page.
- Student photos, academic details, contact, registration date, balance, and status in the table.
- Row actions for profile, ledger, payment, and editing.
- Individual and current-page bulk selection.
- Export all filtered students or selected students to CSV.
- Student CSV template download and import preview.
- Bulk strike-off with a required reason and audit entries.
- Browser printing and empty-state messages.
- Test records hidden by default, with a setting to include them.

**CSV import limits:** The directory importer creates student records but does not create admission fee demands or locked fee contracts. Validation and duplicate handling are limited. It accepts some values through type casts, and its exported columns are not a guaranteed round-trip import format.

### New admission

The admission workflow has four steps:

1. **Bio:** Name, father's name, CNIC, contact, address, registration date, date of birth, gender, domicile, emergency contact, and optional photo.
2. **Academic:** Course, program, term, program-specific batch, and session.
3. **Fees:** Read-only template breakdown, optional concession, net fee, and recurring promotion fee.
4. **Confirm:** Review details, optionally collect payment, then confirm admission.

Supported behavior includes:

- Form validation using React Hook Form and Zod.
- CNIC formatting and duplicate-CNIC detection during admission.
- Possible duplicate-name warnings.
- Pakistani contact-number validation.
- Future date-of-birth and registration-date checks.
- Photo upload with a 2 MB limit.
- Program-specific batches and session selection.
- Fee structure copied into the student record at admission.
- Automatic initial ledger demand when the net fee is positive.
- Optional cash, bank, online, or cheque payment.
- Receipt-number checks and receipt-book advancement for collected payment.
- Automatic bank deposit for non-cash payment.
- Admission, demand, and payment audit entries.
- Persistent success screen with student number and follow-up actions.
- ID-card printing and payment receipt printing when payment was collected.
- Unsaved-data warning on browser unload and selected cancellation paths.

**Limits:** Fee selection currently matches course, program, and term without requiring the template's batch and session to match. A fee template is required to advance through the fee step, but the template editor cannot save new templates yet. Fully discounted zero-fee admissions are blocked by the final submit button. Navigation guards do not cover every route change.

### Student profile and editing

- Profile with identity, photo, academic placement, contact details, and registration date.
- Live balance breakdown: demanded, charged, discounted, and paid.
- Last five ledger entries.
- Recent audit-history preview.
- Shortcuts to payment, ledger, promotion, charges, and editing.
- ID-card print component.
- Editable personal and contact fields, photo, and current term.
- Required reason for edits.
- Audit entries containing before/after field values.
- Comparison of the stored term with the highest demand term in the ledger.

Course, program, batch, and session are displayed as locked in the edit screen. A student-transfer workflow is mentioned in interface text but is not implemented.

### Strike-off and reinstatement

- Strike-off with reason, date, and optional details; details required for “Other.”
- Outstanding-dues or credit warning before strike-off.
- Existing ledger balance retained after strike-off.
- Reinstatement with a required reason and an audit entry.
- Bulk strike-off from the directory.
- Ledger action buttons disable demands, charges, and promotion for struck-off students.

**Limit:** These restrictions are not consistently enforced in the destination forms. Direct navigation or another entry point can bypass some disabled-button restrictions.

## 7. Fee ledger and accounting

### Balance model

Student balances are calculated from ledger transactions:

```text
Balance = Total fee demands + Total charges - Total discounts - Total payments
```

Charges are currently represented as negative values in the transaction's `discount` field. Positive discounts reduce the amount owed. A positive balance means dues, zero means cleared, and a negative balance means student credit.

### Ledger hub and statement

- Searchable student selection page for opening individual ledgers.
- Student identity, balance, and status displayed before opening the ledger.
- Transactions shown in transaction-number order.
- Transaction date, number, type, description, receipt reference, signed amount, and running balance.
- Summary totals and closing balance.
- Newly posted transaction highlighted briefly after returning to the ledger.
- Printable statement with institute information.
- Links to demands, charges, adjustments, payment, and promotion.

### Add or re-bill a fee demand

- Current term selected by default, with a correction option to change it.
- Session selection and editable narration.
- Fee breakdown from a matching template or fallback to a locked fee.
- Full template fee for the first term and recurring template components for later terms.
- Duplicate demand check by student, term, and session.
- Optional update of the student's current term.
- Ledger-change guard based on transaction count since opening the form.
- Audit entry and return to the highlighted ledger row.

### Add special charges

- Exam fee.
- Clinical training.
- Annual charges.
- Late payment fine.
- Library fine.
- Equipment damage.
- Other/custom charge.

Charges support amount, date, required description, optional receipt reference, duplicate receipt checking, balance preview, ledger-change checking, and audit logging.

### Ledger adjustments

- Correction, write-off, and refund labels.
- Explicit increase/decrease direction.
- Positive amount entry with a balance preview.
- Optional reference to an original transaction number.
- Required reason of at least ten characters.
- Confirmation stating the balance effect.
- Ledger-change guard and audit entry.

**Refund limit:** Choosing “Refund” creates an `Adj` ledger transaction with the selected direction. It does not implement a separate refund payment, expense, or bank withdrawal workflow.

## 8. Individual and batch promotion

### Individual promotion

- Determines the next term from the student's program.
- Displays completion when the final term has been reached.
- Defaults to the student's locked recurring fee, with a template fallback.
- Allows a fee override, session selection, and narration.
- Checks for an existing demand for the target term/session.
- Checks whether the student's ledger changed after the form opened.
- Confirms both the academic change and new demand.
- Posts the demand and updates the student's term and session.
- Records an audit entry.

Target-template annual, clinical, and diploma charges may be displayed as information. They are not automatically added to the default promotion amount; the interface directs operators to add extras through charges.

### Batch promotion / bulk demand

- Select course, program, batch, target term, and session.
- Preview matching students and their individual fee amounts.
- Exclude test records and struck-off students.
- Identify duplicate demands and students without an available fee.
- Select or deselect eligible students.
- Optionally update student terms and sessions.
- Recheck duplicate demands while posting.
- Show posting progress and a completion summary with failure details.
- Preserve an existing locked recurring fee; backfill it when absent.
- Create a batch-level audit entry.

**Limits:** The target term is chosen manually; the bulk workflow does not enforce that it is the next term for every student. A status-name mismatch currently blocks TypeScript compilation. Some completion counts also need correction.

## 9. Payments and receipts

### Record payment

- Search and confirm a student, or preselect one through a URL parameter.
- Show current ledger balance.
- Enter payment amount and an optional discount.
- Require a reason for a positive discount.
- Select Cash, Bank, Online, or Cheque.
- Enter a bank/transaction reference; cheque number required for cheque mode.
- Autofill a receipt number from an available receipt book.
- Check receipt duplication and active receipt-book range.
- Enter optional narration and automatically record the logged-in receiver.
- Preview the resulting balance.
- Confirm when the proposed credit exceeds PKR 10,000.
- Post a payment to the student's ledger.
- Create a bank deposit for non-cash payment.
- Advance the receipt book and add an audit entry.
- Display receipt printing and record-another-payment actions.

Struck-off students remain searchable for payment collection.

### Receipt books

- Book number, start/end range, next number, assigned user, and active status.
- Add new books in Settings.
- Prevent duplicate book names and overlapping ranges through the Settings form.
- Show remaining receipts and exhausted-book status.
- Prefer the user's assigned book, with fallback to another available active book.

**Limits:** Receipt-use checks are incomplete: `isReceiptUsed` is a stub, assignment is not enforced when consuming a receipt, and callers do not handle every failed receipt-consumption result.

### Print and reprint

- Shared payment receipt layouts for thermal 80 mm and A4.
- Institute name, address, phone, student details, receipt number, date, amount, receiver, and signature/stamp areas.
- Optional payment mode, reference, discount, and balance details where supplied.
- Search existing payment receipts by receipt number, student name, or SNO.
- Reprint selected receipts through browser printing.

**Limits:** Reprints infer payment mode from narration and omit historical balances. The record-payment success screen can use an already-updated balance and subtract the payment again. URL-based student preselection can also reset the success step after a ledger update. Print layouts have not been verified against physical printers in this review.

## 10. Fee templates and batches

### Fee templates

- Browse seeded fee templates.
- Filter by course, program, and term.
- Open an existing template or a new-template form.
- Set course, program, term, batch, and session on screen.
- Display eight fee components: admission, tuition, ID card, annual, security, enrollment, diploma, and clinical charges.
- Compute a total from the components.
- Display soft warnings for selected semester-specific fee rules.

**Current status:** The editor's Save action waits briefly and returns to the list. It does not save a template or record a template-change audit event. Admissions and fee workflows read seeded templates.

### Batches

- Create a batch for a program and session.
- Prevent duplicate names within the same program when adding or renaming through the UI.
- Filter batches by program.
- Rename a batch and change its session.
- Enable or disable a batch.
- Confirm disabling a batch that has students.
- Persist batch records in local storage.

**Limit:** Renaming does not update existing students' saved batch names. The edit-student screen does not currently provide the re-linking action described by the batch page's helper text.

## 11. Expenses and budgets

### Expense entry

- Category, amount, date, time, payer/giver, and details.
- Optional bill or receipt image, up to 3 MB.
- Select petty cash or bank as the payment source.
- For bank-funded expenses, automatically create a linked bank withdrawal.
- Optional bank narration.
- Audit entry for expense creation.

### Expense categories

Salaries, food, utility bills, building rent, clinical training, doctor remuneration, faculty payment, fee refund, furniture, electronic equipment, ID cards, stationery, advertisement, and other.

### Expense list and budgets

- Category filter and text search.
- Expense amounts, dates, payer, bank links, and bill-image links.
- Filtered total and CSV export.
- Monthly budget entry per category in Settings.
- Current-month budget versus actual totals and progress bars.
- Links to bank-withdrawal tagging.
- Expenses and budgets persisted in local storage.

**Limits:** The list's reconciliation message compares record counts rather than performing a complete accounting reconciliation. Category budget cards cover only a subset of categories. A voucher-print workflow is not implemented despite bill-upload helper text mentioning vouchers.

## 12. Bank account and expense tagging

### Bank ledger

- Record deposits and withdrawals.
- Date, amount, narration, and personal/non-operational flag.
- Preview the resulting balance and warn about a negative balance.
- Search by narration, transaction number, and date.
- Show or hide personal transactions.
- Display deposits, withdrawals, stored balance, and tagged/untagged status.
- Summary figures and untagged-withdrawal count.
- CSV export.
- CSV import with flexible header recognition, preview, and template download.

### Expense tagging

- Find bank withdrawals without an expense link.
- Find expenses without a bank link.
- Select and stage matching pairs.
- Save links in both bank and expense records.
- Mark unmatched withdrawals as personal.
- Record audit entries for saved changes.

**Limits:** Matching is manual and does not require equal amounts. Bank balances are stored values and are not fully reconstructed or validated from transaction history. The “current balance” summary follows the last filtered row, so searching can change it. Bank settings are editable, but several screens still display hardcoded bank constants.

## 13. Audit trail

- Activity table with timestamp, user, action, student number, and details.
- Search and filters for action and user.
- Newest-first or oldest-first ordering.
- Expand field-level before/after changes for student edits.
- Entries produced by several student, ledger, payment, expense, and bank operations.
- No edit or delete controls for audit entries.

**Limits:** Audit data exists only in memory and resets when the application reloads. Logging is not complete for all actions, including login, simulated sync, and some settings/batch changes. There is no durable or tamper-resistant audit backend.

## 14. Reports catalog

The interface lists the following 16 reports:

| Group | Reports listed |
| --- | --- |
| Daily | Daily Cash Collection; Fee Register (Print Format) |
| Fees | Active Fee Defaulters; Struck Off Students with Dues; Students with Credit Balance; Student Full Fee Statement; Program-wise Collection Summary; Discount Summary |
| Students | Student List (Program-wise); Struck Off Students; Admission Register |
| Expenses | Expense Summary by Category; Monthly Expense Report |
| Bank | Bank Statement; Personal Transactions Report |
| Sync | Pending Sync Log |

**Current status:** This is a catalog with descriptions and print/download icons. Report-specific filters, generation, printing, and downloads are not connected. Existing ledger printing and CSV exports on other pages are separate implemented features.

## 15. Data migration wizard

The migration page presents six stages:

1. Import students.
2. Import fee templates.
3. Map ledger entries to students.
4. Import bank ledger.
5. Import expenses.
6. Verify and confirm.

The page displays sample record counts, progress, warnings, and a completion summary. Its text describes legacy-ID mapping, CNIC normalization, test-record detection, fee validation, balance verification, and expense matching.

**Current status:** These migration operations are simulated. The wizard does not read or import files into the stores. It is separate from the implemented student-directory and bank CSV import handlers.

## 16. Settings, sync, and backup

### Settings that update local application preferences

- Institute name, address, and phone.
- Bank name and account number.
- Default receipt paper size: A4 or 80 mm.
- Show/hide test records.
- Receipt-book creation.
- Monthly expense budgets.

### Demonstration or inactive settings

- Server URL and API/device token fields: component state only.
- Test Connection: always reports success after a timer.
- Sync Now: updates visual status after a timer without transferring records.
- View Sync Log: no implemented action.
- Default printer display: sample printer name.
- Test Print: no implemented action.
- Recalculate balances: no implemented action.
- Rename unknown expense categories: no save implementation.
- Auto-backup schedule and last-backup display: static text.
- Backup Now, Restore, and Open Backup Folder: no implemented actions.
- Check for Updates: no implemented action.

The interface describes offline-first storage and synchronization, but no SQLite database, remote API, conflict-resolution service, or working sync queue is present.

## 17. Current data storage

| Data | Current storage | Survives application reload? |
| --- | --- | --- |
| Students and locked fees | Zustand memory, seeded from mock data | No |
| Ledger transactions | Zustand memory, seeded from mock data | No |
| Bank transactions and bank-side expense links | Zustand memory, seeded from mock data | No |
| Audit history | Zustand memory, seeded from mock data | No |
| Expenses and expense-side bank links | Zustand with local-storage persistence | Yes, in the same browser/app storage |
| Batches | Zustand with local-storage persistence | Yes, in the same browser/app storage |
| Budgets | Zustand with local-storage persistence | Yes, in the same browser/app storage |
| Receipt books and next numbers | Zustand with local-storage persistence | Yes, in the same browser/app storage |
| Institute, bank, and display settings | Zustand with local-storage persistence | Yes, in the same browser/app storage |
| Login state | Zustand with local-storage persistence | Yes, in the same browser/app storage |
| Fee templates | Seeded source-code constants | Editor changes are not saved |
| Sync state and temporary UI state | Memory | No |

Local storage is specific to the browser origin or desktop app environment. It does not synchronize between devices. Mixed persistence means, for example, a receipt book can retain an advanced number while the related payment disappears after reload, or an expense can retain a link to a bank entry that no longer exists.

## 18. Main workflows

### Admit a student

```text
Personal details -> Academic placement -> Fee review and concession
-> Confirm admission -> Create student -> Post initial demand
-> Optional payment and receipt -> Optional bank deposit -> Audit entries
```

### Collect a payment

```text
Find student -> Confirm identity -> Enter payment/discount/mode/receipt
-> Validate -> Post payment -> Advance receipt book
-> Create bank deposit for non-cash mode -> Print receipt
```

### Promote a student

```text
Open student -> Determine next term -> Review recurring fee/session
-> Confirm -> Post demand -> Update term/session -> Audit entry
```

### Record a bank-funded expense

```text
Enter expense -> Select bank source -> Create bank withdrawal
-> Create linked expense -> Audit entry -> View expense list
```

These operations currently perform separate store updates. There is no database transaction providing atomicity across the related records.

## 19. Technical structure and delivery targets

| Area | Implementation |
| --- | --- |
| Frontend | React 19 and TypeScript |
| Build and development | Vite |
| Routing | React Router; hash routing for `file:` protocol, browser routing otherwise |
| State | Zustand |
| Forms | React Hook Form and Zod in admissions; manual validation elsewhere |
| Styling | Tailwind CSS, custom UI components, Radix Select, Lucide icons |
| Date utilities | date-fns and native Date |
| Electron | Desktop browser window loading Vite or built files; Windows NSIS configuration |
| Tauri | Rust application wrapper and logging plugin |
| Web hosting configuration | Vercel SPA rewrite configuration |
| Printing | Browser print API and CSS print layouts |

Both desktop wrappers currently host the frontend. Neither implements the application's database, financial services, or synchronization backend. Packaging configuration is present; successful desktop distribution was not verified in this review.

### Main source areas

- `src/App.tsx`: routes and access wrappers.
- `src/pages/`: module screens and most business-operation handlers.
- `src/stores/`: application state and persistence choices.
- `src/types/index.ts`: shared data models.
- `src/lib/balance.ts`: ledger balance calculations.
- `src/lib/promotion.ts`: fee splitting and promotion helpers.
- `src/lib/constants.ts`: courses, programs, terms, categories, and rules.
- `src/lib/schemas.ts`: form-validation schemas.
- `src/lib/mockData.ts`: seeded development records.
- `src/components/`: layout, search, UI, ledger, student, and print components.
- `electron/`: Electron launcher.
- `src-tauri/`: Tauri wrapper and build configuration.

## 20. Screen and route inventory

| Route | Screen |
| --- | --- |
| `/login` | Login |
| `/` | Redirect to dashboard |
| `/dashboard` | Dashboard |
| `/students` | Student directory |
| `/students/:sno` | Student profile |
| `/students/:sno/edit` | Edit student |
| `/admissions/new` | Admission wizard |
| `/ledger` | Student ledger selection |
| `/ledger/:sno` | Student fee ledger |
| `/ledger/:sno/add-demand` | Add/re-bill demand |
| `/ledger/:sno/add-charge` | Add special charge |
| `/ledger/:sno/adjust` | Ledger adjustment |
| `/ledger/:sno/promote` | Individual promotion |
| `/ledger/bulk-demand` | Batch promotion / bulk demand |
| `/payments/record` | Record payment |
| `/payments/reprint` | Receipt reprint |
| `/fee-templates` | Fee template list and editor |
| `/batches` | Batch management |
| `/expenses` | Expense list and budget comparison |
| `/expenses/add` | Add expense |
| `/expenses/tag-from-bank` | Link bank withdrawals and expenses |
| `/bank` | Bank ledger and CSV import |
| `/bank/add` | Add deposit or withdrawal |
| `/audit` | Audit trail |
| `/reports` | Reports catalog |
| `/import` | Demonstration migration wizard |
| `/settings` | Settings |

## 21. Verification and known implementation gaps

The source review and checks on 9 October 2026 found:

- **Build fails:** `BulkFeeDemand.tsx` compares the preview status to `no-template`, although the status union contains `ready`, `duplicate`, and `no-fee`.
- **Lint fails:** 49 errors and 1 warning in the reviewed working tree. Findings include conditional hooks, explicit `any` types, unused values, and React tooling rules.
- **Core records are not durable:** Students, payments, ledger entries, bank data, and audits reset on reload.
- **Payment success needs correction:** Receipt balances and the preselected-student effect can behave incorrectly after posting.
- **Fee rules are not fully consistent:** Template matching omits batch/session in important paths, and displayed promotion extras are not automatically included in the demand.
- **Validation is uneven:** Some direct routes and import paths bypass protections applied elsewhere in the interface.
- **Cross-module updates are not atomic:** A multi-record operation has no database rollback mechanism.
- **No automated test suite was found:** There is no test script in the package configuration and no application test files were found during the review.

The existing design documents describe intended behavior beyond what is implemented. Where they differ, this scope document follows the current code.

## 22. Features outside the current implemented scope

The reviewed application does not currently implement:

- Attendance tracking.
- Class timetables or room scheduling.
- Teacher/faculty record management.
- Examination scheduling, marks, grades, or transcripts.
- Learning management or course content delivery.
- Student or parent self-service portals.
- Multiple operational roles such as Principal, Accountant, or Teacher.
- Full payroll processing; salary is currently an expense category.
- Library inventory and lending; library fine is currently a charge label.
- Hostel, transport, or inventory management.
- Online payment-gateway processing; payment modes currently record manual entries.
- SMS, email, or WhatsApp notifications.
- Student transfers, graduation processing, or certificate issuance.
- Multi-campus administration.
- Production authentication, database storage, multi-device sync, or backup/restore.

These exclusions describe the present implementation and do not establish commitments for future development.
