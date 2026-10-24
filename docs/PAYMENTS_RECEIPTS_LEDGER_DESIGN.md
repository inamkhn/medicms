# MediCMS Desktop: Payments, Receipts and Ledger

**Document type:** Improved design and scope, with frontend screens
**Version:** Draft 1
**Date:** 9 October 2026
**Covers:** Feature 1 (Ledger), Feature 2 (Payments), Feature 3 (Receipts and Receipt Books), Feature 4 (Cheques and Non-cash Payments), Feature 5 (Charges, Adjustments, Write-offs, Refunds and Reversals), and the frontend screens for all five
**Replaces:** the Payments, Receipt Management and Ledger sections of `APPLICATION_SCOPE.md`
**Related:** `FEE_TEMPLATES_AND_ADMISSION_DESIGN.md` (sections 24 to 27), `LOGIN_DASHBOARD_STUDENTS_DESIGN.md` (sections 3 and 33), `FRONTEND_DESIGN.md`

---

## Answers assumed

The four questions from the previous step were not answered, so this draft assumes the following. Change any that do not suit the institute.

| Question | Assumed answer |
| --- | --- |
| Pre-printed receipt books or app-printed receipts? | Both are supported. **Printed by app** is the default. In **Pre-printed book** mode the screen shows the next slip number and the operator confirms it matches the slip. |
| Cheques? | Supported with a full lifecycle, including post-dated cheques. |
| Combined receipt for several students? | Not in the first release. One receipt per payment, per student. A parent paying for two students makes two payments. |
| SMS or WhatsApp receipts? | Not in the first release. Paper and Save as PDF only. |

---

## 1. Purpose and what changes

Every rupee received from a student, or owed by a student, passes through the ledger. The fee design added due dates, allocation, voids, refunds and day closing, but they need a home. This document redesigns payments, receipts and the ledger as one system, so the money records can be trusted.

| Today | New design |
| --- | --- |
| Charges are stored as negative discounts, so reports cannot tell a real discount from a charge. | Every ledger entry has a type. Amounts are always positive and the type decides the direction (section 6). |
| Payment, bank deposit, receipt book and audit entry are saved separately and can drift apart. | One all-or-nothing save (section 18). |
| The "receipt already used" check is a stub, books are not enforced, and there is no void or spoiled handling. | Strict receipt books, a receipt register, void and spoiled numbers (Feature 3). |
| The success screen can subtract the payment from a balance that was already updated. | The success screen shows the saved balance, never a recalculation. |
| Cheques are treated like cash. | A cheque lifecycle: received, deposited, cleared or bounced (Feature 4). |
| Payments have no due dates or allocation. | Every payment is allocated to fee charges, and every fee charge has a due date. |
| Corrections edit or delete entries. | Nothing is edited or deleted. Mistakes are fixed with linked reversal entries (section 45). |

## 2. Wording used in this document

| Term | Meaning |
| --- | --- |
| **Ledger** | A student's list of money entries, with a running balance. |
| **Entry** | One line in the ledger. |
| **Fee charge** | The fees billed for one term, with a due date. |
| **Special charge** | A one-off charge: fine, exam fee, certificate fee, re-admission fee. |
| **Concession** | A reduction for a student: waiver, scholarship or discount. |
| **Payment** | Money received, with a receipt. |
| **Allocation** | The record of which fee charge a payment pays off. |
| **Reversal** | A new entry that cancels an earlier one. The earlier entry stays visible. |
| **Adjustment** | A correction to an amount, with a reason. |
| **Write-off** | Removing dues that will never be collected. |
| **Refund** | Money paid back to a student. |
| **Receipt book** | A numbered range of receipts, belonging to one counter. |
| **Spoiled** | A receipt number that was damaged or wasted before use. |
| **Void** | A receipt that was issued and then cancelled by a reversal. |
| **Cheque in hand** | A cheque received but not yet cleared by the bank. |
| **Balance** | Dues minus credit. Positive means dues, zero means clear, negative means credit. |

## 3. Roles, permissions and limits

| Action | Admin | Accountant | Counter operator | Viewer |
| --- | :---: | :---: | :---: | :---: |
| View ledger and statements | Yes | Yes | Yes | Yes |
| Record a payment (today) | Yes | Yes | Yes | No |
| Back-date a payment | Any open day, with reason | Up to 7 days, with reason | No | No |
| Reprint a receipt | Yes | Yes | Yes | No |
| Mark a receipt number spoiled | Yes | Yes | Own book | No |
| Void a receipt | Yes | Yes | No | No |
| Give a concession at payment | Approve | Approve | Request | No |
| Add a special charge | Yes | Yes | No | No |
| Make an adjustment | Yes | Up to limit | No | No |
| Write off dues | Yes | Up to limit | No | No |
| Refund | Yes | Up to limit | No | No |
| Reverse a charge or another entry | Yes | Yes | No | No |
| Mark a cheque deposited, cleared or bounced | Yes | Yes | No | No |
| Create and assign receipt books | Yes | No | No | No |
| Allow an out-of-order receipt number | Yes | Yes | No | No |
| View the receipt register | Yes | Yes | Own book | Yes |
| Run the ledger check | Yes | No | No | No |

"Request" means the operator prepares the action and an Accountant or Admin approves it on the spot with their own password. Default limits are in section 65.

---

# Feature 1: The Ledger

## 4. Goals

- One trustworthy list of every money entry for a student.
- The balance is always calculated from entries, never stored as a number that can drift.
- Every entry says what it is, who made it, and why.
- Nothing is edited or deleted.

## 5. Entry model

| Field | Notes |
| --- | --- |
| Entry number | Unique, never reused. |
| Date | Posting date (local date). |
| Student | The student the entry belongs to. |
| Type | One of the types in section 6. |
| Amount | Whole rupees, always positive. |
| Description | Plain words, for example "Term 1 fee charge". |
| Reference | Receipt number, cheque number, bank reference, and so on. |
| Term | For fee charges: which term. |
| Due date | For fee charges, special charges and "Adjustment (add)". |
| Lines | For fee charges: the itemised components. |
| Linked entry | For concessions (the charge reduced), allocations, and reversals (the entry reversed). |
| Reason | Required for concessions, adjustments, write-offs, refunds and reversals. |
| Created by, created at | The signed-in user and the time. |
| Approved by | Filled in when approval was needed. |
| Action number | Entries created by one action share it, so a payment, its bank deposit and its audit entry can be seen together. |

## 6. Entry types and their effect

| Type | Effect on balance | Used for |
| --- | --- | --- |
| Opening balance (dues) | Increases | A migrated student who owes money. |
| Opening balance (credit) | Reduces | A migrated student with credit. |
| Fee charge | Increases | One term's fees, itemised, with term and due date. |
| Special charge | Increases | Late fine, exam fee, certificate fee, re-admission fee, bounce fine. |
| Adjustment (add) | Increases | Correct an amount that was too low. |
| Concession | Reduces | Waiver, scholarship or discount, linked to a fee charge. |
| Payment | Reduces | Money received, with a receipt. |
| Adjustment (reduce) | Reduces | Correct an amount that was too high. |
| Write-off | Reduces | Dues that will never be collected. |
| Refund | Increases | Money paid back, which reduces credit. |
| Reversal | Opposite of the entry it reverses | Cancelling any of the above. |

**Balance** = entries that increase − entries that reduce.

**Unpaid on a fee charge** = charge amount − concessions on it − payments allocated to it − write-offs and reduce-adjustments allocated to it + add-adjustments attached to it.

## 7. Rules

1. Entries are never edited or deleted. A mistake is fixed with a reversal (section 45).
2. Amounts are whole rupees. Percentages are rounded to the nearest rupee, with halves rounding up.
3. The balance is always calculated from entries. If a stored copy is kept for speed, it is rebuilt automatically and can be checked with the **ledger check** tool (Admin), which recalculates every student and lists any difference.
4. Payments cannot be future-dated. Fee charges and special charges are posted today and may have a later due date.
5. Back-dated payments follow the limits in section 3, and cannot go onto a day that has been closed (Login, Dashboard and Students document, section 33).
6. For a **struck-off** student, payments, refunds, adjustments and write-offs are allowed. New fee charges, promotion and special charges are blocked.
7. For a **completed** student, payments and special charges (for example a certificate fee) are allowed. Promotion is not.
8. Every action that changes several records saves them together or not at all (section 18).
9. Every entry is written to the audit trail with the user and time.
10. **Moving from the current data:** any ledger line stored as a negative discount becomes a **Special charge** of the same amount. All other lines keep their type.

## 8. Sample ledgers

### 8.1 Ayesha Khan, after admission

| No. | Date | Entry | Type | Amount (PKR) | Balance (PKR) | Due date | Allocated to |
| ---: | --- | --- | --- | ---: | ---: | --- | --- |
| 1 | 9 Oct 2026 | Term 1 fee charge | Fee charge | +77,000 | 77,000 | 23 Oct 2026 | |
| 2 | 9 Oct 2026 | Sibling: admission fee waived | Concession | -15,000 | 62,000 | | Term 1 |
| 3 | 9 Oct 2026 | Merit: 20 percent of tuition | Concession | -9,000 | 53,000 | | Term 1 |
| 4 | 9 Oct 2026 | Payment R-1042, cash | Payment | -30,000 | 23,000 | | Term 1 |

### 8.2 Bilal Ahmed, with allocation

| No. | Date | Entry | Type | Amount (PKR) | Balance (PKR) | Due date | Allocated to |
| ---: | --- | --- | --- | ---: | ---: | --- | --- |
| 1 | 31 Dec 2025 | Term 2 fee charge | Fee charge | +47,000 | 47,000 | 15 Jan 2026 | |
| 2 | 5 Jul 2026 | Term 3 fee charge | Fee charge | +61,000 | 108,000 | 20 Jul 2026 | |
| 3 | 12 Aug 2026 | Payment R-0388, cash | Payment | -30,000 | 78,000 | | Term 2: 30,000 |
| 4 | 9 Oct 2026 | Payment R-1043, cash | Payment | -25,000 | 53,000 | | Term 2: 17,000, Term 3: 8,000 |

Unpaid by fee charge after entry 4: Term 2 is 0. Term 3 is 53,000 (81 days overdue).

## 9. Statements and day book

### 9.1 Student statement

- Header with institute name, student details, period and who printed it.
- Balance brought forward, then every entry in the period with a running balance.
- A summary: brought forward, charges, concessions, payments, balance.
- An **Unpaid fee charges** list with due dates and days overdue.
- An ageing line: not yet due, 1 to 30, 31 to 60, 61 to 90, over 90 days.
- Two variants: **Full statement** and **Dues only** (just the summary and unpaid charges).
- Fits one A4 page for a normal period. Longer statements repeat the header on each page.

Sample, for Bilal Ahmed, 1 January to 9 October 2026:

```text
AL-SHIFA MEDICAL INSTITUTE                         STUDENT STATEMENT
Bilal Ahmed, s/o Raza Ahmed      SNO 0987     BS Nursing, BSN, Spring 2025, Term 3
Period: 1 Jan 2026 to 9 Oct 2026            Printed 9 Oct 2026 by Kamran Ali

Date         Entry                          Charges    Credits    Balance
             Brought forward                                       47,000
5 Jul 2026   Term 3 fee charge (due 20 Jul)  61,000               108,000
12 Aug 2026  Payment R-0388 (cash)                      30,000     78,000
9 Oct 2026   Payment R-1043 (cash)                      25,000     53,000

Brought forward 47,000 | Charges 61,000 | Concessions 0 | Payments 55,000
Balance due 53,000

Unpaid fee charges:  Term 3   53,000   due 20 Jul 2026   81 days overdue
Ageing:  Not yet due 0 | 1-30 0 | 31-60 0 | 61-90 53,000 | Over 90 0
```

### 9.2 Day book

A register of everything entered on one day.

- Filters: date, counter, payment mode, entry type.
- Totals by payment mode (cash, bank, online, cheque) and by entry type.
- A list of entries with student, type, amount, receipt number and who entered it.
- Print and export. It feeds the day closing screen.

Sample totals for 9 October 2026:

| Mode | Receipts | Amount (PKR) |
| --- | ---: | ---: |
| Cash | 9 | 112,500 |
| Bank | 2 | 50,000 |
| Online | 2 | 15,000 |
| Cheque | 1 | 10,000 |
| **Total** | **14** | **187,500** |

## 10. Acceptance criteria (Feature 1)

- [ ] Every ledger entry has a type, and amounts are always positive.
- [ ] The balance equals the sum of increasing entries minus reducing entries for every student.
- [ ] No screen offers to edit or delete an entry.
- [ ] Old negative-discount lines become special charges when the data is moved.
- [ ] The ledger check reports zero differences on correct data and names any student that differs.
- [ ] A statement fits one A4 page and shows due dates, days overdue and ageing.
- [ ] The day book totals match the dashboard's collection for the same day.

## 11. Not included

- Part payments inside one fee charge on a schedule (installments).
- Interest or automatic late fees.
- Multi-currency.

---

# Feature 2: Payments

## 12. Goals

- Record a payment in under a minute, using the keyboard.
- Show exactly what the payment will pay off before saving.
- Make mistakes hard: duplicate warnings, back-dating limits, no future dates.
- Save the payment, receipt, bank record and audit entry together.

## 13. Recording a payment

### 13.1 Flow

1. **Find the student** by name, SNO, CNIC or phone, or start from the student's profile or the dashboard.
2. **See the position:** dues, overdue, credit and next due date.
3. **Enter the amount.** Shortcut buttons: **Pay overdue**, **Pay all dues**, and each unpaid fee charge.
4. **Choose the mode** and fill in its details (section 14).
5. **Check the allocation preview** (section 15).
6. Optionally **give a concession** (section 16).
7. **Confirm.** The payment is saved and the receipt prints.

### 13.2 Fields

| Field | Notes |
| --- | --- |
| Student | Required. |
| Amount | Whole rupees, more than zero. |
| Payment date | Default today. Rules in section 17. |
| Mode | Cash, Bank, Online or Cheque. |
| Mode details | Depend on the mode (section 14). |
| Paid by | Student, guardian or someone else (name). Defaults to the guardian when there is one. |
| Allocation | Oldest dues first (default) or a chosen fee charge. |
| Narration | Optional note printed on the receipt. |
| Receipt number | Automatic, from the counter's active book. |

## 14. Payment modes

| Mode | Details asked | What else happens |
| --- | --- | --- |
| Cash | None. | Counts toward expected cash at day closing. |
| Bank | Bank account that received it, slip or reference number, date. | A deposit is added to that bank account straight away. |
| Online | Bank account that received it, transaction ID, platform (for example JazzCash, Easypaisa, bank app). | A deposit is added to that bank account straight away. |
| Cheque | Cheque number, bank, cheque date, account holder name. | A cheque record is created. No bank deposit until it clears (Feature 4). |

## 15. Allocation

The rules are in `FEE_TEMPLATES_AND_ADMISSION_DESIGN.md`, section 25. In short:

- By default a payment pays the **oldest unpaid fee charge first**, in due date order. Special charges are included in the same order.
- The operator can instead choose one fee charge.
- The unit is the whole fee charge, not each fee line inside it.
- Anything above what is owed stays as **credit**, and is applied to the next fee charge when it is posted.
- The preview shows each charge before and after, and the credit left over.

Sample, Bilal Ahmed pays 25,000:

| Fee charge | Unpaid before | Allocated | Unpaid after |
| --- | ---: | ---: | ---: |
| Term 2 | 17,000 | 17,000 | 0 |
| Term 3 | 61,000 | 8,000 | 53,000 |
| **Total** | **78,000** | **25,000** | **53,000** |

## 16. Concession at payment

A discount given while taking a payment is the most common source of lost revenue, so it is controlled.

- A **Give a concession** link on the payment screen opens a small form: which fee charge, kind (fixed amount or percent), value and reason.
- A counter operator can only **request** it. An Accountant or Admin approves it with their own password.
- It is saved as a normal concession record and a **Concession** ledger entry linked to that fee charge, in the same save as the payment.
- The receipt shows it as a line, for example "Concession: -2,000".
- The usual concession limits apply (fee document, section 13.6).

Sample: dues 23,000. A 2,000 concession (reason "Management decision") is approved, and 21,000 is paid. Balance after: 0.

## 17. Safety checks

| Check | Behaviour |
| --- | --- |
| Duplicate warning | Same student, same amount and same mode within 10 minutes of an earlier payment: "A similar payment was recorded at 11:40 by Kamran. Record anyway?" |
| Future date | Blocked. |
| Back-dating | Counter operator: today only. Accountant: up to 7 days, with a reason. Admin: any open day, with a reason. |
| Closed day | A payment dated on a closed day is blocked until an Admin reopens the day. |
| Over-payment | If the amount is more than everything owed: "This leaves 5,000 as credit." Credit above 10,000 needs an extra confirmation. |
| Large amount | An amount above 500,000 asks for a second confirmation. |
| Zero or negative amount | Blocked. |
| No dues at all | A warning "This student has no dues. The whole amount will be credit." |
| Receipt book | No active book, or the book is full: blocked with a message to ask an Admin for a new book. |
| Struck-off or on-leave student | Allowed, with a banner. |

All limits can be changed in Settings (section 65).

## 18. One all-or-nothing save

When the operator confirms, the app saves all of this together. If any part fails, **nothing** is saved and the receipt number is released.

1. The payment ledger entry and its allocation records.
2. The concession entry, if one was approved.
3. The receipt number, taken from the book.
4. A bank deposit (bank and online) or a cheque record (cheque).
5. The day book line.
6. The audit entry.

The success screen then **reads the saved data**. It shows the saved balance and the saved allocation, never a recalculation. This removes the current double-subtraction problem.

## 19. Sample walk-through

**Bilal Ahmed** pays **25,000 in cash** at 2:15 PM on 9 October 2026. The counter operator is Kamran Ali, with Book 1.

1. Position: dues 78,000, overdue 78,000 (Term 2: 17,000; Term 3: 61,000).
2. Amount 25,000, mode Cash, paid by "Raza Ahmed (father)".
3. Preview: Term 2 17,000 to 0; Term 3 61,000 to 53,000; credit 0.
4. Confirm. Receipt **R-1043** is issued.
5. Result: balance 53,000. Overdue 53,000. Term 2 is paid in full.

The receipt prints as shown in section 61. The ledger lines are in section 8.2.

## 20. Edge cases

| Case | Behaviour |
| --- | --- |
| Printer fails or paper runs out | The payment is already saved. The success screen keeps **Print again**, and the receipt can be reprinted later. |
| The app closes during saving | Nothing is saved, and the receipt number is released. |
| Two staff take a payment for the same student at once | The duplicate check runs again at confirmation. |
| Payer is not the student | The "Paid by" name is saved and printed. |
| Student has no fee charge yet | A warning, and the whole amount becomes credit. |
| Amount typed with decimals | Not accepted. Whole rupees only. |
| Payment on a cheque that later bounces | See Feature 4. |

## 21. Acceptance criteria (Feature 2)

- [ ] A payment can be recorded entirely with the keyboard.
- [ ] The allocation preview matches what is saved.
- [ ] The success screen shows the saved balance, and it is correct even when the student was opened from the profile.
- [ ] A duplicate payment within 10 minutes shows a warning.
- [ ] A counter operator cannot back-date. An Accountant cannot back-date beyond 7 days.
- [ ] A payment on a closed day is blocked.
- [ ] A failed save leaves no payment, no deposit, no used receipt number and no audit entry.
- [ ] A concession at payment by a counter operator needs an approver's password.

## 22. Not included

- Combined receipts for several students.
- Installment plans inside one fee charge.
- Online payment gateways. The app records online payments but does not collect them.
- SMS or WhatsApp receipts.

---

# Feature 3: Receipts and Receipt Books

## 23. Goals

- Every receipt number is accounted for: used, void, spoiled or unused. No silent gaps.
- A receipt can always be reprinted, and a reprint is clearly a duplicate.
- Each counter has its own book, so numbers never clash.

## 24. Receipt books

| Field | Notes |
| --- | --- |
| Book name | For example "Book 1". |
| Prefix | For example `R-`. |
| From and to number | For example 1001 to 1050. Ranges of different books cannot overlap. |
| Assigned to | One counter or user. |
| Mode | **Printed by app** (default) or **Pre-printed book**. |
| Status | Active, Full or Closed. |
| Created by, date | Recorded. |

Rules:

- A counter has **one Active book** at a time. A new one is activated when the old one is full or closed.
- Only an Admin creates and assigns books.
- When fewer than 20 receipts are left, the dashboard shows "Book 1 has 8 receipts left".
- A book that is Full cannot issue another receipt.

## 25. Receipt numbers

- The next number is **automatic**. Operators cannot type a free number.
- **Pre-printed book mode:** the screen shows "Next slip: R-1043. Write this number on the slip." The operator ticks "Slip number matches". If the physical slip is different or damaged, the operator marks the number **Spoiled** and moves to the next one.
- **Out-of-order use:** if slips are used out of order, an Accountant or Admin can allow a different unused number from the same book, with a reason. The numbers skipped stay **Unused**, so they are visible.
- A number is never reused, even when its receipt is void.

## 26. Receipt content and print formats

| Item | Content |
| --- | --- |
| Header | Institute name, logo, address and phone. |
| Number and time | Receipt number, date and time. |
| Student | Name, father's name, SNO, program, batch, session, term. |
| Paid for | One line per fee charge paid, with its due date, and the amount allocated. |
| Concession lines | Any concession given at this payment. |
| Amount | In figures, and in words using lakh and crore (for example "Twenty-five thousand rupees only"). |
| Mode | Cash, bank, online or cheque, with the reference. |
| Balance | Balance after this payment. |
| Received by | The user's name, plus a signature or stamp area. |
| Footer | Institute-set note, for example the refund policy. |

Formats:

- **A4:** two copies on one page, a student copy and an office copy, with a cut line.
- **80 mm thermal:** a single narrow copy.

Marks printed across the receipt:

| Mark | When |
| --- | --- |
| DUPLICATE | Any reprint. |
| VOID | A voided receipt. |
| CHEQUE SUBJECT TO CLEARANCE | A cheque payment that has not cleared. |
| CHEQUE RETURNED | A cheque that bounced. |

## 27. Reprint, void and spoiled

### 27.1 Reprint

Any counter operator, Accountant or Admin can reprint. The copy says **DUPLICATE**, and each reprint is counted and written to the audit trail with who and when.

### 27.2 Void

Voiding follows `FEE_TEMPLATES_AND_ADMISSION_DESIGN.md`, section 27.1: a reversal entry is created, the allocation is released, the receipt stays in the register marked VOID, its number is never reused, and any bank deposit gets a matching reversal. After the day is closed, only an Admin can void, after reopening the day. A replacement receipt can be issued from the same screen.

### 27.3 Spoiled

- A **spoiled** number is one that was damaged or wasted before it was used for a payment.
- It needs a reason. A counter operator can spoil a number in their own book. An Accountant or Admin can spoil any.
- The number stays in the register as Spoiled.

## 28. Receipt register

Each book has a register that lists every number with its status:

| Status | Meaning |
| --- | --- |
| Used | A receipt was issued. |
| Void | A receipt was issued and then cancelled. |
| Spoiled | Damaged or wasted before use. |
| Skipped | Left out of order, with a reason. |
| Unused | Not yet used. |

The register shows counts per status and highlights any gap. It can be printed or exported.

## 29. Sample

**Book 1**, Kamran Ali, prefix `R-`, range 1001 to 1050, Printed by app. Position at the end of 9 October 2026:

| Number | Status | Student | Amount (PKR) | Date | Note |
| --- | --- | --- | ---: | --- | --- |
| R-1038 | Used | Imran Sheikh | 18,000 | 8 Oct 2026 | |
| R-1039 | Void | Nida Hassan | 20,000 | 8 Oct 2026 | Wrong amount entered. Replaced by R-1040. |
| R-1040 | Used | Nida Hassan | 25,000 | 8 Oct 2026 | Replacement for R-1039 |
| R-1041 | Spoiled | | | 9 Oct 2026 | Slip torn |
| R-1042 | Used | Ayesha Khan | 30,000 | 9 Oct 2026 | |
| R-1043 | Used | Bilal Ahmed | 25,000 | 9 Oct 2026 | |
| R-1044 to R-1050 | Unused | | | | 7 left |

Counts: 43 numbers consumed (1001 to 1043), 7 unused.

## 30. Acceptance criteria (Feature 3)

- [ ] Receipt numbers come only from the counter's active book, and cannot be typed freely.
- [ ] A number can never be used twice, including after a void.
- [ ] The register shows every number with its status, and highlights gaps.
- [ ] A reprint is marked DUPLICATE and recorded in the audit trail.
- [ ] Marking a number spoiled needs a reason.
- [ ] A full book cannot issue another receipt.
- [ ] Ranges of two books cannot overlap.
- [ ] The A4 and 80 mm layouts show the allocation lines, balance and amount in words.

## 31. Not included

- Pre-numbered slip scanning.
- Receipts in Urdu.
- Sending receipts by SMS, WhatsApp or email.

---

# Feature 4: Cheques and Non-cash Payments

## 32. Goals

- Treat a cheque as a promise until the bank clears it.
- Never count an uncleared cheque as money in the bank.
- Show clearly when a cheque bounces, and put the dues back.

## 33. Bank and online payments

- The operator chooses the **bank account** that received the money. The accounts come from the bank module.
- A **deposit** is created in that account at the time of the payment, with the reference, so the bank page and the ledger agree.
- If the receipt is later voided, a matching reversal is created in the bank ledger.

## 34. Cheque lifecycle

| Status | Meaning | Next steps |
| --- | --- | --- |
| **Received** | Cheque taken at the counter. | Deposit, return to student. |
| **Deposited** | Sent to the bank for clearing. Bank account recorded. | Cleared or Bounced. |
| **Cleared** | The bank paid it. | Final. |
| **Bounced** | The bank returned it. | Final. |
| **Returned** | Given back to the student before deposit. | Final. |

**Post-dated cheques:** if the cheque date is in the future, the cheque stays Received, cannot be deposited before its date, and shows "Post-dated: deposit from 15 Nov". A reminder appears in Needs attention on the day it can be deposited.

## 35. How a cheque affects balances

| Area | Effect |
| --- | --- |
| Student ledger | The payment is recorded at once and allocated, so the student is not chased. It is flagged **Pending clearance**. The profile shows "of which pending cheque: 10,000". |
| Receipt | Prints "CHEQUE SUBJECT TO CLEARANCE". |
| Bank balance | Counts only **cleared** cheques. Cheques in hand are shown as a separate figure. |
| Reports | "Collected" separates cleared money from pending cheques. |
| Day closing | Cheques appear in the non-cash list, ticked once checked. |
| **Bounced** | The payment is reversed, so the dues return. The allocation is released. The receipt is marked CHEQUE RETURNED. An optional **bounce fine** (a special charge, default 0) is added. A "Cheque bounced" alert appears on the student and in Needs attention. |
| **Returned to student** | Same reversal as a bounce, without the fine. |

## 36. Cheque register

A list of every cheque with: cheque number, bank, cheque date, amount, student, receipt, status and age.

- Filters: status, bank, date, post-dated only, overdue for deposit.
- Actions (Accountant and Admin): **Mark deposited** (choose the bank account and date), **Mark cleared** (date), **Mark bounced** (reason, optional fine), **Return to student** (reason).
- Counter operators can view the register but not change a status.

## 37. Sample

**Rabia Saleem**, PNC Year 1, pays **10,000 by cheque** on 9 October 2026. Cheque number 004512, Meezan Bank, dated 9 October 2026. Receipt **R-1053**, issued by Farah Javed from Book 2.

| Date | Event | Status | Student ledger | Bank balance |
| --- | --- | --- | --- | --- |
| 9 Oct 2026 | Cheque received, receipt R-1053 | Received | Payment recorded. Marked "Pending clearance". | No change |
| 12 Oct 2026 | Deposited at Meezan Bank | Deposited | No change | No change |
| 14 Oct 2026 | Bank cleared the cheque | Cleared | Flag removed | +10,000 |

**If it had bounced on 14 October:** the payment of 10,000 is reversed, Rabia's dues rise by 10,000, and the receipt is marked CHEQUE RETURNED. With a bounce fine of 500 set, a special charge of 500 is also added, so her balance rises by 10,500.

## 38. Acceptance criteria (Feature 4)

- [ ] A cheque payment is recorded and allocated at once, and flagged as pending.
- [ ] The bank balance excludes cheques that have not cleared, and shows cheques in hand separately.
- [ ] A post-dated cheque cannot be deposited before its date.
- [ ] A bounced cheque reverses the payment, restores the dues and shows an alert.
- [ ] A bounce fine is added only when the setting is above zero.
- [ ] Bank and online payments create a deposit in the chosen account, and a void creates the matching reversal.
- [ ] Only an Accountant or Admin can change a cheque's status.

## 39. Not included

- Printing cheques.
- Matching cheques to a bank statement file automatically.
- Bulk deposit slips.

---

# Feature 5: Charges, Adjustments, Write-offs, Refunds and Reversals

## 40. Goals

- Every change to a student's money after the fact is a visible, reasoned entry.
- Limits and approvals stop one person from quietly changing balances.

## 41. Special charges

| Item | Rule |
| --- | --- |
| Types | Late payment fine, Exam fee, Certificate fee, Transcript, Re-admission fee, Cheque bounce fine, Other. The list can be edited in Settings. |
| Fields | Type, amount, due date (default 15 days), note. |
| Who | Accountant and Admin. |
| Blocked for | Struck-off students. (A re-admission fee is added at reinstatement, after the student is active again.) |
| Late fine suggestion | When a fee charge has been overdue for a set number of days (default 30), the profile suggests "Add late payment fine". The operator decides the amount. |
| Bulk special charge | Apply one special charge to a filtered group of students, for example an exam fee for all BSN Term 3 students. A summary shows the number of students and the total before saving. All entries share one action number, so the whole batch can be reversed together. |

## 42. Adjustments

- Used to correct an amount, when a reversal would not be right (for example the corrections prepared by a fee plan change).
- Two kinds: **Adjustment (add)** and **Adjustment (reduce)**.
- A reason is required. An Accountant can adjust up to a limit (default 5,000 per entry). Above that needs an Admin.
- An "Adjustment (add)" has a due date and behaves like a special charge. An "Adjustment (reduce)" is allocated to the oldest unpaid charge, or to a chosen one.

## 43. Write-offs

- Remove dues that will never be collected, for example after a strike-off or a hardship decision.
- A reason is required. An Accountant can write off up to a limit (default 5,000 per student). Above that needs an Admin.
- A write-off is allocated to the oldest unpaid charge, or to a chosen one.
- A list of write-offs, with totals by period, is kept for reports. An Admin can reverse a write-off.

## 44. Refunds

The rules are in `FEE_TEMPLATES_AND_ADMISSION_DESIGN.md`, section 27.4. In short:

- A refund is its own entry type (money out). It reduces the credit on the student's ledger.
- Fields: amount, mode (cash or bank), reference, reason, approved by.
- It also creates an expense in the category **Fee refund** and, for bank refunds, a bank withdrawal, both linked to the student.
- An Accountant can refund up to a limit (default 20,000). Above that needs an Admin.
- It works for cancelled admissions and for credit left on struck-off or completed students.
- A refund voucher is printed with signature lines.
- A payment by cheque cannot be refunded until the cheque has cleared.

## 45. Reversals

- Any entry can be reversed by an Accountant or Admin, except a reversal itself. A reason is required.
- Before confirming, a preview shows the effect on the balance and on each fee charge.
- The original entry stays in the ledger, marked **Reversed**, with a link to its reversal.
- **Reversing a payment** is a void (section 27.2). Its allocation is released.
- **Reversing a fee charge** releases any payments allocated to it. Those amounts are re-allocated to other unpaid charges, oldest first, and any remainder becomes credit.
- **Reversing a refund** is Admin only.
- After a day is closed, reversing anything from that day needs an Admin to reopen it.
- A reversal cannot itself be reversed. Post a new entry instead.

## 46. Approval limits at a glance

| Action | Counter operator | Accountant | Admin |
| --- | --- | --- | --- |
| Back-date a payment | No | Up to 7 days | Any open day |
| Concession at payment | Request | Approve | Approve |
| Special charge | No | Yes | Yes |
| Adjustment | No | Up to 5,000 | Any |
| Write-off | No | Up to 5,000 per student | Any |
| Refund | No | Up to 20,000 | Any |
| Reverse a charge | No | Yes | Yes |
| Reverse a refund | No | No | Yes |

The numbers are defaults and can be changed in Settings.

## 47. Samples

### 47.1 Voided and replaced receipt

Ayesha Khan's receipt R-1042 was entered as 30,000, but she actually paid 35,000. The Accountant voids R-1042 and issues R-1044 for 35,000.

| No. | Entry | Type | Amount (PKR) | Balance (PKR) |
| ---: | --- | --- | ---: | ---: |
| 4 | Payment R-1042 (marked Reversed) | Payment | -30,000 | 23,000 |
| 5 | Reversal of payment R-1042: wrong amount | Reversal | +30,000 | 53,000 |
| 6 | Payment R-1044, cash | Payment | -35,000 | 18,000 |

### 47.2 Write-off by limit

Zainab Farooq (CMW Year 2, struck off) owes 15,000. An Accountant writes off 5,000 (within the limit) with the reason "Hardship, approved by principal". The remaining 10,000 is above the Accountant's limit, so an Admin writes it off. Balance after: 0.

### 47.3 Refund of credit

Usman Tariq has credit of 2,000 from an excess payment. An Accountant records a cash refund of 2,000 (within the limit). The ledger gets a Refund entry of +2,000, taking the balance from -2,000 to 0, and an expense of 2,000 is created under "Fee refund".

### 47.4 Bulk special charge

An exam fee of 2,500 is added for 12 BSN Term 3 students. The summary shows 12 students and 30,000 in total. After confirming, 12 special charges are posted, each due in 15 days. The whole batch can be reversed from the action's page.

## 48. Acceptance criteria (Feature 5)

- [ ] A special charge cannot be added to a struck-off student.
- [ ] An adjustment above the Accountant's limit asks for an Admin.
- [ ] A write-off above the limit asks for an Admin, and the entry shows who approved it.
- [ ] A refund creates a Refund entry, a "Fee refund" expense and, for bank refunds, a bank withdrawal.
- [ ] Reversing an entry keeps the original visible and marks it Reversed.
- [ ] Reversing a charge that had payments allocated releases them and re-allocates oldest first.
- [ ] A bulk special charge shows a summary first, and can be reversed as a batch.

## 49. Not included

- Automatic late fees and interest.
- Approval chains with more than one approver.
- Partial refund rules by date (for example a percentage of tuition by days attended).

---

# Frontend Screens

These screens use the design system in `FRONTEND_DESIGN.md` (colours, money display, tables, dialogs, toasts). Only what is new is described here.

## 50. Screen list and navigation

| Screen | Route | Who |
| --- | --- | --- |
| Record payment | `/payments/new` | Admin, Accountant, Counter operator |
| Payment success | `/payments/:id/done` | Same |
| Student ledger | `/students/:sno` (Ledger tab) | Everyone with student access |
| Ledger (search then open) | `/ledger` | Everyone with student access |
| Receipts list | `/receipts` | Admin, Accountant, Counter operator (own), Viewer |
| Receipt register (one book) | `/receipts/books/:id` | Admin, Accountant, Counter operator (own book), Viewer |
| Receipt books | `/settings/receipt-books` | Admin |
| Cheques | `/cheques` | Admin, Accountant, Counter operator (view), Viewer |
| Day book | `/day-book` | Admin, Accountant, Counter operator (own), Viewer |

**Sidebar change.** The Finance group becomes: Payments, Receipts, Cheques, Ledger, Day book, Day closing, Expenses, Bank. Receipt books sit under Settings.

## 51. Record payment screen

### 51.1 Wireframe (cash)

```text
Record payment                                                  [Cancel]
+------------------------------------------------------------------+
| Student  [ Search name, SNO, CNIC, phone...                    ]  |
+------------------------------------------------------------------+
| [photo] Ayesha Khan   SNO 1042   BSN Fall 2026, Term 1   [Active]  |
| Dues 23,000    Overdue 0    Credit 0    Next due 23 Oct 2026       |
+------------------------------------------------------------------+
| Amount        [ 23,000 ]   [Pay overdue] [Pay all dues] [Term 1]   |
| Payment date  [9 Oct 2026]                                         |
| Mode          (o) Cash  ( ) Bank  ( ) Online  ( ) Cheque           |
| Paid by       [Imtiaz Khan (guardian) v]                           |
| Narration     [_______________________________]                    |
+-- This payment will pay -----------------------------------------+
| Pay for:  (o) Oldest dues first     ( ) A specific charge [ v ]    |
| Term 1 fee charge     23,000  ->  0          paid in full          |
| Credit after payment: 0                                            |
+------------------------------------------------------------------+
| [+ Give a concession]                                              |
+------------------------------------------------------------------+
| Receipt R-1043   Book 1 (Kamran Ali)    Print on [A4 v]            |
|                         [Cancel]   [Confirm and print  Ctrl+Enter] |
+------------------------------------------------------------------+
```

### 51.2 Mode panels

The panel under **Mode** changes with the choice.

```text
Bank:    Bank account [Meezan - 0123 v]   Slip / reference [__________]   Date [9 Oct 2026]

Online:  Bank account [Meezan - 0123 v]   Transaction ID [__________]   Platform [Easypaisa v]

Cheque:  Cheque no [004512]  Bank [Meezan Bank v]  Cheque date [9 Oct 2026]
         Account holder [Rabia Saleem]
         (i) The receipt will say "Cheque subject to clearance".
         (i) Post-dated cheque: it can be deposited from 15 Nov.   <- only when the date is in the future
```

### 51.3 Behaviour

| Element | Behaviour |
| --- | --- |
| Student search | Opens on focus. Arrow keys and Enter pick a result. When opened from a profile, the student is already chosen and the cursor starts in Amount. |
| Position strip | Dues, overdue (red), credit (blue), next due date. A struck-off, on-leave or completed student shows a coloured badge and a one-line banner. |
| Quick amount buttons | **Pay overdue** and **Pay all dues** fill the amount. One button per unpaid fee charge fills that charge's unpaid amount and switches allocation to that charge. |
| Allocation preview | Updates as the amount or choice changes. Credit left over appears as "Credit after payment: 5,000 (applied to the next fee charge)". |
| Date | Defaults to today. A counter operator cannot change it. Other roles see the allowed range, and a reason box appears when it is not today. |
| Receipt strip | Shows the next number and book. In Pre-printed mode it adds "Write **R-1043** on the slip" and a tick box "Slip number matches". |
| Confirm | One click saves everything (section 18) and moves to the success screen. The button shows a spinner and cannot be clicked twice. |
| Warnings | A duplicate, over-payment or large-amount warning opens as a dialog before saving, with **Go back** and **Record anyway**. |
| Leaving | Leaving with an amount typed asks for confirmation. |

## 52. Payment success screen

```text
[tick] Payment recorded
Receipt R-1043     25,000 cash     9 Oct 2026, 2:15 PM

+-- Receipt preview -------------------+   Paid
|  (A4 or 80 mm preview, see 61)       |     Term 2 fee charge   17,000
|                                      |     Term 3 fee charge    8,000
|                                      |   Balance now    53,000 Due
+--------------------------------------+   Overdue now    53,000

[Print receipt]  [Save as PDF]  [Take another payment]  [Open profile]
```

- Every figure comes from the saved record.
- For a cheque, a note shows: "Pending clearance. The bank balance will change when the cheque clears."
- If printing fails, a banner says "The payment is saved. Print again when the printer is ready."

## 53. Giving a concession at payment

```text
+------------------------------------------------+
| Give a concession                               |
| Fee charge  [Term 3 (53,000 unpaid) v]          |
| Kind        [Fixed amount off v]  Value [2,000] |
| Reason *    [Management decision v]             |
| Note        [_______________________________]   |
|                                                 |
| Approval needed (you are a counter operator)    |
| Approver username [__________]                  |
| Approver password [__________]                  |
|                      [Cancel] [Apply concession]|
+------------------------------------------------+
```

- For an Accountant or Admin the approval box is hidden.
- After applying, the payment screen shows a line "Concession: -2,000 (Management decision)" and the allocation preview updates.

## 54. Student ledger tab

```text
Ledger   Bilal Ahmed          [Period v] [Type v] [Show reversed v]   [Print statement]
Balance 53,000 Due   Overdue 53,000   Credit 0
-----------------------------------------------------------------------------------
Date         Entry                           Type         Amount     Balance   Allocated to
31 Dec 2025  Term 2 fee charge   [lines v]   Fee charge   +47,000    47,000    -
5 Jul 2026   Term 3 fee charge   [lines v]   Fee charge   +61,000    108,000   -
12 Aug 2026  Payment R-0388 (cash)           Payment      -30,000    78,000    Term 2
9 Oct 2026   Payment R-1043 (cash)           Payment      -25,000    53,000    Term 2, Term 3
-----------------------------------------------------------------------------------
Row menu: View | Reprint receipt | Reverse... | Add note
```

| Element | Behaviour |
| --- | --- |
| Type badges | Fee charge (neutral), Special charge (amber), Concession (blue), Payment (green), Adjustment (grey), Write-off (grey), Refund (blue outline), Reversal (hatched grey), Opening balance (neutral). |
| Amount colour | Entries that increase dues show red with a plus. Entries that reduce dues show green with a minus. |
| Fee charge lines | The `[lines v]` link expands the itemised components under the row. |
| Reversed entries | Shown in grey with a strike-through and a "Reversed by #7" link. The reversal row shows "Reversal of #4". They can be hidden with the "Show reversed" filter. |
| Pending cheque | A payment by an uncleared cheque shows an amber "Pending clearance" badge. |
| Row menu | Items depend on role: **Reprint receipt** and **View** for everyone with access, **Reverse** only for Accountant and Admin. |
| Header strip | Balance, overdue and credit always visible, and they stay in view when scrolling. |
| Empty | "No entries yet." |

## 55. Statement

**Print statement** opens a small dialog, then a print preview.

```text
Print statement
Period   [1 Jan 2026] to [9 Oct 2026]
Layout   (o) Full statement   ( ) Dues only
Paper    [A4 v]
                         [Cancel]  [Preview]
```

The preview shows the layout from section 9.1 with **Print** and **Save as PDF** buttons.

## 56. Receipts list and register

### 56.1 Receipts list

```text
Receipts                                       [Search number, student...]
[Date v] [Mode v] [Counter v] [Status v]
+----------------------------------------------------------------------+
| Number  Student        Amount  Mode  Date / time          By      Status |
| R-1043  Bilal Ahmed    25,000  Cash  9 Oct 2026 2:15 PM   Kamran  Used   |
| R-1042  Ayesha Khan    30,000  Cash  9 Oct 2026 11:42 AM  Kamran  Used   |
| R-1041  -              -       -     9 Oct 2026           Kamran  Spoiled|
| R-1040  Nida Hassan    25,000  Cash  8 Oct 2026           Kamran  Used   |
| R-1039  Nida Hassan    20,000  Cash  8 Oct 2026           Kamran  Void   |
+----------------------------------------------------------------------+
Row menu: Reprint | Open student | Void... (Accountant, Admin)
```

- Search takes a receipt number, student name, SNO or amount.
- Voided rows are struck through with a "Void" badge. Spoiled rows have no student.
- A reprint shows a small "Reprinted 2 times" note on the row.

### 56.2 Receipt register (one book)

```text
< Receipt books
Book 1   R-1001 to R-1050   Kamran Ali   [Active]   Printed by app
Used 41 | Void 1 | Spoiled 1 | Skipped 0 | Unused 7           [Print] [Export]

[1038 U] [1039 V] [1040 U] [1041 S] [1042 U] [1043 U] [1044 .] [1045 .] [1046 .]
[1047 .] [1048 .] [1049 .] [1050 .]
U used   V void   S spoiled   K skipped   . unused
```

- Each number is a small coloured chip: used (green), void (grey, struck through), spoiled (amber), skipped (red outline), unused (white).
- Clicking a chip opens the receipt, or shows the spoiled or skipped reason.
- A gap in the sequence (a number missing without a status) is highlighted in red with "Unaccounted number". This should never appear, and it is a warning sign if it does.

## 57. Receipt books (Settings, Admin only)

```text
Receipt books                                                [+ New book]
Book    Counter       Range            Used  Left  Mode          Status
Book 1  Kamran Ali    R-1001 - R-1050   43    7    Printed by app  Active
Book 2  Farah Javed   R-1051 - R-1100    3   47    Printed by app  Active
Book 0  Kamran Ali    R-0951 - R-1000   50    0    Printed by app  Full
```

The **New book** drawer:

```text
New receipt book
Name      [Book 3_________]
Prefix    [R-]
From      [1101]   To [1150]      (50 receipts)
Assigned to [Kamran Ali v]   (Book 1 is still Active. This book will start when it is full.)
Mode      (o) Printed by app   ( ) Pre-printed book
                              [Cancel]  [Create book]
```

- The drawer checks that the range does not overlap another book and warns if the counter already has an Active book.
- A book can be **Closed** early from the row menu, with a reason. Its unused numbers stay listed as Unused.

## 58. Cheque register

```text
Cheques                              Status [All v]  [Post-dated only]  [Bank v]
In hand: 3 cheques, 38,000          Cleared this month: 12 cheques, 214,000
+---------------------------------------------------------------------------------+
| Cheque no  Bank   Cheque date   Amount  Student          Receipt  Received  Status |
| 004512     Meezan  9 Oct 2026   10,000  Rabia Saleem     R-1053   9 Oct     Received [Deposit]
| 118830     HBL    15 Nov 2026   18,000  Shahid Latif     R-1029   3 Oct     Received [Post-dated]
| 003901     UBL     4 Oct 2026   10,000  Kashif Mahmood   R-1031   4 Oct     Deposited [Cleared] [Bounced]
+---------------------------------------------------------------------------------+
```

Status dialogs:

| Dialog | Fields | Effect |
| --- | --- | --- |
| Mark deposited | Bank account, deposit date. | Status becomes Deposited. The deposit date is saved. |
| Mark cleared | Clearing date. | Status becomes Cleared. The bank balance increases. The student's "Pending clearance" flag is removed. |
| Mark bounced | Reason, bounce fine (default from Settings). | The payment is reversed, the dues return, and the fine (if any) is added. An alert is raised. |
| Return to student | Reason. | Same reversal as a bounce, without the fine. |

A post-dated cheque shows a disabled **Deposit** button with "From 15 Nov".

## 59. Charge, adjustment, write-off and reversal dialogs

| Dialog | Fields |
| --- | --- |
| Add special charge | Type, amount, due date (default 15 days), note. Shows the new balance. |
| Adjustment | Kind (add or reduce), amount, apply to (oldest charge or a chosen one), reason. Shows the effect on balance. |
| Write-off | Amount (up to the student's dues), apply to, reason. Shows "Within your limit" or "Needs an Admin". |
| Spoil receipt number | The number, reason. |

**Bulk special charge** (from the student directory bulk bar):

```text
Add exam fee to 12 students?
 Students            12
 Amount each         2,500
 Total               30,000
 Due date            24 Oct 2026
 Reason *   [Term 3 exam v]
 (i) Struck-off students are skipped (0 skipped).
                      [Cancel]  [Add 12 charges]
```

**Reverse an entry** shows the effect before confirming:

```text
Reverse payment R-1042?
 Entry         Payment 30,000, cash, 9 Oct 2026
 Effect        Balance 23,000 Due -> 53,000 Due
               Term 1 fee charge: unpaid 23,000 -> 53,000
               No bank entry to reverse
 Reason *      [Wrong amount entered v]   Note [__________]
 [ ] Issue a replacement receipt now
                       [Cancel]  [Reverse entry]
```

An amount above the user's limit changes the button to **Request approval** and shows "Needs an Admin".

## 60. Day book

```text
Day book                         Date [9 Oct 2026]  Counter [All v]  [Print] [Export]
+-- Totals by mode ----------------------------------------+
| Cash 112,500 (9)   Bank 50,000 (2)   Online 15,000 (2)   |
| Cheque 10,000 (1)  Total collected 187,500 (14)           |
+-- Other entries ------------------------------------------+
| Concessions -24,000 (2)   Special charges +2,500 (1)      |
| Refunds 2,000 (1)   Voids -30,000 (1)                     |
+------------------------------------------------------------+
Time      Receipt  Student          Type      Mode   Amount   By
2:15 PM   R-1043   Bilal Ahmed      Payment   Cash   25,000   Kamran
11:42 AM  R-1042   Ayesha Khan      Payment   Cash   30,000   Kamran
...
```

- A **Close day** button links to the day closing screen.
- Counter operators see only their own entries.
- Totals match the dashboard's collection for the same date.

## 61. Receipt print layouts

### 61.1 A4, two copies on one page

```text
+--------------------------------------------------------------+
| [logo] AL-SHIFA MEDICAL INSTITUTE                FEE RECEIPT  |
| Address, phone                          No. R-1043            |
|                                         9 Oct 2026, 2:15 PM   |
+--------------------------------------------------------------+
| Student: Bilal Ahmed          Father: Raza Ahmed    SNO 0987  |
| BS Nursing, BSN, Spring 2025, Term 3                          |
+--------------------------------------------------------------+
| Paid for                                          Amount (PKR)|
| Term 2 fee charge (due 15 Jan 2026)                    17,000 |
| Term 3 fee charge (due 20 Jul 2026)                     8,000 |
| Total received (Cash)                                  25,000 |
| Rupees twenty-five thousand only                              |
| Balance after this payment                       53,000 Due   |
+--------------------------------------------------------------+
| Received by: Kamran Ali                  Signature / stamp    |
| (footer note)                                    STUDENT COPY |
+- - - - - - - - - - - - cut here - - - - - - - - - - - - - - -+
| (same receipt again)                              OFFICE COPY |
+--------------------------------------------------------------+
```

### 61.2 80 mm thermal

```text
 AL-SHIFA MEDICAL INSTITUTE
      FEE RECEIPT
 No. R-1043   9 Oct 2026 2:15 PM
 --------------------------------
 Bilal Ahmed          SNO 0987
 BSN, Spring 2025, Term 3
 --------------------------------
 Term 2 charge            17,000
 Term 3 charge             8,000
 --------------------------------
 TOTAL (Cash)             25,000
 Twenty-five thousand rupees only
 Balance after       53,000 Due
 --------------------------------
 Received by: Kamran Ali
```

A **DUPLICATE**, **VOID**, **CHEQUE SUBJECT TO CLEARANCE** or **CHEQUE RETURNED** mark is printed in large letters across the receipt when it applies (section 26).

## 62. Components, states and shortcuts

### 62.1 New components

| Component | Notes |
| --- | --- |
| `LedgerTable` | Entry rows with type badges, amount colours, expandable fee lines, reversed styling. |
| `EntryTypeBadge` | The badge for each entry type (section 54). |
| `AllocationPreview` | The "This payment will pay" panel, shared with admission. |
| `ReceiptPreview` | Renders the A4 or 80 mm receipt on screen, from saved data. |
| `AmountInWords` | Turns an amount into words using lakh and crore. |
| `ReceiptNumberChip` | A receipt number with its status colour. |
| `ReceiptGrid` | The register chips for one book. |
| `ChequeStatusBadge` | Received, Deposited, Cleared, Bounced, Returned, Post-dated. |
| `ApproverPrompt` | Username and password boxes for an approver, used by concessions, back-dating and limits. |
| `EffectSummary` | The "Effect" block in reverse, write-off and void dialogs. |

### 62.2 States and messages

| Situation | Display |
| --- | --- |
| No active receipt book | Danger banner on Record payment: "No receipt book is active for this counter. Ask an Admin to assign one." The Confirm button is disabled. |
| Book almost full | Amber note on the receipt strip: "8 receipts left in Book 1." |
| Day closed | Banner on Record payment when the date is a closed day: "This day is closed. Only an Admin can reopen it." |
| Student has overdue amount | Red overdue figure in the position strip. |
| Save failed | Danger banner "The payment was not saved. Nothing was recorded." with **Try again**. The receipt number is not shown as used. |
| Approval refused | "Wrong approver username or password." with remaining attempts. |

### 62.3 Shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+P | Open Record payment |
| F2 | Focus the Amount box |
| Alt+C, Alt+B, Alt+O, Alt+Q | Choose Cash, Bank, Online or Cheque |
| Ctrl+Enter | Confirm and print |
| Ctrl+R | Reprint the last receipt issued by this user |
| Esc | Close a dialog, or leave the screen (asks first if data was entered) |

## 63. Route map additions

| Route | Screen | Permission |
| --- | --- | --- |
| `/payments/new` | Record payment | `payments.create` |
| `/payments/:id/done` | Payment success | `payments.create` |
| `/receipts` | Receipts list | `receipts.view` |
| `/receipts/books/:id` | Receipt register | `receipts.view` |
| `/settings/receipt-books` | Receipt books | `receipts.manage` |
| `/cheques` | Cheque register | `cheques.view` |
| `/day-book` | Day book | `daybook.view` |
| `/ledger` | Ledger search | `students.view` |

## 64. Acceptance criteria (screens)

- [ ] Record payment can be completed with the keyboard only.
- [ ] The allocation preview changes as the amount and the "pay for" choice change.
- [ ] The success screen figures come from the saved record, not a recalculation.
- [ ] A counter operator sees no date picker and no approval-free concession option.
- [ ] The ledger tab shows reversed entries struck through with links in both directions.
- [ ] The receipts list shows void, spoiled and reprinted receipts clearly.
- [ ] The register highlights any unaccounted number.
- [ ] The cheque register disables Deposit on a post-dated cheque.
- [ ] Every reversal, write-off and refund dialog shows its effect on the balance before confirming.
- [ ] A4 and 80 mm receipts print with the allocation lines, balance and amount in words, and the correct marks.

---

# Shared Sections

## 65. Settings

| Setting | Default |
| --- | --- |
| Back-date limit for Accountant | 7 days |
| Duplicate payment warning window | 10 minutes |
| Large amount confirmation | 500,000 |
| Credit confirmation | 10,000 |
| Adjustment limit (Accountant) | 5,000 per entry |
| Write-off limit (Accountant) | 5,000 per student |
| Refund limit (Accountant) | 20,000 |
| Concession at payment | Always needs an Accountant or Admin |
| Late fine suggestion after | 30 days overdue |
| Cheque bounce fine | 0 |
| Low receipt stock warning | 20 receipts left |
| Receipt copies on A4 | 2 (student and office) |
| Default print format per counter | A4 |
| Receipt footer note | Empty |
| Special charge types | Late payment fine, Exam fee, Certificate fee, Transcript, Re-admission fee, Cheque bounce fine, Other |
| "Paid by" options | Student, Guardian, Other |
| Amount in words | English, using lakh and crore |
| Default receipt prefix | `R-` |

## 66. Test cases

These should be written as automated tests before the screens that use them.

| # | Case | Input | Expected result |
| ---: | --- | --- | --- |
| 1 | Balance identity | Ayesha's four entries (+77,000, -15,000, -9,000, -30,000) | Balance 23,000 |
| 2 | Oldest first | Bilal unpaid 17,000 (Term 2) and 61,000 (Term 3), pays 25,000 | Term 2 unpaid 0, Term 3 unpaid 53,000, balance 53,000 |
| 3 | Specific charge | Same, pays 25,000 to Term 3 | Term 3 unpaid 36,000, Term 2 unpaid 17,000 |
| 4 | Over-payment | Owes 20,000, pays 25,000 | Balance -5,000 (credit 5,000) |
| 5 | Credit applied | Credit 5,000, then a 47,000 fee charge is posted | New charge unpaid 42,000, balance 42,000 |
| 6 | Void a payment | Ayesha's R-1042 voided | Balance 53,000, allocation released, receipt marked Void, number R-1042 not reused |
| 7 | Void and replace | R-1042 (30,000) voided, R-1044 (35,000) issued | Balance 18,000 |
| 8 | Reverse an unpaid charge | 5,000 special charge reversed | Balance reduced by 5,000, original shown as Reversed |
| 9 | Reverse a paid charge | 10,000 charge fully paid, then reversed, no other charges | Payment released, balance -10,000 (credit) |
| 10 | Cheque pending | Rabia pays 10,000 by cheque | Dues reduced at once, flagged pending, bank balance unchanged |
| 11 | Cheque cleared | Cheque marked cleared | Flag removed, bank balance +10,000 |
| 12 | Cheque bounced | Same cheque bounces, bounce fine 500 | Dues +10,000 and +500 fine, receipt marked Cheque returned |
| 13 | Back-dating | Counter operator back-dates 1 day. Accountant back-dates 5 days. Accountant back-dates 10 days. | Blocked. Allowed with reason. Blocked (needs Admin) |
| 14 | Duplicate warning | Same student, amount and mode within 10 minutes | Warning shown |
| 15 | Full book | Book 1 last number 1050 used | Next payment blocked until a new book is active |
| 16 | Concession at payment | Dues 23,000, concession 2,000, pays 21,000 | Balance 0, concession linked to the fee charge |
| 17 | Write-off limits | Struck-off student owes 15,000. Accountant writes off 5,000, then 10,000 | 5,000 allowed. 10,000 needs an Admin. Balance 0 after the Admin writes it off |
| 18 | Old data | A ledger line stored as a negative discount of -500 | Becomes a Special charge of +500 |
| 19 | Day book total | One day's cash, bank, online and cheque payments | Equals the dashboard collection for that day |
| 20 | Ledger check | Any student | Recalculated balance equals the displayed balance |

## 67. Effects on the other documents

| Document | What to update |
| --- | --- |
| `FRONTEND_DESIGN.md` | Sidebar Finance group (section 50), new routes (section 63), and new components (section 62.1). |
| `LOGIN_DASHBOARD_STUDENTS_DESIGN.md` | Permission matrix rows for cheques, write-offs, adjustments, receipt books and out-of-order numbers. Needs attention items: "Cheque bounced", "Cheques ready to deposit". A **Cheques in hand** figure on the Money card. |
| `FEE_TEMPLATES_AND_ADMISSION_DESIGN.md` | None. Its due dates, allocation, void and refund rules are used as written. |

Sample data fixed alongside this document so receipts agree across the set: Book 1 is R-1001 to R-1050 (Kamran Ali), Book 2 is R-1051 to R-1100 (Farah Javed), Ayesha Khan's receipt is R-1042 everywhere, and the backup sample counts match the receipt numbers.

## 68. Open decisions

Defaults below are adopted in this draft. Change any that do not suit the institute.

| # | Question | Default adopted |
| --- | --- | --- |
| 1 | Pre-printed or app-printed receipts | App-printed by default. Pre-printed books supported. |
| 2 | Receipts per book | 50. |
| 3 | A cheque and the student's dues | Dues are reduced at once and flagged pending. They come back if the cheque bounces. |
| 4 | Bounce fine | 0 until the institute sets one. |
| 5 | Combined receipts for siblings | Not in the first release. |
| 6 | SMS or WhatsApp receipts | Not in the first release. |
| 7 | Reprint limit for counter operators | No limit. Every reprint is logged. |
| 8 | Free typing of receipt numbers | Not allowed. Out-of-order use needs an Accountant or Admin. |
| 9 | Amount in words | English, with lakh and crore. Urdu later. |
| 10 | Limits (back-dating, adjustment, write-off, refund) | As in section 65. |

## 69. Suggested build order

1. **Ledger entry model, balance calculation, the move from negative discounts, the ledger check, and tests** (sections 5 to 8 and 66).
2. **Receipt books and the numbering service,** with strict numbers, spoiled, skipped and the register.
3. **The all-or-nothing payment save,** including allocation, bank deposit, receipt number and audit.
4. **Record payment screen, success screen and receipt layouts** (A4 and 80 mm).
5. **Student ledger tab, statements and the receipts list,** with reprint, void and spoil.
6. **Cheque lifecycle,** and the bank links for bank and online payments.
7. **Special charges, adjustments, write-offs, refunds and reversals,** with limits and approvals.
8. **Day book and the link to day closing.**
9. **Settings and approver prompts.**

Steps 1 to 3 come first. Without a trustworthy ledger and a safe payment save, every screen built on top of them would show wrong numbers.
