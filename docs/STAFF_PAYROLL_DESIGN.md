# MediCMS Desktop: Staff & Payroll

**Document type:** Improved design and scope, with detailed frontend design  
**Version:** Draft 1  
**Date:** 16 October 2026  
**Covers:** Feature 1 (Staff Register), Feature 2 (Pay Structures and Work Inputs), Feature 3 (Staff Advances), Feature 4 (Monthly Payroll), Feature 5 (Payroll Disbursement), Feature 6 (Finance Core Integration), Feature 7 (Controls and Reports), and the frontend design for all seven  
**Builds on:** `FINANCE_CORE_DESIGN.md`, especially sections 3, 7–13, 24, 29–34, 41–48, 52–54, 58, 69, 75–82  
**Related:** `LOGIN_DASHBOARD_STUDENTS_DESIGN.md` (users, permissions, backups, day closing), `PAYMENTS_RECEIPTS_LEDGER_DESIGN.md` (receipt/voucher discipline and reversals), `BATCHES_ACADEMIC_SETUP_DESIGN.md` (programs and sessions), `FRONTEND_DESIGN.md` (shared visual system)  
**Status:** Proposed companion design. It defines new payroll rules; it does not claim these features already exist in the application.

---

## Decisions assumed

These are proposed defaults for the institute. They are deliberately listed so the owner can confirm or change them before development.

| # | Question | Assumed answer |
| ---: | --- | --- |
| 1 | Where does payroll live? | A dedicated **Staff & Payroll** sidebar group, integrated into the existing Finance Core money accounts, voucher register, cost view, budget and month close. |
| 2 | Who can see an individual's salary or payslip? | **Admin only**, consistent with Finance Core. Accountant may see payroll batches and amounts by payment mode, but not person-by-person amounts. |
| 3 | What types of workers? | Teaching staff, administration, support staff, visiting faculty, clinical instructors and doctors. |
| 4 | How is pay calculated? | Fixed monthly salary, per class/session, or fixed/variable honorarium. One pay structure per staff member at a time; effective-dated changes. |
| 5 | Who verifies classes or sessions? | An Admin enters or confirms approved quantities. No teaching attendance/timetable integration in this release. |
| 6 | Are tax, EOBI and other statutory payroll deductions included? | No, per the Finance Core decision. **Salary advance recovery** is supported; bonuses, allowances and unpaid-leave reductions are explicitly recorded. |
| 7 | When is payroll calculated? | One standard pay run per service month, plus linked correction/supplemental runs when required. |
| 8 | How are mid-month joins and departures paid? | For monthly-paid staff, calendar-day proration by default, with an Admin adjustment/reason. The final policy should be confirmed. |
| 9 | Who approves payroll? | Admin only. A separate approval is required before disbursement. |
| 10 | Can a run be paid in several batches or payment modes? | Yes. A run can be partially disbursed and have cash, bank transfers and issued cheques. |
| 11 | Who performs payments? | Admin can prepare/authorize individual payouts. An Accountant may confirm **approved aggregate disbursement batches** without seeing individual salaries or staff-linked payout details. |
| 12 | Is creating a payroll run an expense payment? | No. Approval creates the payroll cost and net payable; bank/cash money moves **only when paid**. Cheques leave the bank on clearing. |
| 13 | Are staff advances salary expenses? | No. An advance is a recoverable amount and a money movement when paid; recovery reduces the advance balance and net salary payable, not gross salary cost. |
| 14 | What does 'payroll finalized' mean for month close? | All payroll cost for that service month is approved/frozen (or an explicit Admin-certified 'no payroll' reason). **Payment may remain outstanding.** |
| 15 | Deployment and dates? | Same offline, one-main-computer release; use institute-local calendar dates (Pakistan Standard Time) and the existing encrypted backup and audit system. |
| 16 | Do staff receive an application login? | Not automatically. Staff records are not user accounts; a staff self-service portal is outside this release. |
| 17 | Should salary structure and payslip exports be allowed? | Only Admin; salary-bearing exports, print previews, backups and history require the same restriction. |
| 18 | Do bank payment files get generated? | Admin-only export of approved bank instructions is supported. The app records a transfer after external bank execution is confirmed; it does not send funds itself. |

---

# 1. Purpose and overall model

## 1.1 Why this module exists

MediCMS currently has the academic, student-fee, cash/bank, vendor bill and financial reporting designs. Finance Core reserves staff expense categories but deliberately leaves the **staff register and pay runs** to a separate document. Treating salaries as manually typed bills would make it difficult to know whom the institute owes, how advance recoveries work, and whether the payment actually happened.

This module answers five questions:

1. **Who works for the institute?** Staff register, roles and employment status.
2. **How is each person paid?** An effective-dated pay structure and verified variable inputs.
3. **What is owed for this month?** A draft, reviewable, Admin-approved payroll run.
4. **What was actually paid, through which account?** Disbursements tied to Finance Core vouchers and money entries.
5. **What remains to pay or recover?** Salary payables, advances, issued cheques, and reconciliation/closing status.

## 1.2 Old approach versus new design

| Today / without this module | New design |
| --- | --- |
| Salaries and faculty honoraria could be typed as ordinary expenses. | Staff payroll is the sole source of new postings to reserved Staff cost categories. |
| No staff master record is required before payout. | Staff must exist, with an active pay structure, to enter a payroll run. |
| No consistent monthly salary record. | Pay runs snapshot rates, inputs and approved amounts by service month. |
| An advance can be confused with an expense. | Advances have their own recoverable balance, payment and recovery records. |
| A cost is recognized only when cash is paid. | Approved payroll cost and actual cash paid are shown separately. |
| A cheque can look like immediate cash out. | Issued, post-dated, cleared and cancelled cheque lifecycle is reused from Finance Core. |
| Re-entering salary payments can double-count costs. | One authoritative payroll run generates costs and payout instructions. |
| Salary figures can leak through vendor or bank pages. | Staff identities and individual pay are protected in Finance views, reports and exports. |

## 1.3 Boundaries and source of truth

```text
   STAFF REGISTER       PAY STRUCTURES       WORK INPUTS / ADVANCES
         |                    |                       |
         +--------------------+-----------------------+
                              |
                     MONTHLY PAYROLL RUN
                    Draft -> Review -> Approved
                              |
               +--------------+----------------+
               |                               |
         PAYROLL COST /                    NET PAYABLE /
         BUDGET USED                       ADVANCE RECOVERY
               |                               |
               +----------------+--------------+
                                |
                         DISBURSEMENTS
                 cash / bank transfer / cheque
                                |
                  FINANCE CORE MONEY ACCOUNTS
                    vouchers / bank book /
                 reconciliation / month close
```

**Ownership:**

- **Staff & Payroll** owns staff records, pay structures, work inputs, advance balances, approved payroll lines, employee-level status and payslips.
- **Finance Core** owns money accounts, cleared money entries, issued cheques, voucher numbers, reconciliation, budgets, month close and financial totals.
- **A shared transactional data layer** posts linked records together. No screen writes directly to stored tables or calculates a second independent balance.
- **Payroll is not a vendor bill.** Payroll payable and payroll cost are first-class payroll records exposed to Finance reports, not dummy vendor bills or duplicate manual expenses.

## 1.4 Terminology

| Term | Meaning |
| --- | --- |
| **Staff member** | A person who works for or provides paid professional services to the institute. |
| **Staff number** | Permanent internal identifier, e.g. `ST-0042`; never reused. |
| **Pay structure** | The effective-dated agreement defining how earnings are calculated. |
| **Service month** | The month for which work was done and salary is earned. |
| **Payment date** | The date actual money moves or an issued cheque is handed over. It may be in a later month. |
| **Work input** | Approved number of classes/sessions or a specific adjustment for a service month. |
| **Gross payroll cost** | Earned base pay + session/honorarium pay + allowances/bonuses − reductions that change earned pay. |
| **Advance** | Cash/bank/cheque paid to staff before salary is earned, tracked as an amount recoverable from future pay. |
| **Advance recovery** | Deduction from net pay that settles part of an earlier advance. Not a new negative payroll cost. |
| **Net payable** | Gross payroll cost − advance recoveries (there are no tax/EOBI deductions in this release). |
| **Payroll run** | One frozen calculation for a service month, with employee lines and totals. |
| **Disbursement batch** | One approved group of payments using one money account and mode. |
| **Salary payable** | Net salary still owed, accounting for disbursements and cheque status. |
| **Payroll cost view** | Cost recognized for the service month from approved payroll, irrespective of payment date. |
| **Pending clearance** | A salary cheque has been issued but the bank has not cleared it. |
| **Supplemental run** | A linked run that adds/corrects amounts without silently rewriting an approved run. |
| **Restricted detail** | Individual salary, rates, deductions, bank instructions or payslips visible only to Admins. |

---

# 2. Roles, permissions and salary privacy

## 2.1 Permission matrix

| Action | Admin | Accountant | Counter operator | Viewer |
| --- | :---: | :---: | :---: | :---: |
| Open Staff & Payroll overview | Full | Aggregate only | No | Aggregate only* |
| View staff directory (non-pay fields) | Yes | Yes | No | Yes |
| Create/edit staff records | Yes | No | No | No |
| View or edit individual pay structures | Yes | No | No | No |
| Enter/approve work quantities | Yes | No | No | No |
| Create or manage advances | Yes | No | No | No |
| View individual advance balances | Yes | No | No | No |
| Generate and edit payroll run | Yes | No | No | No |
| View run totals / payment status | Yes | Yes | No | Aggregate only* |
| View named payroll lines or payslips | Yes | No | No | No |
| Submit and approve pay run | Yes | No | No | No |
| Prepare individual disbursement instructions | Yes | No | No | No |
| Record approved aggregate payout execution | Yes | Yes | No | No |
| Export individual bank transfer instructions | Yes | No | No | No |
| Issue/clear/cancel payroll cheque | Yes | Aggregate/restricted by Finance permission | No | No |
| Print a named payslip | Yes | No | No | No |
| Reconcile bank payroll batch | Yes | Yes (masked payees) | No | No |
| See aggregate payroll in Finance reporting | Yes | Yes, where permitted by Finance | No | Read only* |
| Reopen a closed month or reconciled period | Yes | No | No | No |

*Viewer must not see individual salaries, payment files, person-level pay or any aggregate intended to be hidden by the existing Finance Core policy. Finance Core's **Staff** budget categories remain Admin-only, even if non-Admins have access to other budget data.

**Security enforcement:** Route checks, API/data-layer checks, projections/queries, exports, printed documents, search, autocomplete, audit details, exceptions and notification text all enforce these same permissions. Simply hiding a column is not sufficient.

## 2.2 What non-Admins can see

- A permitted Accountant can see: `October payroll · Approved · 35 staff · Net 1,260,000 · Bank 1,050,000 · Cash 130,000 · Cheque 80,000`.
- They **cannot** drill into rows such as `Ayesha — 60,000`, infer pay from a one-person bank batch, open an individual payslip, download bank instruction files or view hidden linked-record payloads.
- On Finance account books, a payroll line reads `Payroll batch PAY-2026-10 — bank transfers (19 payments)` and exposes its total only.
- For an individual payroll cheque, a non-Admin can match cheque **number, date and amount** as permitted by Finance Core, but the staff payee is masked as `Payroll cheque — restricted` and no linked salary view is exposed.
- An Admin sees the staff name, earning calculation, approval, allocations and document links.

**Aggregation caveat:** A one-person batch can reveal that person's salary if the reader knows the person. For non-Admin readers, aggregate summaries must not expose staff membership, per-person references or batch creation controls that identify a person. Where aggregation would reveal an individual, show the authorized payout total with generic wording, not a named staff record.

## 2.3 Audit trail

Record actor, local timestamp, action, reason, linked run/action number and before/after values for staff changes, pay structure changes, work input approval, advances, run generation, approval, rejection, payout, cheque status, reversal, export, payslip printing, month reopening and correction.

The Admin can inspect restricted values. Non-Admins receive a **redacted audit projection**, not unrestricted JSON data or old/new salary figures.

---

# Feature 1: Staff Register

## 3. Goals

- Keep one reliable record for every person paid by the institute.
- Separate identity, employment and financial details.
- Preserve history when someone leaves or changes designation.
- Support staff who teach multiple programs without creating duplicate people.

## 4. Staff record

| Field | Rule |
| --- | --- |
| Staff number | Generated, unique, never reused. |
| Full name | Required. |
| Father/guardian name | Optional. |
| CNIC / identification | Optional in initial design; normalized for duplicate warnings. Admin-only visibility recommended. |
| Phone | Optional, Pakistani mobile format when given. |
| Email, address, emergency contact | Optional. |
| Photo | Optional, same safe upload conventions as Student module. |
| Staff type | Teaching, Administration, Support, Visiting faculty, Clinical instructor/doctor. |
| Designation | Required free text or a Settings suggestion. |
| Department | Optional; for grouping, e.g. Nursing, Paramedics, Administration. |
| Program association | Optional one or several Active academic programs, for teaching context; does not create academic batches. |
| Joining date | Required; cannot be after leaving date. |
| Leaving date | Optional. |
| Employment status | Active, On leave, Left. |
| Employment mode | Regular, Part-time, Visiting, Contract. |
| Default payout preference | Cash, Bank transfer or Cheque. |
| Bank name, account, account holder | Optional and **Admin-only**; last four digits only outside the secure edit field. |
| Notes | Optional, sensitive notes are Admin-only. |
| Created/changed by and timestamp | System-generated. |

Rules:

1. Exactly one staff record represents a person, even if they teach in several programs.
2. A duplicate CNIC or same-name/phone match warns and allows the Admin to inspect before saving; identical normalized CNIC is blocked unless a documented correction/override is permitted.
3. Records with any pay run, advance or payment **cannot be deleted**. They can be marked Left.
4. Marking someone Left closes their current pay structure prospectively. Historic runs, payables and advances remain.
5. Marking staff On leave does not automatically infer unpaid days; an Admin confirms any pay adjustment in a monthly work input.
6. A person who rejoins is reactivated under the same staff number with a new employment period, not silently duplicated.
7. The staff record is not a login user. The user management module remains the authority for staff operating MediCMS.
8. An individual payroll cannot be generated without an eligible pay structure for the service period.

## 5. Staff statuses

| Status | Meaning | Payroll effect |
| --- | --- | --- |
| **Active** | Currently employed or engaged. | Included when structure/period is eligible. |
| **On leave** | Away temporarily. | Review required; pay may be zero or reduced based on approved input. |
| **Left** | No longer engaged. | Not included after the leaving date, but past month adjustments and outstanding payments remain possible. |

## 6. Acceptance criteria (Feature 1)

- [ ] An Admin can create a staff record and immediately add a pay structure.
- [ ] A staff member can be associated with more than one academic program without duplicates.
- [ ] Leaving a job never removes earlier payroll or payments.
- [ ] Staff cannot be deleted when financial records exist.
- [ ] Staff numbers are unique, permanent and not reused.
- [ ] Non-Admins cannot read restricted salary or bank-account fields, including exports and URLs.

---

# Feature 2: Pay Structures and Monthly Work Inputs

## 7. Goals

- Support the institute's different ways of paying teachers, visiting faculty, doctors and other staff.
- Preserve the exact agreed rate used by each approved payroll run.
- Make variable earnings visible and approved before payroll is submitted.

## 8. Pay structure types

| Type | Fields | Calculation |
| --- | --- | --- |
| **Fixed monthly** | Monthly base amount, effective date, optional allowance defaults. | Base amount, prorated if the member joined/left partway through month. |
| **Per class/session** | Amount per approved class/session, effective date. | Approved units × rate. |
| **Honorarium** | Fixed amount for a service month or approved units × honorarium rate. | Approved honorarium for that month. |

Every pay structure has:

- Staff ID, type, start date, optional end date, reason for change and Admin who approved it.
- An optional Staff cost category mapping (default from staff type): Salaries: Teaching, Salaries: Administration, Salaries: Support, Honoraria: Visiting faculty, or Honoraria: Clinical instructors and doctors.
- Optional default program tag for Finance program summary. No automated multi-program salary splits in this release.
- Optional usual payout mode and reference bank details, kept separately from the numeric rate.

**Effective dates:** A new structure cannot overlap an existing one for the same staff. A historical structure is never rewritten after being used by an approved run. Changing a future structure displays how many draft/approved payroll runs it may affect; approved runs are never recalculated silently.

## 9. Monthly earnings and deductions

| Line | Purpose | Changes payroll cost? |
| --- | --- | :---: |
| Monthly base salary | Fixed monthly earnings | Yes |
| Class/session earnings | Verified quantity × agreed rate | Yes |
| Honorarium | Visiting teaching, clinical instruction or doctor services | Yes |
| Allowance | Travel, responsibility or other approved allowance | Yes |
| Bonus | Approved one-off additional earning | Yes |
| Unpaid leave / absence reduction | Reduces earned base pay, with dates/notes | Yes (reduces) |
| Pay correction for this month | Adjusts earned pay, with reason | Yes |
| **Advance recovery** | Settles prior advance already paid to staff | **No**; changes net payout and advance balance |

There is no tax/EOBI computation. Other deduction types (loans, insurance, statutory deductions, loans to third parties) are **not** silently added; they require a later design.

## 10. Calculation rules

```text
Earned gross cost = Prorated base salary
                  + (Approved classes × per-class rate)
                  + Approved honoraria
                  + Approved allowances and bonuses
                  − Approved unpaid-leave/pay reductions

Net salary payable = Earned gross cost − Approved advance recovery

Still payable = Net salary payable − Posted/recognized disbursements
                + Linked reversals of those disbursements
```

Further rules:

1. All money is whole PKR. Multiply integer unit counts by integer rates; ratios such as proration are rounded to the nearest rupee, halves up.
2. Default monthly proration is `monthly rate × eligible calendar days ÷ calendar days in service month`. An Admin may override with a reason; the period, days and result are shown.
3. Negative earned gross is blocked. Each recovery is capped at the amount actually outstanding on the advance and at available salary before recovery.
4. Recoveries are applied oldest outstanding advance first by default; Admin may select a specific advance.
5. If advances are larger than salary, recover no more than salary for that run; carry the remaining advance forward.
6. A zero-pay staff line requires an explicit reason and stays visible rather than disappearing.
7. No duplicate fixed salary or session unit record may be counted twice for the same staff/month/run. A warning identifies overlapping or repeated inputs.
8. Rate and earning snapshots in approved payroll remain unchanged when a staff structure is edited later.
9. Corrections to **approved** runs use a linked supplemental run or reversal and replacement (see Feature 4).

## 11. Work input workflow

1. Admin chooses service month and staff group.
2. System shows the expected monthly staff and input gaps (sessions missing, leave needs review, unmatched rates).
3. Admin enters session counts and honors/bonuses, or records `0 — no sessions` with a reason.
4. Admin reviews source notes and confirms all entries.
5. Each entry gains `Draft` or `Verified` state, with actor and timestamp.
6. Payroll generation uses only Verified inputs. A revised quantity requires a reason and a new verification before approval.

The first release accepts manual verified quantities; it does **not** pretend to derive them from attendance or classroom schedules that do not exist.

## 12. Acceptance criteria (Feature 2)

- [ ] Fixed salary, session pay and honorarium produce predictable amounts.
- [ ] Changing a staff rate does not alter an existing approved run.
- [ ] A missing required session count blocks submission until verified or deliberately set to zero.
- [ ] A recovery cannot exceed the advance balance or the staff member's available salary.
- [ ] Pay reduction and advance recovery affect different totals and are clearly labeled.
- [ ] Mid-month proration shows dates, eligible days, denominator and rounded result.

---

# Feature 3: Staff Advances

## 13. Purpose

A salary advance is money given to an employee before it is earned. Unlike an expense or bonus, the institute expects to recover it. Every advance must have an identifiable balance, payment record and recovery history.

## 14. Advance record and states

| Field | Rule |
| --- | --- |
| Number | `ADV-` plus sequence, never reused. |
| Staff | Required; Admin-only person-level association. |
| Requested amount | Positive whole PKR. |
| Reason | Required. |
| Approval | Admin with user/time. |
| Method | Cash, bank transfer, cheque. |
| Payout account and reference | Existing Finance accounts and cheque books. |
| Date | Actual payment date; no future posted cash/bank money movement. |
| Recovery policy | Fixed amount per month, remaining-in-full, or manually chosen amounts per pay run. |
| Start recovery month | Defaults to next service month. |
| Balance | Advance disbursed − recoveries + recovery reversals; calculated. |
| Status | Draft, Approved, Pending disbursement, Active, Recovered, Cancelled. |

## 15. Advance lifecycle

```text
New advance -> Approve -> Pay via Finance account -> Outstanding advance
                                                        |
                                             Recover in payroll
                                                        |
                                               Part recovered
                                                        |
                                                  Recovered
```

Rules:

- Creating or approving an advance does **not** move money.
- A cash/bank disbursement creates a money-out entry only when the payment happens. A cheque follows Finance Core's issued/cleared lifecycle.
- Advances use a distinct **Staff advance** money-entry kind and a recoverable-advance subledger, not the reserved Staff salary expense categories.
- Recovery from payroll reduces both the employee's take-home pay and the advance outstanding; it does **not** create a second money-in entry or reduce gross salary cost.
- Recoveries are committed when the pay run is approved. Voiding that run or reversing its recovery restores the outstanding advance balance.
- If the person leaves with an unrecovered advance, the balance remains visible to Admin. Settlement/write-off requires a separate audited decision and is not silently treated as salary expense.
- An advance cannot be paid from counter cash or petty cash if that account would become negative.
- Corrections to an already disbursed advance use linked Finance reversals, respecting day/month and reconciliation locks.

## 16. Example

An employee receives Rs. 40,000 from the bank on 15 September. Their October gross salary is Rs. 100,000, with an approved Rs. 10,000 advance recovery.

| Event | Payroll cost | Money account | Advance balance |
| --- | ---: | ---: | ---: |
| Pay advance in September | No change | −40,000 bank | 40,000 |
| Approve October payroll | +100,000 October cost | No change | 30,000 after recovery booked |
| Pay October net salary | No new cost | −90,000 by chosen mode | 30,000 |

The example assumes the full October net salary is paid. The September advance was an earlier money-out movement, not additional October salary expense.

## 17. Acceptance criteria (Feature 3)

- [ ] An advance does not count as salary cost when issued.
- [ ] Its actual disbursement reduces the chosen Finance account, subject to cheque-clearance rules.
- [ ] The balance is rebuilt from disbursements and recoveries, not typed into a mutable field.
- [ ] A recovery affects net pay but not gross payroll cost.
- [ ] A cancelled run reverses its committed recovery.
- [ ] Leaving the institute does not make an outstanding advance disappear.

---

# Feature 4: Monthly Payroll Generation and Approval

## 18. Goals

- Generate a consistent draft for an entire service month.
- Display exceptions before financial approval.
- Keep a frozen snapshot after approval, with clear correction rules.
- Recognize payroll cost separately from the eventual payment of salary.

## 19. Payroll run header

| Field | Rule |
| --- | --- |
| Run number | `PAY-YYYY-MM-01`, with linked supplemental suffix if needed; immutable. |
| Service month | Required, within the institute's valid go-live period. |
| Run kind | Standard or Supplemental/Correction. |
| Staff group | All eligible staff by default; group filters do not create separate duplicate standard runs. |
| Created/updated | Actor, local timestamp, revision. |
| Calculation state | Draft, Submitted, Approved, Cancelled/Reversed. |
| Disbursement state | Unpaid, Part paid, Paid, Pending cheque clearance (separate from calculation state). |
| Counts | Staff included, exceptions, zero-pay lines, missing inputs. |
| Totals | Base, session pay, honoraria, allowances, reductions, gross, advance recoveries, net payable, paid, pending cheques, still payable. |
| Approval | Admin, time, review note, locked calculation revision. |
| Finance links | Payroll cost posting, disbursement batch IDs, vouchers, cheque references, action numbers. |

Only **one standard approved run** may exist for a service month. An approved standard run cannot be generated or approved again. Supplemental runs must reference the original.

## 20. Run workflow

### 20.1 Generate

1. Admin opens **Payroll → New pay run**.
2. Choose service month (default previous unfinalized month, not automatically current).
3. Show eligibility preview: Active/Left-during-month staff, missing structures, session inputs and existing standard run.
4. Confirm `Generate draft`. The app snapshots the structures and inputs currently selected.
5. Run details open. No Finance money or cost entry is posted yet.

### 20.2 Review

The Admin checks every employee row, exceptions, proration, advance balances and net payable. Optional overrides require a reason, and the run totals recalculate instantly. `Rebuild draft` re-reads updated source records with a comparison; it never discards manual edits silently.

### 20.3 Submit and approve

- **Submit for approval** runs preflight checks. The run cannot be approved if required work inputs are unverified, a staff structure is missing, a recovery exceeds the balance, a duplicate run exists, or another financial invariant fails.
- **Approve payroll** is Admin only, requires re-authentication or an equivalent existing approver challenge, and displays total gross, net, recovery and change count.
- Approval atomically freezes the run, creates the payroll cost and net payable records, posts the advance recoveries, writes the audit entries, and enables the payout plan.
- **Approval does not itself debit any bank or cash account.**

### 20.4 If wrong after approval

| Situation | Safe action |
| --- | --- |
| No disbursement and month open | Admin cancels/reverses approved run with a reason; cost, payable and recovery effects reverse together, then a corrected replacement run may be approved. |
| Some disbursements already made | Original run remains visible. Create a linked supplemental run or reversing/correcting records; never delete or overwrite paid transactions. |
| Payroll entry reconciled | Reopen reconciliation (Admin) before reversing the linked money movement. |
| Service month closed | Do not silently rewrite its saved month-end report. A correction posts in the current open month and carries the original service-month reference, or Admin explicitly reopens the closed month. |
| Amount owed is negative after correction | Do not create a negative payment. Show a recoverable staff amount requiring a separately approved resolution. |

## 21. Sample monthly payroll

The numbers below are **illustrative for this document** and separate from the historic Finance Core October sample.

| Staff cost group | Gross pay (PKR) |
| --- | ---: |
| Teaching salaries | 800,000 |
| Administration salaries | 220,000 |
| Support salaries | 120,000 |
| Visiting/clinical honoraria | 160,000 |
| **Gross payroll cost** | **1,300,000** |
| Advance recoveries | −40,000 |
| **Net payroll payable** | **1,260,000** |

Assume this is an approved pay run for a service month. The Rs. 1,300,000 belongs to that month's **cost view**, while the Rs. 1,260,000 becomes payable to staff. Finance Core money accounts are unchanged until disbursements occur.

## 22. Month-close contract

For Finance Core's month-close checklist item **Staff pay for the month is finalised**:

- The service month's standard payroll is Approved and frozen; supplemental runs for known corrections are resolved, or the Admin records `No payroll for this month` with a reason.
- `Unpaid` or `Part paid` **does not** by itself block the close. Those amounts remain salary payables and are paid later.
- A payroll run that is still Draft or Submitted blocks the check; it must be approved or explicitly cancelled/resolved.
- An approved October payroll paid in November is still **October cost** and **November cash out**.
- A payroll run cannot add cost retrospectively to a locked month. Follow the correction rules in section 20.4.

## 23. Acceptance criteria (Feature 4)

- [ ] Payroll generation is idempotent for a service month: no duplicate standard pay.
- [ ] Draft generation moves no cash and posts no cost.
- [ ] Approval posts gross cost, net payable and recovery records atomically, but moves no money.
- [ ] A run cannot be approved with unverified input or missing structure.
- [ ] An approved run is a frozen snapshot.
- [ ] Corrections never silently rewrite an approved pay run.
- [ ] Payroll may be finalized for month close even when employees remain unpaid.

---

# Feature 5: Payroll Disbursement

## 24. Goals

- Pay exactly the approved net salary, using existing named money accounts.
- Support cash, bank transfer and cheque payments in different batches.
- Know which approved amounts have been paid, which cheques are uncleared, and what is still owed.
- Preserve individual salary privacy outside Admin access.

## 25. Payment plan and batches

The Admin prepares payout allocations from an Approved run:

| Field | Description |
| --- | --- |
| Disbursement batch | `PB-YYYYMM-###` unique ID. |
| Source payroll run | Required, Approved only. |
| Mode | Cash, Bank transfer, Cheque. |
| Money account | Existing active account of the matching type. |
| Staff payout lines | Admin-only staff/pay amounts and payout status. |
| Batch total | Sum of included lines (visible by permitted role). |
| Requested date | When the transfer/hand-over is planned. |
| Execution reference | Bank batch ref, cash handover reference, or cheque numbers. |
| Status | Prepared, Ready, Part executed, Executed, Cancelled. |
| Linked voucher(s) | Numbered Finance Core voucher references. |

**Do not overpay:** For each staff line, proposed disbursements plus already paid/issued amounts must never exceed the approved net payable for that line. Credit from an unrelated employee is never offset against another person's salary.

## 26. Payment modes and posting

| Mode | Staff/payroll effect | Finance Core effect |
| --- | --- | --- |
| **Cash** | Mark amount paid when cash is handed over and acknowledged. | Money Out from selected counter cash account; numbered voucher; included in daily cash count. Negative cash prohibited. |
| **Bank transfer** | Mark paid only after external transfer execution is confirmed with reference. | Money Out immediately from selected bank account; numbered voucher; reconcile later. |
| **Cheque issued** | Mark `Issued — pending clearance` when handed over. | Issue cheque and voucher; bank book unchanged, **available balance** decreases. |
| **Cheque cleared** | Mark settled/cleared. | Post bank Money Out on clearance date; reconcile with statement. |
| **Cheque cancelled** | Restore staff amount to payable, reason required. | Reverse voucher/issued commitment; cheque number never reused. |

Only the app's ledger and linked Finance Core functions determine paid totals. A `Prepared` bank file or unconfirmed transfer must **not** be counted as cash paid.

## 27. Accountant-friendly aggregate workflow

The Admin creates and approves the staff-level payout list and (when bank is used) exports a restricted bank instruction file. The Accountant receives only an execution batch reference, mode, account, count and total. After external execution the Accountant can record:

```text
Payroll payout batch PB-202610-002
Mode: Bank transfer
Source: Meezan, main account
Recipients: 19 (identity restricted)
Authorized total: Rs. 1,050,000
Reference: BANK-BULK-2941
[Confirm external execution]
```

The data layer privately applies the total to the exact pre-approved employee allocations. The Accountant cannot change staff membership or per-person amounts. If the executed total differs, the batch is held for Admin correction or a formally approved partial-execution mapping; it is **not** distributed proportionally by the Accountant.

**Cash handover:** Admin produces sealed staff-level payment acknowledgements. Accountant may fund/record the approved aggregate cash movement. Individual acknowledgement/status is confirmed by Admin to avoid exposing named salaries. A missing acknowledgement leaves the specific item Pending in the Admin view; do not mark it paid merely because cash left a drawer.

## 28. Vouchers and cheque privacy

- A payroll payout creates numbered Finance Core payment voucher(s). The payee shown to non-Admins is `Payroll disbursement — restricted`, with run ID, method, account, total and reference.
- A confidential sub-ledger maps that voucher/batch to named staff lines. Admin-only detail and payslip views use that mapping.
- If a cheque is issued to an individual staff member, the actual cheque-payee details are available only in Admin-only or bank-execution context. Bank reconciliation for Accountants matches amount/date/cheque number without displaying the staff name.
- A payout voucher never pretends to be a regular vendor bill; Staff expense categories remain payroll-only.
- Printing/exporting a Finance voucher or reconciliation sheet cannot accidentally reveal a named salary.
- Financial reversals preserve the original voucher number and leave a linked reversal visible. Issued cheque numbers are never reused.

## 29. Partial payments and outstanding payables

| Example | Result |
| --- | --- |
| Approved net payable 1,260,000; nothing paid | Payroll payable 1,260,000; cash out 0. |
| Bank transfer 1,050,000 recorded | Remaining payable 210,000; bank money out 1,050,000. |
| Cash handover 130,000 recorded | Remaining payable 80,000; cash money out 130,000. |
| Cheque 80,000 issued | No unallocated staff payable under the issued commitment; cheque pending clearance 80,000; bank book unchanged, available balance down 80,000. |
| Cheque later clears | Bank money out 80,000; pending-clearance figure becomes 0. |
| Cheque instead cancelled | 80,000 becomes payable again; available balance commitment released. |

The payroll dashboard shows **Still to disburse** and **Issued cheques pending clearance** separately. It does not call an uncleared cheque a cleared bank payment.

## 30. Acceptance criteria (Feature 5)

- [ ] Payouts cannot be made for Draft/Submitted/Cancelled runs.
- [ ] A staff salary line cannot be disbursed twice or above its approved net value.
- [ ] An approved batch may be split into several payment modes and dates.
- [ ] Finance account balances change only when the corresponding money movement occurs (or cheque clears).
- [ ] Cheque issuance reduces available balance and cheque cancellation restores payable.
- [ ] An Accountant can confirm only prepared aggregate batches and cannot read staff identities or individual salaries in the workflow.
- [ ] Every payment has a numbered voucher, audit record and traceable originating run.

---

# Feature 6: Finance Core Integration

## 31. Exact posting rules

| Payroll event | Finance Core record | When |
| --- | --- | --- |
| Approve payroll for October | Payroll cost record categorized under Staff; payroll net payable; staff recovery records | At approval, attributed to October service month if open |
| Issue staff advance by cash/bank | `Staff advance` Money Out entry, recoverable advance balance | On actual payment |
| Recover an advance in approved payroll | Advance subledger recovery and reduced net payroll payable | At approval; **no Money In** |
| Pay salary in cash | Voucher + Counter cash Money Out | On acknowledged cash payout |
| Pay salary by bank | Voucher + Bank Money Out | On confirmed bank transfer |
| Issue payroll cheque | Voucher + issued-cheque record | On issue, before clearance |
| Clear payroll cheque | Bank Money Out | On clearing date |
| Cancel payroll cheque | Linked reversal/restore obligation | On cancellation |
| Reverse approved unpaid payroll | Linked reversal of payroll cost, payable and recovery | Authorized correction in an open period |

**Payroll cost categories:**

1. Salaries: Teaching
2. Salaries: Administration
3. Salaries: Support
4. Honoraria: Visiting faculty
5. Honoraria: Clinical instructors and doctors

These are the exact Staff-group categories reserved in `FINANCE_CORE_DESIGN.md` section 24. A general **Record Cost** screen must continue to block manual postings into these categories: `Salaries are paid through payroll.`

## 32. Cash view versus cost view

The Finance design distinguishes the amount paid from the cost incurred. Payroll extends the **cost view** to include approved payroll cost assigned to the service month, alongside bills posted for that month.

| Example | Cost view | Cash view |
| --- | --- | --- |
| October salary approved in October for 1,300,000 | October payroll cost +1,300,000 | No change yet |
| Advance recovery 40,000 | No additional cost | No Money In |
| October salary bank transfers paid in November, 1,050,000 | No extra cost | November Money Out 1,050,000 |
| October salary cash paid in November, 130,000 | No extra cost | November Money Out 130,000 |
| October salary cheque 80,000 issued in November | No extra cost | November available bank balance decreases; money out only on clearing |

**Existing Finance Core October 2026 historical example:** The Finance document's sample shows a payroll **cash payment of September wages in October**. It must not be retroactively labeled as an October salary cost. That legacy sample remains a valid cash-view illustration. The new Payroll cost view will count a service month's gross payroll once that month's run is approved.

If a run is approved for a month that has already closed, the system must follow the documented reopening/correction mechanism instead of backdating hidden cost changes.

## 33. Finance overview and reports

| Existing Finance surface | Payroll contribution |
| --- | --- |
| Money In / Out | Paid payroll appears as Money Out only when cleared/posted; advances are a separate cash-out kind. |
| Where money is | Counter/bank balances include payroll payouts; issued cheques reduce available balance. |
| Costs | Approved gross payroll recognized for service month in Staff group, with restricted category visibility. |
| Budget versus Actual | Gross approved payroll cost counts against corresponding Staff category; remains Admin-only at category level. |
| Payables | Separate **Salary payable** subtotal; not mixed with unpaid vendor bills. |
| Held / commitments | Payroll issued cheques remain pending until clearing. |
| Bank book | Aggregated/redacted payroll payment lines with linked payout batch. |
| Reconciliation | One statement debit may match an entire bulk payout or multiple linked Finance entries. |
| Month close | Payroll-finalized check for the service month. |
| Program summary | Optional program tags from payroll earning lines, Admin-only for sensitive pay. |
| Finance reports | Staff cash totals and Admin-only payroll cost detail, without duplicate costs. |

Do not double-count payroll by creating both a normal vendor bill and a payroll cost for the same pay run. Do not count transfers (bank-to-cash) as another salary expense.

## 34. Day closing and cash deposits

The existing day-closing design counts cash receipts and refunds. With payroll cash disbursements, **expected cash must include all actual cash movements in the account**: opening/last-count balance + cash student receipts − refunds − acknowledged payroll cash payments − bill/petty cash payments ± transfers ± approved cash differences.

- A cash salary payout changes the appropriate cash account on the actual handover date.
- The cash count checks **physical cash**, so the payout cannot be omitted just because it was initiated in Staff & Payroll.
- Closed days and closed months block backdating and reversal until Admin reopening.
- Payroll does not issue a student receipt-book number. It issues a Finance payment voucher.

This requirement should update `LOGIN_DASHBOARD_STUDENTS_DESIGN.md` section 33 before implementation.

## 35. Bank reconciliation

- Bank instruction files are only instructions; they do not create booked deposits/withdrawals.
- A confirmed bulk bank payment creates individual protected allocation records and visible **aggregate** Finance movement(s) sharing the same action number.
- Bank statement matching supports one debit to an approved payroll payout batch, using equal amount, near date and bank reference as matching evidence.
- Unmatched salary debits prompt **Match to payroll payout batch**; only an Admin can inspect named lines.
- Incoming/issued payroll cheque matching relies on cheque number and amount; identity stays redacted for Accountants.
- Reversing a reconciled payroll payment requires the same Admin reconciliation reopening as every other Finance payment.

## 36. Month-close conditions and migration

- **Payroll finalized** is required when payroll is enabled, even if salary remains unpaid.
- Payroll cost can be recognized only within an open period, or through a documented correction in the current period.
- At go-live, enter **opening unpaid salary liabilities** and **unrecovered staff advances** separately from bank/cash opening balances, with date, reason and evidence. Do not generate false historical money movements for these starting amounts.
- Legacy manually entered salary expenses are retained as **Before go-live** history and excluded from new account balances, as specified by Finance Core.
- Do not convert historical salary expense into a new pay run and count it again. A one-time mapping tool may attach history references without reposting money.

## 37. Acceptance criteria (Feature 6)

- [ ] An advance is money out but not Staff salary cost.
- [ ] Approving salary raises gross cost and net payable but leaves bank/cash balances unchanged.
- [ ] Cash/bank payouts change exactly one named money account and have voucher links.
- [ ] Issued cheques affect available balance immediately but bank book only on clearance.
- [ ] Staff categories cannot be posted manually through Bills and Expenses.
- [ ] A bank statement bulk payroll debit can reconcile to a payout batch.
- [ ] Month close is blocked for unfinalized payroll, not for legitimate unpaid approved payroll.
- [ ] Historical expenses are not double-counted after go-live.

---

# Feature 7: Payroll Controls, Reporting and Monitoring

## 38. Goals

- Show the Admin what needs to be approved, paid, recovered or corrected.
- Let Finance users verify approved batch totals without exposing staff salaries.
- Keep historical pay, reversals and monthly costs traceable.

## 39. Payroll health checks

| Check | Shown when | Action |
| --- | --- | --- |
| Staff missing pay structure | A payroll-eligible staff member has no rate for the selected service month. | Open Salary structure (Admin). |
| Work inputs not verified | Sessions/honoraria or leave decisions are incomplete. | Open Work inputs (Admin). |
| Draft waiting for approval | A payroll draft has been submitted but not approved. | Review run (Admin). |
| Approved pay remains unpaid | An approved run has an outstanding disbursement balance. | Open Pay run / payout plan. |
| Payroll cheques pending | A salary cheque has not cleared. | Issued cheques. |
| Stale payroll cheque | Older than six months by default. | Investigate or cancel. |
| Advance scheduled for recovery | Active advance has scheduled deduction this month. | Check pay run (Admin). |
| Outstanding advance after leaving | A Left staff member still owes an advance. | Review advance (Admin). |
| Payroll service month not finalized | The current month-close checklist has no Approved run or justified no-payroll record. | Open pay run. |
| Payroll payment needs reconciliation | Bank entry is older than the in-transit threshold. | Reconciliation. |

For non-Admins, show only authorized **counts and batch totals**, without staff names or a link to person-level pay.

## 40. Payroll reports

| Report | Primary audience | Content |
| --- | --- | --- |
| **Payroll summary by service month** | Admin; aggregate Accountant | Gross, recoveries, net payable, disbursed, pending cheque, outstanding. |
| **Staff earnings statement** | Admin only | Month-by-month earnings, deductions, advances, payslips. |
| **Pay structure history** | Admin only | Rates, effective periods, change reasons. |
| **Advances and recovery** | Admin only | Issued, recovered, outstanding, planned future recovery. |
| **Payout register** | Admin full; Accountant aggregate | Payment batches, modes, accounts, vouchers, dates, references. |
| **Unpaid salary payables** | Admin full; Accountant totals only | Amount owed by service month and age. |
| **Payroll cost by category** | Admin only | Teaching, Administration, Support, Visiting and Clinical. |
| **Payroll cash flow** | Finance-permitted aggregate | Money out by date/mode/account, without staff details. |
| **Payroll exceptions** | Admin only | Missing inputs, advances over balance, corrections, zero-pay lines. |
| **Payroll reconciliation links** | Admin and Accountant, redacted | Statement matches, in-transit and unresolved batches. |

All reports use local dates, have period filters, a clear data definition, drill-down only where authorized, and print/export permissions. Exports of named salary/pay detail and bank instruction files are audited and Admin-only. Aggregate reports never offer an unrestricted `View raw rows` link.

## 41. Sample cross-module checks

Using the illustrative gross 1,300,000 / recoveries 40,000 / net 1,260,000 pay run:

| View | Before payout | After bank 1,050,000 + cash 130,000 + cheque issued 80,000 |
| --- | ---: | ---: |
| Gross cost for service month | 1,300,000 | 1,300,000 |
| Advance recovered | 40,000 | 40,000 |
| Approved net payable | 1,260,000 | 1,260,000 |
| Cleared/booked money out from these payouts | 0 | 1,180,000 |
| Issued payroll cheques not cleared | 0 | 80,000 |
| Remaining uncommitted salary payable | 1,260,000 | 0 |

After cheque clearing, booked money out becomes 1,260,000 and uncleared issued cheques become 0. If the cheque is cancelled instead, 80,000 returns to salary payable.

## 42. Acceptance criteria (Feature 7)

- [ ] Every health item opens a screen that can resolve it, without bypassing permissions.
- [ ] Non-Admin payroll reports do not expose named compensation through drill-down, export, print or raw links.
- [ ] Gross payroll cost, recovery, net payable and money-out totals reconcile in the sample.
- [ ] Aggregate account report money-out equals cleared payroll payouts by mode and period.
- [ ] Every change and print/export of sensitive information is audited.

---

# Frontend Design

These screens adopt the shared MediCMS design system from `FRONTEND_DESIGN.md`: sidebar, page headers, cards, searchable tables, underlined tabs, right-hand drawers, confirmation dialogs, toasts, skeleton rows, accessible focus, role-based buttons, PKR formatting and local date formatting. The details below are specific to Staff & Payroll.

## 43. Navigation and routes

**Sidebar:** Add a distinct **Staff & Payroll** group alongside Operations, Fees and Finance. Keep ordinary expense pages in Finance; do not relocate staff salaries into Bills and Expenses.

```text
STAFF & PAYROLL
  Overview
  Staff directory
  Work inputs
  Salary advances
  Pay runs
  Payout batches
  Payroll reports

FINANCE
  Overview
  Bills and expenses
  Pay out
  Accounts
  Bank and reconciliation
  Issued cheques
  Budgets
  Month close
```

| Route | Screen | Permission |
| --- | --- | --- |
| `/staff` | Staff & Payroll overview | `staff.view` (role-scoped projection) |
| `/staff/directory` | Staff list | `staff.directory.view` |
| `/staff/:id` | Staff profile with tabs | `staff.directory.view`; restricted tabs additionally gated |
| `/staff/:id?tab=pay` | Salary structures | `payroll.compensation.view` (Admin only) |
| `/staff/:id?tab=advances` | Staff advances | `payroll.advances.view` (Admin only) |
| `/staff/work-inputs` | Monthly quantities and adjustments | `payroll.inputs.manage` (Admin only) |
| `/staff/advances` | Advances list | `payroll.advances.view` (Admin only) |
| `/staff/payroll` | Pay-run register | `payroll.summary.view` |
| `/staff/payroll/new` | Generate pay run | `payroll.run.manage` (Admin only) |
| `/staff/payroll/:id` | Pay-run page | `payroll.summary.view`; Admin sees named rows |
| `/staff/payroll/:id/payouts` | Payout planner | `payroll.payout.manage` (Admin only) |
| `/staff/payouts` | Payout batch register | `payroll.payout.summary` |
| `/staff/payouts/:id` | Payout batch | `payroll.payout.summary`; staff lines Admin only |
| `/staff/reports` | Payroll reports index | `payroll.reports.view` (role scoped) |
| `/staff/reports/:name` | Report details | Report-specific permission |
| `/staff/settings` | Payroll settings | `payroll.settings.manage` (Admin only) |

**Routes never confer access by themselves.** Typed URLs, data actions, file exports, downloadable PDFs and print routes must all repeat permission checks. Search parameters are allowed for month, staff type, status, department, sort and page; they do not carry salary data.

## 44. Page-level badges

| Badge | Proposed visual treatment | Meaning |
| --- | --- | --- |
| Active | Green | Staff currently engaged |
| On leave | Amber outline | Staff temporarily away |
| Left | Grey | Historic staff record |
| Draft | Grey | Editable, no cost posted |
| Submitted | Amber | Waiting for Admin approval |
| Approved | Green | Frozen and recognized as payroll cost |
| Cancelled / Reversed | Red outline / struck through | Original history retained |
| Unpaid | Red outline | Approved salary not disbursed |
| Part paid | Amber | Some salary paid |
| Paid | Green | Staff-level obligation settled, subject to cheque status |
| Cheque pending | Blue outline | Issued; bank not yet cleared |
| Cleared | Green | Bank has paid cheque |
| Recovery due | Amber | Scheduled advance recovery |
| Restricted | Grey lock | Detail requires Admin permissions |

Status is always displayed in words, not color alone.

## 45. Getting started / empty state

When there are no staff or no pay structures, the Overview displays a checklist rather than a meaningless empty chart.

```text
Staff & Payroll                                         [Add staff]
Get payroll ready

 [ ] 1  Add staff                Create at least one active staff record.    [Add staff]
 [ ] 2  Set pay structures       Add an effective salary/rate for staff.    [Set rates]
 [ ] 3  Set up Finance accounts  Cash and bank opening positions are ready.[Open accounts]
 [ ] 4  Review advances          Enter opening outstanding advances.       [Review]
 [ ] 5  Generate first pay run   Create a draft for a service month.       [New pay run]

 [Hide this checklist]
```

- Steps 1–5 tick automatically when their actual conditions hold.
- An Admin can hide the checklist early; it reappears in Settings help.
- Non-Admins see only the steps and links their role may use, or a concise `Payroll has not been set up` message.
- Missing opening Finance accounts blocks disbursement, **not** creation of a staff record or draft payroll.

## 46. Staff & Payroll overview

### 46.1 Admin layout

```text
Staff & Payroll                            Service month [October 2026 v] [New pay run]

+-- Workforce --------+ +-- Payroll status -------+ +-- Approved cost ---------+
| Active       35     | | October   Approved    | | Gross       1,300,000    |
| On leave      2     | | Staff included    35  | | Recoveries     40,000    |
| Left this mo  1     | | Exceptions         0  | | Net payable 1,260,000    |
+--------------------+ +------------------------+ +--------------------------+

+-- Payment position -----------------------------------------------------------+
| Paid: Bank 1,050,000   Cash 130,000   Cheque issued 80,000                    |
| Cleared money out 1,180,000  |  Pending cheque 80,000  |  To disburse 0     |
| [Open pay run]  [Open payout batches]                                     |
+-------------------------------------------------------------------------------+

+-- Needs attention -----------------------------------------------------------+
| (!) 2 staff lack valid rate for November                  [Fix rates]       |
| (!) 1 advance recovery needs review                      [Review]          |
| (!) 1 payroll cheque has not cleared                     [Issued cheques]  |
+-------------------------------------------------------------------------------+

Recent pay runs
Month        State       Gross          Recoveries   Net          Disbursed
October      Approved    1,300,000      40,000       1,260,000    1,180,000 + cheque
September    Approved    ...

Quick actions: Add staff | Work inputs | Salary advances | Generate pay run | Reports
```

### 46.2 Behavior

| Element | Behavior |
| --- | --- |
| Service month | Controls month-specific payroll totals and attention items; workforce figures reflect the selected month where applicable. |
| Summary cards | Click into filtered staff list, pay-run register or payout register. |
| Payroll status | Separates calculation status and payment status. Do not label an approved-but-unpaid run 'Paid'. |
| Payment position | Cleared cash/bank payments, issued cheques and still-to-disburse are separate. |
| Needs attention | Live items only. Each action opens the right screen/filter. |
| Accountant | Sees approved aggregate totals, mode totals and payout status, **not** individual staff pay or rates. |
| Viewer | Sees permitted aggregate figures only; no record/edit actions. |
| Counter operator | Cannot enter this module. |
| Empty/loading/error | Helpful checklist, eight skeleton rows, or error banner with Retry. |

## 47. Staff directory

### 47.1 List layout

```text
Staff directory                                                        [+ Add staff]
[ Search staff / staff no. / phone... ] [Staff type v] [Department v] [Status v]
[Employment mode v] [Joined from/to v]              [Clear filters]

Staff #    Name              Type          Designation       Department   Joined       Status
ST-0042    Sara Ahmed        Teaching      Nursing Tutor    Nursing      1 Jul 2024    Active
ST-0031    Bilal Khan        Visiting      Visiting Faculty BS Nursing   1 Feb 2026    Active
ST-0018    Hassan Ali        Support       Lab Assistant    Paramedics   15 May 2023   On leave
ST-0009    Nida Shah         Administration Accounts Clerk Administration 1 Jan 2022    Left

Showing 35 of 41       Rows [20 v]
```

- Default sort: Active first, then staff name; searchable by staff number, normalized name, phone, department and designation.
- Staff list **never** displays salary or advances for non-Admins; for Admin an optional `Current pay structure` column is available by deliberate column chooser, not default.
- Filters, sort, page and selected status are reflected in the address.
- Row click opens the staff profile; hover actions: Open, Edit (Admin) and Status (Admin).
- No results: `No staff match these filters.` with Clear filters.
- CSV export of non-sensitive staff directory fields may be permitted according to role; salary-bearing export requires Admin and separate confirmation/audit.

### 47.2 Profile header and tabs

```text
< Staff directory
[Photo] Sara Ahmed                   ST-0042       [Active]   [Edit staff]
Nursing Tutor · Teaching · Joined 1 Jul 2024

Overview | Employment | Pay structures* | Advances* | Payslips* | History

* Admin only

Overview
  Contact / designation / department / assigned programs
  Employment timeline
  Current status
  Current pay structure summary (Admin only)
  Outstanding salary / advance balance (Admin only)
```

**Employment** includes joining/leaving history and status changes. **Pay structures**, **Advances** and **Payslips** do not even load their restricted data for a non-Admin. **History** is redacted by permission. Direct profile URLs with restricted tabs return No access.

## 48. Add/Edit staff drawer

A right-hand drawer, approximately 520 px wide; Admin only.

```text
New staff member                                                        [x]
------------------------------------------------------------------------
Full name *              [_________________________________]
Staff type *             [Teaching v]
Designation *            [Nursing Tutor____________________]
Department               [Nursing v]
Employment mode *        [Regular v]
Joining date *           [1 Jul 2026]
Status                   [Active v]
Associated programs      [BSN x] [+ Add program]
------------------------------------------------------------------------
CNIC                     [_____-_______-_]
Phone                    [03_________]
Email                    [__________________________]
Address                  [__________________________]
------------------------------------------------------------------------
Preferred payout mode    [Bank transfer v]
Bank name                [Meezan Bank v]
Account holder           [__________________________]
Account number           [__________________________]
                       [lock] Confidential: Admin access only
------------------------------------------------------------------------
Notes                    [__________________________]
                                            [Cancel] [Save staff]
```

Behavior:

- Errors appear beside fields and in a concise summary on attempted save.
- Duplicate identity warnings link to the possible existing record.
- `Save staff` creates the ID only on a successful save; the ID cannot collide in a future network deployment.
- Edits require a reason when identity, department, employment, bank detail or status changes.
- Leaving date must be on/after joining date; leaving warns about outstanding payables/advances.
- Bank details do not appear in browser/address logs, toast messages, non-Admin exports or Finance voucher public labels.
- After save: **Add pay structure**, **Open profile**, **Add another**.

## 49. Salary structure editor

### 49.1 Admin-only drawer

```text
Pay structure — Sara Ahmed                                              [x]
Effective from *  [1 Oct 2026]         Until [None]
Pay type *        (o) Fixed monthly  ( ) Per session  ( ) Honorarium

Monthly base (PKR) *  [ 60,000 ]
Default allowance     [  2,000 ]    Description [Responsibility allowance]
Staff cost category   [Salaries: Teaching v]
Program tag           [BSN v]  (optional)
Preferred payout      [Bank transfer v]

Preview for October 2026
   Monthly base         60,000
   Allowance             2,000
   Gross before changes 62,000

Reason for change * [Annual contract revision________________]
Existing structure: 1 Jan–30 Sep 2026, 55,000 (read-only)
                                          [Cancel] [Save new structure]
```

### 49.2 Behavior

| Element | Behavior |
| --- | --- |
| Pay type | Changing type changes only its relevant fields; values are not silently reused. |
| Per session | Shows rate per unit and a notice that verified monthly quantity is required. |
| Honorarium | Choose fixed amount per service month or rate × approved units. |
| Effective period | Must not overlap another pay structure; old structures remain in history. |
| Preview | Shows one illustrative month or selected service month, including proration when applicable. |
| Existing payroll | Warns `This staff member appears in 3 approved runs. Past runs will not change.` |
| Save | Admin permission and reason required; audit old/new values. |
| Delete | Not allowed once referenced by a run. Use End date / replace. |

The editor may suggest default categories by Staff type but cannot allow an unrecognized manual Salary category.

## 50. Monthly Work Inputs

### 50.1 Page

```text
Work inputs                                  Service month [October 2026 v] [Review all]
[Type v] [Department v] [Missing only] [Search staff...]

Staff                 Pay type          Work required       Entered      Status      Action
Sara Ahmed            Fixed monthly    Leave review        0 days       Verified    [Review]
Bilal Khan            Per session      Class count         12 classes   Verified    [Edit]
Dr. Umair             Honorarium       Clinical sessions   —            Missing     [Enter]
Hassan Ali            Fixed monthly    Leave review        3 days       Draft       [Verify]

Missing 1     Draft 1     Verified 2                   [Verify selected]
```

**Admin-only.** Other roles cannot open this page or infer quantities that would reveal compensation.

### 50.2 Input drawer

```text
Work input — Dr. Umair                                       October 2026
Pay type: Honorarium per session          Rate: 8,000 per verified session

Approved sessions * [ 5 ]      Calculated earning 40,000
Service/program      [BSN v]     Note [Clinical supervision_____]
Unpaid leave days    [ 0 ]       Adjustment [ 0 ]
Proof / note         [Schedule approved by principal___________]

Status: Draft        [Save draft] [Verify input]
```

For fixed salary, show eligible days and entered unpaid-leave reductions. For session pay, show units and earnings. The **Verify** action stores actor/date and a snapshot; any later edit resets verification. Bulk verify requires preview and confirmation, never acts on hidden rows without showing the count.

## 51. Salary advances

### 51.1 Advances list

```text
Salary advances                                                [+ New advance]
[Search staff...] [Status v] [Issue month v] [Recovery due v]

No.        Staff          Issued      Original    Recovered   Outstanding   State
ADV-0041   Sara Ahmed     15 Sep      40,000      10,000      30,000        Active
ADV-0040   Bilal Khan     1 Aug       20,000      20,000           0        Recovered
ADV-0039   Hassan Ali     20 Jul      25,000           0      25,000        Active
```

Admin-only; the table is not exposed through Finance Core aggregate permissions.

### 51.2 New advance drawer

```text
New salary advance                                                     [x]
Staff *               [Sara Ahmed / ST-0042 v]
Amount (PKR) *        [40,000]
Reason *              [Emergency family expense____________]
Recovery policy *     (o) Fixed each month  ( ) Full next month  ( ) Manual
Monthly recovery      [10,000]      Start month [October 2026 v]
Payment mode          [Bank transfer v]
Money account         [Meezan, main v]   Balance 1,260,000
Reference             [___________________]

Preview
  Advance paid now           40,000
  Money account after       1,220,000
  Planned first recovery     10,000
  Balance after 1st          30,000

[Approve advance]    [Approve and record payment]
```

Behavior:

- Show approval and actual payment as separate steps, even when one combined Admin action is offered.
- An advance approved but not disbursed shows `Approved — awaiting payment` and does not yet count as an outstanding staff advance.
- Cash payment validates balance; bank negative warns; cheque mode reserves an issued cheque and posts bank money only when cleared.
- An existing advance with remaining balance is displayed so the Admin understands the employee's total obligation.
- Every recovery in an approved pay run links back to the exact advance and appears in its history.

### 51.3 Advance detail

Tabs: **Overview**, **Disbursements**, **Recoveries**, **History**. The balance is calculated from linked movements. **Reverse advance payment** or **Reverse recovery** is a controlled Admin action and may be blocked by reconciliation/month locks.

## 52. Payroll runs list

```text
Pay runs                                                [Generate payroll]
[Service year v] [State v] [Disbursement state v] [Run type v]

Run              Service month    State       Staff    Gross       Net        Payout
PAY-2026-10-01   Oct 2026         Approved    35       1,300,000   1,260,000  1,180,000 + 80,000 pending
PAY-2026-09-01   Sep 2026         Approved    34       ...         ...        Paid
PAY-2026-08-01   Aug 2026         Cancelled   34       ...         ...        Reversed

Rows [20 v]     [Export summary] (aggregate if not Admin)
```

| Element | Behavior |
| --- | --- |
| Default sort | Latest service month first, newest supplemental after its standard run. |
| Status columns | Calculation state and payout status are independent. |
| Row click | Admin sees full run; Accountant sees permitted aggregate summary without employee lines. |
| New run button | Admin only. If standard approved run exists, offer `Open run` or Admin-only `Create supplemental` with reason. |
| Export | Admin may export named lines; Accountant's export is aggregate only. |
| Cancellation | Original remains in register, visibly struck through/reversed with reason and link to replacement. |

## 53. Generate Payroll wizard

### 53.1 Step 1 — Choose month

```text
Generate payroll                  Step 1 of 3 — Service period
Service month * [October 2026 v]
Run type        (o) Standard   ( ) Supplemental (requires existing run)

Existing payroll: No approved standard run for October 2026
Eligible staff: 35
                                      [Cancel] [Continue]
```

### 53.2 Step 2 — Preflight

```text
Generate payroll                  Step 2 of 3 — Readiness
[x] 35 eligible staff identified
[x] 35 valid pay structures
[!] 2 work inputs not verified                     [Open work inputs]
[x] No duplicate standard pay run
[x] No closed-month conflict
[i] 4 active advances scheduled for review

                              [Back] [Check again] [Continue disabled]
```

### 53.3 Step 3 — Review and generate

```text
Generate payroll                  Step 3 of 3 — Confirmation
Service month: October 2026
Employees: 35     Structures: current for service dates
Inputs: 35 verified     Advances: 4 to consider

This creates a DRAFT ONLY.
No bank/cash entry, voucher or payroll cost will be posted yet.

                                           [Back] [Generate draft]
```

- The wizard never silently ignores staff with missing structures or invalid effective dates.
- A back link preserves selections. Leaving with entered data warns.
- `Generate draft` is atomic and produces exactly one run identifier.
- If another Admin or process has created the standard run in the meantime, the final save refuses to duplicate it.

## 54. Pay-run detail and review

### 54.1 Admin view

```text
< Pay runs
PAY-2026-10-01     October 2026     [Draft]     [Refresh calculations] [Submit]
Created 5 Nov 2026 by Admin   Calculation revision 3

Gross cost    1,300,000  |  Advance recovery 40,000  |  Net payable 1,260,000
Missing inputs 0        Exceptions 0                 Lines 35

Overview | Earnings | Recoveries | Payouts | History

[Search staff...]  [Type v] [Exceptions only] [Sort v]
Staff           Pay type        Base       Variable  Reductions  Recovery    Net
Sara Ahmed      Monthly         60,000      2,000          0     10,000     52,000  [Open]
Bilal Khan      Per session          0     48,000          0          0     48,000  [Open]
Dr. Umair       Honorarium           0     40,000          0          0     40,000  [Open]
... 32 more

[Preview payroll summary] [Submit for approval]
```

For an Accountant or Viewer, the screen stops after approved **aggregate run cards** and permitted payout batches; the Earnings/Recoveries tabs and person-level table are absent and not queried.

### 54.2 Staff line drawer (Admin only)

```text
Payroll line — Sara Ahmed                                        [x]
Service month: October 2026             Structure snapshot: v4, effective 1 Oct

Earnings
  Monthly base                 60,000
  Allowance                     2,000
  Session earnings                  0
  Approved reductions               0
  GROSS                        62,000

Advance recoveries
  ADV-0041                      10,000      Remaining on advance 30,000
NET PAYABLE                      52,000

Eligible days: 31 of 31
Work input: Verified by Admin, 2 Nov 2026
Reason/notes: ___________________________________

[Apply adjustment]  [Review source records]  [Save line]
```

- An adjustment cannot overwrite the salary structure snapshot; it creates an itemized positive or negative adjustment with a reason.
- A changed advance recovery updates the expected advance remainder immediately.
- Zero/negative net payable, duplicate input and policy exceptions display explicit inline warnings.
- The drawer shows pending earlier month salary or staff status changes when relevant.

### 54.3 Submit and approve

```text
Submit payroll for approval?
Service month  October 2026
35 staff, 0 exceptions
Gross cost       1,300,000
Advance recovery    40,000
Net payable      1,260,000

[Cancel] [Submit for approval]
```

Once Submitted, the **Approve** action is Admin-only. Approval confirmation requires current Admin credentials (or supported re-authentication), displays cost/service month and says:

> `This will freeze the calculation and post Rs. 1,300,000 of payroll cost and Rs. 1,260,000 of salary payable. It will NOT pay anyone yet.`

Buttons: **Back to review**, **Approve payroll**. If it succeeds, the status changes to Approved, the run becomes read-only, and **Prepare payouts** appears.

## 55. Payout planner (Admin only)

```text
Payouts for PAY-2026-10-01                                         [New batch]
Approved net payable: 1,260,000   Paid/issued: 0   Still to plan: 1,260,000

[Staff filter v] [Preferred mode v] [Unplanned only]
[ ] Sara Ahmed          52,000    Bank transfer    [Assign batch v]
[ ] Bilal Khan          48,000    Cash             [Assign batch v]
[ ] Dr. Umair           40,000    Cheque           [Assign batch v]
...

Planned batches
 PB-202610-001 Bank transfer | Meezan main   | 19 staff | 1,050,000 | Prepared
 PB-202610-002 Cash          | Counter cash  | 13 staff |   130,000 | Prepared
 PB-202610-003 Cheque        | Meezan main   |  3 staff |    80,000 | Prepared

                                    [Review totals] [Authorize batches]
```

- The sum of planned, already paid and still-unplanned amounts reconciles to the approved net amount.
- A staff member can have more than one payout line if legitimately partially paid; their total cannot exceed their remaining pay.
- The planner checks account availability and warns before authorizing a bank withdrawal/issued cheque that might overdraw an account. Cash negatives are blocked.
- The Admin can create batches grouped by payment mode/account. Accountants cannot modify staff membership or amounts.
- An Admin-only **Export bank instruction CSV** includes recipient name, bank details, approved amount and batch/reference. Export is audited and displays a confidential-data warning. No live bank transmission.

## 56. Payout batch page

### 56.1 Admin detail

```text
PB-202610-001       PAY-2026-10-01     [Ready]
Bank transfer · Meezan main · 19 recipients
Authorized amount: Rs. 1,050,000

Recipients (Admin only)
Staff #   Name                Amount       Status
ST-0042   Sara Ahmed          52,000       Prepared
...       18 more

External bank execution reference [________________________]
Execution date                   [6 Nov 2026]
Bank instruction CSV             [Export confidential CSV]

[Cancel batch] [Record executed transfer]
```

### 56.2 Accountant aggregate view

```text
Payroll payout batch PB-202610-001
Run: PAY-2026-10-01           [Approved by Admin]
Mode: Bank transfer           Account: Meezan main
Recipients: 19 (details restricted)
Authorized amount: Rs. 1,050,000

Bank reference * [BANK-BULK-2941____________]
Execution date * [6 Nov 2026]

This records the approved batch total. You cannot change individual payouts.
[Cancel] [Confirm external execution]
```

- `Confirm external execution` verifies the batch is ready, amount exact, account active, date permitted and reference supplied.
- It atomically posts the Finance Core voucher(s), money entry/entries, staff-line settlement (internally), payout status and audit trail.
- If the executed amount differs, show `Amount does not match approved batch. Ask an Admin to revise the batch or provide approved partial-execution mapping.` Never guess how to split money across staff.
- The success screen offers **Open Finance voucher**, **Open bank account**, and **Print aggregate confirmation**.
- A failed save shows `Nothing was saved`; do not show a false success or mark people Paid.

## 57. Cash disbursement and cheque screens

### 57.1 Cash salary handover

```text
Cash payroll — PB-202610-002
Account: Counter cash             Available 250,000
Approved batch amount             130,000
Expected balance after            120,000

[ ] Cash packets/receipts prepared by Admin
[ ] Staff acknowledgements completed (Admin)
Cash handover date                 [6 Nov 2026]
Voucher narration                 [Payroll cash batch]

[Record cash disbursement]
```

If acknowledgements are incomplete, the batch remains Pending or Part executed, with the exception privately mapped by Admin. One cash movement is not treated as multiple acknowledged staff payments unless the corresponding mappings have been confirmed.

### 57.2 Cheque issuance (Admin-only named detail)

```text
Payroll cheque — ST-0042 (restricted)
Run                  PAY-2026-10-01
Payable amount       80,000
Bank / chequebook    [Meezan, range 004850–004899 v]
Next number          [004871]
Cheque date          [10 Nov 2026]
Payee                [Confidential staff name]
[x] A/C payee only

Bank book unchanged at issue.
Available bank balance decreases by 80,000.

[Cancel] [Issue cheque and voucher]
```

An Accountant in Finance Core can later see `Cheque 004871, Payroll — restricted, amount 80,000, Issued`, match it to a bank statement line and mark it Cleared subject to permissions, but cannot open the named salary detail.

## 58. Payroll reports and exports

### 58.1 Report index

```text
Payroll reports
[Service month from/to] [Compare period v]

Payroll summary                  Monthly gross, recovery, net and payments      [Open]
Payout register                  Batch totals, methods, vouchers              [Open]
Unpaid salary payable            Unpaid amounts and ageing                     [Open]
Payroll reconciliation           Cleared/in-transit batches                    [Open]

Admin-only reports
Staff earnings statement         Named history                                [Open]
Advances and recoveries          Staff balances and recovery schedule          [Open]
Cost by Staff category           Private cost breakdown                       [Open]
Pay structure history            Contract/rate changes                        [Open]
```

### 58.2 Payroll summary detail

```text
Payroll summary                                        Service month [October 2026]
Gross cost                   1,300,000
Advance recoveries              40,000
Net salary payable           1,260,000
Paid cash/bank              1,180,000
Issued cheques pending          80,000
Still to disburse                   0

[Export aggregate CSV] [Export PDF] [Print]
```

- Aggregate figures have clearly labeled service month versus payment date.
- Comparison columns reference previous service month, not payments booked in a different month.
- Exports follow the current role projection and repeat the permission check at file-generation time.
- Staff detail reports are Admin-only and print `CONFIDENTIAL` in the header/footer.

## 59. Payslip and print layouts

### 59.1 Payslip (A4, Admin only)

```text
[Institute logo] AL-SHIFA MEDICAL INSTITUTE                        PAYSLIP
CONFIDENTIAL                                  Service month: October 2026

Staff: Sara Ahmed                 Staff #: ST-0042
Designation: Nursing Tutor        Department: Nursing
Run: PAY-2026-10-01               Printed: 7 Nov 2026 by Admin

EARNINGS                                                PKR
Monthly base                                           60,000
Allowance                                               2,000
Gross                                                  62,000

RECOVERIES
Advance ADV-0041                                      (10,000)

NET PAYABLE                                            52,000
Payments / mode: Bank transfer, reference ********
Remaining payable                                         0

Generated from the approved payroll snapshot. Any later correction
appears as a linked supplemental payslip, not a rewrite of this one.
```

A payslip is **not** a student fee receipt, not a Finance payment voucher, and not proof that a transfer cleared unless it explicitly contains a confirmed payment record. Pending-cheque payslips must say `CHEQUE SUBJECT TO CLEARANCE`.

### 59.2 Other print layouts

| Layout | Who | Content |
| --- | --- | --- |
| Staff register | Admin; restricted non-pay subset for permitted roles | Staff number, identity and employment status, no salary unless Admin chooses private columns. |
| Payroll summary | Admin and permitted aggregate roles | Month, count, gross/net aggregates as authorized, approval, mode totals and status. |
| Payroll review sheet | Admin only | Named salary lines, approvals, exception notes, signature fields. |
| Payout batch confirmation | Admin and Accountant aggregate | Batch, account, total, mode, reference, voucher, status; no recipient names for Accountant. |
| Cash staff acknowledgement | Admin only | Single staff member, amount, date and signature. |
| Advance statement | Admin only | Issue, repayments/recoveries, balance, signatures. |
| Reconciliation report | Admin/Accountant masked | Finance account totals, vouchers, refs and matched status without named pay. |

A voided/corrected document prints its status prominently. Reprinted private payslips are audited. All paper layouts repeat headers and never split a single staff line across pages.

## 60. Settings

| Setting | Proposed default | Owner |
| --- | --- | --- |
| Staff ID prefix | `ST-` | Admin |
| Payroll run prefix | `PAY-` | Admin |
| Payout batch prefix | `PB-` | Admin |
| Advance prefix | `ADV-` | Admin |
| Monthly salary proration | Calendar days in service month | Admin |
| Payroll generation default month | Previous unfinalized service month | Admin |
| Starting recovery month | Next service month | Admin |
| Salary advance recovery option | Fixed monthly / full next month / manual | Admin |
| Auto-apply recovery | Suggest schedule; Admin confirms during review | Admin |
| Cheque stale threshold | Existing Finance Core setting: 6 months | Shared |
| Cash negative balance | Never allowed (Finance Core) | Shared |
| Bank overdraft | Warn, do not block (Finance Core) | Shared |
| Staff expense categories | Exact reserved Finance Core Staff categories | Shared |
| Approval | Admin only, re-authentication | Shared login controls |
| Payroll money/date format | Whole PKR, institute-local date | Shared |
| Named salary export | Admin only, audited | Security policy |
| Payroll enable/disable month close | Enabled when staff payroll is in use | Admin |

Changing a Settings value does **not** silently change already approved pay runs or historical payroll numbers.

## 61. Shared components and data-layer responsibilities

### 61.1 Frontend components

| Component | Responsibility |
| --- | --- |
| `StaffSummaryCard` | Counts by status, never salary unless Admin projection. |
| `StaffDirectoryTable` | Role-safe staff list, search, filters and selection. |
| `StaffDrawer` | Create/edit employee identity and employment details. |
| `PayStructureEditor` | Effective-dated structure with live calculation preview. |
| `WorkInputTable` | Unit counts, adjustments, verification and missing states. |
| `AdvanceBalanceCard` | Issue, recovery and remaining amount for Admin. |
| `PayrollRunHeader` | Calculation state, payment state and totals. |
| `PayrollLineTable` | Admin-only named earning/recovery breakdown. |
| `PayrollLineDrawer` | Snapshot and controlled adjustment editor. |
| `PayrollPreflight` | Validation checklist before generation/submission. |
| `PayrollApprovalDialog` | Clear amounts, permissions, re-authentication and confirmation. |
| `PayoutBatchTable` | Role-scoped, exact totals by method/account. |
| `PaymentModePanel` | Shared Finance Core cash/bank/cheque controls. |
| `SalaryChequeStatusBadge` | Issued, post-dated, cleared, stale, cancelled. |
| `RestrictedField` | Explicit protected placeholder, not a frontend-only security boundary. |
| `PayrollReportTable` | Aggregate or named projection with export guard. |
| `PayrollHealthPanel` | Exceptions and quick fixes by permission. |

### 61.2 Data layer / application services

| Function | Responsibility |
| --- | --- |
| `createStaff`, `updateStaff`, `changeStaffStatus` | Staff master and employment history. |
| `getStaffProjection(role, staffId)` | Returns only permitted staff/profile fields. |
| `savePayStructure`, `payStructureAtDate` | Effective-dated rate records. |
| `recordWorkInput`, `verifyWorkInput` | Approved monthly units/adjustments. |
| `createAdvance`, `disburseAdvance`, `advanceBalance` | Advance agreement, money movement and recovery subledger. |
| `calculatePayrollLine` | Single canonical gross/net formula and rounding. |
| `preflightPayroll`, `generatePayrollDraft` | Eligible staff, missing inputs, duplicates, draft snapshot. |
| `submitPayroll`, `approvePayroll` | Freeze snapshot and atomically post cost/payable/recovery. |
| `reversePayroll`, `createSupplementalRun` | Safe corrections with linked history. |
| `preparePayoutBatch`, `authorizePayoutBatch` | Admin-only staff payout allocations. |
| `recordPayrollCashPayout`, `confirmBankPayout` | Finance voucher and money movement with status updates. |
| `issuePayrollCheque`, `clearPayrollCheque`, `cancelPayrollCheque` | Existing Finance cheque lifecycle and payable effects. |
| `payrollCost`, `payrollPayables`, `payrollMoneyFlow` | Shared Finance and Payroll report queries. |
| `payrollFinalized(month)` | Finance Core month-close checklist flag. |
| `getPayrollSummaryProjection(role, runId)` | Role-redacted summary, no per-staff values. |
| `exportPayrollReport(role, report, filters)` | Permission checks and audit trail. |

All multi-record changes are all-or-nothing. All calculations come from the server/data layer, not JSX totals copied into page state. Prepared exports or screen caches cannot be used to bypass permission changes.

## 62. Loading, validation, keyboard and accessibility

| Situation | UX rule |
| --- | --- |
| Loading | Skeleton rows/cards; restricted private fields are never briefly flashed. |
| Save failure | `Nothing was saved. Try again.` Do not display a run/paid state that was not persisted. |
| No matching records | Explain the active filter and offer Clear filters. |
| Missing rate | `No valid pay structure for this service month.` with Admin-only fix link. |
| Missing input | `Session count must be verified before approval.` |
| Double pay | `This amount would exceed this staff member's approved payable.` |
| Advance too large | `Recovery exceeds outstanding advance or available salary.` |
| Closed month | `This service month is closed. Ask an Admin to reopen it or use a current-period correction.` |
| Cash shortage | `Not enough cash in the selected account. Transfer funds first.` |
| Bank reference missing | `Enter the external transfer reference before recording payment.` |
| Batch mismatch | `Executed amount differs from the approved batch. Admin review required.` |
| Unauthorized access | Dedicated `No access` page; no protected data in error payload. |
| Keyboard | `/` focuses list search; `Ctrl+Enter` saves when permitted; `Esc` closes drawers; tables accessible with arrow/Tab navigation. |
| Focus | Confirmation dialogs trap focus and return it to originating control when closed. |
| Screen readers | Monetary cells announce label, amount and effect; status uses text as well as color. |
| Responsive | Primary design 1280 px+, internal horizontal scrolling at 1024–1279 px; below 1024 px follow shared `use a larger window` behavior. |

All pages show who approved or changed financial records without leaking other employees' private compensation information.

## 63. Frontend acceptance criteria

- [ ] Sidebar routes and action buttons appear only to permitted roles.
- [ ] A non-Admin cannot access named payroll lines, payslips, private bank instructions or advance balances by direct URL, export or API action.
- [ ] Staff directory and profile work without showing protected pay fields to ordinary viewers.
- [ ] Work input editor shows rate × units and verifies quantities before payroll approval.
- [ ] Draft pay run displays staff-level earnings, advances and exceptions to Admin.
- [ ] Approval dialog clearly states that payroll cost will post but **money will not move yet**.
- [ ] A prepared payout batch does not change money accounts.
- [ ] Accountant aggregate execution view hides recipients and cannot change allocations.
- [ ] Cash, bank and cheque payout previews show correct account/available-balance consequences.
- [ ] Payout success reads persisted voucher and account data rather than doing a second frontend subtraction.
- [ ] Admin can print a confidential payslip and a correction never rewrites the original.
- [ ] Reports/exports are role-safe and salary-sensitive exports are audited.
- [ ] All screens have helpful empty/loading/error states and clear validation messages.

---

# Shared Sections

## 64. Core data entities and relationships

The implementation may choose its own database naming, but the following relationships and constraints are requirements.

| Entity | Key links and important fields |
| --- | --- |
| `Staff` | `id`, immutable `staff_no`, identity, staff type, employment status, date history. |
| `StaffEmploymentPeriod` | `staff_id`, from/to dates, role/department, rehire history. |
| `PayStructure` | `id`, `staff_id`, pay type, amounts/rates, effective from/to, cost category, reason, revision. |
| `WorkInput` | `id`, `staff_id`, service month, type, units/dates, verified state and approver. |
| `Advance` | `id`, `staff_id`, approved amount, recovery policy, outstanding computed from events. |
| `AdvanceEvent` | Disbursed/recovered/reversed, source money action or payroll line, posting date. |
| `PayrollRun` | `id`, run number, service month, kind, state, revision, approver, frozen totals. |
| `PayrollLine` | `run_id`, `staff_id`, pay-structure version snapshot, earned lines, recoveries, net. |
| `PayrollLineItem` | Component type, amount, service dates, source work input, cost category, program tag, reason. |
| `PayrollRecovery` | `payroll_line_id`, `advance_id`, amount, linked advance event. |
| `PayrollCostPosting` | Approved run/line/category/service month, amount, reversal links; used for cost view. |
| `PayrollPayable` | Approved line, net amount, settlements and reversals, status derived. |
| `PayrollPayoutBatch` | Run, mode, account, count/total, state, external reference, Finance action ID. |
| `PayrollPayoutAllocation` | Approved batch to payroll line, authorized amount, settled amount/status. Restricted. |
| `PayrollDisbursement` | Finance voucher, money entry or cheque ID, amount, actual date, state, reversal link. |
| `PayrollAudit` | May use shared audit log; values redacted by reader permission. |

**Uniqueness and integrity**

1. Unique staff number and payroll run number.
2. No overlapping effective-dated structures for a staff member; handle an effective-date change within a service month with explicit segment-based proration and one clear calculation preview.
3. Unique standard run for the service month, regardless of status; a replacement must link to an explicitly cancelled/reversed predecessor instead of creating a second live standard run.
4. Approved pay line amounts cannot be mutated; supplemental/reversal records are new events.
5. Every Finance money entry or issued cheque from payroll links to exactly one authoritative payroll/advance action number. No orphan voucher.
6. All recoveries must link to an existing funded advance and remain within the outstanding amount at approval time.
7. Total planned/issued/paid allocation for a line may not exceed that line's approved payable.
8. No non-Admin data projection includes bank account numbers, named pay values, staff-line IDs tied to amounts, hidden audit payload or named payout lines.
9. For whole-PKR rounding, the final sum of per-line amounts must equal the stored run totals. Calculate and validate totals within a single database transaction.

## 65. Calculation examples and test cases

The sample values below are independent test fixtures unless identified as linked to a document example. They should be implemented as automated unit and transactional integration tests before constructing payroll screens.

| # | Scenario | Input | Expected result |
| ---: | --- | --- | --- |
| 1 | Fixed salary | Base 60,000, no other lines | Gross 60,000. |
| 2 | Fixed salary with allowance | Base 60,000 + allowance 2,000 | Gross 62,000. |
| 3 | Per-session teacher | 12 verified sessions × 4,000 | Gross 48,000. |
| 4 | Clinical honorarium | 5 verified sessions × 8,000 | Gross 40,000. |
| 5 | Unverified session input | 12 entered but not Verified | Approval blocked. |
| 6 | Zero sessions | Explicit Verified 0 with reason | Gross 0, staff line visible. |
| 7 | Prorated joining month | 60,000 monthly, 15 eligible days in a 30-day month | Base gross 30,000. |
| 8 | Rate change during month | 30-day month: 15 days at 60,000 rate, 15 at 66,000 rate | Base gross 63,000; two source segments shown. |
| 9 | Prorated monthly reduction | Base 60,000 over 30 days, 3 unpaid days | Base after deduction 54,000; default allowance rule applied separately. |
| 10 | Leave with no deduction | Leave 3 days, Admin Verified paid leave | No automatic reduction. |
| 11 | Structure edited later | October run Approved at 60,000; November new rate 65,000 | October stays 60,000. |
| 12 | Advance issued | Advance 40,000 by bank | Bank Money Out 40,000; advance balance 40,000; payroll cost 0. |
| 13 | Advance approved but not paid | Advance approved 40,000, no payout | Bank unchanged; funded advance balance 0. |
| 14 | Advance recovery | Gross 100,000, recovery 10,000 | Gross cost 100,000; net payable 90,000; advance balance falls by 10,000. |
| 15 | Recovery larger than salary | Gross 20,000, outstanding advance 40,000, requested recovery 30,000 | Cap recovery at 20,000 with warning; carry 20,000 outstanding. |
| 16 | Recovery larger than advance | Outstanding 5,000, request 10,000 | Block or reduce to 5,000 with explicit preview; never negative advance. |
| 17 | Two advances | A oldest 10,000, B 20,000, recovery 15,000 oldest-first | A 0, B 15,000. |
| 18 | Admin manual recovery selection | A 10,000, B 20,000, allocate 15,000 to B | A 10,000, B 5,000; reason captured. |
| 19 | Draft payroll | 35 lines generated | No cost, payable or money entry yet. |
| 20 | Run approval | Gross 1,300,000; recovery 40,000 | Cost 1,300,000; salary payable 1,260,000; no money movement. |
| 21 | Duplicate standard run | October standard already Approved | New October standard approval blocked; supplemental only with reference. |
| 22 | Partial bank payout | Approved payable 1,260,000; pay bank 1,050,000 | Bank −1,050,000; uncommitted payable 210,000. |
| 23 | Cash payout | Remaining 210,000; pay cash 130,000 | Cash −130,000; remaining 80,000; cash cannot go negative. |
| 24 | Issued salary cheque | Remaining 80,000; cheque 80,000 | Bank book unchanged; available balance −80,000; pending cheque 80,000. |
| 25 | Cheque clears | Same cheque cleared | Bank book −80,000; pending cheque 0; available balance unchanged at clearing. |
| 26 | Cheque cancelled | Same cheque cancelled before clearing | Pending cheque 0, available commitment released, payable 80,000; number never reused. |
| 27 | Post-dated cheque | Future cheque date | Cannot clear before valid date. |
| 28 | Payout attempted twice | Same approved batch execution ref repeated | No second posting; duplicate detected. |
| 29 | Payment beyond entitlement | Staff net 52,000, pay 60,000 | Block. |
| 30 | Batch amount mismatch | Approved 1,050,000, Accountant enters 1,040,000 | Block; Admin must resolve private allocation. |
| 31 | Aggregate permissions | Accountant opens October payroll | Sees 35 staff and totals, no named earning lines. |
| 32 | Direct URL bypass | Accountant opens `/staff/:id?tab=pay` | No access; no restricted payload. |
| 33 | Export bypass | Accountant requests named payroll CSV directly | Denied, no file created. |
| 34 | Finance voucher redaction | Accountant opens payroll PV | Batch amount/reference visible; no named staff pay. |
| 35 | Cheque reconciliation masking | Accountant matches issued cheque 004871 | Amount/date/number visible; staff name hidden; status updates. |
| 36 | Budget classification | Gross approved teaching payroll 800,000 | Staff category cost +800,000, no manual vendor bill. |
| 37 | Month attribution | October payroll approved Oct, paid Nov | October cost, November cash out. |
| 38 | Month close with unpaid salary | October payroll Approved, no payouts | Payroll-finalized check passes, outstanding salary payable remains. |
| 39 | Month close with draft | October payroll Draft | Payroll-finalized check fails. |
| 40 | Closed month correction | October closed, attempted backdated extra cost | Block until reopen, or approved current-period correction. |
| 41 | Day closing | Counter cash 250,000, pay salary cash 130,000 | Expected physical cash 120,000 before other movements. |
| 42 | Account reconciliation | Bank statement bulk debit 1,050,000, matching batch reference | Match to payout batch, difference zero when all other lines reconcile. |
| 43 | Reversal of unpaid approved run | Gross 100,000, recover 10,000, no pay | Cost, payable and recovery effects reversed as linked events. |
| 44 | Reversal after payment | Pay linked to reconciled account | Must reopen reconciliation/month as required and use controlled reversal; no deletion. |
| 45 | Left staff with outstanding advance | Staff leaves owing 25,000 | Balance remains on Admin advance report; no automatic write-off. |
| 46 | Historical records | Pre-go-live salary expense already in legacy history | No second salary cost/money posting during migration. |
| 47 | Finance salary category | User tries manual Bill with Salaries: Teaching | Block with payroll-only message. |
| 48 | Print confidentiality | Accountant requests a named payslip | Denied; no generated print/PDF payload. |
| 49 | Backup/restore | Full encrypted restore | Staff, rates, advances, runs, payouts and linked audit/Finance entries restore consistently. |
| 50 | Concurrent approval safeguard | Two approval requests for same run | Exactly one approved posting; the other sees already-approved state. |
| 51 | Rounding | Prorate Rs. 10,001 for 15 of 30 calendar days | Rs. 5,001 (halves up). |
| 52 | Aggregate total validation | 35 payroll lines after rounding | Sum of individual approved lines equals stored run gross, recovery and net totals. |

**Policy note on unpaid days:** This draft assumes that, for fixed monthly pay, each verified unpaid day reduces the prorated base at the service-month daily rate. Recurring allowances are not automatically reduced unless the pay structure explicitly says they follow base proration. Confirm this with the institute before coding tests 8–10.

## 66. Exceptional cases and corrections

| Case | Expected handling |
| --- | --- |
| Staff has no active structure but worked during month | Missing-structure preflight item. Admin adds a correct effective-dated structure or a documented one-time supplemental honorarium. |
| Staff has multiple employment periods within a month | Show eligible segments and dates; calculate each once. |
| Staff switches between fixed and per-session pay mid-month | Explicit period segments, Admin review, avoid overlapping earnings. |
| Staff is on leave with salary continuing | Verified paid-leave decision; no inferred deduction. |
| An earned amount is genuinely negative after corrections | No negative salary payment; create an Admin-reviewed recovery or later supplemental adjustment. |
| Pay run approved but no bank account configured | Cost/payable may exist; disbursement blocked until setup. |
| Cash is insufficient | Block. Offer link to Finance Transfer or another authorized account. |
| Bank goes negative | Finance warning, allowed under existing overdraft rule, with audit. |
| External bank batch partially succeeds | Admin maps successful lines privately, posts only confirmed amounts, keeps failures payable. Accountant cannot guess allocations. |
| Bank sends duplicate confirmation | Idempotent reference/action check, no second movement. |
| Bank charges fee for salary transfer | Separate bank charge entry during reconciliation; not another staff salary expense. |
| Bank transfer returned/rejected | Controlled linked reversal restores payable. If reconciled/closed, require reopening. |
| Staff refuses a cheque | Cancel cheque with reason, restore payable, keep number consumed. |
| Cheque becomes stale | Flag at configured threshold and show in payroll/Finance Needs attention. |
| Cash handed over without acknowledgement | Keep exception; Admin resolves or reverses rather than silently marking all staff Paid. |
| Employee has an old salary payable at go-live | Import opening payable, not a new historical salary cost. |
| User changes role during a session | Re-check authorization at every data fetch/export/action; private cached displays must be cleared on lock/sign-out. |
| Restore older backup after payroll paid | Standard safe-restore warning must count affected voucher, cheque and Finance events; restore all related records together. |

## 67. Effects on the existing MediCMS documents

| Document | Required update / integration point |
| --- | --- |
| `FINANCE_CORE_DESIGN.md` | Extend Money Entry kinds with **Staff advance**; include payroll costs from approved runs in cost view; include salary payable separately from vendor bills; link aggregate salary vouchers, bank reconciliation and issued cheques. Keep existing Staff category restrictions and privacy. |
| `FINANCE_CORE_DESIGN.md`, month close section | Define `Payroll finalized` as Approved/frozen cost for service month, **not** necessarily fully paid; block unfinalized runs. |
| `FINANCE_CORE_DESIGN.md`, reports/overview | Avoid cost double counting; show advances separately from salary cost; show uncleared payroll cheques and salary payables distinctly. |
| `LOGIN_DASHBOARD_STUDENTS_DESIGN.md` | Add Staff & Payroll permissions, Admin-only compensation screens, role-safe Needs attention, salary export auditing. Daily cash closing must account for **payroll cash out** and every other linked cash movement. Backup includes payroll data. |
| `PAYMENTS_RECEIPTS_LEDGER_DESIGN.md` | No change to student receipts. Payroll uses Finance **payment vouchers**, not receipt books; share correction and cheque semantics without creating student ledger entries. |
| `BATCHES_ACADEMIC_SETUP_DESIGN.md` | Staff may optionally tag earnings to existing programs by ID. Academic batches and student term schedules do not govern salary processing. |
| `FRONTEND_DESIGN.md` | Add sidebar routes, role-safe table/print components and private field patterns; reuse common drawers, dialogs, currency/date format and errors. |

## 68. Not included in this release

- Employee attendance device integration, clock-in/clock-out, timesheets, automated teaching schedules or automatic class counting.
- Recruitment, hiring pipeline, performance reviews, HR onboarding, leave entitlements or leave approval workflows.
- Statutory payroll: income tax withholding, EOBI, pensions, provident fund, healthcare deductions or payroll tax reporting.
- Automatic transfer to the bank or payment gateway integration. The application records and reconciles transfers executed externally.
- Staff self-service portal, mobile payslips, SMS/email salary notices.
- Foreign-currency payroll, multi-company payroll or complex overtime rules.
- Splitting one fixed salary automatically across multiple programs or cost centers; this would require a separate allocation design.
- Biweekly/weekly payroll. The first release uses a **monthly service period**, with supplemental corrections as needed.
- Generic multi-step payroll approvals beyond Admin approval.

## 69. Open decisions to confirm before implementation

The body of this document adopts the following defaults. Changing one may affect calculations, controls or frontend wording.

| # | Decision | Draft default | Why confirmation matters |
| ---: | --- | --- | --- |
| 1 | Mid-month monthly salary | Calendar-day proration | Institutes may use fixed 30 days or paid working days instead. |
| 2 | Unpaid-leave reduction | Reduce base daily rate only; allowances unchanged unless configured | Prevents unintended deductions. |
| 3 | Rate changes during a month | Split into effective-date segments | Requires precise handling if contracts change mid-month. |
| 4 | Variable honorarium approval | Admin verifies entered quantity | No timetable/attendance data in current design. |
| 5 | Staff types | Teaching, Administration, Support, Visiting, Clinical | Confirm exact categories and names with institute. |
| 6 | Advance recovery | Next month, fixed monthly amount unless overridden | Need to avoid unrecoverable over-deductions. |
| 7 | Cash salary acknowledgement | Admin verifies named receipt; Accountant sees total only | Balances salary privacy with physical cash control. |
| 8 | One-person bank payouts | Restricted batch with generic label | Even batch totals can reveal individual pay through inference. |
| 9 | Payroll run month | One Standard per service month + Supplemental | Avoid duplicate cost recognition. |
| 10 | Payroll finalization for month close | Approved/frozen, not paid in full | Ensures cost is recognized even if payment is delayed. |
| 11 | Staff payout bank files | Admin-only CSV for external execution | File format depends on bank; generic CSV may require manual conversion. |
| 12 | Opening advance/payable history | Separate opening schedules and no fake old transactions | Required for accurate go-live balances. |
| 13 | Program-level cost tagging | Optional single program per earning line | Multi-program allocations are deferred. |
| 14 | Individual pay visibility | Admin only, without exceptions | Existing Finance Core privacy rule; may affect who handles bank transfer execution. |

## 70. Suggested build order

1. **Agree policy defaults** in sections 2, 10, 22 and 69 (privacy, proration, finalization and advance recovery).
2. **Database and permissions:** staff IDs, effective-dated structures, masked projections, shared audit, encrypted backup coverage.
3. **Staff register, profiles and editor**, with status history and safe identification checks.
4. **Pay structures and work inputs**, including calculation preview and automated tests.
5. **Staff advances**, separate subledger, payment/refund reversal rules and Finance money-entry integration.
6. **Monthly draft payroll generation**, missing-input preflight, frozen snapshots, gross/recovery/net calculation tests.
7. **Admin approval and payroll cost/payable postings**, protected and atomic.
8. **Disbursement planner and batch records**, cash/bank execution and Finance voucher links.
9. **Payroll issued cheques**, clearance/cancellation and available balance integration.
10. **Accountant aggregate payouts and bank reconciliation**, including one-statement-line-to-batch matching and privacy tests.
11. **Payroll overview, reports, payslips and salary-payable visibility**, with separate cost and cash periods.
12. **Month-close integration and migration**, including opening advances and unpaid salary schedules.
13. **Full end-to-end automated tests**, backup/restore and restriction checks before live use.

The **data layer, payroll formulas, Finance posting contracts and security projections** must be in place before interactive screens are treated as complete. This prevents the frontend from appearing to work while financial totals or permissions disagree.

---

# Final design principles

1. **A payroll run establishes what the institute owes. It does not itself pay anyone.**
2. **Actual payments are handled only through Finance Core's named money accounts, vouchers and cheque lifecycle.**
3. **Gross salary cost and net salary paid are intentionally different figures.** Advance recovery is not a salary expense reduction and does not create new Money In.
4. **Salaries are not ordinary vendor bills.** Payroll is the only source of new postings to the reserved Staff cost categories.
5. **Individual salary privacy is enforced in queries, workflows, reports, exports and prints, not merely by hiding a frontend column.**
6. **Corrections preserve history** through supplemental runs, linked adjustments or reversals; reconciled and closed periods remain protected.
7. **The Finance Core October sample remains historically valid.** This document adds the detailed staff-payroll mechanism without pretending the sample contains a newly generated October pay run.
8. **Every computed balance and payment position must be reproducible** from authoritative staff, payroll, advance, voucher and money-entry records.

**End of Draft 1.**
