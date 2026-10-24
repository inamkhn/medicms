# MediCMS Desktop: Fee Templates, New Admission and Fee Operations

**Document type:** Improved design and scope
**Version:** Draft 2
**Date:** 9 October 2026
**Covers:** Feature 1 (Fee Templates), Feature 2 (New Admission) and Feature 3 (Fee Operations)
**Replaces:** the Fee Templates and Admissions sections of `APPLICATION_SCOPE.md`

---

## Changes in Draft 2

This draft folds in the review of Draft 1.

| Area | Change |
| --- | --- |
| Concessions | Stored as separate concession records (waive, fixed, percent, set amount). The "This student" amount is calculated from them (section 13). |
| Approval | Any concession that continues beyond the first term needs approval (section 13.6). |
| Terms per year | Each program has a terms-per-year value, so "Every new year" is exact (section 5.4). |
| Template versions | Each plan remembers the template version it was copied from (sections 5.1 and 7). |
| Refundable amounts | Template totals show the refundable part separately (section 8). |
| Joining part-way through a year | Rule for annual charges (sections 5.4 and 21). |
| Student fields | Guardian, previous education, council registration number and roll number added (section 12). |
| Drafts | Admission drafts expire after 7 days (section 21). |
| Feature 3 (new) | Due dates and overdue amounts, payment allocation, changing a plan after admission, corrections, cancellations and refunds, and fee engine test cases (sections 24 to 28). |

---

## 1. Purpose

Every program in the institute has its own fees, and individual students often get different deals (a sibling waiver, a merit scholarship, a free admission fee). The current app has a fixed list of eight fee fields, a template editor that cannot save, and an admission step that cannot adjust fees per student.

This document designs one connected fee system:

1. A separate **Fee Templates** module where the institute defines the standard fees for each program.
2. A redesigned **New Admission** flow where each student gets a fee plan copied from a template and adjusted for that student.
3. Automatic **term-by-term fees**: the same fee repeats every term, and a promotion fee is added when a student moves up.

### Wording used in this document

| Term | Meaning |
| --- | --- |
| **Fee Template** | The institute's standard price list for one program and session. |
| **Fee Component** | One line in a template, such as Tuition or Clinical Training. |
| **Student Fee Plan** | A private copy of the template made for one student at admission, with that student's changes. |
| **Fee Charge** | The amount billed to a student for one term. It is posted to the student's ledger. This replaces the older word "demand". |
| **Concession** | Any reduction for a student: a waiver, scholarship or discount. |
| **Term** | A semester, a year or a term, depending on the course. |
| **Ledger** | The student's running account: fee charges, concessions and payments. |
| **Concession record** | One stored reduction in a student's plan: what it applies to, its type, value, term scope and reason. |
| **Due date** | The date by which a fee charge should be paid. |
| **Overdue** | The unpaid part of a fee charge after its due date has passed. |
| **Allocation** | The rule that decides which fee charge a payment pays off. |
| **Terms per year** | How many terms make one academic year for a program (for example 2 for semester programs). |
| **Template version** | A number that rises each time an Active template is changed. |

---

## 2. How the pieces fit together

```text
Fee Template          Student Fee Plan          Ledger
(institute price  ->  (this student's deal) ->  (what was billed
 list per program)     copied at admission       and paid)
```

- Changing a template later does **not** change students who are already admitted. Their plan is their own copy.
- Every change made to a student's plan is recorded with a reason.
- Every fee charge posted to the ledger can be traced back to the plan.
- Each plan remembers the template and version it was copied from.

---

# Feature 1: Fee Templates

## 3. Goals

- Let the institute define fees once per program and session, in one place.
- Support different fee components for different programs without any code change.
- Define when each component is charged: at admission, every term, every year, on promotion, or in the last term.
- Show the total for every term before the template is used.

## 4. Users

| User | What they do |
| --- | --- |
| Admin / Accountant | Create, edit, activate, duplicate and archive templates. |
| Counter operator | Read-only. Templates are only used through the admission screen. |

Until multiple roles exist, the single Admin user does everything.

## 5. Template structure

### 5.1 Template header

| Field | Notes |
| --- | --- |
| Course | Required. Example: BS Nursing. |
| Program | Required. Example: BSN. |
| Session | Required. Example: 2026. |
| Batch | Optional. Leave empty to apply to all batches of that session. |
| Name | Auto-suggested, editable. Example: "BSN 2026". |
| Status | Draft, Active or Archived. |
| Notes | Optional internal note. |
| Terms per year | Taken from the program (section 5.4). Shown read-only. |
| Payment due rule | Days allowed to pay each fee charge. Default: 14 days for the admission charge, 15 days for later fee charges. |
| Version | Starts at 1. Rises each time an Active template is saved with changes. |

One template covers **all terms** of the program. The term-by-term amounts are worked out from the components (section 5.3). This replaces the current approach of storing a separate template for every term.

### 5.2 Fee components

A template holds any number of components. Each one has:

| Field | Notes |
| --- | --- |
| Name | Free text, with suggestions: Admission, Tuition, ID Card, Security Deposit, Lab, Clinical Training, Annual Charges, Exam, Promotion Fee, Diploma, Other. |
| Amount | PKR. Must be zero or more. |
| Charged | One of the timing options below. |
| From term | Optional. First term the component applies. |
| To term | Optional. Last term the component applies. |
| Refundable | Yes or No. Used for items such as security deposit. |

### 5.3 Charge timing options

| Charged | Meaning | Typical use |
| --- | --- | --- |
| At admission only | Charged once, in the first term. | Admission fee, ID card, security deposit |
| Every term | Charged in every term, with the same amount. | Tuition, lab fee |
| Every new year | Charged in the first term of each academic year. | Annual charges |
| On promotion | Charged in every term except the first. | Promotion fee |
| Last term only | Charged once, in the final term. | Diploma or degree fee |

"From term" and "To term" narrow any option. Example: Clinical Training is "Every term, from term 3".

### 5.4 Terms per year

"Every new year" depends on how many terms make up an academic year. Each program has a **terms per year** value, set once in Settings. Starting values:

| Course | Terms per year | Note |
| --- | ---: | --- |
| Paramedics (4 semesters) | 2 | |
| BS Nursing (8 semesters) | 2 | |
| Pharmacy Cat-B (2 annual terms) | 1 | |
| PNC (2 annual terms) | 1 | |
| Homeopathic Council, DHMS (4 annual terms) | 1 | |
| Ultrasound 6 Months (1 term) | 1 | |
| Ultrasound 1 Year (2 terms) | 1 | To be confirmed with the institute. |

**Rule:** an "Every new year" component is charged in term 1 and in every term where (term number minus 1) divides exactly by terms per year. With 2 terms per year that is terms 1, 3, 5 and 7. With 1 term per year it is every term.

**Joining part-way through a year.** If a student starts in a term that is not the first term of a year, the annual charge for that year is included in their first fee charge by default. The operator can remove it, with a reason.

## 6. Screens

### 6.1 Template list

- Table columns: Name, Course, Program, Session, Batch, Status, Course total, Students using it.
- Filters: course, program, session, status.
- Row actions: Open, Duplicate, Activate or Archive.
- Button: **New Template**.

### 6.2 Template editor

```text
+------------------------------------------------------------------+
| BSN 2026                          Status: Draft   [Save] [Activate]|
| Course: BS Nursing   Program: BSN   Session: 2026   Batch: All     |
+----------------------------------+-------------------------------+
| COMPONENTS                       | TERM-BY-TERM PREVIEW          |
| Name          Amount  Charged    | Term 1        77,000          |
| Admission     15,000  Admission  | Term 2        47,000          |
| ID Card        1,000  Admission  | Term 3        61,000          |
| Security      10,000  Admission  | Term 4        55,000          |
| Tuition       45,000  Every term | Term 5        61,000          |
| Clinical       8,000  Every term | Term 6        55,000          |
|                       from term 3| Term 7        61,000          |
| Annual         6,000  Every year | Term 8        67,000          |
| Promotion      2,000  Promotion  | ----------------------------- |
| Diploma       12,000  Last term  | Course total 484,000          |
| [+ Add component]                | of which refundable   10,000  |
+----------------------------------+-------------------------------+
```

The preview on the right updates as components are edited. It shows the course total and the refundable part separately. A tag beside the status shows the template version (for example, v3).

### 6.3 Duplicate to a new session

- Copies all components to a new session and batch.
- Optional: raise every amount by a percentage (for example 8 percent), with rounding to the nearest 100.
- The copy starts as a Draft so it can be reviewed before use.

## 7. Rules

1. Only **Active** templates appear in the admission screen.
2. Only one Active template may exist for the same course, program, session and batch.
3. A template for "all batches" is used when no batch-specific template exists. A batch-specific template wins when both exist.
4. Editing an Active template affects **future admissions only**. Existing student plans are not changed.
5. A template that students are using cannot be deleted. It can be archived.
6. The editor shows "Used by N students" and warns before changing an Active template.
7. Creating, editing, activating and archiving a template is written to the audit trail, with before and after values.
8. Templates are stored permanently (not reset on reload).
9. Each save of an Active template with changes raises its version number. A student's plan records the template and version it was copied from.
10. A template cannot be activated until its program has a terms-per-year value.

## 8. Samples

### 8.1 Sample A: BS Nursing (BSN), Session 2026, 8 semesters

| Component | Amount (PKR) | Charged |
| --- | ---: | --- |
| Admission fee | 15,000 | At admission only |
| ID card | 1,000 | At admission only |
| Security deposit (refundable) | 10,000 | At admission only |
| Tuition | 45,000 | Every term |
| Clinical training | 8,000 | Every term, from term 3 |
| Annual charges | 6,000 | Every new year |
| Promotion fee | 2,000 | On promotion |
| Degree fee | 12,000 | Last term only |

Resulting fee per term:

| Term | What is included | Total (PKR) |
| --- | --- | ---: |
| 1 | Admission, ID card, security, tuition, annual | 77,000 |
| 2 | Tuition, promotion | 47,000 |
| 3 | Tuition, clinical, annual, promotion | 61,000 |
| 4 | Tuition, clinical, promotion | 55,000 |
| 5 | Tuition, clinical, annual, promotion | 61,000 |
| 6 | Tuition, clinical, promotion | 55,000 |
| 7 | Tuition, clinical, annual, promotion | 61,000 |
| 8 | Tuition, clinical, promotion, degree fee | 67,000 |
| | **Course total** | **484,000** |
| | of which refundable (security deposit) | 10,000 |
| | Non-refundable cost | 474,000 |

### 8.2 Sample B: Paramedics, Radiology, Session 2026, 4 semesters

| Component | Amount (PKR) | Charged |
| --- | ---: | --- |
| Admission fee | 10,000 | At admission only |
| ID card | 500 | At admission only |
| Tuition | 25,000 | Every term |
| Lab fee | 3,000 | Every term |
| Promotion fee | 1,000 | On promotion |
| Diploma fee | 5,000 | Last term only |

| Term | Total (PKR) |
| --- | ---: |
| 1 | 38,500 |
| 2 | 29,000 |
| 3 | 29,000 |
| 4 | 34,000 |
| **Course total** | **130,500** |

## 9. Acceptance criteria

- [ ] A template can be created, saved and found again after reloading the app.
- [ ] Each of the five charge timing options produces the correct amount in the term-by-term preview, matching the samples above.
- [ ] Duplicate-to-next-session creates a Draft with the optional percentage increase applied.
- [ ] Two Active templates for the same course, program, session and batch cannot exist.
- [ ] Changing an Active template does not change any existing student's plan.
- [ ] Every template change appears in the audit trail.
- [ ] Saving changes to an Active template raises its version number.
- [ ] "Every new year" charges follow the program's terms per year (terms 1, 3, 5, 7 for a 2-per-year program).
- [ ] The editor shows the refundable amount separately from the course total.

## 10. Not included

- Different amounts for the same component in different terms (use two components with "From term" and "To term" instead).
- Late-fee rules, penalties or automatic fee increases.
- Approval workflows for template changes.

---

# Feature 2: New Admission

## 11. Goals

- Admit a student in one guided flow.
- Choose a fee template, or build the fees by hand.
- Adjust the fees for this student, with a recorded reason.
- Decide whether an adjustment applies to this term only or to all remaining terms.
- Optionally take a payment and print a receipt at the same time.
- Make sure the student, fees and payment are saved together, or not at all.

## 12. Flow overview

```text
1 Personal details -> 2 Academic placement -> 3 Fees -> 4 Review and confirm
```

| Step | Content |
| --- | --- |
| 1. Personal details | Name, father's name, CNIC, phone, address, date of birth, gender, domicile, emergency contact, registration date, photo. Also: guardian or fee payer (name, phone), previous education (last qualification, board or institute, year), and, where they apply, council registration number and roll number. |
| 2. Academic placement | Course, program, session, batch, starting term. |
| 3. Fees | Choose template, adjust the student's fee plan, see term-by-term fees. |
| 4. Review and confirm | Summary, optional payment, confirm. |

Steps 1, 2 and 4 keep the current checks (CNIC format and duplicate check, phone format, date checks, 2 MB photo limit, receipt number checks).

## 13. Step 3: Fees (redesigned)

### 13.1 Choosing the fee source

| Option | When to use |
| --- | --- |
| **Use matching template** (default) | The system finds the Active template for the course, program, session and batch chosen in step 2. |
| **Choose a different template** | The operator picks another Active template from a list. |
| **Build fees manually** | No suitable template. The operator adds components one by one. |

If no template matches, a clear message is shown ("No active template for BSN, Session 2026"), with the choices above. The system never silently uses a template for a different session or batch.

### 13.2 Student fee plan (editable)

After a source is chosen, the student's plan is shown as an editable list:

```text
+--------------------------------------------------------------------+
| FEE PLAN FOR: Ayesha Khan, BSN 2026        Template: BSN 2026       |
+--------------------------------------------------------------------+
| Component        Template   This student   Applies to    Reason      |
| Admission fee      15,000       0          Term 1 only   Sibling     |
| ID card             1,000       1,000      Term 1        -           |
| Security           10,000      10,000      Term 1        -           |
| Tuition            45,000      36,000      All terms     Merit 20%   |
| Annual              6,000       6,000      Every year    -           |
| [+ Add custom component]                                            |
+--------------------------------------------------------------------+
| Term 1 total (template)   77,000                                    |
| Concessions              -24,000                                    |
| Term 1 net fee            53,000                                    |
| Later terms (per term)    see preview  [View all terms]             |
+--------------------------------------------------------------------+
```

### 13.3 What the operator can change

| Change | Example |
| --- | --- |
| Reduce or waive one component | Waive the admission fee. |
| Change a component's amount | Tuition set to 36,000. |
| Percentage concession on a component or on the whole plan | 20 percent off tuition. |
| Fixed concession on the whole plan | 5,000 off the total. |
| Remove a component | Remove ID card (already issued). |
| Add a custom component | "Late admission fee", 2,000, admission only. |

#### How the plan stores changes

The plan keeps the **template amounts untouched** and stores each change as a separate **concession record**. The "This student" column is calculated from the template amount and these records, so nothing is lost and every reduction has a reason.

| Field | Notes |
| --- | --- |
| Target | One component, or the whole plan. |
| Kind | Waive fully, Fixed amount off, Percent off, or Set amount. |
| Value | Rupees or percent. |
| Applies to | This term only, all remaining terms, or specific terms. |
| Reason | Category and note. |
| Approved by | Filled in when approval is needed. |

- **Set amount** (for example, tuition set to 36,000) is saved as a fixed amount off equal to the difference (9,000).
- Order of calculation: concessions on a component first, then a whole-plan percent, then a whole-plan fixed amount.
- Percent amounts are rounded to the nearest rupee (halves round up).
- A component can never go below zero. A concession larger than the component is reduced to fit, and a warning is shown.
- Each concession record posts to the ledger as its own entry in each term it applies to.

### 13.4 Applies to

Every change asks where it applies:

| Choice | Meaning |
| --- | --- |
| **This term only** | The change affects the first term's fee charge only. |
| **All remaining terms** | The change continues in every later term (for example, a scholarship). |
| **Specific terms** | From term N to term M. |

### 13.5 Concession reason (required)

Each concession needs:

- A category: Merit, Sibling, Staff child, Need-based, Management decision, Other.
- A short note (required when the category is Other).

The reason is shown on the review screen, saved in the plan, and written to the audit trail.

### 13.6 Limits on concessions

| Rule | Default |
| --- | --- |
| Total concessions in any single term above a set percentage of that term's template fee need approval by an Admin or Accountant. | 10 percent (editable in Settings) |
| Any concession that continues beyond the first term (a scholarship) needs approval, whatever its size. | Always |
| A fully waived fee (net fee of zero) is allowed with a reason. | Allowed |
| A negative net fee is not allowed. | Blocked |

Until roles exist, the Admin user approves everything, and the approval is still recorded.

### 13.7 Term-by-term preview

A "View all terms" panel shows what the student will be charged in every term, with their personal concessions applied:

| Term | Template | Concessions | Student pays |
| --- | ---: | ---: | ---: |
| 1 | 77,000 | -24,000 | 53,000 |
| 2 | 47,000 | -9,000 | 38,000 |
| 3 | 61,000 | -9,000 | 52,000 |
| ... | ... | ... | ... |

This gives the operator, and the parent, a clear picture of the full course cost before admission is confirmed.

## 14. Step 4: Review and confirm

The review screen shows:

- Personal and academic details.
- Fee plan with every concession and its reason.
- Term 1 fee charge, concessions, net fee.
- Optional payment section: amount, mode (cash, bank, online, cheque), reference, receipt number (auto-filled from the active receipt book), narration.
- Due date of the Term 1 fee charge (default: 14 days after admission, editable).
- Amount paid and balance after admission.

## 15. What happens on confirm

All of the following are saved **together as one operation**. If any part fails, nothing is saved.

1. Create the student with a new student number.
2. Save the Student Fee Plan (components, concession records, reasons, where each applies, and the template version).
3. Post the Term 1 fee charge to the ledger, itemised by component, with its due date.
4. Post each concession to the ledger.
5. If a payment was entered: post the payment, allocate it to the Term 1 fee charge (section 25), use up the receipt number, and create a bank deposit for non-cash modes.
6. Write audit entries for the admission, the fee plan, each concession and the payment.

After confirming, a success screen offers: print receipt, print ID card, print admission summary, open student profile, and **Admit another** (keeps the same course, program, session and batch).

## 16. Future terms: same fee, plus promotion fee

When a student is promoted to the next term, the system prepares the next fee charge from the student's own plan.

```text
Next term fee charge =
    components charged "Every term" that apply to that term
  + "Every new year" components, if the new term starts a new year
  + "On promotion" components
  + "Last term only" components, if it is the final term
  - the student's concessions that apply to that term
```

The operator sees a preview, can edit it, and confirms. The fee charge is then posted and the student's term and session are updated.

Each fee charge gets a due date (default: 15 days after posting). A student who is struck off, on leave or completed cannot be promoted. When the final term has been charged and paid, the profile offers **Mark as completed**.

### Sample: promoting Ayesha Khan from Term 1 to Term 2 (BSN)

| Line | Amount (PKR) |
| --- | ---: |
| Tuition (every term) | 45,000 |
| Promotion fee (on promotion) | 2,000 |
| Merit concession, 20 percent of tuition (all terms) | -9,000 |
| **Term 2 fee charge** | **38,000** |

The admission-only concession (waived admission fee) is not repeated, because it applied to Term 1 only. The fee charge is due 15 days after it is posted.

### Fee changes in a later session

A student keeps the fees agreed in their own plan for the whole course, even if the institute raises the template next session. An Admin can use a separate "Re-price student" action when the institute decides to apply new rates to enrolled students.

## 17. Sample admission walk-through

**Student:** Ayesha Khan, BS Nursing (BSN), Session 2026, starting Term 1.

**Step 3 choices:**

- Template: BSN 2026, Term 1 total 77,000.
- Sibling concession: admission fee waived, 15,000, this term only.
- Merit concession: 20 percent of tuition, 9,000, all remaining terms.

**Step 4:** pays 30,000 in cash, receipt R-1042.

**Ledger after confirming:**

| Entry | Amount (PKR) | Balance (PKR) |
| --- | ---: | ---: |
| Term 1 fee charge (admission 15,000, ID card 1,000, security 10,000, tuition 45,000, annual 6,000) | +77,000 | 77,000 |
| Concession: Sibling, admission fee waived | -15,000 | 62,000 |
| Concession: Merit, 20 percent tuition | -9,000 | 53,000 |
| Payment, cash, receipt R-1042 | -30,000 | 23,000 |
| **Balance due** | | **23,000** |

The Term 1 fee charge is due on 23 October 2026 (14 days after admission), and the 30,000 payment is allocated to it. If 23,000 is still unpaid on 24 October 2026, the student shows as **Overdue** for that amount.

## 18. How the student profile uses this

The student profile becomes the one place to see the whole picture:

| Area | Content |
| --- | --- |
| Header | Photo, name, student number, program, batch, session, current term, status, balance. |
| Fee summary | Total agreed, concessions, paid, remaining dues, overdue amount, next fee due. |
| Term-by-term table | One row per term: charged, concessions, paid, due, due date, and whether it has been billed yet. |
| Fee plan | The student's components and concessions with their reasons. |
| Ledger and receipts | All entries, with print and reprint. |
| Personal information | Identity, contact, documents. |
| History | Audit trail of edits and fee changes. |

Sample term-by-term table for Ayesha Khan after admission:

| Term | Charged | Concessions | Paid | Due | Due date | Status |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 77,000 | -24,000 | 30,000 | 23,000 | 23 Oct 2026 | Partly paid |
| 2 | not yet billed | | | | | Upcoming |
| 3 to 8 | not yet billed | | | | | Upcoming |

A term becomes **Overdue** (shown in red, with the number of days) once its due date has passed and an unpaid amount remains.

The full profile redesign is covered in a later document. This section only defines the fee information it must show.

## 19. Validation rules

| Area | Rule |
| --- | --- |
| Template match | Course, program, session and batch must all match. Closest-match substitution requires the operator to confirm. |
| Components | Amount cannot be negative. Name is required. |
| Concession | Reason category required. Cannot reduce a component below zero. |
| Net fee | Cannot be negative. Zero is allowed with a reason. |
| Payment | Cannot exceed the Term 1 net fee without an explicit "advance payment" confirmation. Large credit confirmation stays at PKR 10,000. |
| Receipt | Number must be unique and inside the active receipt book range. |
| Batch | Must be active and belong to the chosen program. |
| Due date | Cannot be before the date the fee charge is posted. |
| Starting term | If it is not the first term of a year, the annual charge for that year is included by default (section 5.4). |
| Guardian | If the student is under 18, guardian name and phone are required. |
| CNIC | Duplicate check across all students. A match with a struck-off student offers reinstatement instead of a new record. |
| Navigation | Leaving the wizard with unsaved data always asks for confirmation, including sidebar and in-app links. |

## 20. Permissions

| Action | Counter operator | Accountant | Admin |
| --- | :---: | :---: | :---: |
| Admit a student with template as is | Yes | Yes | Yes |
| Concession up to the limit | Yes | Yes | Yes |
| Concession above the limit | Request | Approve | Approve |
| Edit a component's amount | Request | Yes | Yes |
| Build fees manually | No | Yes | Yes |
| Change a fee plan after admission | Request | Yes | Yes |
| Void a receipt | No | Yes | Yes |
| Cancel an admission | No | Yes | Yes |
| Approve a refund above the limit | No | No | Yes |

"Request" means the operator prepares the change and an Accountant or Admin approves it on the spot. These roles are introduced with the login improvements. Until then, one Admin user does all of this.

## 21. Edge cases

| Case | Behaviour |
| --- | --- |
| No template exists for the program | Offer "Build fees manually" and a link to create a template. |
| Fee plan changed after admission | Use **Change fee plan** on the profile (section 26). Posted fee charges are corrected with visible adjustment entries, never rewritten. |
| Admission cancelled before confirming | Nothing is saved. A draft can be kept for later. |
| Same receipt number entered twice | Blocked before saving. |
| Failure while saving | The whole admission is rolled back. The receipt number is released. |
| Two people admit at the same time | This release runs on one main computer (see the Login, Dashboard and Students document, section 32). Student numbers are issued inside the save operation, so they cannot collide, and the same rule keeps working if a network version is added later. |
| Template changed while an admission is open | The wizard keeps the version it loaded. If a newer version has become Active, the review step shows a warning and offers to reload the fees. |
| Draft left unfinished | Drafts are private to the user who started them and expire after 7 days. |
| Student admitted into a later term (transfer-in) | Starting term can be chosen. The plan charges the "admission only" items in that first term, and earlier terms are not billed. If the starting term is not the first term of a year, the annual charge for that year is included by default. |

## 22. Acceptance criteria

- [ ] The Fees step shows the template that matches course, program, session and batch, and warns when none matches.
- [ ] An operator can waive or reduce any component and see the net fee update.
- [ ] Every concession needs a reason, and the reason appears on the review screen and in the audit trail.
- [ ] Each concession can be set to this term only, all remaining terms, or specific terms.
- [ ] The term-by-term preview matches the template samples and includes personal concessions.
- [ ] Confirming creates the student, fee plan, Term 1 fee charge, concessions, payment, receipt use, bank deposit (non-cash) and audit entries together, or none of them.
- [ ] Promotion produces the next term's fee charge from the student's plan, including the promotion fee and continuing concessions.
- [ ] A zero net fee (full waiver) can be admitted with a reason.
- [ ] The success screen offers receipt, ID card, admission summary and "Admit another".
- [ ] Leaving the wizard from any in-app link asks for confirmation if data was entered.
- [ ] Concessions are stored as records, and the template amounts stay visible beside the student's amounts.
- [ ] Any concession that continues beyond Term 1 asks for approval.
- [ ] Joining at Term 2 or Term 3 gives the amounts in the test cases (section 28).
- [ ] The Term 1 fee charge has a due date, and the payment is allocated to it.
- [ ] Guardian, previous education, council registration number and roll number can be saved.

## 23. Not included

- Installment schedules (several part-payment dates inside one fee charge). A single due date per fee charge is included (section 24).
- Online fee payment.
- A document checklist and upload (planned for a later document).
- Student transfer between programs.

---

# Feature 3: Fee Operations

This feature covers what happens to money after admission: when it is due, which charge a payment pays off, how a plan is changed, and how mistakes, cancellations and refunds are handled.

## 24. Due dates and overdue amounts

### 24.1 Rules

- Every fee charge has a **due date**.
- Default due date: the admission charge is due 14 days after admission. Later fee charges are due 15 days after posting. Both numbers come from the template's payment due rule.
- The operator can change a due date when posting a charge. It cannot be earlier than the posting date, and the change is audited.
- A fee charge is **Current** until its due date passes. After that, any unpaid part is **Overdue**.
- Special charges (exam fee, fines) also get a due date, 15 days after posting by default.
- A student's **overdue amount** is the unpaid part of all charges past their due date, after payments are allocated (section 25).

### 24.2 Ageing

Overdue amounts are grouped by how long they have been overdue:

| Bucket | Meaning |
| --- | --- |
| Not yet due | Due date has not passed. |
| 1 to 30 days | Overdue for up to 30 days. |
| 31 to 60 days | |
| 61 to 90 days | |
| Over 90 days | |

### 24.3 Where it is used

| Place | Use |
| --- | --- |
| Dashboard | Overdue total, and top defaulters ranked by overdue amount. |
| Student directory | Overdue tab and an overdue-age filter. |
| Student profile | Due date and Overdue badge per term, with an ageing bar. |
| Reports | Fee ageing report (reports are designed later). |
| Fee vouchers | Printing a fee voucher for a charge is planned for a later release. |

### 24.4 Late fees

Late fees are not added automatically. When a charge goes overdue, the profile suggests "Add late payment fine". The operator decides the amount and reason, using the existing special charge.

### 24.5 Sample

Bilal Ahmed, BS Nursing, Spring 2025, currently in Term 3. Position on 9 October 2026:

| Fee charge | Amount (PKR) | Due date | Allocated payment | Unpaid | Days overdue |
| --- | ---: | --- | ---: | ---: | ---: |
| Term 2 | 47,000 | 15 Jan 2026 | 30,000 | 17,000 | 267 |
| Term 3 | 61,000 | 20 Jul 2026 | 0 | 61,000 | 81 |
| **Total** | **108,000** | | **30,000** | **78,000** | |

Ageing: 61,000 in the 61 to 90 days bucket and 17,000 over 90 days. Overdue total: 78,000.

## 25. Payment allocation

A payment must say which fee charge it pays. Without this, the profile cannot show how much of each term is paid.

### 25.1 Rules

- By default a payment is allocated to the **oldest unpaid fee charge first**.
- On the payment screen the operator can instead choose a specific fee charge (for example, "Term 3").
- The unit is the whole fee charge for a term, not each component inside it.
- Special charges (fines, exam fees) are allocated by the same oldest-first rule, in due date order.
- If the payment is more than everything owed, the extra stays as **credit**. When the next fee charge is posted, the credit is applied to it automatically, and an audit entry records this. Credit on a struck-off or completed student stays as credit until refunded.
- A discount given at the time of payment is saved as a concession record on that charge, with a reason.
- The allocation is stored with each payment. Voiding a payment releases it (section 27).

### 25.2 Sample

Bilal Ahmed (section 24.5) pays 25,000 today:

| Fee charge | Unpaid before | Allocated | Unpaid after |
| --- | ---: | ---: | ---: |
| Term 2 | 17,000 | 17,000 | 0 |
| Term 3 | 61,000 | 8,000 | 53,000 |
| **Total** | **78,000** | **25,000** | **53,000** |

If he chose "Term 3" instead, Term 3 would drop to 36,000 and Term 2 would stay at 17,000.

## 26. Changing a fee plan after admission

### 26.1 Flow

Profile, Fees tab, **Change fee plan** (Accountant or Admin; operators send a request).

1. **What to change:** add or remove a concession, change a component's amount, or add a custom component.
2. **Effective from:** the term the change starts from.
3. **Review the effect:** a table shows each term before and after.
4. **Reason and approval:** a reason is required, and the same approval rules as admission apply (section 13.6).

### 26.2 How posted charges are handled

- Terms **not yet charged** simply use the new plan.
- Terms **already charged** from the chosen term onward are corrected by adjustment entries that the system prepares. The operator confirms them. The old charge is never rewritten or deleted.
- Paid terms that become overpaid turn the difference into credit.
- The audit entry stores the plan before and after, the template version, the reason and the approver.

### 26.3 Sample

Ayesha Khan is given a need-based concession of 5,000 per term from Term 2.

| Term | Before | After | How it is applied |
| --- | ---: | ---: | --- |
| 2 | 38,000 | 33,000 | Not yet charged, so the new amount will be used. |
| 3 | 52,000 | 47,000 | Not yet charged. |

If Term 2 had already been charged at 38,000 and was unpaid, the system would prepare a 5,000 adjustment entry on Term 2 with the reason, leaving 33,000 unpaid.

## 27. Corrections, cancellations and refunds

Nothing in the ledger is ever deleted or edited. Every correction is a new, visible entry with a reason.

### 27.1 Void a receipt

- Who: Accountant or Admin. A reason is required.
- A reversal entry is created. The receipt stays in the list marked **VOID**, and its number is never reused.
- The payment's allocation is released, so the fee charge shows unpaid again.
- If a bank deposit was created for the receipt, a matching reversal is created in the bank ledger.
- After the day has been closed (Login, Dashboard and Students document, section 33), only an Admin can void, after reopening that day.
- The same screen can issue a replacement receipt with the correct amount or mode.

### 27.2 Wrong fee charge

A **Reverse fee charge** action creates a reversal entry. The correct charge is then posted and linked to it. The reversal and the new charge both appear in the ledger.

### 27.3 Cancel an admission

- Available from the profile to Accountant and Admin, within the **cancellation window** (default: 7 days after admission). An Admin can override with a reason.
- The screen shows: charges, concessions, payments received, and a **suggested refund**.
- **Suggested refund** = amount paid minus the non-refundable charges (net of concessions). Payments are treated as paying non-refundable items first. Items marked Refundable in the template (for example, the security deposit) make up the refundable part. The suggestion is never below zero. An Admin can change it, with a reason.
- Unpaid charges are reversed. What the student has paid is kept, except the refund.
- The student is struck off with the reason "Admission cancelled".

| Student | Paid | Non-refundable charges (net) | Suggested refund |
| --- | ---: | --- | ---: |
| Ayesha Khan | 30,000 | 43,000 (admission 0, ID card 1,000, tuition 36,000, annual 6,000) | 0 (23,000 unpaid is reversed) |
| A student with the same plan who paid the full 53,000 | 53,000 | 43,000 | 10,000 (the security deposit) |

### 27.4 Refunds

- A refund is its own ledger entry type (money out), not an adjustment.
- Fields: amount, mode (cash or bank), reference, reason, approved by.
- It reduces the credit on the student's ledger. It also creates an expense in the category "Fee refund" and, for bank refunds, a bank withdrawal, both linked to the student.
- An Accountant can refund up to a limit (default 20,000). Anything above needs an Admin.
- It works for cancellations and for credit left on struck-off or completed students.
- A refund voucher is printed with signature lines.

### 27.5 Re-admission fee

When a struck-off student is reinstated, an optional **re-admission fee** can be added. The default amount is set in Settings (default 0). It is posted as a special charge with a due date.

## 28. Fee engine test cases

The fee calculation is the part of the app where mistakes cost money. These cases come from the samples in this document and should be written as automated tests **before** the screens that use them.

| # | Case | Input | Expected result |
| ---: | --- | --- | --- |
| 1 | BSN term totals | Sample A template | 77,000; 47,000; 61,000; 55,000; 61,000; 55,000; 61,000; 67,000. Total 484,000 |
| 2 | Radiology term totals | Sample B template | 38,500; 29,000; 29,000; 34,000. Total 130,500 |
| 3 | Ayesha, Term 1 | Sibling waiver of admission fee (Term 1 only), merit 20 percent on tuition (all terms) | Net fee 53,000 |
| 4 | Ayesha, Term 2 | Same plan | 38,000 (merit continues, sibling waiver does not) |
| 5 | Percent rounding | 15 percent off a 3,333 component | 500 (499.95 rounds up) |
| 6 | Component floor | Waive 20,000 on a 15,000 component | Reduced to 15,000, warning shown |
| 7 | Whole-plan percent | Term 1 template 77,000, admission waived (15,000), then 10 percent off the plan | 10 percent of 62,000 = 6,200. Net 55,800 |
| 8 | Join at Term 2 (BSN) | Starting term 2 | 77,000 (annual charge included, no promotion fee, clinical not yet) |
| 9 | Join at Term 3 (BSN) | Starting term 3 | 85,000 (admission 15,000, ID card 1,000, security 10,000, tuition 45,000, clinical 8,000, annual 6,000) |
| 10 | One term per year | PNC program with an "Every new year" component | Charged in every term |
| 11 | Allocation, oldest first | Bilal: unpaid 17,000 and 61,000, payment 25,000 | 17,000 to Term 2, 8,000 to Term 3. Term 3 unpaid 53,000 |
| 12 | Ageing | Bilal on 9 Oct 2026 | 61,000 in 61 to 90 days, 17,000 over 90 days |
| 13 | Overpayment | Student owes 20,000 and pays 25,000 | 5,000 credit, applied to the next fee charge |
| 14 | Plan change, not yet charged | Ayesha, 5,000 per term off from Term 2 | Term 2 charge 33,000 |
| 15 | Plan change, already charged | Same, Term 2 already charged 38,000 and unpaid | 5,000 adjustment prepared. Unpaid 33,000 |
| 16 | Void receipt | Ayesha's receipt R-1042 voided | Balance returns to 53,000. Receipt shows VOID. Number not reused |
| 17 | Cancellation refund | Paid 53,000, non-refundable charges 43,000 | Suggested refund 10,000 |

## 29. Acceptance criteria (Feature 3)

- [ ] Every fee charge has a due date, and the profile shows Due and Overdue separately.
- [ ] Payments are allocated oldest first by default, and the operator can choose a specific fee charge.
- [ ] Overpayment becomes credit and is applied to the next fee charge.
- [ ] Changing a plan shows the effect on every term before saving, and corrects posted charges with visible adjustment entries.
- [ ] A voided receipt stays in the list as VOID, its number is never reused, and the balance and allocation are restored.
- [ ] A cancelled admission shows a suggested refund and records a refund entry with approval.
- [ ] All 17 test cases in section 28 pass.

## 30. Not included

- Installment schedules inside one fee charge.
- Automatic late fees.
- Online fee payment and fee voucher printing (planned later).
- Partial refund rules by date (for example, a percentage of tuition by days attended).

---

## 31. Open decisions

Defaults below are adopted in this draft. Change any that do not suit the institute.

| # | Question | Default adopted |
| --- | --- | --- |
| 1 | Does an enrolled student keep their admission fees for the whole course? | Yes, locked. An Admin can re-price. |
| 2 | Concession approval | Over 10 percent in a term, or any concession beyond Term 1, needs approval. |
| 3 | Installments | Not in the first release. One due date per fee charge. |
| 4 | Different amounts for the same item in different terms | Use "From term" and "To term" on separate components. |
| 5 | Security deposit | Marked refundable. Refund handled by section 27. |
| 6 | Due dates | Yes. 14 days for the admission charge, 15 days for later charges. |
| 7 | Cancellation window | 7 days after admission. |
| 8 | Refund approval limit | Accountant up to 20,000. Above that, Admin. |
| 9 | Late fines | Added manually, not automatic. |
| 10 | Ultrasound 1 Year terms per year | To be confirmed. Assumed 1. |
| 11 | Re-admission fee | Optional, default 0. |
| 12 | Council registration and roll numbers | Optional fields. |

## 32. Suggested build order

1. **Fee engine functions** (term-by-term fees, concessions, allocation, ageing) with the tests from section 28.
2. **Permanent storage** for templates, plans and ledger.
3. **Fee Templates module:** list, editor, versions, terms per year, refundable marks, duplicate, audit.
4. **Template matching** on course, program, session and batch.
5. **Student fee plan** with concession records.
6. **Redesigned admission** Fees step, due dates, and the single all-or-nothing save.
7. **Payment allocation** and overdue amounts.
8. **Promotion** using the student's plan.
9. **Profile fee view** with due dates, overdue and ageing.
10. **Plan changes, void receipt, cancellation and refunds.**
11. **Permissions and concession limits** once roles exist.

Step 1 comes first because admission, promotion, the profile and every report depend on those calculations being right.
