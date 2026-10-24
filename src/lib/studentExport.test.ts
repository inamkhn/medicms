// ============================================
// MediCMS Desktop — Student export tests (students doc §23.1)
// The export must use the import's column layout so a file round-trips through
// Excel, the counter's file must be the doc's five columns, and the audit entry
// must name the filters that narrowed the list. Each promise is pinned here.
// Run with: npm run test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';

import type { StudentWithBalance } from '@/types';
import {
  COUNTER_COLUMNS,
  IMPORT_COLUMNS,
  csvText,
  splitCsvLine,
  studentExportRows,
  summarizeFilters,
} from './studentExport.ts';

function student(over: Partial<StudentWithBalance> = {}): StudentWithBalance {
  return {
    sno: 101,
    name: 'Maryam Iqbal',
    fatherName: 'Iqbal Hussain',
    contact: '03001234567',
    address: 'Village Kokarai, Tehsil Kabal',
    cnic: '3520211111111',
    regDate: '2025-09-01',
    course: 'BSN',
    program: 'BSN',
    batch: 'Fall',
    session: 2025,
    semester: '3rd',
    struckOff: false,
    isTestRecord: false,
    synced: true,
    computedBalance: 18_000,
    badge: 'dues',
    ...over,
  };
}

describe('IMPORT_COLUMNS (§23.3)', () => {
  it('is exactly the documented column layout, in order', () => {
    deepStrictEqual([...IMPORT_COLUMNS], [
      'name', 'father_name', 'cnic', 'phone', 'address', 'date_of_birth', 'gender',
      'domicile', 'emergency_contact', 'guardian_name', 'guardian_phone',
      'council_registration_no', 'roll_no', 'registration_date', 'course', 'program',
      'batch', 'session', 'current_term', 'opening_balance', 'fee_template',
    ]);
  });
});

describe('studentExportRows (§23.1)', () => {
  it('exports the full import layout, one cell per column', () => {
    const { header, rows } = studentExportRows([student()], false);
    deepStrictEqual(header, [...IMPORT_COLUMNS]);
    equal(rows.length, 1);
    equal(rows[0].length, IMPORT_COLUMNS.length);
  });

  it('fills placement as import-resolvable labels and the balance as opening_balance', () => {
    const { rows } = studentExportRows([student()], false);
    const row = rows[0];
    const at = (col: (typeof IMPORT_COLUMNS)[number]) => row[IMPORT_COLUMNS.indexOf(col)];
    equal(at('name'), 'Maryam Iqbal');
    equal(at('course'), 'BS Nursing');
    equal(at('program'), 'BS Nursing');
    equal(at('session'), 2025);
    equal(at('current_term'), 3);
    equal(at('opening_balance'), 18_000);
    // The record holds no template link, so the cell stays blank and import falls
    // back to the Active template for the placement (§7.1).
    equal(at('fee_template'), '');
  });

  it('keeps guard and identifier columns from the model (§23.3)', () => {
    const { rows } = studentExportRows([
      student({ guardianName: 'Iqbal Hussain', guardianPhone: '03001234567', rollNo: 'BSN-01', councilRegistrationNo: 'PNC-77' }),
    ], false);
    const row = rows[0];
    const at = (col: (typeof IMPORT_COLUMNS)[number]) => row[IMPORT_COLUMNS.indexOf(col)];
    equal(at('guardian_name'), 'Iqbal Hussain');
    equal(at('guardian_phone'), '03001234567');
    equal(at('roll_no'), 'BSN-01');
    equal(at('council_registration_no'), 'PNC-77');
  });

  it('gives a counter operator only SNO, name, program, batch and session', () => {
    const { header, rows } = studentExportRows([student()], true);
    deepStrictEqual(header, [...COUNTER_COLUMNS]);
    deepStrictEqual(header, ['SNO', 'name', 'program', 'batch', 'session']);
    deepStrictEqual(rows[0], [101, 'Maryam Iqbal', 'BS Nursing', 'Fall', 2025]);
  });
});

describe('csvText + splitCsvLine round-trip (§23.2)', () => {
  it('a written file reads back to the same cells', () => {
    const { header, rows } = studentExportRows([student(), student({ sno: 102, name: 'Ali, "Raza"' })], false);
    const lines = csvText(header, rows).split('\n');
    deepStrictEqual(splitCsvLine(lines[0]), header);
    deepStrictEqual(splitCsvLine(lines[1]), rows[0].map(String));
    deepStrictEqual(splitCsvLine(lines[2]), rows[1].map(String));
  });

  it('escapes embedded quotes the way the reader expects', () => {
    const csv = csvText(['name'], [['He said "hi", twice']]);
    deepStrictEqual(splitCsvLine(csv.split('\n')[1]), ['He said "hi", twice']);
  });
});

describe('summarizeFilters (§23.1 audit)', () => {
  it('says so when nothing narrows the list', () => {
    equal(summarizeFilters({ course: 'all', status: 'all', q: '', age: 'any', term: undefined }), 'no filters');
  });

  it('lists only the filters that are set', () => {
    equal(
      summarizeFilters({ q: 'ali', course: 'all', status: 'dues', min: 0, max: '' }),
      'q=ali, status=dues, min=0',
    );
  });
});
