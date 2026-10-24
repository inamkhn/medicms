# MediCMS Desktop: Promotion (Single and Batch)

**Document type:** Improved design and scope, with detailed frontend design
**Version:** Draft 1
**Date:** 10 October 2026
**Covers:** Feature 1 (Individual Promotion), Feature 2 (Batch Promotion), Feature 3 (Hold Back, Undo and History), and the frontend design for all three
**Replaces:** the "Individual and batch promotion" section of `APPLICATION_SCOPE.md`
**Related:** `FEE_TEMPLATES_AND_ADMISSION_DESIGN.md` (sections 5.4, 13, 16, 24 to 26), `PAYMENTS_RECEIPTS_LEDGER_DESIGN.md` (sections 5 to 8, 45), `BATCHES_ACADEMIC_SETUP_DESIGN.md` (sections 8, 18, 38), `LOGIN_DASHBOARD_STUDENTS_DESIGN.md`, `FRONTEND_DESIGN.md`

Samples in this document use the same working date as the other documents, 9 October 2026, unless a sample says otherwise.

---

## Decisions assumed

These choices shape the whole design. Change any that do not suit the institute.

| # | Decision | Assumed answer |
| --- | --- | --- |
| 1 | What does "promotion" do? | Two things in one action: it moves the student to the next term and posts that term's fee charge. A separate **Bill current term** mode posts a missing charge without moving the student. |
| 2 | Where do the amounts come from? | From the student's **own fee plan**, not the template. The plan is locked at admission. One-off changes for this term are made on the promotion screen. Changes for later terms use **Change fee plan**. |
| 3 | How many terms can one promotion move? | One. A student who is two terms behind is promoted twice. |
| 4 | How does batch promotion save? | Student by student. Each student's save is all-or-nothing, a run can be repeated safely, and an interrupted run can be resumed. |
| 5 | Do overdue dues block promotion? | No. They are shown as a warning. A setting can block promotion above an amount. |
| 6 | Can a promotion be undone? | Yes, within 7 days, if no payment has been allocated to the new fee charge. |
| 7 | Can a student be kept back? | Yes, with a reason. A held-back student is left out of the batch's "due for promotion" count. |
| 8 | When is the new fee charge due? | 15 days after it is posted (the template's due rule), and it can be changed. |

---

## 1. Purpose and what changes

At the start of each term, every active student has to move up and be billed. This is the biggest single money action in the app: one batch run can post millions of rupees of fee charges. It needs to be fast, but above all it needs to be safe and traceable.

| Today | New design |
| --- | --- |
| The amount comes from a "recurring fee" with a template fallback. Annual, clinical and diploma charges are shown but not added. | The charge is built from the student's own plan by the fee engine: every-term, annual, promotion and last-term components, minus the student's concessions. |
| The fee can be overridden by typing a number. | Changes are visible: a custom component or a this-term concession, each with a reason and the usual approval rules. |
| In a batch, the target term is chosen by hand and is not checked as the next term for each student. | Each student moves exactly one term. The batch is chosen with a "from" term, and the target is worked out. |
| Nothing says which batches are due. | The Academic setup calendar flags batches due for promotion, and the Promotion page lists them. |
| Posting stops with a failure list, and counts need correction. | Per-student saves, clear outcomes (promoted, moved only, skipped, failed), a saved run record, and resume. |
| There is no way to reverse a promotion. | Single and batch undo, with clear rules. |
| A student who should not move up has no way to be marked. | Hold back, with a reason. |
| Students with no fee charge for their current term (imports, errors) have no fix. | **Bill current term** mode. |
| The student's session changes on promotion. | The student's session stays the intake session. The fee charge records the billing session (section 7.4). |

## 2. Wording used in this document

| Term | Meaning |
| --- | --- |
| **Promotion** | Moving a student from term N to term N + 1 and posting term N + 1's fee charge, in one action. |
| **Bill current term** | Posting the fee charge for the student's current term when none exists. The student does not move. |
| **Move term only** | Moving a student to the next term when that term's charge has already been posted. No money is posted. |
| **From term** | The term a group of students is in now. |
| **Target term** | The term they will move to. |
| **Calendar term** | The term a batch should be in today, from its term schedule (Academic setup document, section 18). |
| **Behind schedule** | A student whose current term is lower than the calendar term. |
| **Early promotion** | Promoting before the target term has started on the calendar. |
| **Hold back** | Keeping a student in the current term for now, with a reason. |
| **Run** | One batch promotion. It has a number, a state and a result. |
| **Billing session** | The session whose year contains the target term's start date. It is saved on the fee charge. |
| **Fee charge** | The fees billed for one term, with a due date (fee document, section 24). |
| **Concession** | A reduction for a student (fee document, section 13). |
| **Credit** | Money paid in advance, held as a negative balance. |

## 3. Roles, permissions and limits

| Action | Admin | Accountant | Counter operator | Viewer |
| --- | :---: | :---: | :---: | :---: |
| View the Promotion page, runs and history | Yes | Yes | No | Yes |
| Promote one student | Yes | Yes | No | No |
| Run a batch promotion | Yes | Yes | No | No |
| Bill current term (one student or a batch) | Yes | Yes | No | No |
| Move term only | Yes | Yes | No | No |
| Add a this-term concession or custom component while promoting | Yes | Within limit | No | No |
| Hold back or release a student | Yes | Yes | No | No |
| Undo one promotion | Yes | Within 7 days | No | No |
| Undo a batch run | Yes | No | No | No |
| Print promotion lists | Yes | Yes | No | Yes |

"Within limit" means the same concession approval rules as admission (fee document, section 13.6). At promotion only **this-term** concessions can be added. Anything that continues beyond this term must be made with **Change fee plan**, which needs approval.

---

# Feature 1: Individual Promotion

## 4. Goals

- Promote one student in under a minute, with the fee charge clear before anything is posted.
- Never post a charge twice, and never move a student the wrong way.
- Make it obvious why a student cannot be promoted, and what to do about it.

## 5. What promotion does

1. Works out the **target term**: the student's current term plus one.
2. Builds the **fee charge** for that term from the student's plan (section 7).
3. Shows a **preview**, which the operator can adjust for this term only (section 8).
4. On confirmation, saves everything together (section 10), moves the student to the target term and posts the charge.

Where it starts: the student's profile (**Promote**), a row in the directory, the batch page, or the Promotion page.

## 6. Who can be promoted

| Student state | Result |
| --- | --- |
| Active, has a fee plan, target term not yet charged | **Ready** |
| Active, target term already has a fee charge, student still in the lower term | **Charge exists: move term only** |
| Active, already in the target term | Not promoted: "Already in Semester 3." |
| Active, no fee plan | Blocked: "No fee plan." A link opens **Add fee plan**. |
| Active, at the final term | Promotion unavailable: "Final term." **Mark as completed** is offered. |
| Held back | Allowed from the profile, which also clears the hold. Left out of batch runs by default. |
| On leave | Blocked: "On leave. Return the student from leave first." |
| Struck off | Blocked: "Struck off. Reinstate the student first." |
| Completed | Blocked: "Completed." |
| Program with only one term | Promotion is not offered. |
| Test record | Left out of batch runs. Allowed one by one. |

## 7. The fee charge for the next term

### 7.1 How it is built

The fee engine builds the charge from the student's **plan** (components copied from the template at admission, plus the student's concession records). For the target term N:

1. Take every component charged **every term** (respecting "from term" and "to term").
2. Add components charged **every new year** if term N starts a new year. This uses the **terms per year stored in the student's plan**: term N starts a new year when (N − 1) divides exactly by that number.
3. Add components charged **on promotion**.
4. Add components charged **last term only**, if N is the final term.
5. Add any custom components added at this promotion (section 8).
6. The sum is the **fee charge** (gross).
7. Apply the student's **concessions** that cover term N, in the order from the fee document (component concessions, then whole-plan percent, then whole-plan fixed amount), rounded to the nearest rupee. Concessions that were "this term only" in an earlier term are not repeated.
8. The result is the **net fee**.
9. If the student has **credit**, it is applied to the new charge automatically, up to the net fee.

### 7.2 Sample: BSN 2025 v3 plan, term by term

Components: Admission 15,000 (admission only), ID card 1,000 (admission only), Security 10,000 (admission only), Tuition 43,000 (every term), Clinical 8,000 (every term from term 3), Annual 6,000 (every new year), Promotion 2,000 (on promotion), Degree fee 12,000 (last term only).

| Term | What is included | Fee charge (PKR) |
| --- | --- | ---: |
| 1 (admission) | Admission, ID card, security, tuition, annual | 75,000 |
| 2 | Tuition, promotion | 45,000 |
| 3 | Tuition, clinical, annual, promotion | 59,000 |
| 4 | Tuition, clinical, promotion | 53,000 |
| 5 | Tuition, clinical, annual, promotion | 59,000 |
| 6 | Tuition, clinical, promotion | 53,000 |
| 7 | Tuition, clinical, annual, promotion | 59,000 |
| 8 | Tuition, clinical, promotion, degree fee | 65,000 |
| | **Course total** | **468,000** |

### 7.3 Due date

- Default: 15 days after the posting date (the template's due rule).
- It can be changed on the preview. It cannot be earlier than today.
- A promotion is always posted **today**. The term's start date is shown for information and is never used as the posting date.

### 7.4 Billing session

The fee charge records the **billing session**: the session whose year contains the target term's start date, from the batch's term schedule. For example, Semester 2 of a batch that starts in September 2026 begins on 1 March 2027, so its billing session is **2027**.

If the batch has no term schedule, the Current session is used, and the preview shows a note "This batch has no term dates, so the current session is used."

The student's own session is not changed by promotion. It stays the session the student started in.

## 8. Edits allowed at promotion

| Edit | Rule |
| --- | --- |
| Add a **custom component** (for example "Lab kit", 3,000) | This term only. A name and amount are required. It is part of this fee charge only. |
| Add a **concession for this term** | A kind (waive, fixed amount, percent, set amount), value and reason. Follows the approval limits in the fee document, section 13.6. |
| Change the **due date** | Not before today. |
| Add a **note** | Optional, saved on the fee charge. |
| Change a component's amount or remove a component | **Not allowed here.** Use **Change fee plan** first, which records the change and its approval. |
| Re-price from a newer template | **Not allowed here.** An Admin can use "Re-price student" (fee document). The preview shows an information line when the template has a newer version than the student's plan. |

## 9. Safety checks

| Check | Behaviour |
| --- | --- |
| Student changed since the preview opened (term, status, plan or ledger) | Blocked: "This student was changed by someone else. Reload the preview." |
| Target term already charged | The screen switches to **Move term only** and says why. |
| Already in the target term | Blocked. |
| No fee plan | Blocked with a link to add one. |
| Struck off, on leave or completed | Blocked with the reason. |
| Overdue dues | A warning showing the overdue amount. Not blocked. A setting can block promotion when overdue is above an amount (default off). |
| Early promotion | A warning "Semester 2 starts on 1 Mar 2027. Promoting now bills early." The operator must tick "Promote early". |
| More than one term behind | An information line "2 terms behind. This promotion moves one term." |
| Ahead of the calendar | An information line. |
| Template has a newer version | An information line. |
| Due date before today | Blocked. |
| Net fee is zero | Allowed (a full waiver). The charge and concessions are still posted, so the term is billed. |

## 10. What is saved

When the operator confirms, all of this is saved **together**. If any part fails, **nothing** is saved.

1. The **fee charge** entry for the target term: itemised lines, due date, billing session, run number.
2. A **concession** entry for each concession that applies, linked to the new charge.
3. Any custom components (as lines inside the charge) and any this-term concession record, with its reason and approver.
4. The **credit allocation**, if the student had credit.
5. A **promotion record**: from term, to term, date, user, charge, run (if any), and the type (Promoted, Billed current term, or Term moved only).
6. The student's **current term**, set to the target term. Any hold is cleared.
7. The **audit entry**.

**Bill current term** saves items 1 to 4, 5 (type "Billed current term") and 7, and does not change the term.
**Move term only** saves the term change, a promotion record (type "Term moved only") and the audit entry, and posts no money.

## 11. Samples

### 11.1 Ayesha Khan, Semester 1 to Semester 2

Posted on 1 March 2027, as the first day of Semester 2. Assume Term 1 was paid in full, so her balance is 0. Her plan comes from BSN 2026 v1: tuition 45,000, promotion fee 2,000, and a merit concession of 20 percent of tuition for all terms. Her sibling waiver applied to Term 1 only.

| Line | Amount (PKR) |
| --- | ---: |
| Tuition (every term) | 45,000 |
| Promotion fee (on promotion) | 2,000 |
| **Fee charge** | **47,000** |
| Merit concession, 20 percent of tuition (all terms) | -9,000 |
| **Net fee** | **38,000** |
| Credit applied | 0 |
| **Unpaid after promotion** | **38,000** |

Due date 16 March 2027. Billing session 2027. Ledger entries: **Fee charge** +47,000 and **Concession** -9,000. Balance after: 38,000.

If Ayesha had 5,000 of credit, 5,000 would be applied to the charge. The unpaid amount and balance would be 33,000.

### 11.2 Bilal Ahmed, Semester 3 to Semester 4

Bilal is in BSN Spring 2025, whose calendar term is Semester 4, so he is one term behind. He has an overdue balance of 53,000. The preview shows a warning with that figure. It does not block, so the operator can continue. His charge for Semester 4 follows his own plan.

## 12. Edge cases

| Case | Behaviour |
| --- | --- |
| A student has overdue dues and the block setting is on | The screen says "Overdue 53,000 is above the limit of 10,000" and the button is disabled. Admin can override with a reason. |
| Charge exists but the student is still in the lower term | **Move term only**. |
| A student's term does not match the highest charged term in the ledger | A warning on the profile (Students document) and on the preview. |
| Two people open the same student | The second to confirm gets the "changed by someone else" message. |
| The program has a terms-per-year value that was changed after admission | The plan's stored value is used. |
| The batch has no term schedule | The Current session is used for the billing session, and the "early promotion" warning does not apply. |
| A student is held back | Allowed from the profile. The hold is cleared on success. |
| Final term | Promotion unavailable. **Mark as completed** is offered (Students document, section 26.5). |
| The network or app closes during saving | Nothing is saved for that student. |

## 13. Acceptance criteria (Feature 1)

- [ ] The fee charge for each term matches the table in section 7.2.
- [ ] Concessions that cover the target term are applied, and ones that were for an earlier term only are not repeated.
- [ ] Existing credit is applied to the new charge automatically.
- [ ] A student cannot be promoted twice into the same term, and a second charge for a term is never posted.
- [ ] Struck-off, on-leave and completed students are blocked, with the reason shown.
- [ ] Early promotion needs a tick box.
- [ ] A change to the student since the preview was opened blocks the save.
- [ ] The fee charge, concessions, credit allocation, promotion record, term change and audit entry save together or not at all.
- [ ] The billing session is the session whose year contains the target term's start date.

## 14. Not included

- Promoting a student more than one term in a single action.
- Changing plan amounts on the promotion screen.
- Automatic repeat-term fees.
- Fee vouchers (planned later).

---

# Feature 2: Batch Promotion

## 15. Goals

- Promote a whole group at the start of a term, in minutes, with a clear list of what will happen.
- Exclude students who should not move, and say why.
- Survive interruptions: a power cut or a closed app must never leave a student half-promoted or promoted twice.

## 16. Modes

| Mode | Use | What it does |
| --- | --- | --- |
| **Promote** (default) | Start of a term | Moves each student up one term and posts the new term's fee charge. |
| **Bill current term** | Imports, fixes, students with no charge for their current term | Posts the missing fee charge for each student's current term. The term does not change. |

## 17. Choosing the group

A step with these choices:

| Choice | Detail |
| --- | --- |
| **Batch** | Chosen with the academic selector (Academic setup document, section 38), showing only Running batches. Each option shows the calendar term and a **Promotion due** badge. |
| **From term** | The term the group is in now. The list shows each term that has students, with counts, for example "Semester 2 (43 students)". It defaults to the lowest term that is behind schedule. |
| **Target term** | Shown, not typed: the from term plus one, with its start date. |
| **Billing session** | Shown, worked out as in section 7.4. |
| **Due date** | Defaults to 15 days after posting. Changed once for the whole run. |
| **Note** | Optional, saved on every charge. |
| **Early promotion** | If the target term has not started, a warning appears and a tick box "Promote early" is required. |

Only students **currently in the from term** are listed. To promote students in another term of the same batch, run again with a different from term.

## 18. The review list

Every student in the batch who is in the from term appears with a status.

| Status | Meaning | Selected by default |
| --- | --- | --- |
| **Ready** | Can be promoted. | Yes |
| **Ready, with warnings** | Can be promoted, but has an overdue amount or is more than one term behind. | Yes |
| **Charge exists, move term only** | The target term is already charged. | Yes |
| **No fee plan** | Cannot be promoted. | No (and cannot be selected) |
| **Held back** | The student was held back. | No (can be selected, which releases the hold) |
| **At final term** | Promotion is not possible. | No (cannot be selected) |
| **On leave, Completed, Struck off, Test record** | Not eligible. Hidden unless **Show excluded** is ticked. | No (cannot be selected) |

In **Bill current term** mode the statuses are: **Ready** (no charge for the current term), **Already charged** (skipped), **No fee plan**, and the same exclusions.

## 19. Review rules

- The summary updates as students are ticked or unticked: number selected, total fee charges, total concessions, total credit applied, and the expected new dues.
- Each row shows: student, plan version, fee charge, concessions, net, credit applied, and status.
- Operators can **Hold back** a student from the list, or open the student to **edit before promoting**, then return to the run.
- A student with a custom component or this-term concession is not edited in a batch. Those are done individually.
- The totals shown are exactly what will be posted. They are recalculated from the plans when the run starts, and any student whose figure changed is flagged "changed since preview" and skipped.

## 20. Posting

1. The Admin or Accountant confirms a summary (students, total, due date, term, billing session). No new approval is needed, because every concession in a batch run was approved when it was added to the plan. If the block-on-overdue setting is on, students over the limit are left out unless an Admin overrides them.
2. A **run record** is created with a number and the list of selected students. Its state is **Running**.
3. Students are processed one at a time. For each student the app **re-checks the conditions** (still active, still in the from term, still no charge for the target term, plan unchanged) and then saves everything in section 10 as one all-or-nothing save.
4. The screen shows live progress: done, skipped, failed.
5. **Stop** pauses the run after the current student. The run stays resumable.
6. If the app closes or the computer shuts down, the run stays **Running**. On the next start a banner offers **Resume**. Resuming continues with the students not yet done.
7. Running the same batch and from term again is safe. Students already promoted are skipped as "Already promoted". No student is ever charged twice for a term.

A run ends as **Completed**, **Completed with errors**, **Stopped** or (after undo) **Partly undone** or **Undone**.

## 21. Result and run record

The result shows:

| Outcome | Meaning |
| --- | --- |
| **Promoted** | Fee charge posted and term moved. |
| **Billed** | (Bill current term mode.) Fee charge posted for the current term. |
| **Term moved only** | The charge already existed. |
| **Skipped** | Not done, with a reason: no fee plan, held back, already promoted, changed since preview. |
| **Failed** | An error stopped that student. Nothing was saved for them. The error is shown. |

The result can be printed or exported. Each student's line links to their profile. Buttons: **Undo this run** (Admin), **Promote the next group**, and **Open batch**.

The run record keeps: number, mode, batch, from and to terms, date, user, due date, billing session, note, the list of students with their outcome and amount, and totals. It is kept forever and appears in the Promotion history.

## 22. Sample: BSN Fall 2025, Semester 2 to Semester 3

Position on 9 October 2026. Batch: BSN Fall 2025 (44 students: 43 Active and 1 Struck off), template BSN 2025 v3. Calendar term Semester 3 since 1 September 2026, so the batch is due, and the promotion is **not** early. Billing session 2026 (Semester 3 starts 1 September 2026). Due date 24 October 2026.

**Review list**

| Status | Students | Fee charge each | Concession each | Net each |
| --- | ---: | ---: | ---: | ---: |
| Ready, standard plan | 34 | 59,000 | 0 | 59,000 |
| Ready, merit 20 percent of tuition | 4 | 59,000 | -8,600 | 50,400 |
| Ready, staff child 10,000 off per term | 2 | 59,000 | -10,000 | 49,000 |
| Charge exists, move term only | 1 | 0 | 0 | 0 |
| No fee plan | 1 | | | |
| Held back | 1 | | | |
| Struck off (hidden) | 1 | | | |

27 of the 40 ready students have an overdue amount. This is shown as a warning and does not block the run.

**Summary before posting**

| Item | Amount (PKR) |
| --- | ---: |
| Students selected | 41 (40 charged, 1 term only) |
| Fee charges (40 × 59,000) | 2,360,000 |
| Concessions (4 × 8,600 and 2 × 10,000) | -54,400 |
| **Net to be charged** | **2,305,600** |
| Credit applied (3 students) | -14,000 |
| **New dues after the run** | **2,291,600** |

**Result**

| Outcome | Students | Amount (PKR) |
| --- | ---: | ---: |
| Promoted | 40 | 2,305,600 |
| Term moved only | 1 | 0 |
| Skipped: no fee plan | 1 | |
| Skipped: held back | 1 | |
| Failed | 0 | |

Afterwards, the batch's calendar term and its 41 promoted students are both in Semester 3. The held-back student stays in Semester 2, and the batch is no longer "due" because held-back students are not counted (section 25). The one student with no plan is listed with a link to add one.

## 23. Acceptance criteria (Feature 2)

- [ ] The review list shows the statuses in section 18, and totals update as students are ticked.
- [ ] The totals shown in the summary equal what is posted, and the sample in section 22 gives 2,305,600.
- [ ] Each student is saved all-or-nothing, and one failure never stops the rest.
- [ ] Running the same batch twice posts no second charge for any student.
- [ ] An interrupted run shows a banner on the next start and can be resumed without duplicates.
- [ ] A student who changed since the preview is skipped with a clear reason.
- [ ] Early promotion needs a tick box.
- [ ] **Bill current term** posts only the missing charges and does not change any term.
- [ ] The result can be printed and exported, and the run record is kept.

## 24. Not included

- Promoting students from more than one from-term in one run.
- Per-student amount edits inside a batch run.
- Scheduling a promotion to run later.
- Notifications to students or parents.

---

# Feature 3: Hold Back, Undo and History

## 25. Hold back and release

### 25.1 Hold back

- **Hold back** keeps a student in their current term for this round. The term and fees do not change.
- A reason is required: Failed exams, Fees pending, Medical, Disciplinary, or Other (with a note). The list can be edited in Settings.
- The hold records the date, user and reason, and is shown as a **Held back** badge on the student's profile and in lists.
- Held-back students are:
  - left out of batch runs by default (they can be ticked to release them),
  - **not counted as behind schedule**, so a batch is not flagged "due for promotion" because of them.
- A hold has no automatic fee. If the institute charges for repeating a term, add a special charge.

### 25.2 Release

- **Release** removes the hold without promoting. The student is behind schedule again.
- Promoting the student (individually or in a run) also clears the hold.
- Release needs no reason. Both actions are audited.

## 26. Undo a single promotion

Allowed when **all** of these are true:

- No payment has been allocated to the new fee charge.
- The student has not been promoted again.
- The promotion was posted within the undo window (default 7 days) for an Accountant. An Admin is not limited by the window.

What it does, with a required reason:

1. Reverses the fee charge and each concession entry created by the promotion, using reversal entries (Ledger document, section 45).
2. Releases any credit that was applied, so it returns as credit.
3. Sets the student's term back to the previous term.
4. Marks the promotion record **Undone**.
5. Writes an audit entry.

If a payment has been allocated, the screen says "A payment of 20,000 has been allocated to this charge. Void that receipt first, or keep the promotion." A fee charge reversal has no cash effect, so a closed day does not block it.

## 27. Undo a batch run

- **Admin only**, with a reason.
- A preview checks every student in the run and sorts them into **Can undo** and **Cannot undo** (with the reason: payment allocated, promoted again, already undone).
- Undoing applies the single-undo steps to everyone in **Can undo**. The others stay promoted.
- The run becomes **Undone**, or **Partly undone** if any student could not be undone.
- The result lists both groups and can be printed.

Sample: a run promoted 40 students. 3 have had a payment allocated to their new charge. The preview shows 37 can be undone and 3 cannot. After undoing, the run is **Partly undone** with 37 reversed.

## 28. Term history and promotion history

### 28.1 Term history (on the student)

A card on the student's profile lists every term:

| Term | Fee charge | Amount | Due date | How it was posted |
| --- | --- | ---: | --- | --- |
| Semester 1 | Admission | 77,000 | 23 Oct 2026 | Admission |
| Semester 2 | Posted 1 Mar 2027 | 47,000 | 16 Mar 2027 | Promotion, run 14 |
| Semester 3 | Not yet billed | | | |

### 28.2 Promotion history (all runs)

A list of every run and single promotion: date, mode, batch, from and to terms, students promoted, skipped and failed, total charged, who ran it, and state. Opening a run shows every student's outcome.

## 29. Acceptance criteria (Feature 3)

- [ ] A student can be held back with a reason, and shows a Held back badge.
- [ ] Held-back students are left out of batch runs and are not counted when deciding whether a batch is due for promotion.
- [ ] Release removes the hold without promoting.
- [ ] A single promotion can be undone only when no payment has been allocated to its charge.
- [ ] A batch undo sorts students into Can undo and Cannot undo, and only reverses the first group.
- [ ] Undo uses reversal entries, restores the previous term, and writes audit entries.
- [ ] The profile shows a term history, and the history page shows every run.

## 30. Not included

- Automatic fees for repeating a term.
- Undoing a promotion that has had a payment allocated, without first voiding the receipt.
- Editing a past run.

---

# Frontend Design

These screens use the design system in `FRONTEND_DESIGN.md`: colours, money and date formats, tables, drawers, dialogs, toasts and the permission hook. Only what is new is described here.

## 31. Navigation and routes

**Sidebar.** In the Operations group, **Promotion** is added beside Academic setup and Fee templates. Counter operators do not see it.

| Route | Screen | Permission |
| --- | --- | --- |
| `/promotion` | Promotion page (due batches, runs, held back, missing charges) | `promotion.view` |
| `/promotion/batch` | Batch promotion wizard. Address options: `batch`, `from`, `mode=promote` or `bill`, `students` | `promotion.run` |
| `/promotion/runs/:id` | Run detail | `promotion.view` |
| `/promotion/history` | Promotion history | `promotion.view` |
| `/students/:sno/promote` | Promote one student | `promotion.run` |
| `/ledger/bulk-demand` | Old address. Redirects to `/promotion/batch` | |

The **Batch promotion** action in the student directory's bulk bar opens `/promotion/batch?students=...` (selection mode, section 34.6). The **Open batch promotion** buttons on the batch page, the setup health panel and the dashboard open `/promotion/batch?batch=...&from=...`.

## 32. Promotion page

### 32.1 Layout

```text
Promotion                                  [Promote a student]  [Start batch promotion]

(!) A batch promotion was interrupted: BSN Fall 2025, 22 of 41 students done.
                                                          [Resume]  [Review]

Due for promotion (3)
+------------------------------------------------------------------------------------+
| BSN Fall 2025    43 students in Semester 2  ->  Semester 3 (from 1 Sep 2026)         |
|                  Due for 38 days                               [Start promotion]   |
| BSN Spring 2025  50 students in Semester 3  ->  Semester 4 (from 1 Sep 2026)         |
|                  Due for 38 days                               [Start promotion]   |
| RAD Fall 2025    25 students in Semester 2  ->  Semester 3 (from 1 Sep 2026)         |
|                  Due for 38 days        (!) No active fee template [Start promotion]|
+------------------------------------------------------------------------------------+

 Recent runs | Held back (3) | Missing fee charges (23)
-------------------------------------------------------------------------------------
 (tab content)
```

### 32.2 Behaviour

| Element | Behaviour |
| --- | --- |
| Interrupted run banner | Shown only while a run is in the Running state. **Resume** continues it. **Review** opens the run detail. |
| Due for promotion | One row per batch that is due (Academic setup document, section 18.3). Held-back students are not counted. **Start promotion** opens the wizard with the batch and the lowest behind-schedule term already chosen. |
| Batch with no template | Shows a red warning. Promotion still works for students who have a plan. |
| Recent runs tab | The last 10 runs: date, mode, batch, terms, promoted, skipped, failed, total charged, state. **View all** opens the history page. |
| Held back tab | Held-back students with batch, term, reason, date and who held them. Buttons: **Release** and **Promote**. |
| Missing fee charges tab | Batches that have Active students with no fee charge for their current term, with the count. **Bill current term** opens the wizard in that mode. |
| Promote a student | Opens a student search. Choosing a student opens their promotion page. |
| Empty | "No batches are due for promotion." with a green tick. |

## 33. Individual promotion page

### 33.1 Ready state

```text
< Ayesha Khan
Promote to Semester 2

+-- Student ---------------------------+  +-- Position ----------------------------+
| [photo] Ayesha Khan    SNO 1042      |  | Now: Semester 1    Calendar: Semester 2 |
| BSN Fall 2026   Plan: BSN 2026 v1    |  | Semester 2 starts 1 Mar 2027            |
| Balance 0 (clear)                    |  | Not behind schedule.                    |
+--------------------------------------+  +-----------------------------------------+

+-- Semester 2 fee charge ------------------------------------------------------------+
| Component                       Amount     Note                                     |
| Tuition (every term)            45,000                                              |
| Promotion fee (on promotion)     2,000                                              |
| [+ Add custom component]                                                            |
| Fee charge                      47,000                                              |
|                                                                                     |
| Concessions that continue                                                           |
|   Merit, 20% of tuition         -9,000     all terms                                |
| [+ Add concession for this term]                                                    |
| Net fee                         38,000                                              |
| Credit applied                       0                                              |
| Unpaid after promotion          38,000                                              |
|                                                                                     |
| Due date  [16 Mar 2027]         Billing session 2027                                |
+-------------------------------------------------------------------------------------+
Note  [_______________________________________________]

(i) Template BSN 2026 is now v2. This student's plan is v1.   [Re-price student] (Admin)

                              [Cancel]   [Promote to Semester 2 and post 38,000]
```

### 33.2 Behaviour

| Element | Behaviour |
| --- | --- |
| Header | "Promote to Semester 2". The target term comes from the program's term labels (Academic setup document, section 8). |
| Position card | The student's term, the batch's calendar term, when the target term starts, and whether the student is behind. |
| Fee charge table | Built by the fee engine. Each row says which timing rule put it there. Custom components can be removed with an x. Plan components cannot be edited. |
| Concessions | Concessions from the plan that cover this term are listed and cannot be edited here. Each shows its scope ("all terms", "Terms 2 to 4"). |
| Add custom component | Opens a small dialog (section 33.4). |
| Add concession for this term | Opens the concession editor with **Applies to** fixed to "This term only". Approval is requested when needed. |
| Totals | The net fee, credit applied and unpaid amount update as edits are made. |
| Due date | A date picker. The default is 15 days after today. Dates before today are not accepted. |
| Warnings | Shown above the buttons (section 33.3). |
| Confirm button | Named for the result: "Promote to Semester 2 and post 38,000". It shows a spinner and cannot be clicked twice. |
| Leaving | Leaving after adding a custom component or concession asks for confirmation. |

### 33.3 Warning and blocked states

Warnings sit in coloured banners above the buttons.

| Situation | Banner | Effect on the button |
| --- | --- | --- |
| Overdue dues | "Bilal Ahmed has 53,000 overdue." (amber) | None |
| Overdue above the block limit | "Overdue 53,000 is above the limit of 10,000." (red) | Disabled. Admin sees **Override with reason**. |
| Early promotion | "Semester 2 starts on 1 Mar 2027. Promoting now bills early." with a tick box **Promote early** (amber) | Disabled until ticked |
| Two terms behind | "2 terms behind. This promotion moves one term." (blue) | None |
| Student changed | "This student was changed by someone else. [Reload]" (red) | Disabled |
| Held back | "Held back since 20 Sep 2026: Failed exams. Promoting clears the hold." (blue) | None |

A student who cannot be promoted sees a blocked page in place of the fee table:

```text
< Hassan Raza
Promotion is not available

 [x] This student has no fee plan.
     A fee plan is needed to work out the fee charge.          [Add fee plan]

                                                               [Back to student]
```

The reason line changes with the cause (section 6): struck off (**Reinstate**), on leave (**Return from leave**), completed, final term (**Mark as completed**), already in the target term, program with one term.

### 33.4 Dialogs

| Dialog | Fields |
| --- | --- |
| Add custom component | Name (required), amount (required, whole rupees), note. Shows the new fee charge total. |
| Add concession for this term | The concession editor from the fee document (kind, value, reason, note), with **Applies to** locked to This term only. Shows the rupee result of a percentage. Shows a **Needs approval** badge and the approver's username and password boxes when over the limit. |
| Hold back | Reason and note (section 35.1). Offered from the student's profile and the review list, not from this page. |

### 33.5 Move term only

When the target term is already charged, the page says so and shows a short summary instead of a fee table:

```text
Promote to Semester 3 (term only)

(i) The Semester 3 fee charge was already posted on 5 Oct 2026 (59,000, due 20 Oct 2026).
    Promoting will move the student to Semester 3. No money will be posted.

                              [Cancel]   [Move to Semester 3]
```

### 33.6 Success screen

```text
[tick] Ayesha Khan promoted to Semester 2

 Fee charge posted      47,000      due 16 Mar 2027
 Concession             -9,000
 Net fee                38,000
 Balance now            38,000 Due

 [Take payment]  [Open profile]  [Promote next student: Hassan Raza]  [Print summary]
```

- **Promote next student** appears when the page was opened from a batch, and moves through that batch's ready students in order.
- If the student was held back, a line notes "Hold cleared."

## 34. Batch promotion wizard

A full page with a three-step bar: **Choose group, Review, Run and result**.

### 34.1 Step 1: Choose the group

```text
Batch promotion                                              Step 1 of 3
[1 Choose group]--[2 Review]--[3 Run and result]

Action       (o) Promote to the next term
             ( ) Post missing fee charges for the current term
Batch        [BSN Fall 2025 v]    Calendar: Semester 3 since 1 Sep 2026   [Promotion due]
From term    [Semester 2 (43 students) v]  ->  Target: Semester 3 (starts 1 Sep 2026)
Billing session  2026
Due date     [24 Oct 2026]       15 days after posting
Note         [_______________________________________]

(i) 43 students are in Semester 2. Students in other terms are not listed.
                                                  [Cancel]  [Review students]
```

| Element | Behaviour |
| --- | --- |
| Action | Two radio buttons. **Bill current term** hides "Target" and "From term" and says "Students keep their current term." |
| Batch | The academic selector in promotion context: Running batches only, each with its calendar term and due badge. |
| From term | Lists each term that has students, with counts. Defaults to the lowest behind-schedule term. |
| Early promotion | If the target term has not started, an amber banner appears with the tick box **Promote early**. Review is disabled until it is ticked. |
| Billing session and due date | Billing session is shown. The due date can be changed once for the whole run. |
| Review students | Builds the preview (section 34.2). |

### 34.2 Step 2: Review

```text
Review: BSN Fall 2025, Semester 2 -> Semester 3                        [Change group]

+-- Ready ------+ +-- Move only --+ +-- Left out -----+ +-- Net to be charged ------+
| 40            | | 1             | | 2 (+1 hidden)   | | 2,305,600                 |
| 27 with       | |               | | 1 no fee plan   | | Concessions     -54,400   |
| overdue       | |               | | 1 held back     | | Credit applied  -14,000   |
+---------------+ +---------------+ +-----------------+ +---------------------------+

[All] [Ready] [Warnings] [Move term only] [Left out]          [ ] Show excluded
[Select all ready]  [Deselect all]                                 41 of 43 selected
-----------------------------------------------------------------------------------------
[x] SNO   Student         Plan  Fee charge  Concessions  Net     Credit   Status
[x] 0801  Aiman Fatima    v3    59,000      0            59,000  0        Ready
[x] 0802  Hassan Raza     v3    59,000      -8,600       50,400  0        Ready (merit)
[x] 0815  Sana Iqbal      v3    59,000      0            59,000  -5,000   Ready (credit)
[x] 0820  Rida Aslam      v3    59,000      0            59,000  0        Ready, overdue 24,000
[x] 0833  Amna Tariq      v3    -           -            -       -        Charge exists: move term only
[ ] 0841  Faiza Noor      none  -           -            -       -        No fee plan     [Add fee plan]
[ ] 0846  Usman Ghani     v3    -           -            -       -        Held back (Failed exams)  [Release]
-----------------------------------------------------------------------------------------
                                                    [Back]   [Continue with 41 students]
```

| Element | Behaviour |
| --- | --- |
| Summary cards | Ready, Move only, Left out, and the money totals. They update as rows are ticked. Each count is a filter. |
| Filters | All, Ready, Warnings (overdue or more than one term behind), Move term only, Left out. |
| Show excluded | Reveals on-leave, completed, struck-off, test-record and already-promoted students, greyed and not selectable. |
| Selection | Ready and Move-only rows are ticked by default. **No fee plan**, **At final term** and excluded rows have a disabled tick box with a tooltip. A **Held back** row can be ticked, which releases the hold on posting. |
| Columns | Fee charge, concessions, net and credit applied use the money display rules. A row's **Status** explains any warning in words. |
| Row menu | **Open student** (in a new tab), **Hold back**, **Edit before promoting** (opens the individual page and returns to this list afterwards), **Add fee plan** where relevant. |
| Large lists | Rows are virtualised above 200. The summary cards stay visible while scrolling. |
| Continue | The button shows the selected count and is disabled when nothing is selected. |

### 34.3 Step 3: Confirm, run and result

**Confirmation dialog** (opens when Continue is pressed):

```text
+------------------------------------------------------------------+
| Promote 41 students from Semester 2 to Semester 3?                |
|                                                                   |
|  Batch               BSN Fall 2025                                |
|  Fee charges         40 students                      2,360,000   |
|  Concessions                                            -54,400   |
|  Net to be charged                                    2,305,600   |
|  Credit applied      3 students                         -14,000   |
|  Term moved only     1 student                                    |
|  Due date            24 Oct 2026     Billing session  2026        |
|  Left out            2 (no fee plan, held back)                   |
|                                                                   |
|  [x] I have reviewed the list.                                    |
|  Each promotion can be undone for 7 days if no payment has been  |
|  allocated to its new fee charge.                                 |
|                          [Cancel]   [Promote 41 students]         |
+------------------------------------------------------------------+
```

**Progress** (replaces the dialog):

```text
Promoting BSN Fall 2025: Semester 2 -> Semester 3                    Run 14
[===========================>          ]  26 of 41
 Promoted 25    Moved only 1    Skipped 0    Failed 0
 Now: Rida Aslam
                                               [Stop after this student]
(i) Please keep the app open until the run finishes. If it is interrupted, you can resume it.
```

**Result:**

```text
[tick] Run 14 completed                      BSN Fall 2025, Semester 2 -> Semester 3
 Promoted 40    Term moved only 1    Skipped 2    Failed 0
 Net charged 2,305,600     Due 24 Oct 2026     Billing session 2026

 [All 43] [Promoted 40] [Moved only 1] [Skipped 2] [Failed 0]
 SNO   Student        Outcome        Amount    Note
 0801  Aiman Fatima   Promoted       59,000
 0802  Hassan Raza    Promoted       50,400
 0841  Faiza Noor     Skipped                  No fee plan        [Add fee plan]
 0846  Usman Ghani    Skipped                  Held back          [Release]

 [Print list] [Export] [Undo this run] [Promote next group] [Open batch]
```

| Element | Behaviour |
| --- | --- |
| Progress | Updates after every student. The percentage and counts come from the run record. |
| Stop | Pauses after the current student. The run shows **Stopped** and a **Resume** button. |
| Failed rows | Show the error in plain words. Nothing was saved for those students. A **Retry failed** button re-runs only them. |
| Promote next group | Opens step 1 with the same batch and the next from-term that has students. |
| Undo this run | Admin only (section 36). |

### 34.4 Interrupted run

If the app is closed or the computer shuts down during a run, the next start shows a banner on every page of the app for users with promotion access:

```text
(!) A batch promotion was interrupted: BSN Fall 2025, 22 of 41 students done.   [Resume] [Review]
```

Resume opens the progress screen and carries on with the students not yet done. Nobody is charged twice, because every student is re-checked before saving.

### 34.5 Bill current term mode

Same wizard, with these differences:

| Place | Change |
| --- | --- |
| Step 1 | No From or Target term. A line says "Students keep their current term." |
| Step 2 | The columns show the student's current term and the fee charge for it. Statuses: Ready, Already charged (skipped), No fee plan. |
| Confirmation | "Post 23 fee charges for the current term?" The summary has no "term moved" line. |
| Result | Outcomes: **Billed**, Skipped, Failed. |

### 34.6 Selection mode

When the wizard is opened from the student directory with students selected:

```text
Batch promotion                                              Step 1 of 3
Selected students: 12   from 2 batches   (BSN Fall 2025: 7, BSN Spring 2025: 5)

Action   (o) Promote to the next term   ( ) Post missing fee charges
Due date [24 Oct 2026]       Note [___________________]
(i) Each student moves one term. The billing session comes from each student's batch.
                                                  [Cancel]  [Review students]
```

- There is no batch or From-term choice. Each student moves from their own term to the next.
- The review list adds columns for batch and from → to term, and the billing session is shown per row.
- Everything else is the same, including the run record.

## 35. Hold back screens

### 35.1 Hold back dialog

```text
+--------------------------------------------------+
| Hold back Usman Ghani?                            |
| He will stay in Semester 2 for now. Fees do not   |
| change.                                           |
|                                                   |
| Reason *  [Failed exams v]                        |
| Note      [_________________________________]    |
|                                                   |
| (i) He will not be counted as behind schedule     |
|     and will be left out of batch runs.           |
|                       [Cancel]   [Hold back]      |
+--------------------------------------------------+
```

Reasons: Failed exams, Fees pending, Medical, Disciplinary, Other (a note is required for Other).

### 35.2 Held back list

The **Held back** tab of the Promotion page, and a card on the batch page.

```text
Held back (3)
Student          Batch            Term        Reason         Since        By
Usman Ghani      BSN Fall 2025    Semester 2  Failed exams   20 Sep 2026  Saba Noor     [Release] [Promote]
...
```

- **Release** is a one-click action with a confirmation. The student becomes behind schedule again.
- **Promote** opens the individual promotion page. Promoting clears the hold.
- A **Held back** badge also appears on the student's profile and in the directory.

## 36. Undo dialogs

### 36.1 Undo one promotion

```text
+--------------------------------------------------------+
| Undo promotion of Ayesha Khan to Semester 2?            |
|                                                         |
| This will:                                              |
|   Reverse the fee charge        47,000                  |
|   Reverse the merit concession  -9,000                  |
|   Return the student to Semester 1                      |
|   Balance changes from 38,000 Due to 0                  |
|                                                         |
| Reason *  [Promoted by mistake v]   Note [__________]    |
|                         [Cancel]   [Undo promotion]     |
+--------------------------------------------------------+
```

When undo is not possible, the dialog shows the reason and no button:

```text
Cannot undo
A payment of 20,000 has been allocated to this fee charge.
Void that receipt first (Receipts), or keep the promotion.        [Open receipt] [Close]
```

For an Accountant after the undo window: "This promotion is more than 7 days old. An Admin can undo it."

### 36.2 Undo a batch run (Admin)

```text
Undo run 14: BSN Fall 2025, Semester 2 -> Semester 3

 Can undo      37 students
 Cannot undo    3 students
   0815 Sana Iqbal      Payment allocated to the new charge
   0820 Rida Aslam      Payment allocated to the new charge
   0833 Amna Tariq      Promoted again

Reason *  [Run started by mistake v]   Note [_________]
(!) The 3 students who cannot be undone stay promoted.
                              [Cancel]   [Undo 37 promotions]
```

The result lists both groups. The run page then shows **Partly undone**.

## 37. Run detail and history

### 37.1 Run detail

```text
< Promotion history
Run 14    [Completed]                                          9 Oct 2026, 11:20 AM
BSN Fall 2025   Semester 2 -> Semester 3   by Saba Noor
Due 24 Oct 2026   Billing session 2026   Note: Start of Semester 3

 Promoted 40 | Moved only 1 | Skipped 2 | Failed 0       Net charged 2,305,600

 (results table as in section 34.3)
 [Print list] [Export] [Undo this run]
```

States shown as badges: **Running**, **Stopped**, **Completed**, **Completed with errors**, **Partly undone**, **Undone**.

### 37.2 History page

```text
Promotion history                          [Date v] [Mode v] [Batch v] [State v]
Date         Run  Mode      Batch            Terms    Promoted  Skipped  Failed  Net charged  State
9 Oct 2026   14   Promote   BSN Fall 2025    2 -> 3   40        2        0       2,305,600    Completed
8 Oct 2026   13   Bill      LHV 2025         Y1       18        0        0       612,000      Completed
12 Mar 2026  9    Promote   BSN Fall 2024    3 -> 4   36        1        0       2,010,500    Completed
(also single promotions, marked "Single")
```

Rows open the run detail. Single promotions open the student's term history.

## 38. Profile and other places

### 38.1 Promote button on the student profile

| Situation | Button |
| --- | --- |
| Ready | **Promote** (enabled). A small dot appears when the student is behind schedule. |
| Target term already charged | **Move term only** |
| No fee plan | Disabled, tooltip "Add a fee plan first." |
| Final term | Replaced by **Mark as completed** |
| Struck off, on leave, completed | Disabled, tooltip with the reason |
| Held back | **Promote** with a badge "Held back". Clicking shows the hold note. |

### 38.2 Term history card

On the Fees tab of the student's profile (Students document, section 24).

```text
Term history
Term        Fee charge      Amount   Due date      How it was posted
Semester 1  Posted 9 Oct 2026  77,000   23 Oct 2026   Admission
Semester 2  Posted 1 Mar 2027  47,000   16 Mar 2027   Promotion, run 14    [Undo]
Semester 3  Not yet billed
```

Each row's **Undo** appears only when undo is allowed (section 26).

### 38.3 Other places

| Place | Change |
| --- | --- |
| Batch page, Term schedule tab | The **Open batch promotion** button opens the wizard with the batch and from-term chosen. The "Charged" column links to Bill current term when students are missing a charge. |
| Batch page, Overview | A **Held back** card with the count and the list. |
| Student directory | The bulk bar's **Batch promotion** opens selection mode (section 34.6). The "No fee charge for current term" filter has a **Bill current term** bulk action. |
| Dashboard, Needs attention | "3 batches are due for promotion", "A promotion run was interrupted", "3 students are held back". Each opens the right place. |

## 39. Print layouts

### 39.1 Promotion list (A4 landscape)

Used for the review list and the run result.

```text
AL-SHIFA MEDICAL INSTITUTE                                   PROMOTION LIST
BSN Fall 2025   Semester 2 -> Semester 3   Run 14           Printed 9 Oct 2026 by Saba Noor
Due date 24 Oct 2026   Billing session 2026

No.  SNO   Student          Fee charge  Concessions  Net      Outcome
1    0801  Aiman Fatima     59,000      0            59,000   Promoted
2    0802  Hassan Raza      59,000      -8,600       50,400   Promoted
...
Totals: Promoted 40    Net charged 2,305,600    Skipped 2    Failed 0
Skipped: 0841 Faiza Noor (No fee plan)    0846 Usman Ghani (Held back)
```

The review version has the same layout, headed "PROMOTION PREVIEW", with a column for Status in place of Outcome. Page headers repeat, and rows never split across pages.

### 39.2 Run summary (A4 portrait)

One page: the run details, outcome counts, totals, the left-out students with reasons, and signature lines for the person who ran it and the person who checked it.

## 40. Messages, validation and states

### 40.1 Messages

| Situation | Message |
| --- | --- |
| No fee plan | "No fee plan. A fee plan is needed to work out the fee charge." |
| Already in the target term | "Already in Semester 3." |
| Charge exists | "The Semester 3 fee charge was already posted on 5 Oct 2026. Promoting will only move the term." |
| Final term | "Semester 8 is the final term. Mark the student as completed instead." |
| Struck off | "This student is struck off. Reinstate the student first." |
| On leave | "This student is on leave. Return the student from leave first." |
| Early promotion | "Semester 3 starts on 1 Mar 2027. Promoting now bills early." |
| Overdue above limit | "Overdue 53,000 is above the limit of 10,000." |
| Due date | "The due date cannot be before today." |
| Student changed | "This student was changed by someone else. Reload the preview." |
| Changed since preview (batch) | "Changed since the preview. Not promoted." |
| Undo, payment | "A payment of 20,000 has been allocated to this fee charge. Void that receipt first, or keep the promotion." |
| Undo, window | "This promotion is more than 7 days old. An Admin can undo it." |
| Run interrupted | "A batch promotion was interrupted: 22 of 41 students done." |

### 40.2 States

| Situation | Display |
| --- | --- |
| Loading the preview | Skeleton rows and the cards in a loading state. For a large batch, a progress line "Working out fee charges: 120 of 400". |
| Nothing to promote | "No students in Semester 2 can be promoted." with the reasons as counts. |
| Save failed (one student) | The student appears as **Failed** with the reason. The run continues. |
| Save failed (individual page) | A danger banner "The promotion was not saved. Nothing was changed." with **Try again**. |
| No access | The "No access" page (frontend document, section 5.5). |

## 41. Keyboard, accessibility and responsiveness

| Area | Detail |
| --- | --- |
| Keyboard | `Ctrl+Enter` confirms on the individual page and in the wizard's confirmation. Arrow keys move through the review list. Space ticks a row. `A` selects all ready rows, `Shift+A` deselects. `Esc` closes dialogs. |
| Focus | Dialogs trap focus. After a run finishes, focus moves to the result heading. |
| Screen readers | The progress bar announces "26 of 41" as it changes. Status cells are text. Totals are in a labelled summary region. |
| Colour | Every status has a word. Money colours always have a sign or the words Due, Cr or Overdue. |
| Safety | The confirmation button text always says what will happen ("Promote 41 students"), never just OK. |
| Widths | Designed for 1280 px and wider. Between 1024 and 1279 px the review table scrolls inside its card and the Plan column hides. Below 1024 px the app shows its "use a larger window" message. |

## 42. Components and data

### 42.1 Components

| Component | Notes |
| --- | --- |
| `FeeChargePreview` | The fee charge table with components, concessions, credit and totals. Used by the individual page and the "Edit before promoting" flow. |
| `PromotionStepper` | The three-step bar. |
| `PromotionReviewTable` | The review list with selection, statuses, filters and summary cards. |
| `EarlyPromotionBanner` | The amber banner and tick box. |
| `RunProgress` | The progress bar, counts and Stop button. |
| `RunResultTable` | Outcomes with filters and row links. |
| `RunStateBadge` | Running, Stopped, Completed, Completed with errors, Partly undone, Undone. |
| `HoldBackDialog` | Reason and note. |
| `UndoSummary` | The effect list in the undo dialogs. |
| `TermHistoryCard` | Section 38.2. |

### 42.2 Data layer

| Function | Purpose |
| --- | --- |
| `buildPromotionPreview(students, mode, options)` | Returns each student's status, fee charge lines, concessions, net, credit applied, warnings and billing session. |
| `postPromotion(student, options)` | The all-or-nothing save for one student (section 10). Re-checks the conditions first. |
| `startRun(preview, options)` | Creates the run record and the list of students. |
| `processRun(runId)` | Posts the students one at a time, updating the run after each. |
| `resumeRun(runId)`, `stopRun(runId)` | Continue or pause a run. |
| `previewUndo(runOrPromotion)` | Sorts students into can and cannot undo, with reasons. |
| `undoPromotion(promotionId, reason)`, `undoRun(runId, reason)` | Section 26 and 27. |
| `holdBack(student, reason)`, `release(student)` | Section 25. |
| `getTermHistory(student)` | The rows for the term history card. |
| `listRuns(filters)`, `getRun(id)` | History and run detail. |
| `calendarTerm`, `isDueForPromotion` | From the Academic setup helpers. Held-back students are not counted. |

The fee engine builds every charge. The screens and the run engine never calculate amounts themselves. Screens read and write only through these functions.

## 43. Acceptance criteria (frontend)

- [ ] The sidebar shows Promotion, and `/ledger/bulk-demand` redirects to the wizard.
- [ ] The Promotion page lists due batches, recent runs, held-back students and missing fee charges, and shows a banner for an interrupted run.
- [ ] The individual page shows the fee charge built from the plan, with every continuing concession, credit, due date and billing session.
- [ ] Blocked students see a clear reason and a button that fixes it.
- [ ] Early promotion cannot be confirmed without the tick box.
- [ ] The wizard's review list shows the statuses in section 18, with working filters, selection rules and live totals.
- [ ] The confirmation dialog states the number of students, the net total, the due date and the term.
- [ ] Progress updates after each student, Stop works, and a closed app can be resumed from the banner.
- [ ] The result lists every student's outcome, can be printed and exported, and offers undo to an Admin.
- [ ] Hold back, release and both undo dialogs show their effect before confirming.
- [ ] Selection mode and Bill current term mode work from the directory.
- [ ] Printed promotion lists and run summaries fit their paper sizes.
- [ ] Every screen has loading, empty and error states.

---

# Shared Sections

## 44. Settings

| Setting | Default |
| --- | --- |
| Days until a promotion fee charge is due | 15 (from the template's due rule) |
| Undo window for Accountants | 7 days |
| Block promotion when overdue is above | Off (an amount can be set) |
| Hold back reasons | Failed exams, Fees pending, Medical, Disciplinary, Other |
| Require "Promote early" confirmation | On |
| Promotion due after the term has started for | 7 days (set in Academic setup) |

## 45. Test cases

These should be written as automated tests, building on the fee engine tests, before the screens that use them.

| # | Case | Input | Expected result |
| ---: | --- | --- | --- |
| 1 | BSN 2025 term totals | The plan in section 7.2 | 75,000; 45,000; 59,000; 53,000; 59,000; 53,000; 59,000; 65,000. Total 468,000 |
| 2 | Semester 3 charge | Standard BSN 2025 student | 59,000 (tuition 43,000, clinical 8,000, annual 6,000, promotion 2,000) |
| 3 | Merit concession | 20 percent of tuition 43,000 | -8,600. Net 50,400 |
| 4 | Fixed concession | Staff child, 10,000 off per term | Net 49,000 |
| 5 | Ayesha, Semester 2 | Posted 1 Mar 2027, plan BSN 2026 v1 | Fee charge 47,000, merit -9,000, net 38,000, due 16 Mar 2027, billing session 2027 |
| 6 | Credit applied | Ayesha with 5,000 credit | Unpaid 33,000, balance 33,000 |
| 7 | Annual rule, 2 per year | BSN to Semester 4. BSN to Semester 5 | No annual charge. Annual charge included |
| 8 | Annual rule, 1 per year | LHV, Year 1 to Year 2 | The annual component is included every year |
| 9 | Last term | BSN student promoted into Semester 8. Student in Semester 8 | Charge includes the degree fee (65,000). Promotion unavailable, completion offered |
| 10 | Earlier-term concession | Sibling waiver for Term 1 only | Not repeated in Semester 2 |
| 11 | Charge already exists | Semester 3 charged, student still in Semester 2 | Status "Move term only". Posting moves the term and posts no charge |
| 12 | Already promoted | Student already in the target term | Blocked |
| 13 | Excluded students | Struck off, on leave, completed, no fee plan, final term | Cannot be promoted, each with its reason |
| 14 | Two terms behind | Student in Semester 1, batch calendar Semester 3 | Moves to Semester 2 only. Still behind. A second run moves to Semester 3 |
| 15 | Early promotion | Target term starts 1 Mar 2027, checked on 9 Oct 2026 | Warning. Needs the tick box |
| 16 | Batch totals | 34 standard, 4 merit, 2 staff child | Fee charges 2,360,000, concessions -54,400, net 2,305,600 |
| 17 | Batch credit | 3 students with 14,000 credit in total | New dues 2,291,600 |
| 18 | Run twice | The same batch and from-term run twice | No second charge for anyone. The second run reports "Already promoted" |
| 19 | Resume | A run stops after 22 of 41 students | Resume completes the other 19. No duplicates |
| 20 | Changed since preview | A student's term changes after the preview | Skipped with "Changed since the preview" |
| 21 | One student fails | An error while saving a student's concession entry | No charge and no term change for that student. Listed as Failed. Others continue |
| 22 | Overdue | Overdue 53,000, no block setting. Block set at 10,000 | Warning only. Blocked, with Admin override |
| 23 | Due date | Default. A date before today | Posting date plus 15 days. Rejected |
| 24 | Billing session | Term starting 1 Mar 2027. Batch with no schedule | 2027. The Current session, with a note |
| 25 | Zero net fee | Concessions equal the fee charge | Charge and concessions posted, net 0, term moves |
| 26 | Hold back | 10 students, 1 held back, 9 promoted | The batch is not "due". After release it is due again |
| 27 | Undo one | No payment on the new charge. A payment of 20,000 allocated | Charge and concessions reversed, term restored, credit returned. Blocked |
| 28 | Undo window | Accountant on day 8. Admin on day 8 | Blocked. Allowed |
| 29 | Undo a batch | 40 promoted, 3 with payments allocated | 37 undone, 3 listed as cannot undo. Run "Partly undone" |
| 30 | Bill current term | A student in Semester 3 with no Semester 3 charge | Charge posted, term stays Semester 3, promotion record type "Billed current term" |
| 31 | Selection mode | 12 students from 2 batches | Each moves one term. Billing session is worked out per student |

## 46. Effects on the other documents

| Document | What to update |
| --- | --- |
| `PAYMENTS_RECEIPTS_LEDGER_DESIGN.md` | Section 45: reversing an entry that has no cash effect (a fee charge or concession with no payment allocated) is not blocked by a closed day. **This change is already made.** |
| `BATCHES_ACADEMIC_SETUP_DESIGN.md` | Section 18.3: held-back students are not counted as behind schedule. **This change is already made.** The batch page's **Open batch promotion** button uses the wizard's address options. |
| `LOGIN_DASHBOARD_STUDENTS_DESIGN.md` | The profile's Promote button states and the Held back badge (section 38.1). The Term history card on the Fees tab. The bulk bar's **Batch promotion** opens selection mode. Needs attention: "A promotion run was interrupted" and "Students are held back". The filter "No fee charge for current term" gets a **Bill current term** action. |
| `FRONTEND_DESIGN.md` | Sidebar (section 31), routes, and components (section 42.1). The profile's older "Promote" button text now follows section 38.1. |
| `FEE_TEMPLATES_AND_ADMISSION_DESIGN.md` | Section 16 is the summary. This document is the detailed design. The billing session rule (section 7.4 here) is new. |

## 47. Open decisions

Defaults below are adopted in this draft. Change any that do not suit the institute.

| # | Question | Default adopted |
| --- | --- | --- |
| 1 | Do overdue dues block promotion? | No. A warning. A setting can block above an amount. |
| 2 | How long can a promotion be undone? | 7 days for an Accountant, any time for an Admin, if no payment has been allocated to the new charge. |
| 3 | Can a promotion move more than one term at once? | No. |
| 4 | Billing session for a later term | The session whose year contains the term's start date. |
| 5 | Can a batch run edit one student's amounts? | No. Use the individual page. |
| 6 | Should a student's session change on promotion? | No. The student keeps their intake session. |
| 7 | Can promotion be scheduled to run later? | No, not in this release. |
| 8 | Hold back reasons | Failed exams, Fees pending, Medical, Disciplinary, Other. |
| 9 | Who can run a batch promotion? | Admin and Accountant. |
| 10 | Early promotion | Allowed with a tick box. |

## 48. Suggested build order

1. **Fee engine: the next-term charge** (components, concessions, credit, due date, billing session) with the tests in section 45.
2. **The per-student promotion save** (section 10), with the duplicate guard and the "changed since" checks.
3. **Individual promotion page,** blocked states, success screen, and the profile button and term history card.
4. **Batch preview** (statuses, totals) and the review screen.
5. **Run engine:** run record, per-student posting, progress, stop, resume, and re-run safety.
6. **Result, print and export.**
7. **Hold back and release,** including the batch "due" rule change.
8. **Undo:** single, then batch.
9. **Promotion page and history,** then the links from the batch page, directory and dashboard.
10. **Bill current term and selection mode.**

Steps 1 and 2 come first, because every screen depends on the charge being right and on a student never being charged twice.
