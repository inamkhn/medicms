# MediCMS Desktop: Batches and Academic Setup

**Document type:** Improved design and scope, with detailed frontend design
**Version:** Draft 1
**Date:** 10 October 2026
**Covers:** Feature 1 (Programs and Academic Structure), Feature 2 (Sessions), Feature 3 (Batches), Feature 4 (Setup Health and Moving Existing Data), and the frontend design for all four
**Replaces:** the "Supported courses and academic structure" and "Batches" parts of `APPLICATION_SCOPE.md`
**Related:** `FEE_TEMPLATES_AND_ADMISSION_DESIGN.md` (sections 5.1, 5.4 and 13), `LOGIN_DASHBOARD_STUDENTS_DESIGN.md` (sections 17, 22 and 25), `PAYMENTS_RECEIPTS_LEDGER_DESIGN.md`, `FRONTEND_DESIGN.md`

---

## Decisions assumed

These choices shape the whole design. Change any that do not suit the institute.

| # | Decision | Assumed answer |
| --- | --- | --- |
| 1 | Where do courses and programs live? | As data that an Admin can edit, seeded with today's list. Today they are fixed in the code. |
| 2 | How is "terms per year" set? | Per program, chosen from 1, 2, 3, 4, 6 or 12. Term length is worked out as 12 ÷ terms per year months. |
| 3 | What does "session" mean? | An academic year label such as 2026. A batch's session is its **intake session**, the year it started. |
| 4 | How is a batch's state shown? | A status (Planned, Running, Completed) plus a separate **Admissions open / closed** switch. This replaces enable and disable. |
| 5 | How are students tied to a batch? | By the batch's ID, not its name, so a rename updates everything. |
| 6 | Does a batch have a calendar? | Yes. A Term 1 start date creates an editable term schedule, which shows when a promotion is due. |
| 7 | How long after a term starts is a promotion "due"? | After 7 days (a setting). |

---

## 1. Purpose and what changes

Students are organised by course, program, session, batch and term. Every other module depends on this structure: the admission form, fee templates, the student directory, promotion, imports and reports. The current setup works but has gaps that cause real problems.

| Today | New design |
| --- | --- |
| Courses, programs, term counts and labels are fixed in the code. | Courses and programs are data. An Admin can add, edit and disable them. They start with today's list. |
| The session list is fixed at 2017 to 2028. | Sessions are managed. One is marked Current, and old ones can be closed. |
| A batch is a name, a program, a session and an on/off switch. | A batch also has a status, an admissions switch, seats, a Term 1 start date, a term schedule and a fee template check. |
| Renaming a batch does not update its students, because they store the name. | Students link to the batch by ID. A rename updates every screen. Names that match nothing are fixed with a re-link tool. |
| A batch's session can be changed at any time. | The session is locked once the batch has students. |
| Terms per year has no screen. | It is set on each program. |
| Nothing shows whether a batch has a fee template, how many students it has, or what it owes. | A batch page shows students, fees, dues, seats and template coverage. |
| Promotion is chosen by hand, and nothing says when it is due. | The term schedule shows which batches are due for promotion. |

## 2. Wording used in this document

| Term | Meaning |
| --- | --- |
| **Course** | A group of programs, for example Paramedics or BS Nursing. |
| **Program** | One course of study, for example BSN or Radiology. |
| **Term** | One teaching period: a semester, a year, or a term, depending on the program. |
| **Term system** | Whether a program counts in Semesters, Years or Terms. |
| **Terms per year** | How many terms make one academic year (1, 2, 3, 4, 6 or 12). |
| **Session** | An academic year label, for example 2026. |
| **Intake session** | The session in which a batch started. It is also the batch's session. |
| **Batch** | One group of students in one program who start together, for example BSN Fall 2026. |
| **Display name** | The batch's full name: program code, batch name and session. |
| **Seats** | The number of places planned for a batch. |
| **Calendar term** | The term a batch should be in today, according to its term schedule. |
| **Behind schedule** | A student whose current term is lower than the batch's calendar term. |
| **Due for promotion** | A batch with at least one active student behind schedule, after the grace period. |
| **Admissions open** | Whether new students can be admitted into the batch. |

## 3. Roles and permissions

| Action | Admin | Accountant | Counter operator | Viewer |
| --- | :---: | :---: | :---: | :---: |
| View academic setup pages | Yes | Yes | No (selectors only) | Yes |
| Add or edit a course or program | Yes | No | No | No |
| Add, close or reopen a session, set the current session | Yes | No | No | No |
| Create or edit a batch | Yes | No | No | No |
| Open or close admissions on a batch | Yes | Yes | No | No |
| Edit term dates | Yes | Yes | No | No |
| Mark a batch completed | Yes | Yes | No | No |
| Reopen a completed batch | Yes | No | No | No |
| Delete an unused batch, program or session | Yes | No | No | No |
| Re-link students to a batch | Yes | No | No | No |
| Print a batch roster | Yes | Yes | No | Yes |
| Use the academic selectors in other screens | Yes | Yes | Yes | Yes |

Every change is written to the audit trail with the user, the time, and the old and new values.

---

# Feature 1: Programs and Academic Structure

## 4. Goals

- Let the institute add or change a program without a software update.
- Hold, in one place, the facts other modules need: how many terms, what they are called, how many make a year, and how long each lasts.
- Keep existing students safe when a program is edited.

## 5. Course and program fields

### 5.1 Course

| Field | Notes |
| --- | --- |
| Name | Required and unique. |
| Status | Active or Disabled. |
| Order | Controls where it appears in lists. |

### 5.2 Program

| Field | Notes |
| --- | --- |
| Course | Required. |
| Name | Required. Unique within the course. |
| Short code | Up to 8 characters, unique. Used in batch names and compact tables, for example `BSN`. |
| Term system | Semester, Year or Term. |
| Number of terms | 1 to 12. |
| Terms per year | 1, 2, 3, 4, 6 or 12. |
| Term length | Shown, not typed: 12 ÷ terms per year, in months. |
| Course length | Shown, not typed: number of terms × term length. |
| Status | Active or Disabled. |
| Order | Controls where it appears in lists. |
| Notes | Optional. |

## 6. Starting data

The app starts with today's list, so nothing has to be typed in.

| Course | Programs (short code) | Term system | Terms | Terms per year | Term length |
| --- | --- | --- | ---: | ---: | --- |
| Paramedics | Health (HLT), Surgical (SUR), Pharmacy Tech (PHT), Radiology (RAD), Pathology (PAT), Cardiology (CAR), Anaesthesia (ANS), Dental (DEN), Dialysis (DIA) | Semester | 4 | 2 | 6 months |
| Pharmacy B | Cat-B (CATB) | Year | 2 | 1 | 12 months |
| PNC | LHV, CMW, CNA | Year | 2 | 1 | 12 months |
| BS Nursing | BSN | Semester | 8 | 2 | 6 months |
| Homeopathic Council | DHMS | Year | 4 | 1 | 12 months |
| Ultrasound | Ultrasound 6 Months (US6) | Term | 1 | 2 | 6 months |
| Ultrasound | Ultrasound 1 Year (US12) | Term | 2 | 2 | 6 months |

The two Ultrasound programs are assumed to have 6-month terms. This should be confirmed with the institute.

## 7. Rules

1. **Number of terms** cannot be set lower than the highest term any student is currently in.
2. **Term system** cannot change once any batch of the program has students.
3. **Terms per year** can be changed, with a warning that shows how many Active templates and running batches use the program. A student's fee plan stores the value that applied **when the student was admitted**, so a later change does not alter existing students (see the fee document, section 5.4).
4. A program with Running batches cannot be **disabled**. Complete or close those batches first.
5. A disabled program is hidden from admission, new batch and template screens, but stays visible in filters, reports and on student profiles.
6. A program or course with batches is never deleted. Only an unused one can be deleted.
7. The short code is unique and, once the program has batches, cannot change (it is part of every batch's display name).
8. Every change is audited.

## 8. Term labels

One shared helper produces every term label in the app.

| Term system | Long label | Short label | Example |
| --- | --- | --- | --- |
| Semester | Semester 3 | T3 | BSN, Semester 3 |
| Year | Year 2 | Y2 | LHV, Year 2 |
| Term | Term 1 | T1 | US12, Term 2 |

The short label is used in tight tables such as the student directory and the dashboard.

## 9. Acceptance criteria (Feature 1)

- [ ] The app starts with the programs in section 6, with no typing needed.
- [ ] An Admin can add a program, with a term system, number of terms and terms per year, and use it straight away in the admission form.
- [ ] The number of terms cannot be reduced below a student's current term.
- [ ] A program with Running batches cannot be disabled.
- [ ] Term labels are identical in every screen and print layout.
- [ ] Changing terms per year does not change any existing student's fee plan.

---

# Feature 2: Sessions

## 10. Goals

- Replace the fixed 2017 to 2028 list with sessions the institute controls.
- Always know which session is current, so new batches, admissions and templates default to it.

## 11. Session fields and states

| Field | Notes |
| --- | --- |
| Label | A year, for example `2026`. Required, unique, four digits. |
| Open or Closed | Open sessions can be used for new batches, admissions and templates. Closed ones cannot. |
| Current | One session is marked Current. It is the default everywhere and is always Open. |
| Notes | Optional. |

## 12. Rules

1. Exactly one session is Current.
2. The Current session cannot be closed. Make another session Current first.
3. Closing a session does **not** affect batches that already started in it. Their students carry on. It only stops new batches, admissions and templates from using the session.
4. A closed session can be reopened by an Admin, for example to admit a late student into an older batch.
5. A session with batches or templates cannot be deleted. An unused session can.
6. **Add next session** creates the year after the latest one.
7. Every change is audited.

## 13. Sample

| Session | State | Batches | Students |
| --- | --- | ---: | ---: |
| 2028 | Open | 0 | 0 |
| 2027 | Open | 2 | 0 |
| 2026 | **Current**, Open | 5 | 86 |
| 2025 | Closed | 6 | 171 |
| 2024 | Closed | 4 | 98 |
| 2023 and earlier | Closed | 9 | 57 |

When the data is moved from today's app, sessions 2017 to 2025 become Closed, 2026 becomes Current, and 2027 and 2028 become Open.

## 14. Acceptance criteria (Feature 2)

- [ ] The session list is managed in the app, not fixed in the code.
- [ ] There is always exactly one Current session.
- [ ] The Current session cannot be closed.
- [ ] Closing a session leaves its running batches and their students untouched.
- [ ] A closed session does not appear in the admission, new batch or new template screens.

---

# Feature 3: Batches

## 15. Goals

- One page that shows every batch, its students, its seats, its fee template and whether a promotion is due.
- Rules that stop common mistakes: duplicate names, a batch started in the wrong session, a batch with no fee template.
- Safe renaming, closing and completing.

## 16. Batch fields

| Field | Notes |
| --- | --- |
| Program | Required. Active programs only. Cannot change after the batch is created. |
| Session | Required. Open sessions only. **Locked** once the batch has students. |
| Name | Optional, up to 30 characters, for example `Fall`, `Spring`, `Evening`. Leave empty if the program has one batch per session. Unique within the program and session, ignoring capital letters. |
| Display name | Automatic: program code, name, session. For example `BSN Fall 2026`, or `LHV 2025` when there is no name. |
| Status | Planned, Running or Completed (section 17). |
| Admissions | Open or Closed. |
| Seats | Optional whole number. |
| Term 1 start date | Needed for the schedule. Required before the batch can be Running. |
| Term schedule | Generated from the start date and editable (section 18). |
| Notes | Optional. |
| Created by, changed by | Recorded. |

## 17. Status and admissions

| Status | Meaning |
| --- | --- |
| **Planned** | Created, but the Term 1 start date is in the future or not yet set. Admissions can be taken. |
| **Running** | The Term 1 start date has arrived. Becomes Running automatically. |
| **Completed** | Marked by an Admin or Accountant when the batch has finished. Admissions are forced Closed. Hidden from selectors unless asked for. |

**Admissions open or closed** is a separate switch:

- A new batch starts with admissions Open.
- Closed means the batch no longer appears in the admission screen. It still appears everywhere else, and its students still get fee charges and promotion.
- When the seats are full the app suggests closing admissions. It never closes them by itself.

**Marking a batch completed**

- Shows how many students are still Active.
- Offers a tick box "Mark the remaining Active students as Completed". If it is not ticked, they stay Active and the batch shows a warning.
- The batch can be reopened by an Admin, with a reason.

**Deleting a batch** is allowed only if it has no students, no fee plans and no template pointing to it. Otherwise close admissions or complete it.

## 18. Term schedule and promotion due

### 18.1 Generating the schedule

- The schedule is built from the **Term 1 start date** and the program's term length.
- Term N starts (N − 1) × term length months after Term 1, on the same day of the month. Each term ends the day before the next one starts.
- Every start date can be edited by an Admin or Accountant, as long as dates stay in order and do not overlap. Each edit is audited with the old and new date.

### 18.2 Calendar term

- The **calendar term** is the highest term whose start date has passed.
- Before Term 1 starts the batch shows "Not started".
- After the last term has ended the batch shows "Finished", and the app suggests marking it completed.

### 18.3 Due for promotion

- A student is **behind schedule** if their current term is lower than the batch's calendar term. Students who are **held back** (see the Promotion document) are not counted.
- A batch is **due for promotion** when at least one Active student is behind schedule, and the calendar term started more than 7 days ago (a setting).
- The batch list, the batch page, the dashboard's Needs attention panel and batch promotion all use this same rule.
- Batch promotion (designed next) uses the schedule to suggest the target term and the due date.

### 18.4 Sample schedule

BSN Fall 2026: Term 1 starts 1 September 2026, 6-month terms, 8 semesters.

| Term | Starts | Ends |
| --- | --- | --- |
| Semester 1 | 1 Sep 2026 | 28 Feb 2027 |
| Semester 2 | 1 Mar 2027 | 31 Aug 2027 |
| Semester 3 | 1 Sep 2027 | 29 Feb 2028 |
| Semester 4 | 1 Mar 2028 | 31 Aug 2028 |
| Semester 5 | 1 Sep 2028 | 28 Feb 2029 |
| Semester 6 | 1 Mar 2029 | 31 Aug 2029 |
| Semester 7 | 1 Sep 2029 | 28 Feb 2030 |
| Semester 8 | 1 Mar 2030 | 31 Aug 2030 |

## 19. Seats

- The batch shows "Admitted 41 of 50" with a small meter. The meter turns amber at 90 percent.
- Seats cannot be set lower than the number of students already in the batch.
- When a batch is full, a counter operator cannot admit another student into it. An Admin can, with a reason, and the override is audited.
- Struck-off students still count toward the admitted total. Completed students do too.

## 20. Fee template coverage

For each batch the app finds the template that would apply, using the rule in the fee document: a template for this exact batch wins, otherwise the template for the program and session with "All batches".

| Result | Shown as |
| --- | --- |
| A matching Active template | The template name and version, for example `BSN 2025 v3`. |
| No Active template | A warning "No active fee template", with a **Create template** button that opens the template editor with the program, session and batch already filled in. |

A batch with admissions Open and no Active template cannot admit students, so this appears in Needs attention.

## 21. Rename, change, close and complete

| Action | Rule |
| --- | --- |
| **Rename** | Allowed at any time. Students link by ID, so nothing is rewritten. A dialog shows how many students and templates use the batch. Printed documents keep the old name. |
| **Change session** | Allowed only while the batch has no students. After that it is locked. If a student was put in the wrong batch, use "Correct batch or session" on the student (Admin). |
| **Change program** | Not allowed. Create a new batch. |
| **Close admissions** | Immediate, with an optional note. |
| **Reopen admissions** | Not allowed on a Completed batch or a Closed session. |
| **Mark completed** | See section 17. |
| **Reopen a completed batch** | Admin only, with a reason. |
| **Delete** | Only if unused (section 17). |

## 22. Batch statistics

Shown on the batch page and used for the batch list:

| Figure | Definition |
| --- | --- |
| Students by status | Active, On leave, Completed, Struck off, Total. |
| Seats | Admitted ÷ seats. |
| Students by term | How many are in each term, for example "T2: 43". |
| Calendar term | From the schedule. |
| Outstanding | Sum of positive balances for the batch's Active students. |
| Overdue | The overdue part of that. |
| Credit held | Sum of credit balances. |
| Collected this month | Payments in the current month from the batch's students. |
| Fee plans by template version | For example "v3: 40, v2: 3". |

## 23. Sample batches

Position on 9 October 2026:

| Batch | Status | Admissions | Students (active / total) | Seats | Students' term / Calendar term | Fee template |
| --- | --- | --- | --- | --- | --- | --- |
| BSN Fall 2026 | Running | Open | 41 / 41 | 41 of 50 | T1 / T1 | BSN 2026 v1 |
| BSN Fall 2025 | Running | Closed | 43 / 44 | 44 of 50 | T2 / T3, **promotion due** | BSN 2025 v3 |
| BSN Spring 2025 | Running | Closed | 50 / 52 | 52 of 55 | T3 / T4, **promotion due** | BSN 2025 v3 |
| BSN Fall 2024 | Running | Closed | 36 / 38 | 38 of 40 | T5 / T5 | BSN 2024 v2 |
| RAD Fall 2025 | Running | Closed | 25 / 25 | 25 of 30 | T2 / T3, **promotion due** | **No active template** |
| LHV 2025 | Running | Open | 30 / 30 | 30 of 35 | Y1 / Y1 | LHV 2025 v1 |
| CMW 2024 | Running | Closed | 21 / 22 | 22 of 25 | Y2 / Y2 | CMW 2024 v1 |
| BSN Fall 2022 | Completed | Closed | 0 / 33 | 33 of 35 | Finished | BSN 2022 v1 |

Term 1 start dates behind these rows: BSN Fall 2025 on 1 Sep 2025, BSN Spring 2025 on 1 Mar 2025, BSN Fall 2024 on 1 Sep 2024, RAD Fall 2025 on 1 Sep 2025, LHV 2025 on 1 Nov 2025, CMW 2024 on 1 Nov 2024.

## 24. Acceptance criteria (Feature 3)

- [ ] A batch cannot be created with a name that already exists for the same program and session, ignoring capital letters.
- [ ] The display name is built automatically from the program code, name and session.
- [ ] The term schedule matches the sample in section 18.4, and edited dates must stay in order.
- [ ] The calendar term, behind-schedule and due-for-promotion results match the test cases in section 45.
- [ ] Renaming a batch changes its name on every screen and print layout without changing any student record.
- [ ] A batch's session cannot be changed after it has students.
- [ ] Seats cannot be set lower than the admitted count, and a counter operator cannot admit into a full batch.
- [ ] Marking a batch completed shows the remaining Active students and offers to complete them.
- [ ] Each batch shows its matching fee template, or a warning and a **Create template** button.
- [ ] An unused batch can be deleted. A used batch cannot.

---

# Feature 4: Setup Health and Moving Existing Data

## 25. Setup health checks

A list of problems in the academic setup that need attention. It appears at the top of the Academic setup page, and its counts feed the dashboard's Needs attention panel.

| Check | Shown when | Fix |
| --- | --- | --- |
| No current session | No session is marked Current. | Set one. |
| Batch with no fee template | A Running or Planned batch has no Active template. Urgent when admissions are Open. | Create template. |
| Batch with no Term 1 start date | The batch has no start date, so it has no schedule. | Add the date. |
| Batch due for promotion | Section 18.3. | Open batch promotion. |
| Seats full, admissions open | Admitted equals seats and admissions are Open. | Close admissions. |
| Batch looks finished | The calendar says "Finished", or every student is Completed or Struck off, and the batch is not Completed. | Mark completed. |
| Students linked to an unknown batch | After moving the data, some students' saved batch names match no batch. | Re-link students. |

## 26. Moving existing data

### 26.1 Mapping from today's app

| Today | Becomes |
| --- | --- |
| Courses and programs in the code | Course and program records, as in section 6. |
| Sessions 2017 to 2028 | Session records. 2026 is Current. 2017 to 2025 are Closed. 2027 and 2028 are Open. |
| Batch, active | Running, admissions Open. |
| Batch, disabled | Running, admissions Closed. |
| Batch with no students and disabled | Running, admissions Closed, and a "Batch looks finished" health item. |
| Batch name, program and session | Kept. A batch's Term 1 start date is empty, so each shows "No start date". |
| A student's saved batch name | Matched to a batch by program, name and session. If only program and name match one batch, that batch is used. |

### 26.2 Re-link tool (Admin only)

- Lists every saved batch name that matched no batch, with the number of students and their program.
- For each name, the Admin chooses the right batch, or creates one.
- A preview shows how many students will be linked.
- Applying it links the students and writes one audit entry per student.
- It can also be used later, for example after a spelling mistake in an import.

## 27. Acceptance criteria (Feature 4)

- [ ] The setup health list shows the checks in section 25 with live counts.
- [ ] Each item opens the screen that fixes it, with the right filter or form already prepared.
- [ ] After the data is moved, no student is left without a batch link unless it appears in the re-link tool.
- [ ] The re-link tool shows a preview and writes an audit entry for each student.
- [ ] The dashboard's Needs attention panel shows the counts for promotion due and missing templates.

---

# Frontend Design

These screens use the design system in `FRONTEND_DESIGN.md`: colours, fonts, money and date formats, tables, drawers, dialogs, toasts and the permission hook. Only what is new is described here.

## 28. Navigation and routes

**Sidebar.** In the Operations group, **Batches** is replaced by **Academic setup**. Fee templates stays beside it. Counter operators do not see it.

| Route | Screen | Permission |
| --- | --- | --- |
| `/academic` | Redirects to `/academic/batches` | `academic.view` |
| `/academic/batches` | Batches tab | `academic.view` |
| `/academic/batches/:id` | Batch page. Tab in the address: `?tab=students`, `schedule`, `fees`, `history` | `academic.view` |
| `/academic/programs` | Programs tab | `academic.view` |
| `/academic/sessions` | Sessions tab | `academic.view` |
| `/academic/relink` | Re-link students | `academic.relink` |
| `/batches` | Old address. Redirects to `/academic/batches` | |

Creating or editing a batch, program or session opens a **drawer** or **dialog** over the current page, so no extra routes are needed. The list filters, sort and view are kept in the address, for example `/academic/batches?session=2025&program=BSN&status=running`. This lets the dashboard link straight into a filtered list.

## 29. Academic setup page

### 29.1 Layout

```text
Academic setup                                                    [+ New batch]
Current session 2026  |  Running batches 14  |  Admissions open 5  |  Active students 412

+-- Setup health (4) -----------------------------------------------------------+
| (!) 3 batches are due for promotion                          [View batches]   |
| (!) RAD Fall 2025 has no active fee template                  [Create template]|
| (!) 2 batches have no Term 1 start date                        [Add dates]     |
| (i) BSN Fall 2022 looks finished                               [Complete]      |
+-------------------------------------------------------------------------------+

 Batches 18   |   Programs 17   |   Sessions 12
-------------------------------------------------------------------------------
 (tab content)
```

### 29.2 Behaviour

| Element | Behaviour |
| --- | --- |
| Summary strip | Four figures, each a link: current session (opens Sessions), running batches (batch list filtered to Running), admissions open (filtered to Open), active students (student directory). |
| Setup health panel | Section 37. Collapses to a single line "4 items need attention" and remembers the choice. When there are none it shows a green tick and "Setup looks good." |
| Tabs | Underlined tabs with counts. The tab is kept in the address. |
| New batch button | Visible to Admin only. Opens the batch drawer. On the Programs tab it changes to **New program**, and on Sessions to **Add session**. |
| Viewer and Accountant | See the same pages. Buttons they cannot use are hidden, and the page header shows "View only" for a Viewer. |

### 29.3 Badges used on these pages

| Badge | Colour | Where |
| --- | --- | --- |
| Planned | Amber outline | Batch status |
| Running | Green | Batch status |
| Completed | Blue-grey | Batch status |
| Admissions open | Green outline | Batch |
| Admissions closed | Grey | Batch |
| Promotion due | Amber | Batch |
| No template | Red outline with a warning icon | Batch |
| Full | Red | Seats |
| Current | Brand teal | Session |
| Open | Green outline | Session |
| Closed | Grey | Session |
| Disabled | Grey | Program, course |

## 30. Getting started

When there is no Running or Planned batch, or no Active fee template for one, the Batches tab shows a checklist in place of the empty table.

```text
Get ready for your first admission
Four steps. The first two are already done for you.

 [x] 1  Programs      17 programs are ready.                    [Review programs]
 [x] 2  Sessions      2026 is the current session.              [Review sessions]
 [ ] 3  First batch   Create a batch, for example BSN Fall 2026.   [Create batch]
 [ ] 4  Fee template  Add the fees for that program and session.   [Open fee templates]
                                                               [Hide this checklist]
```

- A step becomes ticked when its condition is true. Step 4 stays open until the new batch has an Active template.
- The checklist disappears once all four steps are done, and can be hidden earlier.

## 31. Batches tab

### 31.1 List

```text
[ Search batches...               ]  [Session v] [Course v] [Program v] [Status v] [Admissions v]
[x] Hide completed       View: [Table | By program]                              Clear all

+-------------------------------------------------------------------------------------------+
| Batch            Status   Admissions  Students    Seats               Term       Fee template |
| BSN Fall 2026    Running  Open        41 / 41     41 of 50 [=====-]   T1 / T1    BSN 2026 v1  |
|  BS Nursing, 2026                                                                            |
| BSN Fall 2025    Running  Closed      43 / 44     44 of 50 [=====-]   T2 / T3    BSN 2025 v3  |
|  BS Nursing, 2025                                  (!) Promotion due                          |
| RAD Fall 2025    Running  Closed      25 / 25     25 of 30 [=====-]   T2 / T3    (!) No template|
|  Paramedics, 2025                                  (!) Promotion due                          |
| LHV 2025         Running  Open        30 / 30     30 of 35 [=====-]   Y1 / Y1    LHV 2025 v1  |
|  PNC, 2025                                                                                   |
| BSN Fall 2022    Completed Closed      0 / 33     33 of 35 [=====-]   Finished   BSN 2022 v1  |
+-------------------------------------------------------------------------------------------+
Showing 18 batches                                                      Rows: [20 v]
```

### 31.2 Columns

| Column | Content |
| --- | --- |
| Batch | Display name in bold. Under it, in grey, the course and session. |
| Status | Planned, Running or Completed badge. |
| Admissions | Open or Closed badge. |
| Students | Active ÷ total, for example `43 / 44`. Clicking opens the batch's Students tab. |
| Seats | "44 of 50" and a small meter. The meter is green, amber from 90 percent, and red with a **Full** badge at 100 percent. Blank if seats are not set. |
| Term | Students' term ÷ calendar term, for example `T2 / T3`. A **Promotion due** badge appears below it when the rule in section 18.3 is true. If students are in several terms it shows the lowest and highest, for example `T2-T3 / T3`. |
| Fee template | The matching template and version, or a red **No template** badge. |

### 31.3 Behaviour

| Element | Behaviour |
| --- | --- |
| Search | Matches display name, program, course, session and notes. |
| Filters | Session, Course, Program, Status and Admissions. Each narrows the next, using the academic selector rules (section 38). **Clear all** resets them. |
| Hide completed | Ticked by default. The list shows how many completed batches are hidden. |
| Sort | Default: session (newest first), then program order, then name. Clickable headers: batch, status, students, seats. |
| Row click | Opens the batch page. |
| Row quick actions | On hover: **Open**, **Edit**, and a menu. |
| Row menu | Open, Edit, Close admissions or Reopen admissions, Open batch promotion (when due), Print roster, Mark completed, Reopen (Completed batches), Delete (unused batches). Items the user may not use are hidden. |
| Loading | Eight skeleton rows. |
| No match | "No batches match these filters." with **Clear filters**. |
| Error | A danger banner with **Retry**. |

### 31.4 By program view

Groups batches under their program, each group collapsible.

```text
v BS Nursing, BSN        4 running batches, 186 active students              [+ Batch]
     BSN Fall 2026     Running  Open    41 / 41   T1 / T1   BSN 2026 v1
     BSN Fall 2025     Running  Closed  43 / 44   T2 / T3   BSN 2025 v3   (!) Promotion due
     BSN Spring 2025   Running  Closed  50 / 52   T3 / T4   BSN 2025 v3   (!) Promotion due
     BSN Fall 2024     Running  Closed  36 / 38   T5 / T5   BSN 2024 v2
> Paramedics, Radiology (RAD)   1 running batch, 25 active students
> PNC, LHV   1 running batch, 30 active students
```

The group's **+ Batch** button opens the batch drawer with the program already chosen.

## 32. Batch drawer (create and edit)

A right-hand drawer, 480 px wide. Admin only.

### 32.1 Create

```text
New batch                                                        [x]
--------------------------------------------------------------------
Program *       [BSN, BS Nursing v]
Session *       [2026 v]    (Current)
Batch name      [Fall____________]   Suggestions: Fall  Spring  Evening  Morning
Display name    BSN Fall 2026                          <- updates as you type
--------------------------------------------------------------------
Term 1 starts * [1 Sep 2026]
                8 semesters, 6 months each. The course ends on 31 Aug 2030.
Seats           [50]   (optional)
Admissions      (o) Open   ( ) Closed
Notes           [_____________________________________]
--------------------------------------------------------------------
Term schedule   [Show schedule v]            <- expands the table from section 18.4
Fee template    [ok] BSN 2026 v1 will be used for admissions.
                (or) [!] No active fee template for BSN, 2026.  [Create template]
--------------------------------------------------------------------
                                         [Cancel]   [Create batch]
```

### 32.2 Behaviour

| Element | Behaviour |
| --- | --- |
| Program | A searchable list of Active programs, grouped by course. |
| Session | Open sessions only. The Current session is preselected and tagged. |
| Batch name | Optional. The suggestions come from Settings and fill the box when clicked. |
| Display name | A live preview in bold. Shows "Name already used" in red when it clashes. |
| Term 1 starts | A date picker. Beside it, one line explains the program's structure and the end date, for example "8 semesters, 6 months each. The course ends on 31 Aug 2030." |
| Status | Not typed. If the date is in the future the drawer shows a grey note "Status will be Planned until 1 Sep 2026." |
| Seats | Whole numbers only. |
| Term schedule | Collapsed by default. Expanding shows the generated table with editable dates. |
| Fee template line | Checks as soon as program and session are chosen. A missing template shows a warning, not an error, so the batch can still be created. |
| Save | **Create batch** is disabled until Program, Session and Term 1 start date are filled and the name is not a duplicate. After saving, a toast offers **Open batch**. |
| Leaving | Closing the drawer with entered data asks "Discard this batch?". |

### 32.3 Edit

Same layout, with these changes:

```text
Edit batch: BSN Fall 2025                                        [x]
--------------------------------------------------------------------
Program         BS Nursing, BSN  [lock]        Locked after creation.
Session         2025  [lock]                    Locked: 44 students.
Batch name      [Fall____________]   Display name BSN Fall 2025
Term 1 starts   [1 Sep 2025]
Seats           [50]    44 admitted. Seats cannot go below 44.
Admissions      ( ) Open   (o) Closed
Notes           [_____________________________________]
Term schedule   [Show schedule v]
--------------------------------------------------------------------
Reason for change *  [Correcting a typing mistake v]
                                         [Cancel]   [Save changes]
```

- A lock icon on Program and Session has a tooltip. For Session: "A batch's session cannot change after students are admitted. If a student is in the wrong batch, use Correct batch or session on the student."
- Changing the name opens the rename dialog (section 34.1) instead of saving straight away, so the impact is shown.
- Changing the Term 1 start date asks whether to **regenerate the schedule** (replacing any edited dates) or **keep the edited dates**.
- Changed fields get a small dot. Save is disabled until something has changed and a reason is chosen.

## 33. Batch page

### 33.1 Header

```text
< Academic setup / Batches
BSN Fall 2025                     [Running] [Admissions closed]    [Edit] [More v]
BS Nursing, BSN  |  Session 2025  |  8 semesters, 6 months each
Calendar: Semester 3 from 1 Sep 2026
(!) Promotion due: 43 active students are still in Semester 2.     [Open batch promotion]

 Overview | Students | Term schedule | Fees and template | History
```

The **More** menu holds: Close or Reopen admissions, Print roster, Mark completed, Delete (unused only). The warning banner only appears when a promotion is due. The header stays visible when scrolling, in a compact form.

### 33.2 Overview tab

```text
+-- Students ----------+  +-- Seats ------------+  +-- Fees (this batch) ---------------+
| Active          43   |  | 44 of 50            |  | Outstanding        1,420,000     |
| On leave         0   |  | [========--]        |  |  of which overdue    980,000     |
| Completed        0   |  | Admissions closed   |  | Credit held           12,000     |
| Struck off       1   |  +---------------------+  | Collected (Oct)      310,000     |
| Total           44   |                           +----------------------------------+
+----------------------+
+-- Term position -----------------------------------+  +-- Fee template ------------+
| Calendar term       Semester 3 (from 1 Sep 2026)    |  | BSN 2025 v3   [Active]     |
| Students by term    T2: 43    T3: 0                 |  | Matches this batch.        |
| Promotion           Due for 38 days                 |  | [Open template]            |
|                     [Open batch promotion]          |  +----------------------------+
+-----------------------------------------------------+
```

| Card | Behaviour |
| --- | --- |
| Students | Each row is a link to the Students tab filtered by that status. |
| Seats | A wider version of the list's meter, with the admissions state under it. |
| Fees | Figures defined in section 22. **Outstanding** opens the Students tab filtered to With dues. |
| Term position | Shows how far students are behind the calendar. The button opens batch promotion with this batch chosen. |
| Fee template | The matching template, or a red warning and **Create template**. |

### 33.3 Students tab

The student directory table, filtered to this batch and with the batch filter locked.

```text
[ Search in this batch...         ]  [Status v] [Term v] [More filters v]
All 44 | Active 43 | With dues 31 | Overdue 28 | Credit 3 | Struck off 1
-------------------------------------------------------------------------------
[ ] SNO   Student            Term  Phone      Balance         Last paid    Status
[ ] 0801  Aiman Fatima        T2 Behind   0300-...   12,000 Overdue  22 Sep 2026  Active
[ ] 0802  Hassan Raza         T2 Behind   0321-...   Clear           30 Sep 2026  Active
```
(The table uses the same columns, tabs, selection and bulk actions as the Students directory.)

- Bulk actions include **Promote selected** (opens batch promotion with those students), **Print roster**, and the usual export and strike-off actions.
- Behind-schedule students show a small amber "Behind" tag beside their term.

### 33.4 Term schedule tab

```text
Term schedule                           [Edit dates]   [Regenerate from Term 1 date]
Term 1 starts 1 Sep 2025.  6-month terms.

Term        Starts        Ends          Status      Charged
Semester 1  1 Sep 2025    28 Feb 2026   Done        43 of 43
Semester 2  1 Mar 2026    31 Aug 2026   Done        43 of 43
Semester 3  1 Sep 2026    28 Feb 2027   Current     0 of 43   [Open batch promotion]
Semester 4  1 Mar 2027    31 Aug 2027   Upcoming    -
...
Semester 8  1 Mar 2029    31 Aug 2029   Upcoming    -
```

| Element | Behaviour |
| --- | --- |
| Status | Done (past), Current (the calendar term), Upcoming. |
| Charged | How many Active students have a fee charge for that term. For the Current term, a shortfall is highlighted in amber. |
| Edit dates | Turns the start dates into date pickers. End dates update automatically. Dates must stay in order. Saving asks for a reason and writes an audit entry. |
| Regenerate | Rebuilds every date from Term 1, after a confirmation that edited dates will be replaced. |
| Not started | A batch whose Term 1 has not begun shows "Starts in 84 days" above the table. |
| Finished | After the last term ends, the table shows "Course finished" and a **Mark completed** button. |

### 33.5 Fees and template tab

```text
+-- Matching fee template ---------------------------------------------+
| BSN 2025 v3    [Active]    Applies to: BSN, session 2025, all batches   |
| Course total 468,000 (refundable 10,000)                  [Open template]|
+----------------------------------------------------------------------+
+-- Student fee plans --------------------------------------------------+
| Copied from version:   v3: 40 students    v2: 3 students              |
| Students with a concession: 9                      [View in Students]  |
| Students without a fee plan: 0                                         |
+----------------------------------------------------------------------+
```

- If no template matches, the first card is replaced by a red warning and **Create template**, which opens the template editor with course, program, session and batch filled in.
- "Students without a fee plan" is a link that opens the Students tab filtered to those students. After moving the old data or an import this number can be above zero.

### 33.6 History tab

An audit list for this batch, newest first, with who, when and what changed.

| When | User | Change |
| --- | --- | --- |
| 9 Oct 2026, 10:05 | Dr. Imran Shah | Admissions closed. Note: Seats nearly full. |
| 1 Sep 2026 | Dr. Imran Shah | Term 3 start date: 1 Sep 2026 (generated). |
| 14 Jul 2025 | Dr. Imran Shah | Created. Seats 50. Term 1 starts 1 Sep 2025. |

Expandable rows show old and new values. A filter lets the user show only schedule changes.

## 34. Batch dialogs

### 34.1 Rename

```text
+---------------------------------------------------------+
| Rename batch                                             |
| Name   Fall  ->  [Autumn____________]                    |
| Display name changes from "BSN Fall 2025" to             |
|                           "BSN Autumn 2025".             |
|                                                          |
| This affects:  44 students   1 fee template   3 saved views |
| (i) Students are linked to the batch, not its name, so   |
|     every screen shows the new name straight away.       |
|     Documents already printed keep the old name.         |
| Reason *  [Clearer name v]                               |
|                              [Cancel]   [Rename batch]    |
+---------------------------------------------------------+
```

### 34.2 Close or reopen admissions

A small dialog with an optional note. Closing shows "BSN Fall 2025 will no longer appear in the admission form. Its students are not affected." Reopening is blocked for a Completed batch or a Closed session, and the dialog says why.

### 34.3 Mark completed

```text
+---------------------------------------------------------+
| Mark BSN Fall 2022 as completed?                         |
| Students     Active 3   Completed 29   Struck off 1       |
|                                                          |
| [x] Mark the 3 remaining Active students as Completed    |
| (!) If you leave this unticked, they stay Active and the |
|     batch will show a warning.                           |
| Admissions will be closed.                               |
|                           [Cancel]   [Mark completed]    |
+---------------------------------------------------------+
```

### 34.4 Reopen a completed batch (Admin)

Asks for a reason. After reopening, the batch is Running with admissions Closed.

### 34.5 Delete a batch

Only enabled for an unused batch. The dialog says "This batch has no students, fee plans or templates. It will be deleted permanently." For a used batch the **Delete** item is hidden and the batch page's More menu shows "Cannot delete: 44 students" as a disabled item with a tooltip.

### 34.6 Re-link students (Admin)

A full page at `/academic/relink`, opened from the setup health item.

```text
Re-link students
12 students have a batch name that matches no batch.

Saved batch name   Program   Students   Link to
"BSN Fall-2025"    BSN       7          [BSN Fall 2025 v]        <- suggested match
"Rad Batch 1"      RAD       5          [Choose a batch v]  [+ New batch]

Preview: 7 students will be linked. 5 still need a batch.
                                       [Cancel]   [Apply 7 links]
```

- Suggested matches come from similar names within the same program.
- Applying links the chosen students, writes an audit entry for each, and shows a result with the number linked and any left over.

## 35. Programs tab

### 35.1 List

```text
Programs                                           [+ New course]  [+ New program]
Course: Paramedics  (9 programs, Active)                              [Edit course]
 Program         Code  System    Terms  Per year  Term length  Batches  Students  Status
 Health          HLT   Semester  4      2         6 months     0        0         Active
 Radiology       RAD   Semester  4      2         6 months     1        25        Active
 ...
Course: BS Nursing  (1 program, Active)
 BSN             BSN   Semester  8      2         6 months     4        186       Active
Course: PNC  (3 programs, Active)
 LHV             LHV   Year      2      1         12 months    1        30        Active
 ...
```

- Programs are grouped under their course, in the order set by the Order field. Courses are collapsible.
- **Batches** and **Students** are links to the filtered lists.
- Row menu: Edit, Disable or Enable, Delete (unused only).
- Disabled programs appear in grey at the end of their course, with a **Disabled** badge.

### 35.2 Program drawer

```text
Edit program: BSN                                                [x]
--------------------------------------------------------------------
Course *        [BS Nursing v]
Name *          [BSN_____________________]
Short code *    [BSN____]   Locked: 4 batches use this code.
Term system     [Semester v]   [lock] Locked: students exist.
Number of terms [8]            Cannot be below 7 (a student is in Semester 7).
Terms per year  [2 v]          -> each term lasts 6 months
Course length   4 years
Notes           [_____________________________________]
--------------------------------------------------------------------
(!) Changing terms per year affects 1 Active template and 4 running
    batches. Students already admitted keep the value stored in their plan.
Reason *        [Updating program structure v]
                                          [Cancel]   [Save program]
```

| Element | Behaviour |
| --- | --- |
| Terms per year | A dropdown of 1, 2, 3, 4, 6 and 12. The sentence beside it shows the term length. |
| Course length | Calculated and read-only. |
| Warnings | Shown only for changes that matter, as in the example. |
| Locks | Same lock icon and tooltip pattern as the batch drawer. |
| Save | Needs a reason for any change to an existing program. A new program needs none. |

### 35.3 Other dialogs

| Dialog | Content |
| --- | --- |
| New course | Name, order. |
| Disable program | Shows the number of Running batches. If there are any, the dialog says "Complete or close these batches first" with links, and the button is disabled. Otherwise: "RAD will no longer appear in admission, new batch or template screens." |
| Enable program | A simple confirmation. |
| Delete program | Only for an unused program. "This program has no batches or templates and will be deleted permanently." |

## 36. Sessions tab

### 36.1 List

```text
Sessions                                      [Add next session (2029)]  [+ Add session]
 Session   State              Batches  Students  Notes                     
 2028      Open               0        0
 2027      Open               2        0         Planned intake
 2026      Current  Open      5        86
 2025      Closed             6        171
 2024      Closed             4        98
 > Show earlier sessions (2017 to 2023)
```

- Newest first. Earlier closed sessions are collapsed.
- **Batches** and **Students** link to the filtered lists.
- Row menu: Set as current, Close, Reopen, Edit notes, Delete (unused only).

### 36.2 Dialogs

| Dialog | Content |
| --- | --- |
| Add session | Label (a year, checked for duplicates), notes, and "Make this the current session". |
| Set as current | "2027 will become the default session for new batches, admissions and templates. 2026 stays Open." |
| Close session | "Closing 2025 stops new batches, admissions and templates from using it. 6 running batches started in 2025 and carry on as before." |
| Reopen session | A short confirmation with a reason. |

The Current session shows a disabled **Close** item with the tooltip "Make another session current first."

## 37. Setup health panel

```text
Setup health (4)                                                      [Collapse]
(!) 3 batches are due for promotion                         [View batches]
(!) RAD Fall 2025 has no active fee template                [Create template]
(!) 2 batches have no Term 1 start date                      [Add dates]
(i) BSN Fall 2022 looks finished                             [Complete]
```

| Element | Behaviour |
| --- | --- |
| Severity | A warning icon (amber) for items that block or risk work, and an info icon (blue) for suggestions. |
| Order | Warnings first, then information. |
| Buttons | Each opens the right place already prepared. "View batches" opens the batch list with `?due=1`. "Create template" opens the template editor with the batch's details. "Add dates" opens the first batch without a start date. |
| Count | Appears in the page title area and feeds the dashboard's Needs attention panel. |
| Empty | A green tick and "Setup looks good." |
| Items may name several batches | The text shows the first and "and 2 more". The button opens the filtered list. |

## 38. Academic selector (shared component)

The same four-level picker is used in the admission form, the student directory filters, fee templates, imports, promotion and reports. One component keeps the rules identical everywhere.

### 38.1 Layout

```text
Course  [BS Nursing v]   Program [BSN v]   Session [2026 v]   Batch [BSN Fall 2026 v]
```

In the batch dropdown each option reads:

```text
BSN Fall 2026      41 students   Open
BSN Fall 2025      Admissions closed        (greyed, with the reason)
BSN Spring 2026    Seats full               (greyed, with the reason)
BSN Fall 2026 B    No fee template          (greyed, with the reason)
```

### 38.2 Behaviour

| Rule | Detail |
| --- | --- |
| Cascade | Choosing a course narrows programs, then sessions, then batches. Changing a higher level clears the lower ones. |
| One match | If only one choice is left, it is selected automatically. |
| Greyed options | In the admission context, options that cannot be used stay visible but greyed, with the reason, so the operator understands why. |
| Remember | The last choice is remembered per user and per screen. |
| Address | In list screens the choices are stored in the page address (`course`, `program`, `session`, `batch`, `term`). |
| Keyboard | Arrow keys move, Enter selects, typing filters the list. |

### 38.3 What each screen shows

| Context | Programs | Sessions | Batches |
| --- | --- | --- | --- |
| **Admission** | Active | Open | Planned or Running, admissions Open, not full, with a template. Others greyed with the reason. |
| **Student directory and reports** | All | All | All. Completed ones hidden unless "Include completed" is ticked. |
| **Promotion** | Active | All | Running. Shows the calendar term and a Promotion due badge. |
| **Fee templates** | Active | Open | "All batches" plus Planned or Running batches. |
| **Import** | Used to check each row's names. A mismatch message names the first thing that does not match (section 40). | | |
| **Edit student (Admin correction)** | Same program only | Open | Planned or Running, admissions Open |

## 39. Print layouts

### 39.1 Batch roster (A4 landscape)

```text
AL-SHIFA MEDICAL INSTITUTE                                        BATCH ROSTER
BSN Fall 2025   |   BS Nursing   |   Session 2025   |   Calendar: Semester 3
Printed 9 Oct 2026 by Saba Noor                      Students: 43 active, 1 struck off

No.  SNO   Student           Father's name     Phone         Term   Status     Signature
1    0801  Aiman Fatima      ...               0300-...      T2     Active
2    0802  Hassan Raza       ...               0321-...      T2     Active
...
```

Options in the print dialog: include balances (Admin and Accountant only), include struck-off students, and add a signature column. Page headers repeat on every page. Rows never split across pages.

### 39.2 Batch summary (A4 portrait)

One page with the batch details, student counts by status, seats, the fee figures from section 22, the matching template, and the term schedule with each term's status.

## 40. Messages, validation and states

### 40.1 Validation messages

| Situation | Message |
| --- | --- |
| Duplicate batch name | "A batch named Fall already exists for BSN in session 2026." |
| Duplicate batch with no name | "BSN already has a batch for 2026 with no name. Give this one a name." |
| Closed session | "Session 2023 is closed. Choose an open session." |
| Seats too low | "Seats cannot be fewer than the 44 students already admitted." |
| Missing Term 1 date | "Enter the date Term 1 starts." |
| Dates out of order | "Semester 3 must start after Semester 2." |
| Terms below a student's term | "Cannot be below 7. A student is in Semester 7." |
| Short code in use | "The code BSN is already used by another program." |
| Terms per year | "Choose how many terms make one year." |
| Disable program with running batches | "RAD has 1 running batch. Complete or close it first." |
| Delete a used batch | "This batch has 44 students and cannot be deleted." |
| Import, unknown batch | "Row 14: batch 'Fall-2025' not found for BSN, session 2025." |
| Import, closed admissions | "Row 9: BSN Fall 2025 is not open for admissions." |

### 40.2 States

| Situation | Display |
| --- | --- |
| Loading | Skeleton rows or cards, never a blank page. |
| No batches yet | The getting started checklist (section 30). |
| No match for filters | "No batches match these filters." with **Clear filters**. |
| Save failed | A danger banner "The change was not saved." with **Try again**. Nothing is half-saved. |
| Permission denied | The "No access" page from the frontend document, section 5.5. |
| Another user changed it | "This batch was changed by someone else. Review and save again." |

## 41. Keyboard, accessibility and responsiveness

| Area | Detail |
| --- | --- |
| Keyboard | `/` focuses the search box. Arrow keys move through rows. Enter opens the row. The menu key or Shift+F10 opens the row menu. Esc closes a drawer or dialog. Ctrl+Enter saves a drawer. |
| Focus | Drawers and dialogs trap focus and return it to the control that opened them. The first field is focused on open. |
| Screen readers | The seats meter has a text equivalent ("44 of 50 seats taken"). Status badges are text. The term schedule is a real table with header cells. |
| Colour | Every badge carries a word. The seats meter also shows numbers. |
| Dates | Date pickers can be typed into as well as clicked. |
| Widths | Designed for 1280 px and wider. Between 1024 and 1279 px the table scrolls sideways inside its card and the Seats and Fee template columns shrink to icons with tooltips. Drawers stay 480 px. Below 1024 px the app shows its "use a larger window" message. |

## 42. Components and data

### 42.1 Components

| Component | Notes |
| --- | --- |
| `AcademicSelector` | The four-level picker with the rules in section 38. |
| `BatchStatusBadge` | Planned, Running, Completed, plus the admissions badge. |
| `SeatsMeter` | Small bar and text. |
| `TermLabel` | Formats "Semester 3", "T3", "Y2" from a program and a term number (section 8). |
| `TermSchedule` | The schedule table in read and edit modes. |
| `TemplateCoverageBadge` | The matching template and version, or the warning. |
| `SetupHealthPanel` | Section 37. |
| `RenameImpactSummary` | The "This affects" line in the rename dialog. |
| `RelinkTable` | The re-link tool's table. |
| `LockedField` | A read-only field with a lock icon and tooltip. |

### 42.2 Data layer

| Function | Purpose |
| --- | --- |
| `listBatches(filters)` | Returns batches with their counts, seats, calendar term, due state and template match. |
| `getBatch(id)` | One batch with the figures in section 22. |
| `createBatch`, `updateBatch`, `renameBatch` | Validate names, sessions and seats, and write the audit entry. |
| `setAdmissions(id, open)` | Open or close admissions. |
| `completeBatch(id, completeStudents)` | Marks the batch completed, and optionally its students. |
| `generateSchedule(batch, program)` | Builds the term dates from the start date and term length. |
| `calendarTerm(batch, date)` | The batch's calendar term on a date. |
| `isDueForPromotion(batch, date)` | The rule in section 18.3. |
| `resolveTemplate(batch)` | The matching Active template, or none. |
| `relinkStudents(links)` | Applies the re-link tool's choices. |
| `termLabel(program, n, style)` | Section 8. |

Batch figures are calculated from students and the ledger and kept up to date as they change. Every screen reads batches through these functions and never reads the stored records directly. Students refer to a batch by its ID, and every batch name shown on screen is built from the current record.

## 43. Acceptance criteria (frontend)

- [ ] The sidebar shows Academic setup in place of Batches, and `/batches` redirects to it.
- [ ] The Batches list filters, sort and view survive a page refresh and can be shared as a link.
- [ ] The list shows seats, term position, promotion-due and template coverage for every batch.
- [ ] The batch drawer previews the display name, explains the program's structure, and checks for a fee template before saving.
- [ ] Locked fields show a lock and a tooltip that explains why.
- [ ] The batch page's tabs open from the address, and the Students tab keeps the batch filter locked.
- [ ] The term schedule can be edited, with dates kept in order and a reason recorded.
- [ ] Rename, close, complete and delete dialogs each show their effect before confirming.
- [ ] The Programs and Sessions tabs follow the rules for locks, disabling and the Current session.
- [ ] The setup health panel's buttons open the right place with filters or fields already prepared.
- [ ] The academic selector behaves the same in every screen that uses it, with greyed options and reasons in the admission screen.
- [ ] The batch roster and summary fit their paper sizes.
- [ ] Every page has loading, empty and error states.

---

# Shared Sections

## 44. Settings

| Setting | Default |
| --- | --- |
| Promotion due after the term has started for | 7 days |
| Seats meter turns amber at | 90 percent |
| Batch name suggestions | Fall, Spring, Evening, Morning |
| Hide completed batches by default | Yes |
| Counter operators can admit into a full batch | No (an Admin can, with a reason) |

## 45. Test cases

These should be written as automated tests before the screens that use them.

| # | Case | Input | Expected result |
| ---: | --- | --- | --- |
| 1 | Display name | BSN, name `Fall`, session 2026 | `BSN Fall 2026` |
| 2 | Display name without a name | LHV, no name, session 2025 | `LHV 2025` |
| 3 | Duplicate names | A second `fall` for BSN 2026 | Blocked. Allowed for another program or session |
| 4 | Six-month schedule | Start 1 Sep 2026, 8 terms of 6 months | Starts 1 Sep 2026, 1 Mar 2027, 1 Sep 2027, 1 Mar 2028 ... ends 31 Aug 2030 (section 18.4) |
| 5 | Annual schedule | LHV 2025, start 1 Nov 2025, 2 terms of 12 months | Year 1: 1 Nov 2025 to 31 Oct 2026. Year 2: 1 Nov 2026 to 31 Oct 2027 |
| 6 | Calendar term on 9 Oct 2026 | BSN Fall 2025 (start 1 Sep 2025) | Semester 3 |
| 7 | Calendar term on 9 Oct 2026 | BSN Spring 2025 (start 1 Mar 2025) | Semester 4 |
| 8 | Calendar term on 9 Oct 2026 | BSN Fall 2024 (start 1 Sep 2024) | Semester 5 |
| 9 | Calendar term on 9 Oct 2026 | RAD Fall 2025 (start 1 Sep 2025, 4 terms) | Semester 3 |
| 10 | Calendar term on 9 Oct 2026 | CMW 2024 (start 1 Nov 2024, 2 terms) | Year 2, ending 31 Oct 2026 |
| 11 | Not started | A batch starting 1 Jan 2027, checked on 9 Oct 2026 | Calendar term "Not started", status Planned |
| 12 | Finished | BSN Fall 2022 (start 1 Sep 2022, 8 terms), checked on 9 Oct 2026 | "Finished", completion suggested |
| 13 | Due for promotion | BSN Fall 2025: students in Semester 2, calendar Semester 3 for 38 days, grace 7 days | Due |
| 14 | Not due | BSN Fall 2024: students in Semester 5, calendar Semester 5 | Not due |
| 15 | Within grace | Calendar term started 3 days ago, students one term behind | Not due yet |
| 16 | Rename | Rename `Fall` to `Autumn` on a batch with 44 students | Display name changes on every screen. No student record is changed |
| 17 | Session lock | Change the session of a batch with 1 student | Blocked |
| 18 | Seats | 50 seats, 50 admitted | Counter operator blocked. Admin can override with a reason. Seats set to 40 are rejected |
| 19 | Delete rules | An unused batch, and a batch with a fee plan | First deletable. Second not |
| 20 | Program terms | BSN terms changed from 8 to 6 while a student is in Semester 7 | Blocked |
| 21 | Terms per year | Choices 1, 2, 3, 4, 6, 12. The value 5 | Accepted. Rejected |
| 22 | Term length | Terms per year 2 and 1 | 6 months and 12 months |
| 23 | Current session | Close the Current session | Blocked |
| 24 | Closing a session | Close 2025 with 6 running batches | Batches and students unchanged. A new batch in 2025 is blocked |
| 25 | Template coverage | RAD Fall 2025 and BSN Fall 2025 | "No active template". `BSN 2025 v3` |
| 26 | Template precedence | A batch template and an all-batches template for the same program and session | The batch template wins |
| 27 | Moving old batches | Active batch. Disabled batch | Running and Open. Running and Closed |
| 28 | Moving old students | Saved name `Fall`, program BSN, session 2025 | Linked to BSN Fall 2025. Names that match nothing go to the re-link tool |
| 29 | Term labels | Semester 3, Year 2, Term 1 | `T3`, `Y2`, `T1` |

## 46. Effects on the other documents

| Document | What to update |
| --- | --- |
| `FEE_TEMPLATES_AND_ADMISSION_DESIGN.md` | Terms per year is set in Academic setup, not Settings. Both Ultrasound programs now have terms per year 2. A student's plan stores terms per year at admission. **These three changes are already made.** Template matching uses the batch's ID and session. |
| `LOGIN_DASHBOARD_STUDENTS_DESIGN.md` | The directory's course, program, session, batch and term filters use `AcademicSelector`. Needs attention gets "Batches due for promotion" and "Batch has no Term 1 start date". The dashboard item "Fee template missing for an open batch" uses the batch rule in section 20. Import checks use the messages in section 40.1. Student statuses are unchanged. |
| `FRONTEND_DESIGN.md` | Sidebar (section 28), routes, and new components (section 42.1). The admission step 2 uses `AcademicSelector` with greyed options. |
| `PAYMENTS_RECEIPTS_LEDGER_DESIGN.md` | None. |
| Batch promotion (next document) | Uses the term schedule to suggest the target term and due date. A fee charge's session is the session whose year contains the term's start date. |

## 47. Open decisions

Defaults below are adopted in this draft. Change any that do not suit the institute.

| # | Question | Default adopted |
| --- | --- | --- |
| 1 | Ultrasound programs: terms per year | 2 (6-month terms). To be confirmed. |
| 2 | Promotion grace period | 7 days. |
| 3 | A fee charge's session for a later term | The session whose year contains the term's start date. |
| 4 | Can an Accountant edit term dates? | Yes. |
| 5 | Can a counter operator admit into a full batch? | No. An Admin can, with a reason. |
| 6 | Should a batch name be required? | No. Leave it empty if the program has one batch per session. |
| 7 | Can a batch's session be changed after students join? | No. Use the student-level correction. |
| 8 | Should completed batches be hidden by default? | Yes. |
| 9 | Should the app auto-close admissions when seats are full? | No. It suggests it. |

## 48. Suggested build order

1. **Data model and the move from today's data:** courses, programs, sessions, batches linked by ID, and the re-link tool.
2. **Shared helpers with tests:** term labels, display names, schedule generation, calendar term, due-for-promotion, template match.
3. **Programs and Sessions tabs.**
4. **Batches list and the batch drawer.**
5. **Batch page:** overview, students, term schedule, fees and template, history.
6. **Batch dialogs:** rename, close or reopen admissions, complete, delete.
7. **`AcademicSelector`,** then put it into the admission form, the directory filters, fee templates and import.
8. **Setup health panel and the getting started checklist,** with the dashboard counts.
9. **Print layouts:** roster and summary.

Steps 1 and 2 come first because admission, fee templates and promotion all read from them. Step 7 is the one that makes every other module consistent.
