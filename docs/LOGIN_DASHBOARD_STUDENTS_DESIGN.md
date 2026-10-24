# MediCMS Desktop: Login, Dashboard, Students, Data Safety and Cash Closing

**Document type:** Improved design and scope
**Version:** Draft 2
**Date:** 9 October 2026
**Covers:** Feature 1 (Login and Access), Feature 2 (Dashboard), Feature 3 (Students Module), Feature 4 (Data Safety), Feature 5 (Daily Cash Closing)
**Replaces:** the Login, Dashboard and Student Management sections of `APPLICATION_SCOPE.md`
**Related:** `FEE_TEMPLATES_AND_ADMISSION_DESIGN.md` (fee plans, admission, promotion, due dates, allocation, corrections)

---

## Changes in Draft 2

This draft folds in the review of Draft 1.

| Area | Change |
| --- | --- |
| Recovery | Recovery sheet at setup and a prompt to create a second Admin (sections 4 and 7). |
| Deployment | This release runs on one main computer. The data layer is built so a network version can be added later (section 32). |
| Backup | Automatic daily encrypted backup, with a safe restore (section 32). |
| Overdue | The dashboard, directory and profile separate "Due" from "Overdue", with ageing (sections 14, 22 and 24). |
| Student status | Completed and On leave added (sections 22 and 26). |
| Student fields | Guardian, council registration number, roll number and previous education (sections 23 and 25). |
| Exports and imports | Exports are audited and limited by role. An import can be undone (sections 23 and 32). |
| Day closing | New Feature 5: close the day with a cash count (section 33). |
| Reinstatement | Optional re-admission fee (section 26). |
| Samples | Dashboard samples corrected so the same student has the same balance everywhere. |

---

## 1. Purpose

These three features are the front door of the application: who can get in, what they see first, and how they find and manage students. The current versions work as a prototype but have gaps that matter in a real office:

- Everyone shares one `admin / admin` login, so the audit trail cannot say who did what.
- Dashboard figures can be wrong near midnight, and some cards are placeholders.
- The student list cannot be trusted for bulk work: imports skip validation, and bulk actions have no preview.

This document redesigns all three so they work together.

### Wording used in this document

| Term | Meaning |
| --- | --- |
| **Fee charge** | The amount billed to a student for a term, posted to their ledger. |
| **Concession** | Any reduction for a student: waiver, scholarship or discount. |
| **Balance** | Fee charges + special charges − concessions − payments. Positive means dues, zero means cleared, negative means credit. |
| **Active student** | A student who is enrolled and not struck off. |
| **Struck-off student** | A student removed from active enrollment. Their ledger is kept. |
| **SNO** | The student's unique student number. |
| **Term** | A semester, a year or a term, depending on the course. |
| **Due date** | The date a fee charge should be paid by. |
| **Overdue** | The unpaid part of a fee charge after its due date. |
| **Completed** | A student who has finished the final term. |
| **On leave** | A student temporarily paused, expected to return. |
| **Recovery sheet** | A page printed once at setup. It holds a recovery code and a backup passphrase. |

---

# Feature 1: Login and Access

## 2. Goals

- Every person has their own account, so every action is traceable to a name.
- Each person sees and does only what their job requires.
- The first-time setup is safe: no default password ships with the app.
- A shared counter computer locks itself when left alone.

## 3. Users and roles

| Role | Typical person | Summary of access |
| --- | --- | --- |
| **Admin** | Owner, principal's office | Everything, including users, settings, backups, approvals. |
| **Accountant** | Accounts staff | Payments, concessions, adjustments, bank, expenses, reports, approvals. |
| **Counter operator** | Front-desk staff | Admissions, payments, receipt reprint, student lookup. No bank, no approvals. |
| **Viewer** | Principal, auditor | Read-only access to dashboard, students, ledgers and reports. |

### Sample permission matrix

| Action | Admin | Accountant | Counter operator | Viewer |
| --- | :---: | :---: | :---: | :---: |
| View dashboard money cards | Yes | Yes | Today's collection only | Yes |
| View bank balance and bank ledger | Yes | Yes | No | Yes |
| Admit a student | Yes | Yes | Yes | No |
| Record a payment | Yes | Yes | Yes | No |
| Give a concession within limit | Yes | Yes | Yes | No |
| Approve a concession above limit | Yes | Yes | No | No |
| Ledger adjustment or write-off | Yes | Yes | No | No |
| Edit student details | Yes | Yes | Yes | No |
| Strike off or reinstate | Yes | Yes | No | No |
| Bulk strike-off | Yes | No | No | No |
| Import students | Yes | Yes | No | No |
| Void a receipt | Yes | Yes | No | No |
| Cancel an admission, refund | Yes | Yes (up to limit) | No | No |
| Close the day (cash count) | Yes | Yes | Yes (own receipts) | No |
| Reopen a closed day | Yes | No | No | No |
| Run a backup | Yes | Yes | No | No |
| Restore a backup | Yes | No | No | No |
| Create or edit fee templates | Yes | Yes | No | No |
| Add expenses | Yes | Yes | No | No |
| Manage users and settings | Yes | No | No | No |
| View audit trail | Yes | Yes | No | Yes |

All permission checks use **one shared rule set**, applied to routes, buttons and data actions. Hiding a button is never the only protection: opening a page by typing its address must be blocked too.

## 4. First-run setup

On the first launch, with no users in the system:

1. The app shows "Set up your institute".
2. The owner enters institute name, their own full name, a username and a password.
3. That user becomes the first **Admin**.
4. The app shows a **recovery sheet** once: a recovery code and a backup passphrase. The owner must print it or save it, and tick "I have stored this sheet safely" to continue.
5. The app asks the owner to choose a backup folder (a second drive or USB).
6. The setup screen never appears again.

A banner reminds the owner to **create a second Admin** until one exists.

The built-in `admin / admin` account is removed.

## 5. Login screen

| Element | Behaviour |
| --- | --- |
| Institute name and logo | From settings. |
| Username and password | Password has a show/hide toggle. |
| Sign in | Checks credentials. |
| Error message | "Username or password is incorrect." The message never says which one. |
| Disabled account | "This account is disabled. Contact your administrator." |
| Forgot password | "Ask your administrator to reset your password." (There is no email in this app.) |

## 6. Sessions and security

| Rule | Default |
| --- | --- |
| Auto-lock after inactivity | 10 minutes (Admin can change, 1 to 60 minutes). |
| Lock screen | Shows the user's name. Unlock with password, or sign in as someone else. |
| Failed sign-ins | After 5 failures, the account locks for 5 minutes. |
| Password rules | At least 8 characters, not equal to the username. |
| Stored passwords | Stored as a one-way hash, never as readable text. |
| Sign out | Clears the session and any sensitive data held on screen. |
| Offline | Sign-in works offline against the local user list. If a server is added later, a cached sign-in stays valid for 7 days. |

## 7. User management (Admin only)

A **Users** page under Settings:

| Field | Notes |
| --- | --- |
| Full name | Required. |
| Username | Required, unique. |
| Role | Admin, Accountant, Counter operator or Viewer. |
| Status | Active or Disabled. |
| Assigned receipt book | Optional, for counter operators who issue receipts. |
| Last sign-in | Read-only. |

Actions: add user, edit, disable, **reset password** (creates a temporary password; the user must choose a new one at next sign-in).

Users are never deleted, only disabled, so old audit entries still show a real name.

A user can change their own password from their account menu.

### Recovery if every Admin password is lost

- On the sign-in screen, "Forgot password?" offers **Use recovery code**.
- Entering the recovery code lets the owner set a new password for an Admin account. The code is then replaced by a new one, shown once.
- An Admin can generate a new recovery sheet at any time from Settings (password required).
- Using the code is written to the audit trail.
- A second Admin account is the first line of defence. The recovery code is the last.

## 8. Audit events for access

The audit trail records: sign-in, failed sign-in, sign-out, auto-lock and unlock, password change, password reset, user created, user disabled, role changed, recovery code used, backup made or failed, restore, export of student data, import and undo of an import, receipt voided, day closed and reopened.

## 9. Sample users

| Name | Username | Role | Receipt book |
| --- | --- | --- | --- |
| Dr. Imran Shah | imran | Admin | None |
| Saba Noor | saba | Accountant | None |
| Kamran Ali | kamran | Counter operator | Book 1 (1001 to 1500) |
| Farah Javed | farah | Counter operator | Book 2 (1501 to 2000) |
| Principal Office | principal | Viewer | None |

## 10. Acceptance criteria

- [ ] No default password exists; first launch forces owner account creation.
- [ ] Each user signs in with their own username, and every audit entry shows that name.
- [ ] A counter operator cannot open the bank page, even by typing its address.
- [ ] A locked screen requires the password before anything else is visible.
- [ ] Five wrong passwords lock the account for five minutes, and this is audited.
- [ ] An Admin can add, disable and reset users, and disabled users cannot sign in.
- [ ] Users and passwords survive reloading the app.

## 11. Not included

- Email or SMS password recovery.
- Two-step verification.
- Single sign-on.
- Per-field or per-program permissions.

---

# Feature 2: Dashboard

## 12. Goals

- Answer "how are we doing today?" in a few seconds.
- Make every number clickable, leading to the exact list behind it.
- Point out what needs attention instead of only showing totals.
- Show each role only what is relevant to them.

## 13. Layout

```text
+--------------------------------------------------------------------+
| Good morning, Saba            Friday, 9 October 2026   [Print summary]|
| Session: [All v]                                                     |
+--------------------------------------------------------------------+
| TODAY                                                               |
| Collected today   Receipts    Cash        Bank / Online / Cheque    |
| 187,500           14          112,500     75,000                    |
+--------------------------------------------------------------------+
| STUDENTS        |  FEES                     |  MONEY                 |
| Active     412  |  Outstanding   2,845,000  |  Bank balance 1,260,000|
| On leave     5  |   of which overdue 1,930,000| Expenses (Oct)  385,000|
| Completed   61  |  Struck-off dues   410,000|  Budget used       71% |
| Struck off  38  |  Credit held        64,000|  Last backup Today 6:02PM|
| Total      516  |  Collected (Oct) 1,420,000|                        |
+--------------------------------------------------------------------+
| NEEDS ATTENTION                                                     |
| - 12 bank withdrawals not linked to an expense           [Review]   |
| - Yesterday (8 Oct) was not closed with a cash count     [Close day]|
| - Receipt Book 1 has 8 receipts left                      [Open]     |
| - 23 students have no fee charge for their current term   [View]     |
| - 5 struck-off students still have dues                    [View]     |
+--------------------------------------------------------------------+
| TOP DEFAULTERS (by overdue)                  | TODAY'S PAYMENTS      |
| Bilal Ahmed      BSN T3    78,000  267 days  | R-1051 Ayesha Khan  30,000|
| Hina Raza        BSN T5    64,500   62 days  | R-1052 Faisal M.    12,500|
| Faisal Mehmood   PNC Y1    52,000   45 days  | R-1053 Mehwish A.   28,000|
| Mehwish Anwar    Rad. T2   47,500   33 days  | ...                   |
| Taha Siddiqui    BSN T1    45,000   12 days  |                       |
+--------------------------------------------------------------------+
| Quick actions: New admission | Record payment | Search | Reports |    |
|                Batch promotion | Batches                            |
+--------------------------------------------------------------------+
```

The "Sync" quick action and "pending sync" figure are removed until real synchronization exists. In the defaulters list, the days shown are how long the oldest unpaid charge has been overdue.

## 14. What each figure means

| Figure | Definition |
| --- | --- |
| Active / On leave / Completed / Struck off / Total | Counts of students by status. Total is all four. Test records excluded unless the setting is on. |
| Outstanding dues | Sum of positive balances for **active** students. |
| Overdue | The part of outstanding dues whose due date has passed, after payments are allocated. |
| Struck-off dues | Sum of positive balances for struck-off students. They stay visible because the money is still owed. |
| Credit held | Sum of negative balances (as a positive number) for active students. |
| Collected today | Sum of payments dated today. Concessions are not included. |
| Cash / Bank, Online, Cheque | Today's collection split by payment mode. |
| Collected this month | Sum of payments in the current month. |
| Bank balance | Opening balance + all deposits − all withdrawals, calculated from the bank ledger. The dashboard and the bank page use the **same calculation**. |
| Expenses this month | Sum of expenses dated in the current month. |
| Budget used | Expenses this month ÷ total monthly budget. |
| Top defaulters | Five active students with the highest **overdue** amount. |

A **Session** selector (default: All) filters the student, fee and defaulter figures. Money cards (bank balance, expenses, budget) are not filtered by session.

## 15. Date rules

All "today" and "this month" figures use the **local date of the computer** (Pakistan Standard Time), not UTC. A payment taken at 2:00 AM belongs to that day's collection, not the previous day's.

## 16. Click-through

| Card | Opens |
| --- | --- |
| Active | Students, status Active |
| Struck off | Students, status Struck off |
| Outstanding dues | Students, With Dues tab, highest balance first |
| Credit held | Students, Credit tab |
| Overdue | Students, Overdue tab |
| Struck-off dues | Students, Struck off tab, With dues filter |
| Collected today | Receipts list filtered to today |
| Expenses this month | Expense list filtered to this month |
| Bank balance | Bank ledger |
| Each "Needs attention" item | The page that fixes it, already filtered |

This works by passing filters in the page address, for example `/students?status=dues&sort=balance`.

## 17. Needs attention panel

Each item shows a count and a button to fix it:

| Item | Shown when |
| --- | --- |
| Bank withdrawals not linked to an expense | Count above zero. |
| Receipt book running low or used up | Fewer than 20 receipts left. |
| Students with no fee charge for their current term | Count above zero. |
| Struck-off students with dues | Count above zero. |
| Fee template missing for an open batch | A batch has students but no Active template. |
| No backup for 3 days | The last successful backup is older than 3 days (Admin and Accountant only). |
| Day not closed | Yesterday's receipts were not closed with a cash count. |

## 18. Role-based view

| Role | What they see |
| --- | --- |
| Admin | Everything. |
| Accountant | Everything. |
| Counter operator | Today's collection (only their own receipts), student counts, quick actions. No bank balance, expenses or budgets. |
| Viewer | Everything, with no quick actions. |

## 19. Daily summary printout

The Print button creates a one-page **Daily Summary**: institute header, date, who printed it, today's collection by mode, list of receipts, and the closing counts. It is a purpose-built layout, not a copy of the screen.

## 20. Acceptance criteria

- [ ] A payment recorded at 1:30 AM local time appears in that day's collection.
- [ ] The dashboard bank balance equals the bank page balance.
- [ ] Clicking Outstanding dues opens the student list already filtered to students with dues.
- [ ] The sync card is gone, and nothing on the dashboard refers to a sync queue.
- [ ] A counter operator sees no bank balance or expense figures.
- [ ] The Needs attention panel lists only items with a count above zero.
- [ ] The printed Daily Summary fits one A4 page.
- [ ] The Fees card shows overdue and struck-off dues, and Top defaulters are ranked by overdue amount.
- [ ] The Session selector changes student and fee figures but not bank or expense figures.
- [ ] A warning appears when no backup has succeeded for 3 days.

## 21. Not included

- Charts and trends over time (can follow later).
- Comparison with last month or last year.
- Customisable cards.

---

# Feature 3: Students Module

The Students module has five parts: the directory, import and export, the student profile, editing, and strike-off.

## 22. Student directory

### 22.1 Goals

- Find any student within seconds.
- Work on groups of students safely.
- Share a filtered view through a link.

### 22.2 Search

One box searches across: SNO, name, father's name, CNIC, phone, address, domicile, emergency contact, course, program, batch and session.

- CNIC search ignores dashes and spaces: `3520212345671` finds `35202-1234567-1`.
- Phone search ignores dashes, spaces and the leading `+92` or `0`.
- Results update as the user types, after a short pause.

### 22.3 Filters and tabs

| Filter | Options |
| --- | --- |
| Course, Program, Batch, Session, Term | Dropdowns, each narrowing the next. |
| Status | Active, On leave, Completed, Struck off, All. |
| Balance range | Minimum and maximum, for example "dues above 20,000". |
| Registration date | From and to. |
| Overdue age | Any, 1 to 30 days, 31 to 60, 61 to 90, over 90 days. |
| No fee charge for current term | Yes or No. |

Status tabs with live counts: **All, Active, With Dues, Overdue, Credit, On Leave, Completed, Struck Off**.

All filters, the sort and the page number are kept in the page address, so the view can be bookmarked and the dashboard can link straight into it.

### 22.4 Saved views

A user can save the current filters under a name and reopen it later. Examples:

- "BSN defaulters over 20,000"
- "Struck off with dues"
- "Admitted this month"

Saved views belong to the user who created them.

### 22.5 Table

Default columns: Photo, SNO, Name and father's name, Program, Batch and session, Current term, Phone, Balance (with an **Overdue** marker when part of it is past due), Last payment date, Status. The column chooser also offers: Overdue amount, Oldest due date, Guardian phone, Council registration number, Roll number.

- A column chooser lets each user hide or show columns.
- Sort by SNO, name, balance or last payment date.
- Rows per page: 20, 50 or 100.
- Row actions: Profile, Ledger, Take payment, Edit.
- Test records are hidden unless the setting is on.

Balances are calculated once per student and kept up to date as the ledger changes, so large lists stay fast.

### 22.6 Selection and bulk actions

| Selection | How |
| --- | --- |
| Rows | Tick individual rows. |
| This page | Tick the header box. |
| **All filtered results** | After ticking the header box, a banner offers "Select all 186 students matching this filter". |

| Bulk action | Notes |
| --- | --- |
| Export selected | CSV or Excel. |
| Print list | Printed list shows the institute name, filters applied and date. |
| Print ID cards | For the selected students. |
| Batch promotion | Opens batch promotion with these students already chosen. |
| Strike off | See section 26. Admin only. |

### 22.7 Sample directory rows

| SNO | Name | Program | Batch / Session | Term | Balance | Last payment | Status |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| 1042 | Ayesha Khan | BSN | Fall / 2026 | 1 | 23,000 | 9 Oct 2026 | Active |
| 0987 | Bilal Ahmed | BSN | Spring / 2025 | 3 | 78,000 | 12 Aug 2026 | Active |
| 0731 | Hina Raza | BSN | Fall / 2024 | 5 | 64,500 | 3 Sep 2026 | Active |
| 0654 | Sana Malik | Radiology | Fall / 2025 | 2 | 0 | 28 Sep 2026 | Active |
| 0512 | Usman Tariq | LHV | 2025 | Year 1 | -2,000 | 1 Oct 2026 | Active |
| 0398 | Zainab Farooq | CMW | 2024 | Year 2 | 15,000 | 14 Mar 2026 | Struck off |

## 23. Import and export

### 23.1 Export

- Exports all filtered students, or only the selected ones.
- Uses the **same column layout as import**, so a file can be exported, edited in Excel and imported again.
- Respects the user's role. A counter operator can export only SNO, name, program, batch and session (no phone, CNIC or balances). Admin, Accountant and Viewer can export all columns.
- Every export is written to the audit trail (who, when, filters used, number of rows).

### 23.2 Import: a staged process

Nothing is saved until the user confirms.

| Stage | What happens |
| --- | --- |
| 1. Download template | A CSV template with the exact column names and a sample row. |
| 2. Upload file | CSV file chosen by the user. |
| 3. Validate | Every row is checked. Nothing is saved yet. |
| 4. Review | A table shows each row's status. The user can fix the file and re-upload. |
| 5. Resolve duplicates | For each duplicate: Skip, Update existing student, or Create anyway (with a reason). |
| 6. Import | Only Ready rows (and resolved duplicates) are saved. |
| 7. Result | Shows imported, skipped and failed counts, with a downloadable error report. |

### 23.3 Import columns

| Column | Required | Notes |
| --- | :---: | --- |
| name | Yes | |
| father_name | Yes | |
| cnic | Yes | 13 digits, dashes optional. |
| phone | Yes | Pakistani mobile format. |
| address | No | |
| date_of_birth | No | Must not be in the future. |
| gender | No | Male, Female or Other. |
| domicile | No | |
| emergency_contact | No | |
| guardian_name | No | Person who pays the fees, if not the student. |
| guardian_phone | No | Pakistani mobile format. |
| council_registration_no | No | Issued by the council, where one applies. |
| roll_no | No | Institute roll number. |
| registration_date | Yes | Must not be in the future. |
| course | Yes | Must match a known course. |
| program | Yes | Must belong to the course. |
| batch | Yes | Must exist and be active for the program. |
| session | Yes | |
| current_term | Yes | Must be valid for the program. |
| opening_balance | No | Dues as a positive number, credit as negative. |
| opening_balance_due_date | No | Due date for the opening balance. Defaults to the import date. |
| fee_template | No | Name of an Active template to attach as the student's fee plan. |

### 23.4 What imported students get

Imported students do not have an admission fee history. So:

- If **opening_balance** is given, one ledger entry "Opening balance" is posted, dated the registration date or an entered date. It has a due date, and shows as **Overdue** once that date passes.
- If **fee_template** is given, the student gets a fee plan from that template, so promotion works.
- If no template is given, the profile shows a notice "No fee plan. Add one before promotion."

### 23.5 Row checks

| Check | Result |
| --- | --- |
| Missing required value | Error |
| Invalid CNIC, phone or date | Error |
| Unknown course, program, batch or term | Error |
| CNIC already exists | Duplicate |
| Same name and father's name exist | Warning |
| Batch is disabled | Error |
| Opening balance is not a number | Error |

### 23.6 Sample

Sample file:

```text
name,father_name,cnic,phone,registration_date,course,program,batch,session,current_term,opening_balance,fee_template
Maryam Iqbal,Iqbal Hussain,35202-1111111-1,03001234567,2025-09-01,BS Nursing,BSN,Fall,2025,3,18000,BSN 2025
Ali Raza,Raza Ahmed,35202-2222222-3,0300123,2025-09-01,Paramedics,Radiology,Fall,2025,2,0,Rad 2025
Ayesha Khan,Imtiaz Khan,35202-3333333-5,03211234567,2026-10-09,BS Nursing,BSN,Fall,2026,1,0,BSN 2026
```

Validation result:

| Row | Name | Status | Message |
| ---: | --- | --- | --- |
| 1 | Maryam Iqbal | Ready | Opening balance 18,000 will be posted. |
| 2 | Ali Raza | Error | Phone number is not valid. |
| 3 | Ayesha Khan | Duplicate | CNIC matches SNO 1042. Choose Skip or Update. |

Result: 1 imported, 1 skipped, 1 failed. An error report with row 2 can be downloaded.

### 23.7 Undo an import

- An Admin can **undo an import** from the result page or the import history.
- Allowed only while none of the imported students has had a payment, fee charge, edit or other activity after the import.
- Undo removes those students and their opening balance entries. The import and the undo both stay in the audit trail.
- If any student has had activity, undo is not offered. Those students must be corrected one by one.

## 24. Student profile

The profile is the one place to understand a student. Fee information follows the design in `FEE_TEMPLATES_AND_ADMISSION_DESIGN.md` (section 18).

```text
+--------------------------------------------------------------------+
| [photo] Ayesha Khan            SNO 1042         Status: Active       |
| BS Nursing, BSN, Fall 2026, Term 1                Balance: 23,000 due |
| [Take payment] [Ledger] [Promote] [Add charge] [Edit] [More v]       |
+--------------------------------------------------------------------+
| (!) No fee plan. Add one before promotion.      <- alert, if needed  |
+--------------------------------------------------------------------+
| Overview | Fees | Ledger and receipts | Personal | Documents | History |
+--------------------------------------------------------------------+
| FEE SUMMARY                                                          |
| Total agreed  Concessions  Paid     Due now   Overdue  Next fee      |
| 77,000 (T1)   -24,000      30,000   23,000    0        Term 2: 38,000|
|                                                                      |
| Term | Charged | Concessions | Paid   | Due    | Due date    | Status |
| 1    | 77,000  | -24,000     | 30,000 | 23,000 | 23 Oct 2026 | Partly |
| 2-8  | not yet billed                                    | Upcoming |
+--------------------------------------------------------------------+
```

A term whose due date has passed with an unpaid amount shows in red as **Overdue**, with the number of days. When a student has overdue amounts, an ageing bar shows how much is not yet due and how much sits in each overdue bucket.

| Tab | Content |
| --- | --- |
| Overview | Photo, identity, placement, fee summary, last five ledger entries, alerts. |
| Fees | Fee plan with components, concession records and reasons, template version, term-by-term table with due dates, and a **Change fee plan** button. |
| Ledger and receipts | All entries with running balance, print statement, reprint receipts, void a receipt (Accountant and Admin), refund entries. |
| Personal | Identity and contact details, guardian, previous education, council registration number and roll number. |
| Documents | Uploaded documents (planned for a later release). |
| History | Audit trail of edits and fee changes, with before and after values. |

Alerts shown at the top when relevant: struck off, on leave or completed, overdue amount (with days), no fee plan, no fee charge for current term, balance above a set amount.

## 25. Editing a student

| Editable | Locked |
| --- | --- |
| Name, father's name, CNIC | Course |
| Phone, address, emergency contact | Program |
| Date of birth, gender, domicile | Batch |
| Photo | Session |
| Current term (correction only) | Registration date (Admin only) |

- Also editable: guardian name and phone, previous education, council registration number and roll number.
- A **reason** is required for every edit.
- The audit entry stores each changed field with the old and new value.
- Changing the CNIC runs the same duplicate check as admission.
- Changing the current term shows the highest term already charged in the ledger, so a mismatch is obvious.
- **Admin correction:** an Admin can correct batch or session with a reason, for data-entry mistakes only.
- Moving a student to a different program or course is a transfer and is not included in this release.

Sample audit entry:

| When | User | Student | Field | Before | After | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| 9 Oct 2026, 11:42 | Kamran Ali | 1042 | Phone | 0321-1234567 | 0300-7654321 | Parent gave new number |

## 26. Strike-off and reinstatement

### 26.1 Strike-off

| Field | Rule |
| --- | --- |
| Reason | Required. Left institute, Non-payment of fees, Disciplinary, Transferred out, Admission cancelled, Other. |
| Details | Required when the reason is Other. |
| Date | Defaults to today. Cannot be in the future. |

Before confirming, the screen shows the student's balance: "This student has dues of 78,000" or "This student has credit of 2,000".

### 26.2 What strike-off changes

- The student leaves the Active count and the active defaulter lists.
- The ledger and balance are kept.
- **Not allowed:** new fee charges, promotion and special charges. This is enforced on every screen and by direct address, not only by disabled buttons.
- **Still allowed:** taking payments, printing statements and receipts.
- Struck-off students with dues appear in the "Struck-off students with dues" attention item and report.
- If the student has **credit**, the screen offers **Refund credit** (refund rules: `FEE_TEMPLATES_AND_ADMISSION_DESIGN.md`, section 27).

### 26.3 Reinstatement

- A reason is required.
- The student returns to Active in the same term as before strike-off.
- An optional **re-admission fee** can be charged. The default amount is set in Settings (default 0) and is posted as a special charge with a due date.
- Written to the audit trail.

### 26.4 Bulk strike-off (Admin only)

The confirmation screen shows a summary before anything changes:

| | |
| --- | --- |
| Students selected | 12 |
| Total dues | 340,000 |
| Total credit | 15,000 |
| Reason | Non-payment of fees |
| Date | 9 October 2026 |

The Admin must confirm. Afterwards, a result screen offers **Undo (reinstate all 12)** using the same reason field.

### 26.5 Completed and on leave

| Status | When it is used | Effect |
| --- | --- | --- |
| **Completed** | The student has finished the final term. The profile offers **Mark as completed** once the final term has been charged. A warning is shown if dues remain. | Leaves active counts and defaulter lists. Ledger is kept. Payments and statements are still allowed. No promotion. Certificates are not part of this release. |
| **On leave** | The student is temporarily away (medical or personal). A reason and expected return date are required. | No automatic fee charges or promotion while on leave. Payments are allowed. Counted separately. **Return from leave** restores Active, with a reason. |

Both are written to the audit trail and shown as badges.

## 27. Student numbers

- The SNO is issued by the system at the moment of saving, so two computers cannot create the same number.
- SNOs are never reused, including after strike-off.

## 28. Permissions in this module

| Action | Admin | Accountant | Counter operator | Viewer |
| --- | :---: | :---: | :---: | :---: |
| View directory and profile | Yes | Yes | Yes | Yes |
| Export | Yes | Yes | Limited columns | Yes |
| Import | Yes | Yes | No | No |
| Edit student | Yes | Yes | Yes | No |
| Correct batch or session | Yes | No | No | No |
| Strike off or reinstate one student | Yes | Yes | No | No |
| Mark completed or put on leave | Yes | Yes | No | No |
| Undo an import | Yes | No | No | No |
| Bulk strike-off | Yes | No | No | No |
| Saved views | Yes | Yes | Yes | Yes |

## 29. Edge cases

| Case | Behaviour |
| --- | --- |
| CNIC matches a struck-off student at admission or import | Offer reinstatement instead of creating a duplicate. |
| Student has no fee plan | Profile alert. Promotion is blocked until one is added. |
| Search finds no one | "No students match. Clear filters or admit a new student." |
| Two staff edit the same student at once | The second save warns "This student was changed by someone else. Review and save again." |
| Import file has 5,000 rows | Validation shows progress, and the review table is paged. |
| Student's term in the record differs from the ledger | Profile shows a warning with both values. |
| Final term charged and fully paid | Profile offers "Mark as completed". |
| Student on leave makes a payment | Accepted. It reduces dues or becomes credit. |
| Backup folder not available | The app keeps a local copy, retries, and warns on the dashboard after 3 days. |

## 30. Acceptance criteria

**Directory**
- [ ] Filters, sort and page are in the page address, and a copied link reopens the same view.
- [ ] Searching a CNIC without dashes finds the student.
- [ ] "Select all N filtered results" selects every match, not only the current page.
- [ ] Balance range filter works with other filters.

**Import and export**
- [ ] Nothing is saved before the user confirms the review.
- [ ] Invalid rows are rejected with a clear message, and an error report can be downloaded.
- [ ] A CNIC that already exists is flagged as a duplicate.
- [ ] A file exported from the app can be imported again without changes.
- [ ] An opening balance creates one ledger entry.

**Profile and editing**
- [ ] The profile shows the fee summary and term-by-term table.
- [ ] Every edit needs a reason and records old and new values.
- [ ] Course, program, batch and session cannot be edited by non-Admins.

**Strike-off**
- [ ] The dues or credit warning appears before confirming.
- [ ] A struck-off student cannot receive a new fee charge or promotion, even through a direct address.
- [ ] Payments are still accepted for struck-off students.
- [ ] Bulk strike-off shows the summary and can be undone.

**Added in Draft 2**
- [ ] Setup shows a recovery sheet once, and a banner asks for a second Admin until one exists.
- [ ] The directory has an Overdue tab and an overdue-age filter.
- [ ] Completed and On leave can be set and reversed with a reason.
- [ ] Every export is audited, and a counter operator's export has no phone, CNIC or balances.
- [ ] An import can be undone while none of its students has had other activity.
- [ ] A re-admission fee can be added when reinstating a student.

## 31. Not included

- Student transfer between programs or courses.
- Graduation processing and certificates.
- Document upload (placeholder tab only).
- Parent or student portals.
- Attendance and exam records.

---

# Feature 4: Data Safety

Once real student and money records live on one computer, losing that computer is the biggest risk to the institute. This feature covers where the data lives, how it is backed up, and how it is restored.

## 32. Deployment, backup and restore

### 32.1 Deployment model

| Phase | Setup | Notes |
| --- | --- | --- |
| **1 (this release)** | One main computer holds the database. Staff use that computer. | Simple and reliable. Other computers cannot save data. |
| **2 (later, if needed)** | A small server program runs on the main computer or an office PC. Other computers connect over the office network. | Needs sessions per computer, record locking, and a receipt book per counter. |

Rules built in now so Phase 2 stays possible:

- Every screen reads and writes through one data layer. No screen touches the stored files directly.
- Student numbers and receipt numbers are issued by the database at the moment of saving.
- Each receipt book belongs to one user or counter.
- Cloud hosting is not planned. If it is wanted later, it comes with Phase 2 and needs a separate decision about protecting student data.

### 32.2 Automatic backup

| Item | Rule |
| --- | --- |
| When | Every day at a set time (default 6:00 PM), and when the app is closed if no backup was made in the last 12 hours. |
| Where | The backup folder chosen at setup (a second drive or USB), plus a local copy. |
| What | Database, photos, bill images, settings and the audit trail. |
| Format | One encrypted file per backup, named by date and time. Checked after creation. |
| Keep | The last 30 daily backups, plus one per month for 12 months. |
| Manual | **Backup now** (Admin, Accountant). |
| Log | Date, size and result for every backup. |

The status bar shows "Last backup: today 6:02 PM". It turns amber after 2 days and red after 3 days or on failure.

### 32.3 Restore (Admin only)

1. Choose a backup from the list. Each row shows date, size, number of students and number of receipts.
2. The screen warns how many receipts and payments are newer than the chosen backup and will be lost.
3. The Admin enters their password and types **RESTORE**.
4. The app first takes a safety backup of the current data.
5. The data is restored and the app restarts.
6. The restore is written to the audit trail.

### 32.4 Protecting stored data

- The database and backups are encrypted.
- Backups use the **backup passphrase** from the recovery sheet, so they can be restored on a new computer.
- Keeping a copy of the backup folder away from the institute (for example, a USB kept at home) is recommended.

### 32.5 Related safeguards

- Exports are audited and limited by role (section 23.1).
- An import can be undone (section 23.7).
- Admission drafts expire after 7 days and temporary files are cleared.

### 32.6 Acceptance criteria

- [ ] A backup runs daily at the set time, and the status bar shows the last result.
- [ ] A failed or missing backup shows a warning to Admin and Accountant.
- [ ] A backup can be restored on a different computer using the backup passphrase.
- [ ] Restore asks for the password, requires typing RESTORE, and makes a safety backup first.
- [ ] Backups are encrypted, and older ones are removed according to the keep rule.

### 32.7 Not included

- Automatic off-site or cloud copies.
- Scheduled restore tests.
- Multi-computer use (Phase 2).

---

# Feature 5: Daily Cash Closing

## 33. Close the day

### 33.1 Goal

At the end of the day, counter staff count the cash drawer. This feature records what the system expected, what was counted, and the difference, and then locks that day's receipts against changes.

### 33.2 Who

| Role | What they can do |
| --- | --- |
| Counter operator | Close the day for their own receipts. |
| Accountant | Close the day for all counters. |
| Admin | Everything, and **reopen** a closed day with a reason. |

### 33.3 The screen

| Part | Content |
| --- | --- |
| Date and counter | Default: today, own receipts. |
| Expected cash | Cash receipts for the date, minus voided cash receipts and cash refunds paid out. |
| Counted cash | A total, or an optional count by notes and coins. |
| Difference | Counted minus expected. |
| Note | Required when the difference is not zero. |
| Non-cash receipts | Listed by mode (bank, online, cheque), each ticked once checked against bank or cheque records. |
| Receipt list | Expandable list of the day's receipts. |
| Actions | Print the day-close report, and **Close day**. |

### 33.4 Sample

Day closed by Saba Noor (Accountant) for all counters on 9 October 2026:

| Item | Receipts | Amount (PKR) |
| --- | ---: | ---: |
| Cash | 9 | 112,500 |
| Bank | 2 | 50,000 |
| Online | 2 | 15,000 |
| Cheque | 1 | 10,000 |
| **Total collected** | **14** | **187,500** |

Counted cash: 112,000. Difference: -500. Note: "Short change given to a student."

### 33.5 Rules

- Once a day is closed, its receipts cannot be voided or changed. Only an Admin can reopen the day, with a reason.
- A day can be closed more than once only after it has been reopened. Every closing and reopening is audited.
- The dashboard shows "Day not closed" the next morning if yesterday had cash receipts and no closing.
- A closing record keeps: date, counter, expected, counted, difference, note, who closed it and when.

### 33.6 Acceptance criteria

- [ ] Expected cash equals the day's cash receipts minus voids and cash refunds.
- [ ] A non-zero difference cannot be saved without a note.
- [ ] After closing, voiding a receipt from that day is blocked for everyone except an Admin who reopens the day.
- [ ] The day-close report prints on one A4 page.
- [ ] An unclosed previous day appears in Needs attention.

### 33.7 Not included

- Bank reconciliation against a bank statement.
- Multiple cash drawers per counter.

---

## 34. Cross-cutting rules

| Area | Rule |
| --- | --- |
| Dates | Local date and time (Pakistan Standard Time) for every "today", "this month" and receipt date. |
| Permanent storage | Users, students, ledger entries, payments, bank records, audit trail, fee plans and day closings are stored permanently. Nothing resets on reload. |
| Audit | Every change made by a signed-in user is recorded with their name, time and reason where one is required. Audit entries cannot be edited or deleted. |
| Permissions | One shared rule set is used on every route, button and data action. |
| All-or-nothing saves | An action that changes several records (admission, payment, bulk strike-off, import) saves everything or nothing. |
| No deleting | Ledger entries, receipts and fee charges are never deleted or edited. Mistakes are fixed with visible reversal entries. |
| Due dates and allocation | Every fee charge has a due date, and every payment is allocated to a fee charge (see the fee document, sections 24 and 25). |
| Tests | The fee engine, allocation and ageing functions have automated tests built from the sample tables, before the screens that use them. |

## 35. Open decisions

Defaults below are adopted in this draft. Change any that do not suit the institute.

| # | Question | Default adopted |
| --- | --- | --- |
| 1 | One computer, several, or cloud? | One main computer first. The data layer allows a network version later. |
| 2 | Auto-lock time on counter computers | 10 minutes. |
| 3 | Should counter operators see the bank balance? | No. |
| 4 | One global student number or per program? | One global number. |
| 5 | Who can do bulk strike-off? | Admin only. |
| 6 | Who can import students? | Admin and Accountant. |
| 7 | Backup time and place | 6:00 PM daily, second drive or USB, plus a local copy. |
| 8 | Backup retention | 30 daily and 12 monthly. |
| 9 | Council registration and roll numbers | Optional fields. |
| 10 | Is day closing compulsory? | A daily reminder, not a hard block. |
| 11 | Who can reopen a closed day? | Admin only. |
| 12 | Show last payment date in the directory? | Yes. |

## 36. Suggested build order

1. **Permanent storage** behind a single data layer (database, with encryption).
2. **Users, roles, first-run setup, recovery sheet** and the shared permission rules.
3. **Sign-in, lock screen** and access audit events.
4. **Backup and restore** (it protects everything built after this point).
5. **Date handling fix** (local dates) and the shared bank balance calculation.
6. **Fee engine functions with tests** (see the fee document, section 28).
7. **Directory:** filters in the page address, balance range, overdue tab, last payment column, select-all-filtered.
8. **Dashboard:** click-through cards, overdue and struck-off dues, Needs attention panel, role-based view, Daily Summary print.
9. **Student profile:** fee summary, term-by-term table with due dates, tabs.
10. **Edit, strike-off, completed and on leave**, bulk dialogs with summary and undo.
11. **Import:** staged validation, duplicates, opening balance, error report, undo.
12. **Day closing.**
13. **Saved views and column chooser.**

Steps 1 to 4 come first because every other feature depends on stored data, knowing who the user is, and being able to recover it.
