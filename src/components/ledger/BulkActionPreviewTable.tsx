// Ledger module — bulk action preview (spec §3.5).
// Checkbox-editable rows + exclusion-count line.

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatPKR } from '@/lib/utils';

export interface BulkPreviewRow {
  key: string | number;
  title: string;
  subtitle?: string;
  term?: string;
  fee: number;
  status: 'ready' | 'duplicate' | 'no-fee';
  checked: boolean;
}

export function BulkActionPreviewTable({ rows, onToggle, onToggleAll }: {
  rows: BulkPreviewRow[];
  onToggle: (key: string | number) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const selectable = rows.filter((r) => r.status === 'ready');
  const allChecked = selectable.length > 0 && selectable.every((r) => r.checked);
  return (
    <div className="max-h-80 overflow-auto border rounded-xl">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[36px]">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => onToggleAll(e.target.checked)}
                className="w-3.5 h-3.5 accent-blue-600"
                aria-label="Select all ready rows"
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Term</TableHead>
            <TableHead className="text-right">Demand</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, 100).map((r) => (
            <TableRow key={r.key} className={r.checked ? '' : 'opacity-60'}>
              <TableCell>
                <input
                  type="checkbox"
                  checked={r.checked}
                  disabled={r.status !== 'ready'}
                  onChange={() => onToggle(r.key)}
                  className="w-3.5 h-3.5 accent-blue-600"
                  aria-label={`Select ${r.title}`}
                />
              </TableCell>
              <TableCell>
                <div className="font-medium">{r.title}</div>
                {r.subtitle && <div className="text-xs text-slate-500">{r.subtitle}</div>}
              </TableCell>
              <TableCell className="text-slate-600">{r.term ?? '—'}</TableCell>
              <TableCell className="text-right tabular-nums">{r.fee > 0 ? formatPKR(r.fee) : '—'}</TableCell>
              <TableCell>
                {r.status === 'ready' && <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-100">Ready</Badge>}
                {r.status === 'duplicate' && <Badge className="bg-amber-50 text-amber-600 border border-amber-100">Already demanded</Badge>}
                {r.status === 'no-fee' && <Badge className="bg-red-50 text-red-600 border border-red-100">No fee</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
