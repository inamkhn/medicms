# MediCMS Desktop: Frontend Design

**Document type:** Frontend (UI/UX) design
**Version:** Draft 2
**Date:** 9 October 2026
**Covers:** Login and Access, Dashboard, Students Module, Fee Templates, New Admission, Fee Operations, Day Closing, Backup and Restore
**Based on:** `LOGIN_DASHBOARD_STUDENTS_DESIGN.md` and `FEE_TEMPLATES_AND_ADMISSION_DESIGN.md`
**Stack kept:** React 19, TypeScript, Vite, React Router, Zustand, React Hook Form with Zod, Tailwind CSS, Radix UI, Lucide icons

---

## Changes in Draft 2

This draft folds in the review of Draft 1.

| Area | Change |
| --- | --- |
| Recovery | Recovery sheet screen at setup, second-Admin banner, and sign-in with a recovery code (section 5). |
| Overdue | Overdue badge, days overdue and ageing bar on the dashboard, directory and profile. |
| Student status | Completed and On leave statuses, tabs and badges. |
| Concessions | Concession editor in the admission fee plan, with template amounts staying visible (section 13). |
| Templates | Version tag, terms per year, due rule and a Refundable column (section 12). |
| Fee operations | Allocation picker, change fee plan, void receipt, cancel admission and refund screens (section 14). |
| Day closing | New cash closing screen (section 15). |
| Backup | Backup status, restore dialog and recovery sheet (section 16). |
| Samples | Dashboard and directory samples corrected so the same student has the same balance everywhere. |

---

## 1. Design principles

| Principle | What it means on screen |
| --- | --- |
| **Numbers first** | Balances, dues and totals are the largest, clearest items. |
| **Every number is a link** | Clicking a figure opens the list behind it. |
| **Calm and dense** | Compact tables for office use, with plenty of white space around groups, not inside rows. |
| **Safe by default** | Risky actions show a summary of their effect before confirming, and ask for a reason. |
| **Keyboard first** | The counter operator can admit, search and take a payment without the mouse. |
| **One pattern everywhere** | Lists, filters, forms, dialogs and messages behave the same in every module. |
| **Never colour alone** | Dues, credit and status always have a word or icon as well as a colour. |

---

## 2. Design system

### 2.1 Colours

| Token | Value | Use |
| --- | --- | --- |
| `brand-600` | `#0F766E` (teal) | Primary buttons, active navigation, links |
| `brand-50` | `#F0FDFA` | Selected rows, active nav background |
| `bg` | `#F8FAFC` | Page background |
| `surface` | `#FFFFFF` | Cards, tables, dialogs |
| `border` | `#E2E8F0` | Dividers, input borders |
| `text` | `#0F172A` | Main text |
| `muted` | `#64748B` | Secondary text, captions |
| `danger` | `#DC2626` on `#FEF2F2` | Dues, errors, destructive actions |
| `success` | `#16A34A` on `#F0FDF4` | Paid, active, success messages |
| `warning` | `#D97706` on `#FFFBEB` | Alerts, drafts, approvals needed |
| `info` | `#2563EB` on `#EFF6FF` | Credit, information banners |

A dark theme can follow later. All colours are defined as tokens so it can be added without redesigning screens.

### 2.2 Typography

| Style | Size / weight | Use |
| --- | --- | --- |
| Page title | 20 / 600 | One per page |
| Section title | 16 / 600 | Card and section headings |
| Body | 14 / 400 | Forms, text |
| Table | 13 / 400 | Dense lists |
| Caption | 12 / 400 | Hints, helper text, timestamps |
| Big number | 28 / 600 | Dashboard figures |

Font: Inter, with a system fallback. **All money and number columns use tabular figures** so digits line up.

### 2.3 Spacing, shape and layout

- 4 px base unit. Common gaps: 8, 12, 16, 24.
- Corner radius 8 px for cards and inputs, 6 px for buttons and badges.
- Table rows 40 px (compact: 32 px).
- Page content max width 1440 px, centred, with 24 px side padding.
- Main grid: 12 columns, 16 px gutter.

### 2.4 Money and status display

| Item | Format |
| --- | --- |
| Amount | `23,000` in tables. `PKR 23,000` in summaries and receipts. Right-aligned. |
| Dues | Red text with the word **Due**: `23,000 Due` |
| Credit | Blue text with **Cr**: `2,000 Cr` |
| Cleared | Grey `0` with the word **Clear** |
| Dates | `9 Oct 2026`. Time as `11:42 AM`. Always local time. |
| Overdue | Red text with the word **Overdue** and the days: `17,000 Overdue 267d` |
| Due date | `Due 23 Oct 2026`. Turns red once it has passed and an amount is unpaid. |

### 2.5 Status badges

| Badge | Colour | Where |
| --- | --- | --- |
| Active | Green | Student, template |
| Struck off | Grey with red text | Student |
| Draft | Amber | Template |
| Archived | Grey | Template |
| Partly paid | Amber | Term row |
| Paid | Green | Term row |
| Upcoming | Grey outline | Term row |
| Needs approval | Amber | Concession |
| Overdue | Red | Fee charge or student, with days overdue |
| Completed | Blue-grey | Student |
| On leave | Amber outline | Student |
| Void | Grey, struck through | Receipt |
| Closed | Green | Day closing |

---

## 3. Component library

| Component | Notes |
| --- | --- |
| `Button` | Variants: primary, secondary, ghost, danger. Sizes: sm, md. Loading state. |
| `MoneyInput` | Numeric only, thousands separators as you type, right-aligned, `PKR` prefix. |
| `CnicInput`, `PhoneInput` | Auto-format as typed (`35202-1234567-1`, `0300-1234567`). |
| `Select` / `Combobox` | Radix based. Combobox for long lists (students, templates). |
| `DatePicker` | Local dates. Blocks future dates where required. |
| `FormField` | Label, control, hint and error in one place. Error shown on blur and on submit. |
| `ReasonField` | Dropdown category plus note. Used for concessions, edits, strike-off. |
| `DataTable` | Sortable headers, sticky header, row selection, column chooser, empty and loading states. |
| `FilterBar` | Search plus filter chips plus "Clear all". Syncs with the page address. |
| `StatCard` | Label, big number, optional sub-text, whole card is a link. |
| `AmountCell` | Applies the money display rules above. |
| `StatusBadge` | The badges above. |
| `Stepper` | Horizontal wizard steps with done, current and error states. |
| `Tabs` | Underlined tabs with optional count. |
| `Drawer` | Right-side panel for quick edits. |
| `Dialog` | Centered modal. |
| `ConfirmSummaryDialog` | Dialog showing an effect summary table and a confirm button (bulk strike-off, import). |
| `Banner` | Inline message: info, warning, danger, success. |
| `Toast` | Short confirmation, bottom right, 4 seconds. |
| `EmptyState` | Icon, one sentence, one button. |
| `Skeleton` | Placeholder shapes while loading. |
| `Avatar` | Student photo, with initials fallback. |
| `KbdHint` | Small key label, such as `F3`. |
| `PermissionGate` | Hides or disables its children when the user lacks permission. |
| `ConcessionEditor` | Small form for one concession record: kind, value, applies to, reason. |
| `AllocationPicker` | Chooses which fee charge a payment pays, with a live before and after preview. |
| `AgeingBar` | Horizontal bar showing not-yet-due and overdue buckets. |
| `CashCountSheet` | Optional count of notes and coins that totals into counted cash. |
| `BackupStatusChip` | Status bar chip: green, amber or red with the last backup time. |
| `RecoveryCodeCard` | Shows the recovery code and backup passphrase with Print and Save as PDF. |
| `TemplateVersionTag` | Small tag such as `v3` beside a template name. |

---

## 4. Application shell

```text
+---------+----------------------------------------------------------+
| MediCMS | [Search students, receipts...   F3]     Saba N. v  [Lock] |
|         +----------------------------------------------------------+
| MAIN    |                                                          |
|  Dashboard                                                         |
|  Students       Page content area                                  |
|  Admissions                                                        |
| FINANCE                                                            |
|  Payments                                                          |
|  Ledger                                                            |
|  Day closing                                                       |
|  Expenses                                                          |
|  Bank                                                              |
| OPERATIONS                                                         |
|  Fee templates                                                     |
|  Batches                                                           |
| REPORTS                                                            |
| SYSTEM                                                             |
|  Audit trail                                                       |
|  Settings (Users, Backup)                                          |
| [<<]    +----------------------------------------------------------+
|         | Saba N. (Accountant) | Book 1: 8 left | Backup: today 6:02 PM | 11:42 AM |
+---------+----------------------------------------------------------+
```

| Part | Size and behaviour |
| --- | --- |
| Sidebar | 240 px wide, collapses to 64 px icons. Groups come from the user's role, so a counter operator never sees Bank or Settings. |
| Header | 56 px. Global search box, account menu (change password, sign out), Lock button. |
| Status bar | 28 px. User and role, active receipt book with remaining count, backup status chip (Admin and Accountant only), current time. The sync indicator is removed until sync exists. |
| Breadcrumb | Shown on deep pages (`Students / Ayesha Khan / Edit`). |
| Banners | A single banner row under the header for system messages, such as "Create a second Admin so you cannot be locked out." |

The account menu shows the signed-in name and role. The Lock button locks immediately.

---

## 5. Login and access screens

### 5.1 First-run setup

```text
+--------------------------------------------------+
|              Set up your institute               |
|  Create the first administrator account.         |
|                                                  |
|  Institute name   [______________________]       |
|  Your full name   [______________________]       |
|  Username         [______________________]       |
|  Password         [______________________] (eye) |
|  Confirm password [______________________]       |
|  Password strength: ###---  at least 8 chars     |
|                                                  |
|                        [ Create and continue ]   |
+--------------------------------------------------+
```

- Shown only when there are no users.
- Live password rules checklist.
- After creation the user goes straight to the dashboard.

### 5.2 Sign in

```text
+--------------------------------------------------+
|                 [institute logo]                 |
|             Al-Shifa Medical Institute           |
|                                                  |
|  Username  [______________________]              |
|  Password  [______________________] (eye)        |
|                                                  |
|  ! Username or password is incorrect.            |
|                                                  |
|  [ Sign in ]                                     |
|  Forgot password? Ask your administrator.        |
+--------------------------------------------------+
```

- Centered card on a plain `bg` background.
- Enter submits. Focus starts in Username.
- After 5 failures: "Too many attempts. Try again in 4:59" with a countdown, and the button is disabled.
- A disabled account shows a danger banner instead of the generic error.
- **Forgot password?** opens a small dialog: "Ask your administrator to reset it, or use your recovery code." The recovery code route asks for the code and a new password.

### 5.3 Lock screen

```text
+--------------------------------------------------+
|                 [avatar] Saba Noor               |
|                 Screen locked                    |
|        Password [______________________]         |
|                  [ Unlock ]                      |
|             Sign in as someone else              |
+--------------------------------------------------+
```

- The page behind is replaced by a plain background, so no student data is visible.
- Appears after the inactivity time, or when Lock is pressed.

### 5.4 Users page (Settings, Admin only)

```text
Users                                         [+ Add user]
+--------------------------------------------------------------+
| Name           Username  Role              Status   Last in  |
| Dr. Imran Shah imran     Admin             Active   Today    |
| Saba Noor      saba      Accountant        Active   Today    |
| Kamran Ali     kamran    Counter operator  Active   Today    |
| Old Staff      oldstaff  Counter operator  Disabled 3 Jun    |
+--------------------------------------------------------------+
Row menu: Edit | Reset password | Disable
```

The add/edit form opens in a **drawer** with name, username, role, receipt book and status. "Reset password" shows the temporary password once, in a dialog with a Copy button.

### 5.5 No permission page

A full-page message: "You don't have access to this page." with a button back to the dashboard. Shown when a user types an address they cannot open.

### 5.6 Recovery sheet

Shown once at the end of first-run setup, and again whenever an Admin generates a new sheet from Settings.

```text
+--------------------------------------------------+
|            Save your recovery sheet              |
|  You need this if every password is lost, or     |
|  when restoring a backup on a new computer.      |
|                                                  |
|  Recovery code       7QK2-M9XD-4TLB-R8WP         |
|  Backup passphrase   gentle-river-copper-47      |
|                                                  |
|        [ Print ]   [ Save as PDF ]               |
|                                                  |
|  [ ] I have stored this sheet safely             |
|                              [ Continue ]        |
+--------------------------------------------------+
```

- Continue stays disabled until the box is ticked.
- The code and passphrase are never shown again. Generating a new sheet replaces both.

### 5.7 Second Admin banner

A warning banner under the header, shown to the Admin until a second Admin exists: "Create a second Admin so you cannot be locked out." with an **Add Admin** button that opens the Users drawer.

---

## 6. Global search (command palette)

Opens with **F3** or **Ctrl+K**.

```text
+--------------------------------------------------+
| [ayesha____________________________]       Esc   |
+--------------------------------------------------+
| ACTIONS                                           |
|  > New admission                       Ctrl+N     |
|  > Record payment                      Ctrl+P     |
| STUDENTS                                          |
|  [photo] Ayesha Khan  SNO 1042  BSN T1  23,000 Due|
|  [photo] Ayesha Malik SNO 0877  CMW Y1  Clear     |
| RECEIPTS                                          |
|  R-1051  Ayesha Khan  30,000  9 Oct 2026          |
+--------------------------------------------------+
| Up/Down to move   Enter to open   Esc to close    |
+--------------------------------------------------+
```

- Grouped results, arrow keys to move, Enter to open.
- Student result shows photo, SNO, program, balance.
- A receipt result opens the reprint page with that receipt already selected.
- CNIC and phone searches ignore dashes and spaces.

---

## 7. Dashboard screen

### 7.1 Grid

```text
Row 1  [ Greeting + date ]       [ Session selector ] [Print summary]
Row 2  [ Today: Collected | Receipts | Cash | Bank/Online/Cheque ]   (4 cards, 3 cols each)
Row 3  [ Students (4) ] [ Fees (4) ]            [ Money (4) ]
Row 4  [ Needs attention (12) ]
Row 5  [ Top defaulters (7) ]                   [ Today's payments (5) ]
Row 6  [ Quick actions (12) ]
```

### 7.2 Wireframe

```text
Good morning, Saba         Friday, 9 October 2026   Session [All v]  [Print summary]

+----------------+----------------+----------------+------------------+
| Collected today| Receipts       | Cash           | Bank/Online/Chq  |
| 187,500        | 14             | 112,500        | 75,000           |
+----------------+----------------+----------------+------------------+

+-- Students ---------+  +-- Fees --------------------+  +-- Money ---------------+
| Active        412 > |  | Outstanding    2,845,000 > |  | Bank balance 1,260,000 >|
| On leave        5 > |  |  of which overdue 1,930,000 >|  | Expenses (Oct) 385,000 >|
| Completed      61 > |  | Struck-off dues  410,000 > |  | Budget used  71% [====-]|
| Struck off     38 > |  | Credit held       64,000 > |  | Last backup Today 6:02 PM|
| Total         516   |  | Collected (Oct) 1,420,000  |  +-------------------------+
+---------------------+  +----------------------------+

+-- Needs attention ---------------------------------------------------------+
| (!) 12 bank withdrawals not linked to an expense               [Review]     |
| (!) Yesterday (8 Oct) was not closed with a cash count        [Close day]   |
| (!) Receipt Book 1 has 8 receipts left                         [Open]       |
| (!) 23 students have no fee charge for their current term      [View]       |
| (!)  5 struck-off students still have dues                      [View]       |
+-----------------------------------------------------------------------------+

+-- Top defaulters (by overdue) -------------+  +-- Today's payments ----------+
| Bilal Ahmed     BSN T3    78,000 Overdue 267d|  | R-1051 Ayesha Khan    30,000 |
| Hina Raza       BSN T5    64,500 Overdue 62d |  | R-1052 Faisal Mehmood 12,500 |
| Faisal Mehmood  PNC Y1    52,000 Overdue 45d |  | R-1053 Mehwish Anwar  28,000 |
| Mehwish Anwar   Rad. T2   47,500 Overdue 33d |  | View all receipts >          |
| Taha Siddiqui   BSN T1    45,000 Overdue 12d |  +------------------------------+
| View all defaulters >                      |
+--------------------------------------------+

Quick actions: [New admission] [Record payment] [Search] [Reports] [Batch promotion] [Batches]
```

The days shown are how long the oldest unpaid charge has been overdue.

### 7.3 Behaviour

| Element | Behaviour |
| --- | --- |
| Stat cards | Whole card is a link (`>`), with a hover lift and focus ring. |
| Needs attention | Only items with a count above zero. Empty state: a green tick and "Nothing needs attention." |
| Loading | Skeleton cards, never a blank page. |
| Counter operator view | Row 3 and Money card hidden. Today's row shows only their own receipts. |
| Period | The Session selector filters student and fee cards. Money cards are not filtered by session. |
| Backup | The Money card shows the last backup time. It turns amber after 2 days and red after 3 days, for Admin and Accountant only. |
| Print | Opens the Daily Summary layout (section 17). |

---

## 8. Students directory

### 8.1 Wireframe

```text
Students                                  [Import] [Export v] [+ New admission]
(i) 1 admission draft in progress.  [Open]          <- only when a draft exists

[ Search name, SNO, CNIC, phone...                      ]  [Saved views v]
[Course v] [Program v] [Batch v] [Session v] [Term v] [More filters v]  Clear all

All 516 | Active 412 | With dues 187 | Overdue 141 | Credit 14 | On leave 5 | Completed 61 | Struck off 38
-------------------------------------------------------------------------------------------
[ ] SNO   Student                 Program      Term  Phone       Balance         Last paid   Status
[ ] 1042  [ph] Ayesha Khan        BSN Fall 26   1    0300-...    23,000 Due      9 Oct 2026  Active    ...
          d/o Imtiaz Khan
[ ] 0987  [ph] Bilal Ahmed        BSN Spr 25    3    0321-...    78,000 Overdue  12 Aug 2026 Active    ...
[ ] 0512  [ph] Usman Tariq        LHV 2025      Y1   0333-...     2,000 Cr       1 Oct 2026  Active    ...
-------------------------------------------------------------------------------------------
Showing 1-20 of 412        Rows: [20 v]                              < 1 2 3 ... 21 >
```

Row hover shows quick actions at the right: **Profile**, **Ledger**, **Take payment**, **Edit**. The tab strip scrolls sideways on narrow windows.

### 8.2 More filters panel

A popover with: balance range (min, max), registration date (from, to), overdue age (Any, 1 to 30, 31 to 60, 61 to 90, over 90 days), and a checkbox "No fee charge for current term". Active filters appear as removable chips under the filter row.

### 8.3 Selection and the bulk bar

When rows are ticked, the toolbar is replaced by a **bulk bar**:

```text
12 selected   [Export] [Print list] [Print ID cards] [Batch promotion] [Strike off]   Clear
```

After ticking the header box:

```text
All 20 students on this page are selected.  [Select all 186 students matching this filter]
```

### 8.4 Column chooser

A "Columns" button above the table opens a checklist of columns. The choice is remembered per user.

### 8.5 Saved views

A dropdown listing the user's saved views, with "Save current view" at the bottom. Choosing one restores filters, sort and columns.

### 8.6 States

| State | Display |
| --- | --- |
| Loading | 8 skeleton rows. |
| No students at all | EmptyState: "No students yet." Button: New admission. |
| No match | EmptyState: "No students match these filters." Button: Clear filters. |
| Error | Danger banner with Retry. |

### 8.7 Bulk strike-off dialog

```text
+-------------------------------------------------+
| Strike off 12 students?                          |
|                                                  |
|  Students selected     12                        |
|  Total dues            340,000                   |
|  Total credit           15,000                   |
|                                                  |
|  Reason *   [Non-payment of fees v]              |
|  Details    [__________________________]        |
|  Date       [9 Oct 2026]                         |
|                                                  |
|  ! Struck-off students cannot receive new fee    |
|    charges or promotion. Payments still allowed. |
|                                                  |
|            [Cancel]   [Strike off 12 students]   |
+-------------------------------------------------+
```

After confirming, a toast shows "12 students struck off. **Undo**" for 10 seconds. Undo reinstates all 12.

---

## 9. Import wizard

A full page with a stepper: **Upload, Review, Duplicates, Import, Done**.

### 9.1 Upload

```text
Import students
Step 1 of 5  [Upload]--[Review]--[Duplicates]--[Import]--[Done]

+-----------------------------------------------+
|   Drop a CSV file here, or [Choose file]      |
|   Need the format?  [Download template]       |
+-----------------------------------------------+
Columns are explained in a collapsible "What columns are needed?" section.
```

### 9.2 Review

```text
Summary:  3 rows   Ready 1   Duplicate 1   Error 1

Filter: [All] [Ready] [Duplicate] [Error]
+----+--------------+-----------+----------------------------------------+
| #  | Name         | Status    | Message                                 |
| 1  | Maryam Iqbal | Ready     | Opening balance 18,000 will be posted   |
| 2  | Ali Raza     | Error     | Phone number is not valid               |
| 3  | Ayesha Khan  | Duplicate | CNIC matches SNO 1042                   |
+----+--------------+-----------+----------------------------------------+
[Download error report]                    [Back]  [Continue]
```

Rows with errors cannot be imported, but the user can continue with the rest.

### 9.3 Duplicates

For each duplicate row: both records side by side, with radio choices **Skip**, **Update existing**, **Create anyway**. "Create anyway" asks for a reason.

### 9.4 Confirm and result

A `ConfirmSummaryDialog` shows "Import 1 student, skip 1, 1 failed." After importing, the Done page shows the counts and a button to open the new students in the directory (filtered to "added today"). An **Undo this import** button (Admin only) is offered while none of the imported students has had other activity.

---

## 10. Student profile

### 10.1 Wireframe

```text
< Students

+---------------------------------------------------------------------+
| [photo]  Ayesha Khan                      SNO 1042      [Active]      |
|          d/o Imtiaz Khan                                              |
|          BS Nursing, BSN, Fall 2026, Term 1            23,000 Due     |
|                                                                       |
| [Take payment] [Ledger] [Promote] [Add charge] [Edit]  [More v]       |
+---------------------------------------------------------------------+
| (!) No fee plan. Add one before promotion.      <- alert, if needed   |
+---------------------------------------------------------------------+
| Overview | Fees | Ledger and receipts | Personal | Documents | History |
+---------------------------------------------------------------------+
```

The **More** menu holds: Print ID card, Print statement, Change fee plan, Cancel admission, Refund credit, Mark as completed, Put on leave, Strike off or Reinstate, Add adjustment. Items the user may not use are hidden.

### 10.2 Overview tab

```text
+-- Fee summary ------------------------------------------------------------+
| Total agreed  Concessions  Paid      Due now   Overdue   Next fee           |
| 77,000        -24,000      30,000    23,000    0         Term 2: 38,000     |
+----------------------------------------------------------------------------+
+-- Term by term -----------------------------------------------------------+
| Term | Charged | Concessions | Paid   | Due    | Due date    | Status        |
| 1    | 77,000  | -24,000     | 30,000 | 23,000 | 23 Oct 2026 | Partly paid   |
| 2-8  | not yet billed                                       | Upcoming      |
+----------------------------------------------------------------------------+
+-- Ageing (shown only when something is overdue) --------------------------+
| Not yet due | 1-30 days | 31-60 | 61-90 | Over 90 days                     |
| [=========][======][     ][=====][====]                                    |
+----------------------------------------------------------------------------+
+-- Recent ledger (5) ---------------+  +-- Recent activity -----------------+
| 9 Oct  Payment R-1042   -30,000    |  | 9 Oct  Admission   Kamran Ali      |
| 9 Oct  Concession       -9,000     |  | 9 Oct  Payment     Kamran Ali      |
| ...                                |  | View history >                     |
+------------------------------------+  +------------------------------------+
```

The ageing bar appears only for students with an overdue amount. Each segment shows its amount on hover and in a small label.

### 10.3 Other tabs

| Tab | Display |
| --- | --- |
| Fees | Fee plan table (component, template amount, concession, student amount, applies to, reason), template version tag, term-by-term table with due dates, and a **Change fee plan** button. |
| Ledger and receipts | Ledger table with running balance, date range filter, Print statement, receipt reprint links, **Void receipt** (Accountant and Admin) and refund entries. Voided receipts show a Void badge. |
| Personal | Two-column read-only details with an Edit button: identity, contact, guardian, previous education, council registration number and roll number. |
| Documents | Placeholder: "Document upload is coming in a later release." |
| History | Audit entries, newest first, expandable rows showing old and new values. |

### 10.4 Behaviour

- The header stays visible when scrolling (sticky, compact version).
- Balance in the header uses the money display rules and links to the Ledger tab.
- Alerts: struck off (danger), overdue amount with days (danger), no fee plan (warning), no fee charge for current term (warning), term differs from ledger (warning), on leave or completed (info).
- A struck-off student shows a grey banner with the reason and date, and the Promote and Add charge buttons are disabled with a tooltip explaining why.
- `Esc` goes back to the previous list, keeping its filters.

---

## 11. Edit student

Opens as a **drawer** from the profile (right side, 480 px).

```text
Edit student                                     [x]
-------------------------------------------------
Name *          [Ayesha Khan_________]
Father's name * [Imtiaz Khan_________]
CNIC *          [35202-3333333-5_____]
Phone *         [0300-7654321________]
Address         [____________________]
Date of birth   [____________________]
Gender          [Female v]
Domicile        [____________________]
Emergency       [____________________]
Photo           [change photo]
Guardian        [____________________]
Guardian phone  [____________________]
Previous educ.  [____________________]
Council reg. no [______________]  Roll no [________]
Current term    [1 v]  Ledger shows term 1 charged.
-------------------------------------------------
Locked: Course, Program, Batch, Session
-------------------------------------------------
Reason for change *  [Parent gave new number v]
Note                 [____________________]
              [Cancel]            [Save changes]
```

- Changed fields get a small dot, so the user can see what will be saved.
- Save is disabled until there is a change and a reason.
- A CNIC change runs the duplicate check as the user leaves the field.
- Admin only: a "Correct batch or session" link opens a separate dialog with a required reason.

### Strike-off dialog (single student)

Shows the student's balance as a banner at the top ("This student has dues of 78,000"), then reason, details, date, and a danger-coloured confirm button. Reinstatement uses the same layout with a reason field and an optional re-admission fee line. If the student has credit, the dialog offers **Refund credit**. **Mark as completed** and **Put on leave** use the same layout, with a reason and, for leave, an expected return date.

---

## 12. Fee templates

### 12.1 List

```text
Fee templates                                                  [+ New template]
[Course v] [Program v] [Session v] [Status v]
+-------------------------------------------------------------------------------+
| Name      Course      Program Session Batch Status  Ver  Course total  Used by |
| BSN 2026  BS Nursing  BSN     2026    All   Active  v1   484,000       41      |
| BSN 2025  BS Nursing  BSN     2025    All   Active  v3   468,000       96      |
| Rad 2026  Paramedics  Radio.  2026    All   Draft   -    130,500        0      |
+-------------------------------------------------------------------------------+
Row menu: Open | Duplicate to new session | Archive
```

### 12.2 Editor

```text
< Fee templates
BSN 2026  [v1]                      [Draft]        [Save draft] [Activate]
Course [BS Nursing v]  Program [BSN v]  Session [2026 v]  Batch [All v]
Terms per year: 2 (from program)    Pay within: [14] days (admission) [15] days (later)
-----------------------------------------------------------------------
COMPONENTS                                         | TERM-BY-TERM PREVIEW
Name         Amount  Charged           From To Ref | Term 1     77,000
Admission    15,000  Admission only      -   - [ ] | Term 2     47,000
ID card       1,000  Admission only      -   - [ ] | Term 3     61,000
Security     10,000  Admission only      -   - [x] | Term 4     55,000
Tuition      45,000  Every term          -   - [ ] | Term 5     61,000
Clinical      8,000  Every term          3   - [ ] | Term 6     55,000
Annual        6,000  Every new year      -   - [ ] | Term 7     61,000
Promotion     2,000  On promotion        -   - [ ] | Term 8     67,000
Degree fee   12,000  Last term only      -   - [ ] | -------------------
[+ Add component]                                  | Course total   484,000
                                                   | Refundable      10,000
                                                   | Non-refundable 474,000
```

`Ref` is the **Refundable** checkbox.

| Behaviour | Detail |
| --- | --- |
| Rows | Edited in place. Tab moves across cells. Enter on the last cell adds a new row. |
| Amount | `MoneyInput`. Cannot be negative. |
| Charged | A dropdown with the five timing options, each with a one-line help tooltip. |
| Terms per year | Read-only here, with a link to the program setting. Activation is blocked if it is missing. |
| Preview | Updates as you type. Terms that changed are highlighted briefly. Shows the refundable part separately. |
| Version tag | `TemplateVersionTag` beside the name. Rises when an Active template is saved with changes. |
| Activate | Opens a confirm dialog. If another Active template exists for the same course, program, session and batch, the dialog explains it must be archived first. |
| Active template edit | A warning banner: "41 students use this template. Changes apply to new admissions only." |
| Duplicate | Dialog: new session, new batch (optional), "Increase amounts by [8]%". The copy opens as a Draft. |
| Unsaved changes | Leaving the editor asks for confirmation. |

---

## 13. New admission

A full page wizard with a stepper at the top and a sticky footer holding **Back**, **Save draft** and **Next**.

```text
New admission
[1 Personal]--[2 Academic]--[3 Fees]--[4 Review]
```

### 13.1 Step 1: Personal details

Two columns of fields: name, father's name, CNIC, phone, address, date of birth, gender, domicile, emergency contact, registration date. Below them, three small groups: **Guardian or fee payer** (name, phone, required under 18), **Previous education** (last qualification, board or institute, year), and **Registration** (council registration number and roll number, both optional). Photo upload on the right with a square preview and "2 MB maximum". A duplicate CNIC shows a danger banner with a link to the existing student. A similar name shows a warning with a link, which does not block.

### 13.2 Step 2: Academic placement

Course, Program, Session, Batch, Starting term. Each dropdown filters the next. After a program is chosen, a one-line note: "BS Nursing has 8 semesters."

### 13.3 Step 3: Fees

```text
Fee source:  (o) Use matching template: BSN 2026 (v1)   ( ) Choose another   ( ) Build manually

+-- Fee plan for Ayesha Khan -------------------------------------------+
| Component   Template  Concession          This student  Applies to     |
| Admission    15,000   Waived (Sibling)         0        Term 1 only    |
| ID card       1,000   -                       1,000     -              |
| Security     10,000   -                      10,000     -              |
| Tuition      45,000   20% off (Merit)        36,000     All terms      |
| Annual        6,000   -                       6,000     -              |
| [+ Add concession]  [+ Add custom component]                           |
+------------------------------------------------------------------------+
| Term 1 fee charge due:  [23 Oct 2026]                                  |
+------------------------------------------------------------------------+

+-- Term 1 -----------------------+   +-- All terms [View] -----------+
| Template total        77,000     |   | T1  53,000   T5  52,000      |
| Concessions          -24,000     |   | T2  38,000   T6  46,000      |
| Net fee               53,000     |   | T3  52,000   T7  52,000      |
+----------------------------------+   | T4  46,000   T8  58,000      |
                                       +------------------------------+
```

Clicking a concession cell, or **Add concession**, opens the `ConcessionEditor` popover:

```text
+--------------------------------------+
| Concession on: Tuition               |
| Kind     [Percent off v]             |
| Value    [20] %          = 9,000     |
| Applies  [All remaining terms v]     |
| Reason * [Merit v]  Note [_________] |
| (!) Continues beyond Term 1: needs   |
|     approval.                        |
|           [Cancel]   [Save]          |
+--------------------------------------+
```

| Behaviour | Detail |
| --- | --- |
| No matching template | Warning banner "No active template for BSN, Session 2026", with the other two source options highlighted. |
| Template amounts stay visible | The Template column never changes. Typing a new amount in "This student" creates a **Set amount** concession automatically and shows it in the Concession column. |
| Kinds | Waive fully, Fixed amount off, Percent off, Set amount. Percent amounts show the rupee result beside them. |
| Applies to | This term only, All remaining terms, or Specific terms (a small from and to term picker). |
| Reason | Required as soon as a concession exists. The step cannot continue without it. |
| Approval | A concession over the limit, or one that continues beyond Term 1, shows a **Needs approval** badge. Next opens an approval dialog (approver's username and password). |
| Net fee | Cannot go below zero. Zero is allowed with a reason. A concession larger than its component is reduced to fit, with a small warning. |
| Due date | Defaults from the template's due rule. Cannot be before today. |
| Totals | The two summary cards stay visible while scrolling. |

### 13.4 Step 4: Review and confirm

```text
+-- Student ---------------+  +-- Fees --------------------------------+
| Ayesha Khan              |  | Term 1 fee charge            77,000    |
| d/o Imtiaz Khan          |  | Concession: Sibling         -15,000    |
| CNIC 35202-3333333-5     |  | Concession: Merit           -9,000     |
| BSN, Fall 2026, Term 1   |  | Net fee                      53,000    |
| Guardian: Imtiaz Khan    |  | Due date                23 Oct 2026    |
+--------------------------+  +----------------------------------------+

+-- Payment now (optional) ------------------------------------------+
| Amount [30,000]  Mode [Cash v]  Receipt no. [R-1042] (auto)         |
| Reference [________]  Narration [__________]                        |
| Pays: Term 1 fee charge (the only charge)                            |
|                                  Balance after admission: 23,000 Due |
+----------------------------------------------------------------------+
                           [Back]  [Save draft]  [Confirm admission]
```

If a newer template version has become Active since the wizard was opened, a warning banner appears at the top of this step with **Reload fees**.

After confirming, a success page shows the student number in large type and the actions: **Print receipt**, **Print ID card**, **Print admission summary**, **Open profile**, **Admit another** (keeps course, program, session and batch).

### 13.5 Wizard behaviour

| Behaviour | Detail |
| --- | --- |
| Keyboard | Enter moves to the next field. Ctrl+Enter goes to the next step. |
| Validation | Field errors on blur. Step errors listed in a banner when Next is pressed, and the first error is focused. |
| Stepper | Completed steps are clickable. Steps with errors show a red dot. |
| Leaving | Any link, back button or sidebar click asks to save a draft or discard. |
| Drafts | A saved draft appears at the top of the Students page: "1 admission draft in progress." Drafts are private to the user and expire after 7 days. |
| Failure | If saving fails, the page stays on step 4 with a danger banner. Nothing is half-saved. |
| Concession limits | Approval prompts appear when moving to step 4, not while typing, so the operator can finish editing first. |

---

## 14. Fee operation screens

These screens follow Feature 3 of `FEE_TEMPLATES_AND_ADMISSION_DESIGN.md` (sections 24 to 27). The full Record payment screen is designed with the payments feature. The allocation picker below is the part it shares with admission.

### 14.1 Allocation picker

Used wherever a payment is taken.

```text
Pay for:  (o) Oldest dues first (recommended)   ( ) A specific fee charge [Term 3 v]

Preview for a payment of 25,000
  Term 2 charge   17,000  ->  0         paid in full
  Term 3 charge   61,000  ->  53,000
  Credit after payment: 0
```

The preview updates as the amount changes. Any extra shows as "Credit after payment" with a note that it will be applied to the next fee charge.

### 14.2 Change fee plan

A three-step page opened from the profile (Fees tab, **Change fee plan**).

1. **What to change:** add or remove a concession, change a component amount, or add a custom component.
2. **Effective from:** a term picker.
3. **Review the effect:**

```text
Change fee plan: Ayesha Khan                      Template BSN 2026 (v1)
Step 3 of 3: Review the effect
+--------------------------------------------------------------------+
| Change: Need-based concession, 5,000 per term, from Term 2          |
| Term | Now      | After    | How it is applied                      |
| 2    | 38,000   | 33,000   | Not yet charged: new amount will be used|
| 3    | 52,000   | 47,000   | Not yet charged                         |
| ...                                                                  |
+--------------------------------------------------------------------+
Reason * [Need-based v]   Note [____________________]
(!) This concession continues beyond the first term and needs approval.
                             [Cancel]   [Request approval]
```

Terms already charged show "Adjustment of -5,000 will be added" instead.

### 14.3 Void receipt

```text
+----------------------------------------------------+
| Void receipt R-1042?                                |
| Ayesha Khan   30,000   Cash   9 Oct 2026            |
|                                                      |
| Effect:                                              |
|  Balance changes from 23,000 Due to 53,000 Due       |
|  Term 1 shows 53,000 unpaid                          |
|  No bank entry to reverse                            |
|                                                      |
| Reason *  [Wrong amount entered v]  Note [_______]   |
| [ ] Issue a replacement receipt now                  |
|                       [Cancel]  [Void receipt R-1042] |
+----------------------------------------------------+
```

If the day has been closed, the dialog shows a banner "This day is closed. Only an Admin can reopen it." and the button is disabled for everyone else.

### 14.4 Cancel admission

```text
Cancel admission: Ayesha Khan   (admitted 9 Oct 2026, day 3 of 7)
+-----------------------------------------------------------+
| Net fee charged (Term 1)                          53,000   |
| Paid so far                                       30,000   |
| Non-refundable items (net of concessions)         43,000   |
| Suggested refund                                       0   |
| Unpaid amount that will be reversed               23,000   |
+-----------------------------------------------------------+
Refund amount [ 0 ]   (an Admin can change this with a reason)
Reason * [Changed mind v]   Note [____________________]
Result: the student is struck off (Admission cancelled).
                              [Back]   [Cancel admission]
```

### 14.5 Refund credit

```text
Refund credit: Usman Tariq                    Credit available: 2,000
Amount [2,000]   Mode [Cash v]   Reference [_____]
Reason * [Excess payment v]
Approval: within your limit (20,000)
                              [Cancel]  [Record refund]
```

Amounts above the user's limit show "Needs an Admin" and the button becomes **Request approval**.

## 15. Day closing screen

```text
Close day                                 Date [9 Oct 2026 v]  Counter [All v]
+-- Cash ------------------------------------------------------------+
| Expected cash (9 receipts)                                  112,500 |
| Counted cash   [ 112,000 ]    [Count notes and coins]                |
| Difference                                                     -500 |
| Note *  [Short change given to a student________________]           |
+-- Non-cash (5 receipts) -------------------------------------------+
| [x] Bank     2 receipts   50,000                                    |
| [x] Online   2 receipts   15,000                                    |
| [ ] Cheque   1 receipt    10,000     (not yet confirmed)            |
+---------------------------------------------------------------------+
Receipts of the day (expand)                     [Print report] [Close day]
```

| Behaviour | Detail |
| --- | --- |
| Expected cash | Calculated by the system and not editable. |
| Count notes and coins | Opens `CashCountSheet`, a table of denominations with quantity boxes that total into Counted cash. Optional. |
| Difference | Red when not zero. A note is required then. |
| Closed day | The page shows a green **Closed** badge, who closed it and when. Fields are read-only. Admin sees a **Reopen day** button that asks for a reason. |
| Counter operator | Sees only their own receipts and cannot choose another counter. |
| Reminder | The dashboard Needs attention panel links here when the previous day was not closed. |

## 16. Backup and restore screens

### 16.1 Settings, Backup

```text
Backup and restore
+-- Status --------------------------------------------------------+
| Last backup: Today 6:02 PM  (OK, 48 MB)           [Backup now]    |
| Folder: E:\MediCMS-Backups         [Change]                       |
| Time:   [6:00 PM v]      Keep: 30 daily + 12 monthly              |
+------------------------------------------------------------------+
| Backups                                                           |
| Date                Size   Result   Students  Receipts            |
| 9 Oct 2026 6:02 PM  48 MB  OK       516       1,942     [Restore] |
| 8 Oct 2026 6:01 PM  47 MB  OK       513       1,928     [Restore] |
+------------------------------------------------------------------+
| Recovery sheet                              [Generate new sheet]  |
+------------------------------------------------------------------+
```

### 16.2 Restore dialog

```text
+----------------------------------------------------+
| Restore backup from 8 Oct 2026, 6:01 PM?            |
| (!) 14 receipts and 23 payments made after this     |
|     backup will be lost.                            |
| A safety backup of the current data is made first.  |
|                                                     |
| Your password  [______________]                     |
| Type RESTORE   [______________]                     |
|                     [Cancel]   [Restore backup]     |
+----------------------------------------------------+
```

### 16.3 Backup status chip

| State | Look | Meaning |
| --- | --- | --- |
| Green | `Backup: today 6:02 PM` | Last backup succeeded within 2 days. |
| Amber | `Backup: 2 days ago` | Older than 2 days. |
| Red | `Backup failed` or `No backup for 3 days` | Click opens the Backup page. |

Counter operators and Viewers do not see the chip.

## 17. Print layouts

| Layout | Paper | Content |
| --- | --- | --- |
| Daily summary | A4 | Institute header, date, printed by, collection by mode, receipt list, closing counts. |
| Payment receipt | A4 and 80 mm thermal | Institute name, receipt number, student, amount, mode, receiver, signature area. |
| Student list | A4 landscape | Institute name, filters applied, date, table. |
| ID card | Card size | Photo, name, SNO, program, session, institute. |
| Student statement | A4 | Header, student details, ledger with running balance, closing balance. |
| Admission summary | A4 | Student details, fee plan, concessions with reasons, term-by-term fees, signature lines. |
| Day-close report | A4 | Date, counter, expected and counted cash, difference, non-cash totals, signature lines. |
| Refund voucher | A4 | Student, amount, mode, reason, approval, signature lines. |
| Recovery sheet | A4 | Recovery code and backup passphrase, instructions to store it safely. |

A voided receipt reprints with a large VOID mark across it.

Rules: print styles hide the sidebar, header and buttons. Page breaks never split a table row. Every printed page shows the institute name and date.

---

## 18. Feedback, states and messages

| Situation | Pattern |
| --- | --- |
| Action succeeded | Toast, 4 seconds. Example: "Payment R-1042 recorded." |
| Action can be undone | Toast with Undo, 10 seconds. |
| Field problem | Red text under the field, with a short instruction. |
| Page problem | Banner at the top of the form or page. |
| Risky action | `ConfirmSummaryDialog` with the effect, a reason where needed, and a danger button named for the action ("Strike off 12 students", never just "OK"). |
| Loading a page | Skeleton shapes. Buttons show a spinner and are disabled while saving. |
| Nothing to show | `EmptyState` with one clear next step. |
| No access | The "No access" page (section 5.5). |
| Something failed | Danger banner with the reason and a Retry button. |

Message style: short, plain words, say what to do next. "Phone number is not valid. Use the format 0300-1234567."

---

## 19. Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| F3 or Ctrl+K | Global search |
| Ctrl+N | New admission |
| Ctrl+P | Record payment |
| Ctrl+R | Receipt reprint |
| Ctrl+L | Lock screen |
| Ctrl+Enter | Next step or save, in wizards and forms |
| Esc | Close dialog, drawer or search, then go back |
| / | Focus the search box on a list page |
| Up / Down, Enter | Move and open in search and lists |

Shortcuts that open pages are ignored while typing in a field. A **?** key opens a shortcut cheat sheet.

---

## 20. Accessibility and responsiveness

- **Contrast:** text meets WCAG AA (4.5:1). Status never depends on colour alone.
- **Focus:** a visible 2 px focus ring on every control. Dialogs trap focus and return it on close.
- **Labels:** every input has a visible label. Icon buttons have a text tooltip and an accessible name.
- **Tables:** proper header cells, sortable headers announce their sort order.
- **Errors:** announced to screen readers, linked to their fields.
- **Text size:** the layout works at 125 percent browser zoom.
- **Screen sizes:** designed for 1280 px and wider. Between 1024 and 1279 px the sidebar collapses to icons and tables scroll sideways inside their card. Below 1024 px the app shows a "Please use a larger window" message, as it is a desktop product.
- **Names:** fields must accept Urdu characters. Right-to-left labels can follow later.

---

## 21. Frontend structure

### 21.1 Folders

```text
src/
  app/            routes, layout shell, guards
  components/
    ui/           Button, Input, MoneyInput, Select, Dialog, Drawer, Tabs, Toast...
    data/         DataTable, FilterBar, StatCard, AmountCell, StatusBadge
    forms/        FormField, ReasonField, CnicInput, PhoneInput
  features/
    auth/         login, setup, lock, users
    dashboard/    cards, attention panel, daily summary
    students/     directory, profile, edit drawer, strike-off, import
    fee-templates/ list, editor, term preview
    admissions/   wizard, steps, fee plan editor, concession editor
    fee-operations/ change plan, void receipt, cancel admission, refunds, allocation picker
    day-closing/  close day, cash count, reopen
    backup/       backup status, restore, recovery sheet
    search/       command palette
  lib/
    money.ts      formatting and parsing
    dates.ts      local date helpers
    permissions.ts  one shared rule set
    feeEngine.ts  term-by-term calculation from components
    allocation.ts payment allocation and overdue ageing
    dueDates.ts   due date defaults and rules
  stores/         Zustand stores
  data/           repository layer
  print/          print layouts
```

### 21.2 Key patterns

| Pattern | Detail |
| --- | --- |
| Route guards | `RequireAuth` and `RequirePermission` wrap routes. A missing permission shows the "No access" page. |
| Permission hook | `useCan('students.strikeOff')` used by `PermissionGate` and by buttons. The same function runs in the data layer. |
| Filters in the address | `useSearchParams` holds filters, sort and page for the directory. The dashboard links use the same parameters. |
| Fee engine | One pure function computes the term-by-term fees from components and concessions. The template preview, admission step 3, the profile table and promotion all call it. |
| Allocation and ageing | One function allocates a payment to fee charges, and one groups overdue amounts into buckets. The allocation picker, the profile and the dashboard all use them. |
| Tests | The fee engine, allocation and ageing functions have unit tests built from the sample tables in the design documents, written before the screens. |
| Repository layer | Screens call a repository (`students.list()`, `admissions.confirm()`), not stores directly. The repository can be memory first, then database later, with no screen changes. |
| Forms | React Hook Form with Zod schemas, one schema per step. Errors on blur. |
| Money | Stored as whole rupees (integers). Formatting only at the edge. |
| Dates | Stored as local date strings (`2026-10-09`) for calendar dates, and timestamps for events. |
| Large lists | Table rows are virtualised above 200 rows. Balances come from a cached per-student value. |

### 21.3 Route map

| Route | Screen | Permission |
| --- | --- | --- |
| `/setup` | First-run setup | Only when no users exist |
| `/login` | Sign in | Public |
| `/dashboard` | Dashboard | Any signed-in user |
| `/students` | Directory | `students.view` |
| `/students/import` | Import wizard | `students.import` |
| `/students/:sno` | Profile | `students.view` |
| `/admissions/new` | Admission wizard | `admissions.create` |
| `/fee-templates` | Template list | `templates.view` |
| `/fee-templates/:id` | Template editor | `templates.edit` |
| `/students/:sno/fees/change` | Change fee plan | `plans.change` |
| `/day-closing` | Close the day | `cash.close` |
| `/settings/backup` | Backup and restore | `backup.manage` |
| `/settings/users` | Users | `users.manage` |

---

## 22. Acceptance criteria (frontend)

- [ ] All screens use the shared tokens, components and money and date formatting.
- [ ] Every dashboard card and attention item opens the correct filtered page.
- [ ] The directory filters, sort and page are in the address and survive a refresh.
- [ ] A counter operator never sees Bank, Settings, or money cards, and typing those addresses shows the "No access" page.
- [ ] The fee plan editor in admission and the template preview use the same fee engine and agree to the rupee.
- [ ] Bulk strike-off and import show a summary dialog before saving.
- [ ] Every wizard and form warns before losing unsaved data, including sidebar clicks.
- [ ] All primary workflows (admit, search, take payment) can be completed with the keyboard.
- [ ] Printed layouts fit their paper and hide navigation.
- [ ] Every screen has loading, empty and error states.
- [ ] Overdue amounts show in red with the days overdue in the directory, profile and dashboard.
- [ ] The concession editor keeps template amounts visible and shows the rupee result of a percentage.
- [ ] The allocation picker previews which fee charges a payment will pay before it is saved.
- [ ] Voiding a receipt, cancelling an admission and refunding credit each show their effect before confirming.
- [ ] The day-closing screen blocks changes after closing, and only an Admin can reopen it.
- [ ] The backup chip changes colour as the last backup gets older, and the restore dialog needs the password and the word RESTORE.
- [ ] The recovery sheet cannot be dismissed until the user confirms it is stored.

---

## 23. Open decisions

Defaults below are adopted in this draft. Change any that do not suit the institute.

| # | Question | Default adopted |
| --- | --- | --- |
| 1 | Brand colour: teal, or the institute's own colour? | Teal now, with the brand colour changeable in Settings later. |
| 2 | Dark theme in the first release? | No. Tokens make it easy later. |
| 3 | Urdu labels and right-to-left layout? | English first. Names accept Urdu. Full Urdu later. |
| 4 | Approval of over-limit concessions and refunds | Approver's username and password in a dialog. |
| 5 | Should drafts be shared between staff or private? | Private to the user who started them. They expire after 7 days. |
| 6 | Thermal receipt printer model | Confirm with the real printer before finalising the 80 mm layout. |
| 7 | Count notes and coins in day closing | Optional, as a helper under Counted cash. |
| 8 | Recovery sheet format | Print or save as PDF, on one A4 page. |

## 24. Suggested build order

1. **Design tokens and base components** (Button, inputs, MoneyInput, FormField, Dialog, Toast, Badge).
2. **App shell**, route guards and the permission hook.
3. **Fee engine, allocation and ageing functions with unit tests** from the sample tables. Everything money-related depends on them.
4. **Login, setup, recovery sheet, lock and users** screens.
5. **DataTable and FilterBar**, then the **Students directory** with address-based filters and the Overdue tab.
6. **Dashboard** with stat cards, overdue figures, attention panel and click-through.
7. **Student profile** with the fee summary, term-by-term table and ageing bar.
8. **Fee templates** list and editor.
9. **Admission wizard**, using the fee plan editor and concession editor.
10. **Fee operation screens:** allocation picker, change plan, void receipt, cancel admission, refunds.
11. **Edit drawer, strike-off, completed and on leave, and bulk dialogs.**
12. **Import wizard**, including undo.
13. **Day closing screen.**
14. **Backup and restore screens.**
15. **Print layouts and global search polish.**
