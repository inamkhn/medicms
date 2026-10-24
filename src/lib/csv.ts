// ============================================
// MediCMS Desktop — CSV export (§54 "Export to CSV")
// Every report and the cash book write the same shape: a header row, then one
// row per line, quoted only where a value needs it. The download helper is the
// single place a blob and an anchor are made, so no screen hand-rolls them.
// ============================================

export type CsvCell = string | number | null | undefined;

/** A cell as CSV text: empty for nothing, quoted when it holds a comma or quote. */
function cellText(cell: CsvCell): string {
  const text = cell === null || cell === undefined ? '' : String(cell);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The whole sheet as one string — also what a test can read without a DOM. */
export function toCsv(header: readonly CsvCell[], rows: readonly (readonly CsvCell[])[]): string {
  return [header, ...rows].map((line) => line.map(cellText).join(',')).join('\n');
}

/** Save a sheet under `filename`; the name is the caller's, so a report names itself. */
export function downloadCsv(filename: string, header: readonly CsvCell[], rows: readonly (readonly CsvCell[])[]): void {
  const blob = new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
