# MediCMS Desktop: Finance Core

**Document type:** Improved design and scope, with detailed frontend design
**Version:** Draft 1
**Date:** 10 October 2026
**Covers:** Feature 1 (Money Accounts and Cash Book), Feature 2 (Money In), Feature 3 (Money Out: Expenses, Bills and Payment Vouchers), Feature 4 (Bank and Reconciliation), Feature 5 (Budgets and Month Close), Feature 6 (Reports and Money Overview), and the frontend design for all six
**Replaces:** the "Expenses and budgets", "Bank account and expense tagging" and expense and bank report parts of `APPLICATION_SCOPE.md`
**Related:** `PAYMENTS_RECEIPTS_LEDGER_DESIGN.md` (sections 14, 27, 33 to 47), `LOGIN_DASHBOARD_STUDENTS_DESIGN.md` (sections 3 and 33), `FRONTEND_DESIGN.md`
**Next document:** Staff and Payroll (the staff register and pay runs)

Samples use the same working date as the other documents, 9 October 2026. Money figures in the finance samples are illustrative and are consistent with each other and with the dashboard samples (bank balance 1,260,000, expenses 385,000, collected this month 1,420,000).

---

## Decisions assumed

These come from your answers and from defaults I chose. Change any that do not suit the institute.

| # | Topic | Assumed answer |
| --- | --- | --- |
| 1 | Staff | Staff must be added first, and are paid by cash, bank transfer or cheque depending on the month. This document treats staff as **payees** and defines how payroll payments are paid, shown and reconciled. The next document designs the staff register and pay runs. |
| 2 | Vendors | Purchases are on credit. So costs can be recorded as **bills to pay later**, with due dates, part payments and a payables list. |
| 3 | Accounts | One or two bank accounts, and any number is supported. Petty cash and mobile wallets are optional. |
| 4 | Income | Only student fees. Money in is automatic. A small, hidden **Other receipts** feature exists only for rare items such as bank profit, so bank reconciliation always has somewhere to put an unexpected deposit. |
| 5 | Deductions | No tax or EOBI. Payroll only deals with advance recovery (next document). |
| 6 | Salary privacy | Only an Admin sees an individual's pay and approves payroll. Everyone else sees payroll as batch totals. |
| 7 | Month lock | Yes. An Accountant reviews the month and an Admin closes and locks it. |
| 8 | Two views of money | A **cash view** (what moved in and out of accounts) and a **cost view** (what was incurred, including unpaid bills). Both are always available. |
| 9 | Starting out | A **go-live date** is chosen. Opening balances are entered from the real bank statement and cash count. Older records stay as read-only history. |

---

## 1. Purpose and what changes

This module answers three questions: how much money came in and through which route, how much went out and for what, and where the money is now. It also covers everything that is paid out: bills, petty cash, staff and refunds. The design principle is simple: **every rupee that moves is In, Out or a Transfer, and it always happens in a named money account.**

| Today | New design |
| --- | --- |
| Salaries, faculty payment and doctor remuneration are expense categories typed by hand. | Staff payments come from payroll runs. The salary categories are reserved for payroll. |
| An expense is recorded when it is paid. There are no vendors or unpaid bills. | A cost can be a bill to pay later, with a due date, part payments, and a payables list. |
| An expense's source is only petty cash or bank. | Every movement is in a named money account: counter cash, petty cash, each bank account, wallets. |
| The bank balance is a stored number, bank screens show hardcoded constants, and the balance follows search filters. | Balances are calculated from entries. One calculation is used everywhere. |
| Deposits and withdrawals are typed in by hand. | The system creates bank entries from payments, vouchers and transfers. Only bank charges and a few rare items are entered by hand. |
| Withdrawals are linked to expenses by hand, and amounts need not match. | Statement import, automatic match suggestions, and monthly reconciliation. |
| A refund only creates a ledger adjustment. | A refund creates a payment voucher and a money-out entry. |
| Cheques issued are not tracked. | An issued cheque register. The overview shows the available balance after uncleared cheques. |
| Budgets cover only some categories. | A budget for every category, with unpaid bills counted as committed. |
| There is no month closing. | A reviewed and locked month. |
| The report list is a catalog. | Working reports with drill-down to the entries. |
| Bank data resets on reload. | Everything is stored permanently. |

## 2. Wording used in this document

| Term | Meaning |
| --- | --- |
| **Money account** | A place where the institute's money sits: counter cash, petty cash, a bank account, a mobile wallet. |
| **Money entry** | One movement of money into or out of one account. |
| **Transfer** | Money moved between two of the institute's own accounts. It is never income or expense. |
| **Cash view** | Reports built from money entries: what actually moved. |
| **Cost view** | Reports built from bills and expenses: what was incurred, paid or not. |
| **Payee** | Anyone the institute pays: a vendor, a landlord, a hospital, a staff member, a student (refund). |
| **Bill** | A cost recorded with a payee, an amount and a due date. It may be paid now or later. |
| **Payable** | The unpaid part of bills. |
| **Payment voucher** | The numbered record of one payment out, printed with signature lines. |
| **Float** | The fixed amount kept as petty cash. |
| **Issued cheque** | A cheque the institute has written, until the bank clears it. |
| **Available balance** | A bank account's balance minus issued cheques that have not cleared. |
| **Statement line** | One line of a bank statement. |
| **Reconciliation** | Checking that the bank statement agrees with the app's bank account for a month. |
| **Month close** | Reviewing and locking a month so nothing in it can change. |
| **Go-live date** | The date from which the app's records are the official ones. |

## 3. Roles, permissions and limits

| Action | Admin | Accountant | Counter operator | Viewer |
| --- | :---: | :---: | :---: | :---: |
| See the money overview and reports | Yes | Yes | No | Yes (no individual pay) |
| See account balances | Yes | Yes | Own counter cash | Yes |
| Record a bill or expense | Yes | Yes | No | No |
| Pay out (a voucher) | Yes | Up to the limit | No | No |
| Pay out above the limit | Approves | Requests | No | No |
| Manage vendors | Yes | Yes | No | No |
| Transfer between accounts, cash deposit | Yes | Yes | No | No |
| Petty cash vouchers and counts | Yes | Yes | No | No |
| Write or cancel a cheque | Yes | Up to the limit | No | No |
| Import a statement and reconcile | Yes | Yes | No | No |
| Add a bank charge or other receipt | Yes | Up to the limit | No | No |
| Owner withdrawal | Yes | No | No | No |
| Reverse a voucher or bill | Yes | Up to the limit | No | No |
| Edit budgets | Yes | No | No | No |
| Mark a month reviewed | Yes | Yes | No | No |
| Close and lock a month | Yes | No | No | No |
| Reopen a closed month | Yes | No | No | No |
| See an individual's pay | Yes | No | No | No |
| See payroll batch totals | Yes | Yes | No | No |

Default limits (changeable in Settings, section 77): an Accountant may pay out up to 50,000 per voucher, reverse up to 50,000, and add a bank charge or other receipt up to 50,000.

---

# Feature 1: Money Accounts and the Cash Book

## 4. Goals

- Know exactly where the institute's money is, at any moment.
- Make every balance a calculated figure that is the same on every screen.
- Treat moving money between accounts as a transfer, never as income or expense.

## 5. Account types

| Type | What it is | Typical number |
| --- | --- | --- |
| **Counter cash** | Cash taken at a counter. One per counter, created with the counter's receipt book. | 1 or 2 |
| **Petty cash** | A small float for daily purchases. Optional. | 0 or 1 |
| **Bank account** | A bank account of the institute. | 1 or 2 (more allowed) |
| **Mobile wallet** | A JazzCash or Easypaisa style wallet. Optional. | 0 or more |
| **Cheques in hand** | Incoming cheques received but not yet cleared. A system account, with no hand entries. | 1 |
| **Issued cheques** | Cheques written but not yet cleared. A system view for each bank account. | One per bank |

## 6. Account fields and rules

| Field | Notes |
| --- | --- |
| Name | For example "Meezan, main account". |
| Type | As above. |
| Bank details | Bank name and account number (only the last 4 digits are shown on screen). |
| Opening balance and date | Entered once at the go-live date, from the real statement or cash count. |
| Responsible person | For cash accounts. |
| Status | Active or Closed. |
| Notes | Optional. |

Rules:

1. **Balance = opening balance + money in − money out**, counting **cleared** entries only. It is always calculated and never stored.
2. **Counter cash and petty cash cannot go below zero.** A payment that would do so is blocked: "Not enough cash in Petty cash. Top up first."
3. Bank and wallet balances may go below zero. A warning is shown, because overdrafts exist.
4. An account with entries cannot be deleted. It can be closed when its balance is zero.
5. Changing an opening balance later needs an Admin and a reason, and is blocked in a closed month.
6. The same balance appears on the overview, the account page, reports and the dashboard.

## 7. Money entries

### 7.1 Fields

| Field | Notes |
| --- | --- |
| Entry number | Unique and never reused. |
| Date | The date the money moved (local date). |
| Account | The money account. |
| Direction | In or Out. |
| Amount | Whole rupees, always positive. |
| Kind | One of the kinds in section 7.2. |
| Payee | Student, vendor, staff member and so on, where there is one. |
| Category | For money out: the cost category. |
| Reference | Receipt, voucher, cheque, deposit slip or bank reference. |
| Linked document | The receipt, voucher, bill or transfer that created it. |
| Action number | Entries created by one action share it. |
| Created by, approved by | Recorded. |
| Reconciled | Set when matched to a bank statement line. |

### 7.2 Kinds

| Kind | Direction | Created by |
| --- | --- | --- |
| Opening balance | In | Setup |
| Student payment | In | Payments (automatic) |
| Student payment reversal | Out | Void or bounced cheque (automatic) |
| Cheque cleared, incoming | In (bank) | Payments, when the cheque clears |
| Refund to student | Out | Refund (automatic, with a voucher) |
| Bill payment | Out | Payment voucher |
| Payroll payment | Out | Payroll (next document) |
| Cheque cleared, issued | Out (bank) | Bank statement match or marking cleared |
| Transfer out and transfer in | Out and In | Transfer |
| Cash difference | In or Out | Day closing or a petty cash count |
| Bank charge | Out | Reconciliation or a hand entry |
| Other receipt (rare) | In | Reconciliation or a hand entry |
| Owner withdrawal | Out | Admin |
| Reversal | Opposite of the entry it reverses | Any correction |

Entries are never edited or deleted. A mistake is fixed with a reversal (section 34).

## 8. What flows in automatically

Nothing from the fee side is typed again. This table is the heart of the model.

| Event | Account | Effect |
| --- | --- | --- |
| A student pays cash | The receiving counter's cash | Money in |
| A student pays by bank or online | The bank account or wallet chosen on the payment | Money in at once. Reconciled later |
| A student pays by cheque | Cheques in hand | Held, not counted in any balance. When it clears, the bank account gets the money |
| An incoming cheque bounces | Cheques in hand or bank | The payment is reversed |
| A receipt is voided | The same account | Money out (reversal) |
| A refund is paid | The chosen account | Money out, with a payment voucher. Category "Student refunds" |
| A day is closed with a count difference | The counter's cash | A "Cash difference" entry, so the account matches the count |
| Cash is deposited in the bank | Counter cash to bank | Transfer |
| A staff payment is made | Cash or bank, by method | Money out (next document) |
| A bill is paid | The chosen account | Money out, with a payment voucher |
| An issued cheque clears | The bank account | Money out |
| The bank charges a fee | The bank account | Money out |

## 9. Transfers

A transfer moves money from one account to another. Both sides are created together, and neither is income or expense.

| Kind | Example |
| --- | --- |
| Cash deposit to bank | Counter cash to the bank account, with a deposit slip number |
| Top-up of petty cash | Bank to petty cash |
| Bank to bank | One account to another |
| Bank to wallet and back | Wallet funding |

Fields: from account, to account, amount, date, reference, note.

**Cash deposit.** After a day is closed, the counter's counted cash is available to deposit.

- The screen lists **undeposited cash**: each closed day with its counted amount, not yet deposited.
- The Accountant ticks the days, enters the deposit slip number and the bank account, and the amount defaults to the total of the ticked days.
- If the deposited amount is less than the total, a note is required. The difference stays as cash in the counter account.
- The deposit appears on the bank side as a line to be matched on the statement.

Rules: a transfer cannot make a cash or petty cash account negative, cannot be dated in a closed month, and is reversed as a pair.

## 10. Petty cash

Optional. When used:

- A **float** is set, for example 75,000.
- Each purchase is a petty cash voucher with a payee (free text is allowed), a category, an amount (up to the per-voucher limit, default 5,000) and a bill image.
- A **top-up** brings the cash back to the float. The suggested amount is the float minus the cash on hand.
- A **count** compares the counted cash with the expected balance. A difference needs a note and creates a "Cash difference" entry.
- The petty cash account cannot go below zero.

## 11. Day closing link

The day closing screen (Login, Dashboard and Students document, section 33) records expected and counted cash. This feature adds one rule: **a count difference creates a Cash difference entry** in the counter's cash account, in a category "Cash differences", so the account always equals the physical count. A shortage of 500 becomes a money-out entry of 500. An excess becomes money in.

## 12. Cash book and bank book

| View | Content |
| --- | --- |
| **Cash book** | Every entry of the counter cash and petty cash accounts, in date order, with a running balance. |
| **Bank book** | Every entry of one bank account, with a running balance and a Reconciled column. |

The running balance is calculated from the start, so filtering or searching the list **never changes the balance shown**. Both views can be printed and exported.

## 13. Samples

October to date (to 9 October 2026). Every account in one table:

| Account | Opening, 1 Oct | Money in | Money out | Closing, 9 Oct |
| --- | ---: | ---: | ---: | ---: |
| Bank (Meezan, main) | 1,172,000 | 1,380,000 | 1,292,000 | 1,260,000 |
| Counter cash | 352,000 | 640,000 | 742,000 | 250,000 |
| Petty cash | 73,000 | 30,000 | 83,000 | 20,000 |
| **Total** | **1,597,000** | **2,050,000** | **2,117,000** | **1,530,000** |

What is inside those columns:

| Account | Money in | Money out |
| --- | --- | --- |
| Bank | Student fees: bank 520,000, online 160,000, cheques cleared 100,000. **Cash deposit from the counters 600,000** | Payroll 1,050,000, rent 150,000, electricity 62,000. **Petty cash top-up 30,000** |
| Counter cash | Student fees: cash 640,000 | Payroll cash 130,000, refunds 12,000. **Deposit to the bank 600,000** |
| Petty cash | **Top-up from the bank 30,000** | Stationery 28,000, other 55,000 |

The two **transfers** (600,000 and 30,000) appear on both sides, so they cancel out. Without them:

| | PKR |
| --- | ---: |
| Money in from outside (student fees) | 1,420,000 |
| Money out to outside | 1,487,000 |
| **Net movement** | **-67,000** |

Opening 1,597,000 plus net movement -67,000 equals closing 1,530,000. Because the totals prove themselves, any error shows up.

## 14. Acceptance criteria (Feature 1)

- [ ] Every account's balance is calculated, and is the same on the overview, the account page, the dashboard and reports.
- [ ] Searching or filtering a cash book or bank book does not change its balance.
- [ ] A transfer creates two entries, and is not counted as income or expense.
- [ ] Counter cash and petty cash cannot go below zero.
- [ ] A day closing difference creates a Cash difference entry, so the cash account equals the count.
- [ ] The cash deposit screen lists closed days not yet deposited, and a short deposit needs a note.
- [ ] A top-up brings petty cash back to the float.
- [ ] The sample in section 13 reproduces exactly from the entries.

## 15. Not included

- Foreign currency accounts.
- Credit cards and loans.
- Automatic bank feeds. Statements are imported by file.

---

# Feature 2: Money In

## 16. Goals

- Show how much came in, by which route, without any retyping.
- Keep money the institute holds for others out of income.
- Show what is still owed to the institute.

## 17. Student fees (automatic)

Every payment recorded in the Payments module appears here by itself. It is classified by:

| By | Values |
| --- | --- |
| Route (payment mode) | Cash, bank, online, cheque |
| Account | The counter, bank account or wallet that received it |
| Program, session, term | From the student |
| Counter | Which receipt book and user |
| Date | The payment date |

Rules:

- A cheque counts as **money in** only when it clears, because only then does it reach a bank account. Until then it is shown as a cheque in hand.
- Voided receipts and bounced cheques appear as reversals, so totals net out.
- The fee collection view also shows **billed** (fee charges posted) and **outstanding**, so collection can be judged against what was due. These come straight from the ledger.

## 18. Money held for others (not income)

Some of the money in the accounts is not the institute's to spend. It is shown on its own, so it is never mistaken for income.

| Figure | Definition | Why it is shown separately |
| --- | --- | --- |
| **Student credit** | The sum of negative student balances. | Paid in advance. It will be applied to future fee charges or refunded. |
| **Security deposits held** | For each student, the refundable part of their fees that they have paid. It uses the same rule as the refund suggestion (fee document, section 27.3): payments are treated as paying non-refundable items first. | Refundable when the student leaves. |
| **Incoming cheques in hand** | Cheques received but not cleared. | Not yet in any account. |
| **Issued cheques not cleared** | Cheques written but not cleared (section 31). | Already committed, still in the bank. |

Sample: student credit 64,000, security deposits held 1,850,000, incoming cheques in hand 38,000, issued cheques not cleared 0.

## 19. Fees owed to the institute

A receivables view built from the ledger:

| Figure | Definition |
| --- | --- |
| Outstanding | Positive balances of Active students (2,845,000 in the sample). |
| Of which overdue | Past their due date (1,930,000). |
| Struck-off dues | Positive balances of struck-off students (410,000). |
| Ageing | Not yet due, 1 to 30, 31 to 60, 61 to 90, over 90 days. |

Each number opens the matching list of students.

## 20. Other receipts (rare)

Because income is only student fees, this feature is deliberately small and hidden from the menu. It exists so that an unexpected bank deposit during reconciliation can be recorded honestly.

| Item | Rule |
| --- | --- |
| Kinds | Bank profit, Vendor refund, Owner funds, Other |
| Who | Admin, or an Accountant up to the limit, with a reason |
| Where | Added from the reconciliation screen or the bank page |
| Reports | Shown on its own line, **outside** student fee income |

## 21. Acceptance criteria (Feature 2)

- [ ] Every student payment appears in the money-in views without being typed again.
- [ ] A cheque counts as money in only when it clears.
- [ ] Student credit, deposits held and cheques in hand are shown separately from income.
- [ ] Receivables figures equal the ledger and the dashboard.
- [ ] An other receipt needs a reason and appears outside fee income.

## 22. Not included

- Donations, rent received, sales and other income streams. These can be added later if the institute begins to earn from them.
- Scholarships funded by a donor.

---

# Feature 3: Money Out: Expenses, Bills and Payment Vouchers

## 23. Goals

- Record every cost once, with a payee, a category and a bill image.
- Handle purchases on credit: bills, due dates, part payments, and what is owed.
- Pay by cash, bank transfer or cheque, with a numbered voucher for each payment.
- Keep control: approvals, duplicate warnings, and no deleting.

## 24. Categories

Costs have two levels: a **group** and a **category**. An Admin can edit the list. Reports use the ID, so renaming never breaks history.

| Group | Categories |
| --- | --- |
| **Staff** (reserved for payroll) | Salaries: Teaching. Salaries: Administration. Salaries: Support. Honoraria: Visiting faculty. Honoraria: Clinical instructors and doctors |
| **Premises** | Rent. Utilities: Electricity. Utilities: Gas and water. Utilities: Internet and phone. Maintenance and repairs. Security and cleaning |
| **Academic** | Clinical training. Lab and consumables. Books and stationery. Exam expenses. ID cards and printing |
| **Equipment** | Furniture. Electronic equipment |
| **Marketing** | Advertisement |
| **Student related** | Student refunds (automatic) |
| **Operations** | Food and hospitality. Travel and conveyance. Legal and professional. Bank charges |
| **Differences** | Cash differences (automatic) |
| **Other** | Other |

Rules:

- The **Staff** categories can only be posted by payroll. Typing a manual expense into them is blocked: "Salaries are paid through payroll."
- Today's 14 categories map as: Salaries, Faculty payment and Doctor remuneration move to the Staff group (old records stay as history). Food, Utility bills, Building rent, Clinical training, Furniture, Electronic equipment, ID cards, Stationery, Advertisement and Other map to the matching new categories. Fee refund maps to Student refunds.
- A category can be disabled. It then disappears from entry forms but stays in reports.

## 25. Payees and vendors

| Payee type | Where it comes from |
| --- | --- |
| Vendor, Landlord, Hospital or clinical site, Utility company, Other | Added in Vendors |
| Staff member | The staff register (next document). Read-only here |
| Student | Created automatically for refunds |

Vendor fields: name (unique), type, phone, address, notes, payment terms in days (default 30), opening payable (entered at go-live), status.

A vendor with bills is never deleted. It can be made inactive.

## 26. Recording a cost

A cost is always a **bill**. It is either paid straight away or left to pay later.

| Choice | What happens |
| --- | --- |
| **Pay now** | The bill is created and a payment voucher is made at once (cash, bank transfer or cheque). |
| **Bill to pay later** | The bill is created as unpaid, with a due date. Payments are made later. |

| Field | Notes |
| --- | --- |
| Date | When the cost is recorded (posting date). Cannot be in the future or in a closed month. |
| Bill date and number | As on the vendor's bill. Informational. |
| Payee | A vendor, or free text for small petty cash purchases. |
| Category | Required. |
| Description | Required. |
| Amount | Whole rupees. |
| Due date | Defaults to the bill date plus the vendor's payment terms. |
| Program | Optional tag, to compare a program's costs with its fees. |
| Attachments | Up to 3 files (images or PDF), 3 MB each. |
| Note | Optional. |

Rules:

- A bill image is required above 5,000. Without one, a reason must be given.
- **Duplicate warning:** the same vendor and bill number, or the same vendor, amount and date.
- A back-dated cost follows the same limits as payments (Accountant up to 7 days, Admin any open day).

## 27. Bills and payables

| Status | Meaning |
| --- | --- |
| **Unpaid** | Nothing paid yet. |
| **Part paid** | Some paid, some owed. |
| **Paid** | Fully paid. |
| **Overdue** | Unpaid or part paid, past its due date. A warning on top of the status. |
| **Cancelled** | Reversed (section 34). |

- **Unpaid amount** = bill amount − payments allocated − credit from adjustments.
- A vendor's **payable** is the sum of their unpaid amounts, with ageing (not yet due, 1 to 30, 31 to 60, 61 to 90, over 90 days).
- A payment to a vendor is **allocated** to bills, oldest due date first by default, or to bills the operator chooses. An overpayment becomes **vendor credit**, applied to the next bill automatically.
- A **bill adjustment** (a discount from the vendor, or a correction) needs a reason. An Accountant can adjust up to the limit.

## 28. Recurring bills

For regular costs such as rent and electricity.

- A template holds the vendor, category, a fixed amount (or "enter each time"), and the day of the month.
- The app never posts a bill by itself. It shows a **reminder** a few days before, with the bill pre-filled. The user checks the amount, attaches the bill and saves.
- Reminders appear in Needs attention.

## 29. Payment vouchers

Every payment out has a numbered voucher.

| Item | Rule |
| --- | --- |
| Number | `PV-` and a sequence, for example `PV-0412`. Issued by the system. Never reused. |
| Pays | One or several bills of the same payee, with the allocation shown. Or a petty cash purchase. |
| Details | Payee, date, amount, mode, account, reference, bills paid, who prepared it, who approved it. |
| Print | A4 with signature lines (prepared, approved, received). |
| Register | A list of all vouchers, with void ones struck through. |

A voucher is saved with its bill allocation, its money entry and the audit entry together, or not at all.

## 30. Payment modes out

| Mode | Details | Effect |
| --- | --- | --- |
| **Cash** | From a counter cash account or petty cash. | Money out at once. Cash over 25,000 shows a warning "Consider a bank transfer", not a block. |
| **Bank transfer** | Bank account, reference or transaction ID, date. | Money out of the bank account at once. Reconciled later. |
| **Cheque** | Chequebook, cheque number, cheque date, payee name, "A/C payee only". | The bill is paid at once, but the bank balance changes only when the cheque clears (section 31). |
| **Wallet** | The wallet account and reference. | Money out of the wallet. |

## 31. Issued cheques

### 31.1 Chequebooks

| Field | Notes |
| --- | --- |
| Bank account | The account the cheques draw on. |
| From and to number | The range, for example 004850 to 004899. Ranges cannot overlap. |
| Status | Active, Full or Closed. |

The next cheque number is suggested automatically, and can be skipped only with a reason (the skipped number is kept as **Spoiled**).

### 31.2 Cheque lifecycle

| Status | Meaning |
| --- | --- |
| **Issued** | Written and handed over. The bill is paid. The bank balance is unchanged. |
| **Post-dated** | Issued with a future date. It shows "Valid from" until then. |
| **Cleared** | The bank paid it. The bank account's money out is posted, dated the clearing date. |
| **Cancelled** | Not presented and cancelled. The voucher is reversed, the bill becomes unpaid again, and the number is never reused. |
| **Stale** | Flagged when a cheque is not cleared after 6 months (changeable). The Accountant decides to cancel it or investigate. |

### 31.3 Available balance

> **Available balance = bank account balance − issued cheques that have not cleared.**

The overview and the bank page show the balance, the issued cheques not cleared, and the available balance, so nobody spends money that is already committed.

## 32. Approvals and controls

| Control | Rule |
| --- | --- |
| Pay out above the limit | Needs an Admin to approve, using an approver password. Default limit 50,000 per voucher for an Accountant. |
| Bill image | Required above 5,000, or a reason. |
| Duplicate bill | A warning, with a link to the earlier bill. |
| Cash over 25,000 | A warning. |
| Petty cash voucher | Limited to 5,000 each. |
| Staff categories | Only payroll can post to them. |
| Back-dating | Accountant up to 7 days. Admin any open day, with a reason. |
| Closed month | No entry can be dated into it. |
| Deleting | Never. Use reversal. |
| Every action | Written to the audit trail with the user, time and reason. |

## 33. Refunds, owner withdrawals and staff payments

- **Refunds** are started on the student side (Payments document, section 44). Finance receives them as a payment voucher in the category "Student refunds", with a money-out entry in the chosen account. They cannot be edited here.
- **Owner withdrawals** are for money taken out for personal use. Admin only, with a reason. They are **not** a cost and are shown on their own line in reports.
- **Staff payments** come from payroll runs (next document). They are paid by cash, bank transfer or cheque, and are grouped by method. Everyone except an Admin sees them as batch lines, for example "Payroll: bank transfer, 20 payments, 1,050,000", with no names. A single payroll cheque shows its number and amount so the bank statement can be matched, but not the staff member's name.

## 34. Corrections

Nothing is edited or deleted. Fixes are reversals:

| To fix | Action |
| --- | --- |
| A wrong payment | **Void the voucher.** The bill goes back to unpaid, the cheque is cancelled, and the money entry is reversed. |
| A wrong bill | **Cancel the bill**, if unpaid. If paid, void its vouchers first. |
| A wrong transfer | Reverse it. Both sides are reversed together. |
| A wrong amount on an unpaid bill | A bill adjustment, with a reason. |

Every reversal needs a reason and shows its effect first. Reversing something in a **reconciled** period needs the reconciliation reopened (Admin). Reversing something in a **closed month** needs the month reopened (Admin).

## 35. Samples

### 35.1 Bills and payables, 9 October 2026

| Bill | Payee | Category | Posted | Due | Amount | Paid | Unpaid | Status |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| B-0231 | Aslam Properties | Rent | 1 Oct | 5 Oct | 150,000 | 150,000 | 0 | Paid. PV-0412, bank transfer, 5 Oct |
| B-0236 | Electricity company | Utilities: Electricity | 2 Oct | 12 Oct | 62,000 | 62,000 | 0 | Paid. PV-0418, bank transfer, 9 Oct |
| B-0238 | City Teaching Hospital | Clinical training | 3 Oct | 30 Oct | 90,000 | 0 | 90,000 | Unpaid, not yet due |
| | Petty cash purchases | Stationery 28,000, Other 55,000 | Oct | | 83,000 | 83,000 | 0 | Paid from petty cash |

Total costs recorded in October: 385,000. Paid: 295,000. Still to pay (payable): 90,000.

### 35.2 A part payment by cheque, later in the month

On 20 October the Accountant pays 30,000 of B-0238 by cheque 004871 (voucher PV-0431).

| Date | Event | Cheque status | Bill B-0238 | Bank balance | Available balance |
| --- | --- | --- | --- | --- | --- |
| 20 Oct | Cheque 004871 for 30,000 issued | Issued | Part paid. Unpaid 60,000 | No change | Balance minus 30,000 |
| 24 Oct | Bank clears the cheque | Cleared | Part paid. Unpaid 60,000 | Minus 30,000 | Same as before |
| 30 Oct | Remaining 60,000 paid by bank transfer (PV-0440) | | Paid | Minus 60,000 | |

If cheque 004871 had been cancelled instead, voucher PV-0431 would be reversed, B-0238 would return to Unpaid 90,000, and the number 004871 would stay as Cancelled.

### 35.3 A voucher

| Item | Value |
| --- | --- |
| Number | PV-0418 |
| Date | 9 Oct 2026 |
| Payee | Electricity company |
| Pays | B-0236, Electricity, 62,000 |
| Mode | Bank transfer, Meezan main account, reference TRF 88213 |
| Prepared by | Saba Noor |
| Approved by | Not needed (within the limit) |

## 36. Acceptance criteria (Feature 3)

- [ ] Every cost is a bill, paid now or left to pay later, with a payee, category and amount.
- [ ] A payment is allocated to a vendor's bills, oldest due date first by default, and an overpayment becomes vendor credit.
- [ ] Every payment out has a numbered voucher that prints with signature lines.
- [ ] A payment above the Accountant's limit needs an Admin's approval.
- [ ] A cheque pays the bill at once, but the bank balance changes only when it clears, and the available balance shows the difference.
- [ ] A cancelled cheque reverses its voucher and its number is never reused.
- [ ] A manual expense cannot be posted to a Staff category.
- [ ] A duplicate bill shows a warning.
- [ ] Nothing can be deleted. Fixes are reversals with reasons.
- [ ] The sample in section 35.1 gives costs of 385,000, paid 295,000 and payable 90,000.

## 37. Not included

- Purchase orders and goods received notes.
- Inventory and stock control.
- Credit cards and loans.
- Splitting one bill across several categories (record each part as its own bill).

---

# Feature 4: Bank and Reconciliation

## 38. Goals

- Make the app's bank account agree with the real bank statement, every month.
- Replace hand-typed deposits and manual tagging with import and matching.
- Spot missing, duplicate and unexpected entries quickly.

## 39. Bank accounts and the bank ledger

The bank ledger is built by the system. Deposits come from student payments and cash deposits, withdrawals come from vouchers, transfers and cleared cheques. Nobody types a deposit or a withdrawal by hand.

Hand entries are limited to four kinds: **Bank charge**, **Other receipt** (for example bank profit), **Owner withdrawal** (Admin), and **Bank to bank transfer**.

| Column | Content |
| --- | --- |
| Date | When the money moved. |
| Kind | The kind from section 7.2. |
| Description | Plain words, for example "Student payment R-1043" or "Voucher PV-0418". |
| Linked document | A link to the receipt, voucher, deposit slip or transfer. |
| In and Out | The amount. |
| Balance | The running balance, calculated from the start. |
| Reconciled | A tick once matched to a statement line. |

A summary strip above the list shows the **balance**, **issued cheques not cleared**, the **available balance**, and the number of unreconciled lines. Searching or filtering the list never changes these figures.

## 40. Importing a statement

| Item | Rule |
| --- | --- |
| File | CSV. Column names are flexible: date, description or narration, debit or withdrawal, credit or deposit, balance (optional), reference or cheque number. |
| Mapping | The app guesses the columns and shows a preview. The choice is remembered for that bank account. |
| Checks | Dates and amounts must be valid. Bad rows are listed and skipped. |
| Duplicates | A line with the same date, amount, reference and balance as one already stored is skipped. So importing an overlapping file is safe. |
| Storage | Each line is stored as a **statement line** for that account. Statement lines are never edited. |
| Before go-live | Lines dated before the go-live date are ignored, with a count shown. |

## 41. Matching

Each statement line has a status: **Matched**, **Suggested**, or **Unmatched**.

### 41.1 How suggestions are made

| Confidence | Rule |
| --- | --- |
| **Exact** | The amount is equal, the date is within 3 days, and the reference contains a receipt, voucher, cheque or deposit slip number. |
| **Likely** | The amount is equal, the date is within 3 days, and there is only one candidate. |
| **Possible** | The amount is equal only. |

A suggestion needs a click to confirm. A setting can accept Exact matches automatically (default off).

### 41.2 Kinds of match

| Match | Example |
| --- | --- |
| One line to one entry | A bank transfer for a bill (voucher PV-0418). |
| One line to several entries | A cash deposit covering three closed days. A bulk salary debit covering 19 payroll payments. |
| A cheque by its number | A line mentioning cheque 004801 matches the issued cheque. Confirming it marks the cheque **Cleared** and posts the bank movement on the statement date. The same works for incoming cheques. |

### 41.3 Unmatched statement lines

| Action | Use |
| --- | --- |
| **Match to existing** | Choose an entry the app already has. |
| **Create entry** | Bank charge, Other receipt, Owner withdrawal (Admin), or **Record a payment out** or **Record a student payment** (each opens the normal screen, already filled in, for something done directly at the bank). |
| **Ignore** | A duplicate or a line that does not belong, with a reason. |

### 41.4 Unmatched book entries

Entries that are in the app but not on the statement are **in transit** when they are recent (within 5 days), and **need attention** when older.

## 42. Reconciling a month

1. Choose the account and the month.
2. Import or confirm the statement.
3. Confirm matches and resolve every unmatched statement line.
4. Enter the **statement closing balance**.
5. Check the figures:

> **Statement closing balance + book entries not yet on the statement that increase the account (deposits in transit) − book entries not yet on the statement that reduce it (payments in transit) = Book balance at month end.**

6. The difference must be **zero**. Then the reconciliation can be finished.

When finished:

- The reconciliation is saved: statement balance, book balance, the in-transit items, who did it and when.
- Matched entries are flagged **Reconciled**.
- Reversing a reconciled entry needs the reconciliation reopened by an Admin, with a reason.

## 43. Sample

**Meezan main account, September 2026.**

| Statement line | Type | Suggested match | Confidence |
| --- | --- | --- | --- |
| 1 Sep, debit 1,020,000, "Bulk payment" | Debit | 19 payroll payments (August pay) | Exact (batch) |
| 5 Sep, debit 150,000, "TRF Aslam Properties" | Debit | Voucher PV-0377, rent | Exact |
| 8 Sep, credit 600,000, "Cash deposit D-112" | Credit | Cash deposit D-112, three closed days | Exact (several entries) |
| 15 Sep, debit 30,000, "Cheque 004801" | Debit | Issued cheque 004801 | Exact (marks it Cleared) |
| 30 Sep, debit 1,500, "Bank charges" | Debit | None | Unmatched. **Create entry: Bank charge** |

Reconciliation figures:

| Item | PKR |
| --- | ---: |
| Statement closing balance, 30 Sep | 1,132,000 |
| Plus deposits in transit (cash deposit recorded 30 Sep, on the statement 1 Oct) | 40,000 |
| Minus payments in transit | 0 |
| **Adjusted statement balance** | **1,172,000** |
| Book balance before the bank charge entry | 1,173,500 |
| Bank charge entry created | -1,500 |
| **Book balance, 30 Sep** | **1,172,000** |
| **Difference** | **0** |

Because the difference is zero, September can be reconciled. The book balance of 1,172,000 is the opening balance used for October in section 13.

## 44. Acceptance criteria (Feature 4)

- [ ] Nobody can type a bank deposit or withdrawal by hand, except the four kinds in section 39.
- [ ] Importing the same statement twice adds no new lines.
- [ ] Suggestions follow the rules in section 41.1, and one statement line can match several entries.
- [ ] A statement line that mentions a cheque number marks the cheque cleared when confirmed.
- [ ] Every unmatched statement line must be resolved before a reconciliation can finish.
- [ ] The reconciliation formula gives a difference of zero for the September sample.
- [ ] Reversing a reconciled entry needs the reconciliation reopened.
- [ ] Filtering the bank ledger does not change the balance.

## 45. Not included

- Automatic bank feeds.
- Reading PDF statements.
- Splitting one bank line across several entries by amount.
- Foreign currency accounts.

---

# Feature 5: Budgets and Month Close

## 46. Goals

- Plan costs for every category, and see early when spending is heading over.
- Count unpaid bills as committed, so a budget is not "saved" by delaying a bill.
- Lock a month once it has been checked, so figures cannot change afterwards.

## 47. Budgets

| Item | Rule |
| --- | --- |
| What | An amount for each category, for each month, with totals for each group. |
| Who edits | Admin only. |
| Views | A month view, and a year view with every month side by side. |
| Helpers | Copy the previous month, copy the same month last year, and **spread a yearly amount evenly**. |
| Actual | The **cost view**: bills posted in the month. Shown as **Paid** and **Unpaid** (committed). |
| Alerts | An information notice at 80 percent of the budget used, and a warning at 100 percent. Alerts never block spending. |
| Staff group | Visible only to an Admin. Others see the group as one hidden row. |
| Fee collection | Not a typed target. The overview compares **fee charges due this month** with **collected**, both from the ledger. |

Sample: October 2026.

| Category | Budget | Paid | Unpaid | Total used | Used |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rent | 150,000 | 150,000 | 0 | 150,000 | 100% |
| Utilities | 70,000 | 62,000 | 0 | 62,000 | 89% |
| Clinical training | 120,000 | 0 | 90,000 | 90,000 | 75% |
| Stationery | 40,000 | 28,000 | 0 | 28,000 | 70% |
| Other | 60,000 | 55,000 | 0 | 55,000 | 92% |
| **Total** | **440,000** | **295,000** | **90,000** | **385,000** | **88%** |

Rent shows a warning (100 percent). Utilities and Other show an information notice.

## 48. Month close and lock

### 48.1 States and who does what

| State | Meaning | Who |
| --- | --- | --- |
| **Open** | Entries can still be made. | |
| **In review** | An Accountant has marked it reviewed, with notes. | Accountant or Admin |
| **Closed** | Locked. | Admin |

Months are closed **in order**. October cannot be closed while September is still open.

### 48.2 Checklist

| # | Item | Needed to close |
| ---: | --- | --- |
| 1 | Every bank account and wallet is reconciled through the end of the month. | Yes |
| 2 | Every day with receipts or vouchers has been closed with a cash count. | Yes |
| 3 | Petty cash has been counted at the end of the month. | Yes |
| 4 | No payment above the limit is waiting for approval. | Yes |
| 5 | Every unmatched statement line is resolved. | Yes |
| 6 | Staff pay for the month is finalised (next document). | Yes, if payroll is used |
| 7 | Issued cheques older than 6 months have been looked at. | No (information) |

Each item shows Done or Not done, with a link to the screen that fixes it.

### 48.3 What the lock does

- No money entry, bill, voucher or payment can be dated in that month. A payment cannot be back-dated into it.
- Reversing anything in it needs the month reopened.
- The month's budget cannot change.
- The next month's opening balances are this month's closing balances.
- Fee charges and promotions are not affected, because they are always posted today.
- A **month-end report** (PDF) is created and saved at the moment of closing (section 54).

### 48.4 Reopen

Admin only, with a reason. The audit trail records it. Entries added after a reopen are flagged **Added after close**, and the month must be reviewed and closed again.

### 48.5 Sample

September 2026: reviewed by Saba Noor on 5 October, closed by Dr. Imran Shah on 6 October. October is Open.

## 49. Acceptance criteria (Feature 5)

- [ ] A budget can be set for every category, and unpaid bills count as committed.
- [ ] Alerts appear at 80 and 100 percent and never block a cost.
- [ ] A month cannot be closed until the required checklist items are done.
- [ ] A month cannot be closed before the earlier month is closed.
- [ ] After closing, nothing can be dated into the month, and a payment cannot be back-dated into it.
- [ ] Reopening needs an Admin and a reason, and flags later entries.
- [ ] The month-end report is saved when a month is closed.

## 50. Not included

- Budgets by program or by cost centre.
- Forecasting.
- Approval of budgets by more than one person.

---

# Feature 6: Reports and Money Overview

## 51. Goals

- One page that answers "where is the money, and how are we doing?".
- A small set of reports that each answer one clear question, with every number opening the entries behind it.

## 52. Two views of the same money

| View | Built from | Counts a cost when | Used for |
| --- | --- | --- | --- |
| **Cash view** | Money entries | The money moves | Money flow, cash and bank books, balances |
| **Cost view** | Bills | The bill is recorded | Costs by category, budget versus actual, payables, program costs |

They differ on purpose. In the October sample, the clinical training bill (90,000) is a **cost** in October, but its **cash** goes out only when it is paid. Payroll is a cash movement when it is paid, and a cost in the month it is **for** (next document).

The bridge from one to the other for October to date:

| | PKR |
| --- | ---: |
| Costs recorded (cost view) | 385,000 |
| Minus bills not yet paid (clinical training) | -90,000 |
| Plus payroll paid in October (September pay) | 1,180,000 |
| Plus student refunds | 12,000 |
| **Money out (cash view)** | **1,487,000** |

## 53. Money overview figures

| Figure | Definition |
| --- | --- |
| Money in, Money out, Net | Cash view for the chosen period. Transfers are excluded. |
| Balance by account | Section 6. |
| Available balance | Bank balance minus issued cheques not cleared. |
| Cheques in hand, issued cheques not cleared | Section 18. |
| Bills unpaid, overdue, due this week | Payables (section 27). |
| Fees outstanding, overdue | Receivables (section 19). |
| Held for others | Student credit, deposits held, cheques in hand. |
| Costs and budget used | Cost view for the period. |
| Fees due this month and collected | From the ledger. |

**Needs attention** items: bills due this week, recurring bill reminders, unmatched statement lines, a month waiting for review or closing, petty cash below 25 percent of the float, payments waiting for approval, stale cheques, a bounced cheque.

## 54. Reports

| # | Report | Question it answers | View |
| ---: | --- | --- | --- |
| 1 | **Money flow** | How much came in and went out, by route and purpose? | Cash |
| 2 | **Account balances** | Where is the money, on any date? | Cash |
| 3 | **Cash book and bank book** | Every movement of an account, with a running balance. | Cash |
| 4 | **Fee collection** | How much was billed, collected and is still due, by program, session, term, counter and mode? | Ledger |
| 5 | **Costs by category** | What did we incur, and for what? | Cost |
| 6 | **Budget versus actual** | Are we on budget, including unpaid bills? | Cost |
| 7 | **Payables and vendor statement** | What do we owe, to whom, and since when? | Cost |
| 8 | **Voucher register** | Every payment out, by payee, mode and date. | Cash |
| 9 | **Held money** | What do we hold for others? | Ledger and cash |
| 10 | **Reconciliation** | Is every bank account reconciled, and what is outstanding? | Cash |
| 11 | **Month-end report** | The whole month on one set of pages, created at closing. | Both |
| 12 | **Program summary** | Fees collected compared with costs tagged to each program. | Both |
| 13 | **Payroll summary** | Staff costs. Admin only (next document). | |

All reports share these features:

- A date range, with a comparison to the previous period.
- Every number opens the entries behind it.
- Filters are kept in the page address, so a report can be bookmarked.
- Export to CSV and PDF, and print.
- Individual pay never appears for anyone except an Admin.

## 55. Sample outputs

### 55.1 Money flow, October to date (cash view)

| Money in | PKR | Money out | PKR |
| --- | ---: | --- | ---: |
| Student fees: cash | 640,000 | Payroll (September pay) | 1,180,000 |
| Student fees: bank deposit | 520,000 | Rent | 150,000 |
| Student fees: online | 160,000 | Utilities: Electricity | 62,000 |
| Student fees: cheques cleared | 100,000 | Stationery (petty cash) | 28,000 |
| | | Other (petty cash) | 55,000 |
| | | Student refunds | 12,000 |
| **Total in** | **1,420,000** | **Total out** | **1,487,000** |

Net movement -67,000. Transfers of 630,000 (cash deposit 600,000 and petty cash top-up 30,000) are left out. Balances are in section 13.

### 55.2 Payables, 9 October 2026

| Payee | Not yet due | 1 to 30 days | 31 to 60 | 61 to 90 | Over 90 | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| City Teaching Hospital | 90,000 | 0 | 0 | 0 | 0 | 90,000 |
| **Total** | **90,000** | **0** | **0** | **0** | **0** | **90,000** |

### 55.3 Held money and fees owed

| Figure | PKR |
| --- | ---: |
| Student credit | 64,000 |
| Security deposits held | 1,850,000 |
| Incoming cheques in hand | 38,000 |
| Fees outstanding (active students) | 2,845,000 |
| Of which overdue | 1,930,000 |
| Struck-off dues | 410,000 |

## 56. Acceptance criteria (Feature 6)

- [ ] The overview shows balances, available balance, payables, receivables and held money, all from the same calculations as the other screens.
- [ ] The money flow sample reproduces 1,420,000 in, 1,487,000 out and -67,000 net.
- [ ] The bridge between cost view and cash view reproduces exactly (section 52).
- [ ] Every number in every report opens its entries.
- [ ] No report shows an individual's pay to anyone except an Admin.
- [ ] Every report exports to CSV and PDF and prints.
- [ ] The month-end report is created when a month is closed.

## 57. Not included

- Tax reports.
- Statutory accounts, balance sheets and profit and loss statements for external filing.
- Custom report builders.

---

# Frontend Design

These screens use the design system in `FRONTEND_DESIGN.md`: colours, money and date formats, tables, drawers, dialogs, toasts and the permission hook. Only what is new is described here.

## 58. Navigation and routes

**Sidebar.** The Finance area is split into two groups. Counter operators only see the first.

```text
FEES                              FINANCE
 Payments                          Overview
 Receipts                          Bills and expenses
 Cheques (incoming)                Pay out
 Ledger                            Vendors
 Day book                          Accounts
 Day closing                       Bank and reconciliation
                                   Issued cheques
                                   Budgets
                                   Reports
                                   Month close
```

| Route | Screen | Permission |
| --- | --- | --- |
| `/finance` | Overview | `finance.view` |
| `/finance/accounts` | Accounts | `finance.view` |
| `/finance/accounts/:id` | Account page (cash book or bank book) | `finance.view` |
| `/finance/deposit` | Cash deposit to bank | `finance.transfer` |
| `/finance/petty-cash` | Petty cash | `finance.petty` |
| `/finance/bills` | Bills and expenses | `finance.view` |
| `/finance/bills/new` | Record a cost | `finance.bills` |
| `/finance/bills/:id` | Bill page | `finance.view` |
| `/finance/pay` | Pay out | `finance.pay` |
| `/finance/vouchers`, `/finance/vouchers/:id` | Voucher register and voucher | `finance.view` |
| `/finance/vendors`, `/finance/vendors/:id` | Vendors and vendor page | `finance.view` |
| `/finance/cheques` | Issued cheques | `finance.view` |
| `/finance/bank/:accountId/import` | Statement import | `finance.reconcile` |
| `/finance/reconcile/:accountId/:month` | Reconciliation workspace | `finance.reconcile` |
| `/finance/budgets` | Budgets | `finance.view` |
| `/finance/month-close` | Month close | `finance.view` |
| `/finance/reports`, `/finance/reports/:name` | Reports | `finance.view` |
| `/expenses` and `/bank` | Old addresses. Redirect to `/finance/bills` and `/finance/accounts` | |

## 59. Overview page

### 59.1 Layout

```text
Finance overview                              Period [October 2026 v]       [Print]

+-- Money in -------+ +-- Money out ------+ +-- Net --------+ +-- Costs (cost view) --+
| 1,420,000         | | 1,487,000         | | -67,000       | | 385,000               |
| Cash       640,000| | Payroll 1,180,000 | |               | | Paid 295,000          |
| Bank       520,000| | Bills and petty   | |               | | Unpaid 90,000         |
| Online     160,000| |   cash    295,000 | |               | | Budget used 88%       |
| Cheques    100,000| | Refunds    12,000 | |               | |                       |
+-------------------+ +-------------------+ +---------------+ +-----------------------+

+-- Where the money is -----------------------------------------------------------+
| Account           Balance      Issued cheques    Available                       |
| Meezan, main      1,260,000    0                 1,260,000                    >  |
| Counter cash        250,000    (not yet deposited)                              >  |
| Petty cash           20,000    float 75,000                                     >  |
| Total             1,530,000                                                      |
+----------------------------------------------------------------------------------+

+-- Owed to you ---------+ +-- You owe -------------+ +-- Held for others -------+
| Fees outstanding       | | Bills unpaid     90,000| | Student credit    64,000 |
|            2,845,000 > | |  due this week        0| | Deposits held  1,850,000 |
|  of which overdue      | |  overdue              0| | Cheques in hand   38,000 |
|            1,930,000   | | Next due: 30 Oct       | |                          |
| Struck-off dues        | | City Teaching Hospital | |                          |
|              410,000   | |                        | |                          |
+------------------------+ +------------------------+ +--------------------------+

+-- Needs attention ---------------------------------+ +-- Budget, October -----------+
| (!) 2 recurring bills are due to be entered  [Open]  | | Total used 88%   [=======-]  |
| (!) 3 statement lines not matched            [Open]  | | Rent       100%  (!)         |
| (i) September is waiting to be closed        [Open]  | | Other       92%  (i)         |
| (i) Petty cash is below 25% of the float     [Open]  | | [Open budgets]               |
+------------------------------------------------------+ +------------------------------+
```

### 59.2 Behaviour

| Element | Behaviour |
| --- | --- |
| Period | A month selector. Defaults to the current month. A "Year to date" option is available. |
| Money in and out | Cash view. Each line opens the money flow report for that line. Transfers are left out. |
| Costs card | Cost view. Opens the costs report. |
| Where the money is | One row per account. A row opens the account page. The available balance is shown only when issued cheques exist. |
| Owed to you, You owe, Held for others | Three small groups. Every number is a link to its list. |
| Needs attention | Only items with a count above zero. A green tick when there are none. |
| Budget | Shows the total and the categories at or above 80 percent. |
| Roles | An Accountant sees everything except individual pay. A Viewer sees the same, read-only. A counter operator does not see this page. |
| Loading and errors | Skeleton cards while loading. A danger banner with **Retry** on failure. |

## 60. Accounts

### 60.1 Accounts list

```text
Accounts                                                  [+ New account]  [Transfer]
Account              Type          Balance      Reconciled to    Status
Meezan, main         Bank          1,260,000    30 Sep 2026      Active   >
Kamran's counter     Counter cash    130,000    -                Active   >
Farah's counter      Counter cash    120,000    -                Active   >
Petty cash           Petty cash       20,000    -                Active   >
Total                              1,530,000
```

Each row opens the account page. **New account** is Admin only. A new account asks for its type, name, bank details (for a bank), opening balance and opening date.

### 60.2 Account page

```text
< Accounts
Meezan, main   Bank   ...4821                           [Add bank entry v] [Import statement]
Balance 1,260,000   Issued cheques not cleared 0   Available 1,260,000   Unreconciled lines 3

 Movements | Statement lines | Reconciliations | Details
---------------------------------------------------------------------------------------------
[ Search... ]  [Date v] [Kind v] [Reconciled v]
Date        Kind              Description                   In          Out        Balance   Rec
9 Oct 2026  Bill payment      Voucher PV-0418, Electricity              62,000    1,260,000  [ ]
6 Oct 2026  Transfer in       Cash deposit D-118          600,000                 1,322,000  [ ]
5 Oct 2026  Bill payment      Voucher PV-0412, Rent                    150,000    722,000    [x]
...
```

| Element | Behaviour |
| --- | --- |
| Header strip | Balance, issued cheques not cleared, available balance and the unreconciled count. They never change when the list is filtered. |
| Add bank entry | A menu with four items only: Bank charge, Other receipt, Owner withdrawal (Admin), Bank to bank transfer. |
| Movements | The bank book (or cash book for cash accounts). Each row links to its receipt, voucher, deposit slip or transfer. |
| Statement lines | The imported lines with their match status. |
| Reconciliations | One row per month: statement balance, book balance, difference, who, when, **Reopen** (Admin). |
| Cash accounts | No Statement lines or Reconciliations tab. A **Count cash** button instead (section 66). |

### 60.3 Transfer dialog

```text
+------------------------------------------------------+
| Transfer money                                        |
| From   [Petty cash v]        Balance 20,000           |
| To     [Meezan, main v]                               |
| Amount [______]      Date [9 Oct 2026]                |
| Reference [__________]  Note [___________________]    |
| (i) Transfers are not income or expense.              |
|                         [Cancel]   [Transfer]         |
+------------------------------------------------------+
```

The **From** account's balance is shown, and a transfer that would make a cash account negative is blocked with "Not enough cash."

### 60.4 Cash deposit to bank

```text
Cash deposit to bank
Undeposited cash                                         Bank account [Meezan, main v]
[x] Day        Counter           Counted cash
[x] 7 Oct      Kamran's counter     52,500
[x] 7 Oct      Farah's counter      41,000
[x] 8 Oct      Kamran's counter    44,000
[ ] 9 Oct      (day not closed yet)
Selected 137,500       Deposit slip no. [D-119]     Deposit amount [137,500]
(i) A smaller deposit needs a note, and the difference stays as cash.
                                                   [Cancel]   [Record deposit]
```

Only closed days appear. A day that has not been closed is shown greyed with the reason.

## 61. Record a cost

A full page for a new bill or expense.

```text
Record a cost                                                           [Cancel]
What happens:   (o) Pay now      ( ) Bill to pay later

Payee *       [City Teaching Hospital v]   [+ New vendor]
Category *    [Academic > Clinical training v]
Description * [Clinical training, September batch______________]
Amount *      [ 90,000 ]        Date [9 Oct 2026]
Bill number   [CTH-2210]   Bill date [3 Oct 2026]   Due date [30 Oct 2026]
Program tag   [None v]                (optional)
Attachments   [ Drop files here, or choose ]   bill-cth-2210.pdf  [x]
Note          [_________________________________________]

(Pay now) Paid from  [Meezan, main v]   Mode [Bank transfer v]   Reference [_______]

(!) A bill image is attached.      (i) No similar bill found.
                                  [Cancel]   [Save bill]   [Save and pay now]
```

| Element | Behaviour |
| --- | --- |
| What happens | **Pay now** shows the payment section and the **Save and pay now** button. **Bill to pay later** hides it and the button reads **Save bill**. |
| Payee | A searchable list of vendors. **New vendor** opens a small drawer. Petty cash costs under the limit also allow free text. |
| Category | A two-level list. Staff categories are shown greyed with "Paid through payroll". |
| Due date | Defaults to the bill date plus the vendor's payment terms. |
| Attachments | Drop zone for images and PDF. Up to 3, 3 MB each. A thumbnail preview. Above 5,000 a missing image shows an amber note and asks for a reason on save. |
| Duplicate check | A banner links to the earlier bill when the vendor and bill number, or vendor, amount and date, match. |
| Payment section | The mode panel from section 63. A cash payment shows the cash account's balance. |
| Approval | If paying above the limit, an approver box appears (username and password). |
| Closed month | A date in a closed month shows a red message and disables save. |
| Save | One click saves the bill and, for Pay now, its voucher together. |

## 62. Bills and expenses

### 62.1 List

```text
Bills and expenses                                                [+ Record a cost]
[ Search payee, bill no, description... ]  [Category v] [Payee v] [Date v] [Program v]
All 41 | Unpaid 3 | Overdue 0 | Paid 38

Bill     Posted   Payee                   Category            Amount   Unpaid   Status
B-0238   3 Oct    City Teaching Hospital  Clinical training   90,000   90,000   Unpaid   Due 30 Oct
B-0236   2 Oct    Electricity company     Electricity         62,000        0   Paid     PV-0418
B-0231   1 Oct    Aslam Properties        Rent               150,000        0   Paid     PV-0412
...
Showing 1-20 of 41                                                 Total unpaid 90,000
```

- Tabs show live counts. **Overdue** rows show a red badge with the days.
- Filters and tab are kept in the page address.
- Row menu: Open, Pay, Adjust, Cancel (unpaid only).

### 62.2 Bill page

```text
< Bills
B-0238   City Teaching Hospital                                [Unpaid]   [Pay] [More v]
Clinical training, September batch
Posted 3 Oct 2026   Bill date 3 Oct   Due 30 Oct 2026   Category: Academic > Clinical training

+-- Amount ------------+  +-- Payments ----------------------------------------------+
| Bill       90,000    |  | Voucher   Date     Mode         Amount                    |
| Paid            0    |  | (none yet)                                                |
| Unpaid     90,000    |  |                                                           |
+----------------------+  +-----------------------------------------------------------+
Attachments:  [bill-cth-2210.pdf]
 History | Notes
```

**More** holds Adjust bill, Cancel bill, and Add note. After a part payment, the Payments card lists each voucher with a link, and a voided voucher is struck through.

## 63. Pay out

A full page that pays one or more bills of a payee, or makes a petty cash payment.

```text
Pay out                                                                 [Cancel]
Payee *  [City Teaching Hospital v]       Payable 90,000     Vendor credit 0

Bills to pay        (o) Oldest due first    ( ) Choose bills
[x] B-0238   Due 30 Oct 2026    Unpaid 90,000     Pay [ 30,000 ]

Amount  30,000     Date [20 Oct 2026]
Mode    ( ) Cash   ( ) Bank transfer   (o) Cheque   ( ) Wallet

Cheque   Chequebook [Meezan 004850-004899 v]   Number [004871]
         Cheque date [20 Oct 2026]   Payee name [City Teaching Hospital]  [x] A/C payee only
(i) The bill is paid now. The bank balance changes when the cheque clears.

Preview   B-0238  90,000 unpaid -> 60,000          Vendor credit after: 0
          Available balance after: 1,230,000

(!) 30,000 is within your limit.
                                          [Cancel]   [Pay and print voucher]
```

Mode panels:

| Mode | Fields |
| --- | --- |
| Cash | Paid from (a counter cash account or petty cash) with its balance. A warning for over 25,000. |
| Bank transfer | Bank account, reference or transaction ID, date. |
| Cheque | Chequebook, number (suggested), cheque date, payee name, "A/C payee only". A future date shows "Post-dated". |
| Wallet | Wallet account, reference. |

| Element | Behaviour |
| --- | --- |
| Allocation | Oldest due first by default. **Choose bills** lets the user tick bills and set amounts. An amount above what is owed shows "This leaves 5,000 as vendor credit." |
| Preview | Updates as the amount changes. Shows each bill before and after, and the available balance. |
| Limit | Above the limit the button changes to **Request approval**, and an approver box appears. |
| Save | One click saves the voucher, allocation, money entry (or cheque) and audit entry together. The voucher prints on success. |
| After saving | A success screen shows the voucher number, the new unpaid amount, and **Print again**, **Pay another bill** and **Open bill**. |

## 64. Vendors

### 64.1 List

```text
Vendors                                                           [+ New vendor]
[ Search... ]  [Type v]  [Status v]
Vendor                   Type       Payable    Overdue   Terms    Last payment
City Teaching Hospital   Hospital    90,000         0    30 days  -
Aslam Properties         Landlord         0         0    5 days   5 Oct 2026
Electricity company      Utility          0         0    10 days  9 Oct 2026
Total payable                         90,000
```

### 64.2 Vendor page

```text
< Vendors
City Teaching Hospital   Hospital   Terms 30 days                      [Edit] [Pay out]
Payable 90,000   Overdue 0   Credit 0   Lifetime paid 270,000

 Bills | Payments | Statement | Details
Ageing:  Not yet due 90,000 | 1-30 0 | 31-60 0 | 61-90 0 | Over 90 0
Bills:   B-0238  3 Oct 2026  Due 30 Oct 2026  90,000  Unpaid
```

**Statement** shows the vendor's bills, payments and running payable for a period, and prints (section 72).

## 65. Issued cheques

```text
Issued cheques                                      [+ New chequebook]
[Bank account v]  [Status v]  [Post-dated only]
Issued, not cleared: 1 cheque, 30,000                    Stale: 0

Cheque   Date         Payee                    Amount   Voucher   Status       Action
004871   20 Oct 2026  City Teaching Hospital   30,000   PV-0431   Issued       [Cleared] [Cancel]
004850   2 Oct 2026   Stationery shop           8,000   PV-0405   Cleared
004849   -            -                          -       -         Spoiled
```

| Element | Behaviour |
| --- | --- |
| Chequebooks | A list with range, bank account, used and left. The **New chequebook** drawer checks ranges do not overlap. |
| Status badges | Issued, Post-dated, Cleared, Cancelled, Stale, Spoiled. |
| Mark cleared | Asks for the clearing date, then posts the bank money entry. Normally this is done from reconciliation. |
| Cancel | Shows the effect (voucher reversed, bill returns to unpaid) and asks for a reason. The number is never reused. |
| Stale | A cheque not cleared after 6 months shows an amber **Stale** badge and a note in Needs attention. |
| Payroll cheques | Show number, date, amount and status, but the payee is shown as "Payroll" for everyone except an Admin. |

## 66. Petty cash

```text
Petty cash                                  [Top up]  [Count cash]  [New voucher]
Float 75,000      Balance 20,000      Suggested top-up 55,000
(!) Below 25% of the float.

Date     Voucher   Payee            Category     Amount    Bill
8 Oct    PV-0422   Stationery shop  Stationery    4,200    [image]
8 Oct    PV-0421   Tea and snacks   Food          2,800    [image]
...
```

- **New voucher** is a short form: payee (free text allowed), category, amount (up to 5,000), bill image.
- **Top up** opens the transfer dialog with the bank account chosen, and the suggested amount (float minus balance) filled in.
- **Count cash** asks for the counted amount. A difference needs a note and creates a Cash difference entry.
- A voucher that would take the balance below zero is blocked: "Not enough cash. Top up first."

## 67. Bank and reconciliation

### 67.1 Import wizard

A page with four stages: **Upload, Check columns, Preview, Done**.

```text
Import statement: Meezan, main                       Stage 2 of 4  Check columns
Detected columns:
 Date [Txn Date v]  Description [Narration v]  Debit [Withdrawal v]  Credit [Deposit v]
 Balance [Closing Balance v]  Reference [Chq No v]               (remembered for next time)
Preview (first 5 lines)  ...
Lines 38   Valid 37   Errors 1   Duplicates 0   Before go-live 0
                                                     [Back]   [Continue]
```

The result page offers **Start matching**.

### 67.2 Reconciliation workspace

```text
Reconcile: Meezan, main, September 2026                         [Finish reconciliation]
Statement closing balance [ 1,132,000 ]
+-- Statement lines (5) -----------------------+  +-- App entries (not yet matched) ---+
| 1 Sep  Dr 1,020,000 Bulk payment             |  | 30 Sep  Transfer in  Deposit D-119  |
|   Suggested: 19 payroll payments   [Confirm] |  |         40,000        (in transit)  |
| 5 Sep  Dr   150,000 TRF Aslam Properties     |  |                                     |
|   Suggested: PV-0377 Rent          [Confirm] |  |                                     |
| 8 Sep  Cr   600,000 Cash deposit D-112       |  |                                     |
|   Suggested: Deposit D-112 (3 days) [Confirm]|  |                                     |
| 15 Sep Dr    30,000 Cheque 004801            |  |                                     |
|   Suggested: Cheque 004801         [Confirm] |  |                                     |
| 30 Sep Dr     1,500 Bank charges             |  |                                     |
|   No match   [Create entry v] [Match] [Ignore]|  |                                     |
+----------------------------------------------+  +-------------------------------------+

Check   Statement balance           1,132,000
        + Deposits in transit          40,000
        - Payments in transit               0
        = Adjusted statement balance 1,172,000
          Book balance               1,172,000      Difference 0   [ok]
```

| Element | Behaviour |
| --- | --- |
| Two panes | Statement lines on the left, app entries not yet matched on the right. Selecting one on each side and pressing **Match** matches them. A line can be matched to several entries. |
| Suggestions | Shown under each line with a confidence badge (Exact, Likely, Possible). **Confirm** accepts one. **Confirm all exact** accepts every Exact suggestion after a summary. |
| Create entry | A menu: Bank charge, Other receipt, Owner withdrawal (Admin), Record a payment out, Record a student payment. The last two open the normal screens, prefilled. |
| Check panel | Updates live. The **Finish** button is enabled only when every line is resolved and the difference is zero. |
| In transit | Entries not on the statement are labelled **in transit** (within 5 days) or **needs attention**. |
| Finish | Saves the reconciliation, flags matched entries Reconciled, and returns to the account page. |

## 68. Budgets

```text
Budgets                     Month [October 2026 v]  View [Month | Year]      [Copy from...]
Category            Budget     Paid     Unpaid   Used
Premises
  Rent              150,000  150,000        0    100%  [=========] (!)
  Utilities          70,000   62,000        0     89%  [========-] (i)
Academic
  Clinical training 120,000        0   90,000     75%  [======---]
  Stationery         40,000   28,000        0     70%  [=====----]
Operations
  Other              60,000   55,000        0     92%  [========-] (i)
Staff              (hidden)
Total               440,000  295,000   90,000     88%
```

| Element | Behaviour |
| --- | --- |
| Editing | Admin only. Budget cells become inputs. **Copy from** offers the previous month or the same month last year. **Spread a yearly amount** divides an amount evenly across months. |
| Bars | Green below 80 percent, amber from 80, red from 100. Each bar shows paid and unpaid parts in two shades. |
| Year view | Months across, categories down, with totals. |
| Staff row | Shown only to an Admin. For others it is hidden. |
| Locked month | Budget cells are read-only with a lock icon. |

## 69. Month close

```text
Month close                                                   [September 2026 v]
September 2026   [Closed]   Reviewed by Saba Noor, 5 Oct.  Closed by Dr. Imran Shah, 6 Oct.

October 2026   [Open]                                  [Mark as reviewed]  [Close month]
 [x] 1  Every bank account is reconciled through 31 Oct          (not yet: 1 account)  [Reconcile]
 [ ] 2  Every day has been closed with a cash count               (2 days open)         [Day closing]
 [ ] 3  Petty cash counted at month end                                                   [Count]
 [x] 4  No payments waiting for approval
 [ ] 5  Every unmatched statement line is resolved                (3 left)               [Open]
 [ ] 6  Staff pay for the month is finalised                                              [Payroll]
 [i] 7  Issued cheques older than 6 months looked at              (0)
Review notes  [_____________________________________________]
```

| Element | Behaviour |
| --- | --- |
| Checklist | Each item shows a tick, the reason it is not done, and a button to fix it. |
| Mark as reviewed | Accountant or Admin. Saves the notes and moves the month to **In review**. |
| Close month | Admin only. Enabled when all required items are done and the earlier month is closed. Opens a confirmation dialog (below). |
| Closed month | Shows who reviewed and closed it, the saved month-end report, and **Reopen** (Admin). |

Close confirmation:

```text
+--------------------------------------------------------------+
| Close September 2026?                                         |
| After closing, nothing can be dated in this month, and         |
| payments cannot be back-dated into it. A month-end report      |
| will be saved.                                                 |
| [x] I have checked the figures.                                |
|                              [Cancel]   [Close September]      |
+--------------------------------------------------------------+
```

Reopening asks for a reason and warns that later entries will be flagged.

## 70. Reports

### 70.1 Reports hub

A grid of cards, each phrased as the question it answers ("Where is the money?", "What do we owe?"), grouped as **Money**, **Costs**, **Fees**, **Control**. Each card has a one-line description and its view (Cash or Cost).

### 70.2 A report page

```text
Money flow                       Date [1 Oct 2026] to [9 Oct 2026]  Compare [Previous period v]
Account [All v]                                    [Export CSV] [Export PDF] [Print]

Money in                         PKR     Previous    | Money out                  PKR     Previous
Student fees: cash            640,000   ...          | Payroll (September pay)  1,180,000  ...
Student fees: bank            520,000   ...          | Rent                      150,000  ...
Student fees: online          160,000   ...          | Utilities: Electricity     62,000  ...
Student fees: cheques cleared 100,000   ...          | Stationery                 28,000  ...
                                                      | Other                      55,000  ...
                                                      | Student refunds            12,000  ...
Total in                    1,420,000                 | Total out               1,487,000
Net movement  -67,000        (Transfers of 630,000 are left out)   [Show transfers]
```

| Element | Behaviour |
| --- | --- |
| Drill-down | Every number is a link that opens the entries behind it. |
| Compare | None, Previous period, Same period last year. |
| Filters | In the address. A report can be bookmarked or shared as a link. |
| Show transfers | Reveals the transfer lines for people who want to see them. |
| Hidden pay | Payroll lines show batch totals. Names and individual pay are visible only to an Admin. |

## 71. Other dialogs

| Dialog | Content |
| --- | --- |
| **Void voucher** | The voucher, the effect (bill returns to unpaid, cheque cancelled, money entry reversed), a reason, and approval if over the limit. |
| **Cancel bill** | Only for an unpaid bill. Shows "No money has been paid on this bill." and asks for a reason. |
| **Adjust bill** | Add or reduce, amount, reason. Shows the new unpaid amount. |
| **Owner withdrawal** | Admin only. Account, amount, reason. "This is not a cost." |
| **Other receipt** | Kind (Bank profit, Vendor refund, Owner funds, Other), account, amount, reason. |
| **Bank charge** | Account, amount, date, note. |
| **Approver prompt** | Username and password boxes for an Admin approving a payment above the limit. |
| **Count cash** | Counted amount, an optional count by notes and coins, note if there is a difference. |
| **Reopen reconciliation or month** | A reason and a clear warning of what it unlocks. |

## 72. Print layouts

### 72.1 Payment voucher (A4)

```text
+--------------------------------------------------------------+
| [logo] AL-SHIFA MEDICAL INSTITUTE            PAYMENT VOUCHER   |
|                                          No. PV-0418           |
|                                          9 Oct 2026            |
+--------------------------------------------------------------+
| Paid to:  Electricity company                                  |
| For:      B-0236  Electricity, September bill          62,000 |
| Mode:     Bank transfer, Meezan main account, ref TRF 88213    |
| Amount in words:  Sixty-two thousand rupees only               |
+--------------------------------------------------------------+
| Prepared by: Saba Noor    Approved by: ________    Received by: ________ |
+--------------------------------------------------------------+
```

A voided voucher reprints with a large **VOID** mark. A voucher approved above the limit shows the approver's name.

### 72.2 Other layouts

| Layout | Paper | Content |
| --- | --- | --- |
| Vendor statement | A4 | Vendor, period, bills, payments, running payable, ageing. |
| Cash book and bank book | A4 landscape | Account, period, entries with running balance, opening and closing. |
| Reconciliation report | A4 | Statement balance, in-transit items, book balance, difference, who and when. |
| Payables list | A4 | Unpaid bills by vendor with due dates and ageing. |
| Cash deposit slip summary | A4 | Days included, counters, amounts, deposit slip number. |
| Month-end report | A4 | Cover page, money flow, balances, payables, cost view versus budget, reconciliation summary, held money, receivables, review notes, signatures. |

Page headers repeat on every page. Rows never split across pages. Individual pay never appears on any layout except in the Admin-only payroll report.

## 73. Messages, validation and states

### 73.1 Messages

| Situation | Message |
| --- | --- |
| Cash account would go negative | "Not enough cash in Petty cash (20,000). Top up first." |
| Closed month | "September 2026 is closed. Choose a date in an open month, or ask an Admin to reopen it." |
| Staff category | "Salaries are paid through payroll." |
| Duplicate bill | "A bill from this payee with the same bill number already exists: B-0231." |
| Missing bill image | "Add the bill image, or give a reason." |
| Over the limit | "60,000 is above your limit of 50,000. An Admin must approve it." |
| Cash over 25,000 | "Cash payments over 25,000 are not recommended. Consider a bank transfer." |
| Overpayment | "This leaves 5,000 as vendor credit. It will be applied to the next bill." |
| Transfer | "Transfers are not income or expense." |
| Cheque number used | "Cheque 004871 has already been used." |
| Difference not zero | "The difference is 1,500. Resolve every statement line before finishing." |
| Reconciled entry | "This entry is reconciled. Reopen the reconciliation to reverse it." |
| Month cannot close | "September is still open. Close it first." |
| Statement file | "Line 14: the date is not valid." |

### 73.2 States

| Situation | Display |
| --- | --- |
| Loading | Skeleton cards and rows, never a blank page. |
| No accounts yet | "Set up your accounts" with the opening position steps (section 78). |
| Nothing to show | An empty state with one clear button. |
| Save failed | A danger banner "Nothing was saved." with **Try again**. |
| Locked item | A lock icon with a tooltip explaining why. |
| No access | The "No access" page (frontend document, section 5.5). |

## 74. Keyboard, accessibility and responsiveness

| Area | Detail |
| --- | --- |
| Keyboard | `Ctrl+Enter` saves forms. `/` focuses search. Arrow keys move through lists. In the reconciliation workspace, arrow keys move between statement lines, `Enter` confirms the suggestion, `M` matches, and `I` ignores. `Esc` closes dialogs. |
| Focus | Dialogs and drawers trap focus and return it on close. |
| Screen readers | Money cells include their sign and words ("Out 62,000"). The reconciliation check panel is a labelled region that announces "Difference 0". |
| Colour | Status always has a word. Budget bars also show numbers. Overdue always shows days. |
| Safety | Buttons name their effect ("Pay and print voucher", "Close September"), never just OK. |
| Widths | Designed for 1280 px and wider. Between 1024 and 1279 px, tables scroll inside their card and the overview cards stack in two columns. Below 1024 px the app shows its "use a larger window" message. |

## 75. Components and data

### 75.1 Components

| Component | Notes |
| --- | --- |
| `AccountBalanceCard` | A balance with issued cheques and available balance. |
| `MoneyEntryTable` | The bank book and cash book table with running balance and links. |
| `BillForm`, `PayOutForm` | The two main forms, with the payment mode panels. |
| `AllocationPreview` | Shared with the Payments module. Used for bills too. |
| `PaymentModePanel` | Cash, bank transfer, cheque and wallet fields. |
| `ChequeStatusBadge` | Issued, Post-dated, Cleared, Cancelled, Stale, Spoiled. |
| `BillStatusBadge` | Unpaid, Part paid, Paid, Overdue, Cancelled. |
| `AttachmentDrop` | Drop zone, thumbnails, size checks. |
| `ReconcileWorkspace` | The two panes and the check panel. |
| `MatchSuggestion` | A suggestion with a confidence badge and Confirm button. |
| `BudgetBar` | Paid and unpaid shades with a percentage. |
| `MonthChecklist` | The close checklist. |
| `ApproverPrompt` | Shared with the Payments module. |
| `ReportTable` | A report table with compare columns and drill-down links. |

### 75.2 Data layer

| Function | Purpose |
| --- | --- |
| `accountBalance(account, date)` | Opening plus cleared entries. The only place a balance is calculated. |
| `postTransfer`, `postCashDeposit` | Create both sides together. |
| `recordBill`, `payBills`, `voidVoucher` | Bills, allocation and vouchers, each saved all-or-nothing. |
| `issueCheque`, `clearCheque`, `cancelCheque` | The issued cheque lifecycle. |
| `importStatement`, `suggestMatches`, `confirmMatch` | Statement lines and matching. |
| `reconcile(account, month)` | The check and the finish. |
| `closeMonth`, `reopenMonth` | The month lock. |
| `moneyFlow`, `costView`, `payables`, `heldMoney`, `receivables` | The report queries. |

Screens read and write only through these functions. Balances, available balances, payables and report totals are always calculated, never stored.

## 76. Acceptance criteria (frontend)

- [ ] The sidebar shows the Fees and Finance groups, and counter operators see only the Fees group.
- [ ] The overview shows money in, money out, net, balances, available balance, payables, receivables and held money, and every figure opens its list.
- [ ] A cost can be recorded as pay now or bill to pay later, with attachments, duplicate warning and approvals.
- [ ] Pay out previews the allocation and the available balance, and saves the voucher, allocation and money entry together.
- [ ] A cheque payment shows the bank balance unchanged until it clears.
- [ ] The cash deposit screen lists only closed days and requires a note for a short deposit.
- [ ] The reconciliation workspace shows suggestions with confidence, supports one line to several entries, and enables Finish only when the difference is zero.
- [ ] Budgets show paid and unpaid parts, and the Staff row is hidden from non-Admin users.
- [ ] The month close page blocks closing until the required items are done and the earlier month is closed.
- [ ] Reports show every number as a link, compare periods, and export and print.
- [ ] No screen or print layout shows an individual's pay to anyone but an Admin.
- [ ] Every page has loading, empty and error states.

---

# Shared Sections

## 77. Settings

| Setting | Default |
| --- | --- |
| Accountant payout limit (per voucher) | 50,000 |
| Accountant limit for reversals, bank charges and other receipts | 50,000 |
| Bill image required above | 5,000 |
| Petty cash per-voucher limit | 5,000 |
| Cash payment warning above | 25,000 |
| Duplicate bill window | Same vendor and bill number, or same vendor, amount and date |
| Back-dating limit for an Accountant | 7 days (shared with Payments) |
| Cheque stale after | 6 months |
| Accept exact statement matches automatically | Off |
| In-transit window for unmatched entries | 5 days |
| Petty cash low warning | Below 25 percent of the float |
| Budget alerts | 80 percent and 100 percent |
| Default vendor payment terms | 30 days |
| Voucher prefix | `PV-` |
| Cost categories | The list in section 24 |

## 78. Starting out and moving old data

### 78.1 Starting out

1. **Choose a go-live date.** From this date the app's records are the official ones.
2. **Enter opening balances** for each account, from the real bank statement and the actual cash counted on that date. An **Opening position** screen lists every account with a box for its balance and a total.
3. **Enter opening payables:** the unpaid bills from each vendor at the go-live date, as opening bills with their due dates.
4. **Create chequebooks** with the ranges in use, and note issued cheques not yet cleared.
5. **Set the budget** for the first month.

Until the opening balances are entered, the overview shows "Set up your accounts" and money screens are read-only.

### 78.2 Moving today's data

| Today | Becomes |
| --- | --- |
| Expenses | Kept as **history**, marked "Before go-live" and read-only. They are not counted in any balance. Bill images are kept. |
| Expense categories | Mapped as in section 24. |
| Expense "source" (petty cash or bank) | Kept on the history record. |
| Bank transactions and their stored balance | Kept as history. The real balance comes from the opening balance entered at go-live. |
| Manual tags linking withdrawals to expenses | Kept on the history records. New matching uses reconciliation. |
| Budgets | Mapped to the new categories. |
| Receipt-linked bank deposits | Continue automatically from the Payments module after go-live. |

Records dated on or after the go-live date that already exist are re-entered through the new screens, or imported from the old data with a one-time tool that creates bills and vouchers.

## 79. Test cases

These should be written as automated tests before the screens that use them.

| # | Case | Input | Expected result |
| ---: | --- | --- | --- |
| 1 | Account balance | Bank: opening 1,172,000, in 1,380,000, out 1,292,000 | 1,260,000 |
| 2 | Transfer | Cash deposit 600,000 | Counter cash -600,000, bank +600,000. Money in and out from outside unchanged |
| 3 | No negative cash | Petty cash 20,000, voucher 25,000 | Blocked |
| 4 | Bank overdraft | Bank 10,000, payment 15,000 | Warning, allowed |
| 5 | Student payment routes | Cash. Online. Cheque | Counter cash in. Bank in. Cheques in hand, then bank in when cleared |
| 6 | Void a receipt | Receipt R-1043 voided | A reversal in the same account |
| 7 | Refund | Cash refund 12,000 | A voucher, a counter cash out entry, category Student refunds |
| 8 | Day closing difference | Expected 112,500, counted 112,000 | Cash difference entry -500. Account equals the count |
| 9 | Short deposit | Closed days total 137,500, deposit 130,000 | Note required. 7,500 stays as cash |
| 10 | Petty cash top-up | Float 75,000, cash 20,000 | Suggested top-up 55,000 |
| 11 | Bill on credit | Bill 90,000 unpaid | Cost 90,000. Cash out 0. Payable 90,000 |
| 12 | Part payment | 30,000 paid on that bill | Part paid. Unpaid 60,000 |
| 13 | Allocation | Bills 40,000 (due 5 Oct) and 60,000 (due 20 Oct). Pay 50,000 | First paid. Second unpaid 50,000 |
| 14 | Vendor credit | Owes 20,000, pays 25,000 | Credit 5,000 applied to the next bill |
| 15 | Issued cheque | Cheque for 30,000 issued, then cleared | Balance unchanged on issue and available balance falls by 30,000. On clearing the balance falls by 30,000 and available balance is unchanged |
| 16 | Cancel a cheque | Cheque cancelled | Voucher reversed, bill unpaid again, number not reused |
| 17 | Stale cheque | An issued cheque 6 months and a day old | Flagged Stale |
| 18 | Post-dated cheque | Issued with a future date | Shows "Valid from", cannot be marked cleared early |
| 19 | Duplicate bill | Same vendor and bill number | Warning |
| 20 | Approval limit | Accountant pays 50,000. Accountant pays 60,000 | Allowed. Needs an Admin |
| 21 | Staff category | A manual expense in Salaries: Teaching | Blocked |
| 22 | Cost against cash | October sample | Costs 385,000, paid 295,000, unpaid 90,000. Bridge to cash out 1,487,000 |
| 23 | Money flow | October sample | In 1,420,000, out 1,487,000, net -67,000, closing total 1,530,000 |
| 24 | Held money | Student credit 64,000 | Not counted as money in |
| 25 | Import twice | The same statement imported twice | The second adds no lines |
| 26 | Match confidence | Equal amount, 2 days apart, reference contains PV-0377. Equal amount only | Exact. Possible |
| 27 | Batch match | A 1,020,000 debit and 19 payroll payments | Matched together |
| 28 | Cheque by number | A line mentioning cheque 004801, confirmed | Cheque Cleared, bank entry dated the statement date |
| 29 | Reconciliation | Statement 1,132,000, in transit 40,000, payments in transit 0, book 1,172,000 | Difference 0 |
| 30 | Reconciled entry | Reverse an entry in a reconciled month | Blocked until reopened |
| 31 | Budget | Spent and unpaid 385,000 of 440,000 | 88 percent. Rent 100 percent warning. Utilities and Other information |
| 32 | Close blocked | One account not reconciled | Cannot close |
| 33 | Month order | Close October while September is open | Blocked |
| 34 | Locked month | A payment back-dated into a closed month | Blocked. Allowed after an Admin reopens, and flagged |
| 35 | Salary privacy | An Accountant opens payroll payments | Sees batch totals only. Admin sees detail |
| 36 | Owner withdrawal | Withdrawal 50,000 | Not in costs. Shown on its own line |
| 37 | Filters and balance | Search the bank book | The header balance does not change |
| 38 | Opening position | Opening balances entered | Totals equal the sum of the accounts |

## 80. Effects on the other documents

| Document | What to update |
| --- | --- |
| `PAYMENTS_RECEIPTS_LEDGER_DESIGN.md` | A refund creates a payment voucher (Payments document, section 44; this document, section 33). A day closing difference creates a Cash difference entry. The cash deposit is a transfer made after day closing. A cleared incoming cheque posts the bank money entry. A void or bounce posts a reversal. Closed months block back-dated payments. |
| `LOGIN_DASHBOARD_STUDENTS_DESIGN.md` | Permission matrix rows for finance (section 3 of this document). The dashboard's Money card shows balances by account, available balance and bills due. Needs attention gets: recurring bills, unmatched statement lines, month waiting for review, petty cash low, stale cheques. |
| `FRONTEND_DESIGN.md` | Sidebar groups (section 58), routes, and components (section 75). |
| `FEE_TEMPLATES_AND_ADMISSION_DESIGN.md` | The security deposits held figure uses the refundable rule in section 27.3. |
| Staff and Payroll (next document) | Staff are payees. Payroll posts to the Staff categories, pays by cash, bank transfer or cheque, groups payments into batches, and hides individual pay from everyone but an Admin. It must also pass the month-close checklist item 6. |

## 81. Open decisions

Defaults below are adopted in this draft. Change any that do not suit the institute.

| # | Question | Default adopted |
| --- | --- | --- |
| 1 | Do costs count in the cost view by posting date? | Yes. The bill date is shown for information. |
| 2 | Accountant payout limit | 50,000 per voucher. |
| 3 | Petty cash | Optional, with a per-voucher limit of 5,000. |
| 4 | Stale cheque period | 6 months. |
| 5 | Should exact statement matches be accepted automatically? | No. |
| 6 | Can an Accountant edit budgets? | No. Admin only. |
| 7 | Who closes a month? | Admin. An Accountant marks it reviewed. |
| 8 | Do months have to close in order? | Yes. |
| 9 | Are owner withdrawals allowed? | Yes, Admin only, outside costs. |
| 10 | Can payroll cheques show the staff name to an Accountant? | No. Only an Admin sees names and individual pay. |
| 11 | Wallets | Optional accounts. |
| 12 | Foreign currency | Not supported. |

## 82. Suggested build order

1. **Money accounts, money entries and the balance calculation,** with opening balances and the tests in section 79.
2. **Automatic flows from Payments:** counter cash, bank and online deposits, cheques in hand, voids, bounces, refunds, the day closing difference, transfers and the cash deposit.
3. **Categories, vendors, bills, payment vouchers and payment modes.** The Staff and Payroll document can plug in after this step.
4. **Payables:** allocation, vendor credit, recurring reminders.
5. **Issued cheques** and the available balance.
6. **Petty cash.**
7. **Bank:** ledger, statement import, matching and reconciliation.
8. **Budgets.**
9. **Month close and lock.**
10. **Overview and reports,** including the month-end report.
11. **Starting out and moving old data.**

Steps 1 and 2 come first because every other screen reads balances and money entries. Reconciliation (step 7) should be in place before the first month is closed (step 9).
