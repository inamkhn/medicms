// ============================================
// MediCMS Desktop — Print statement (§55, §9.1)
//
// "Print statement opens a small dialog, then a print preview." The dialog asks
// for the period, the layout and the paper; the preview shows the §9.1 layout
// with Print and Save as PDF. The figures come from `studentStatement`, so the
// dialog can show the closing balance before a single page is rendered.
//
// Available to every role that can read a ledger (§3: "View ledger and
// statements — Yes to all four").
// ============================================

import { useMemo, useState } from 'react';
import { FileDown, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { StatementDoc, type StatementPaper } from '@/components/receipts/StatementDoc';
import { formatPKR, getTermLabel } from '@/lib/utils';
import { getSubCourseDef } from '@/lib/constants';
import { todayKey } from '@/lib/dates';
import { studentStatement, type StatementLayout } from '@/lib/receipts';
import { useAuthStore, useLedgerStore, useSettingsStore } from '@/stores';
import type { Student } from '@/types';

export function StatementDialog({ student, onClose }: { student: Student; onClose: () => void }) {
  const entries = useLedgerStore((s) => s.entries);
  const institute = {
    name: useSettingsStore((s) => s.instituteName),
    address: useSettingsStore((s) => s.instituteAddress),
    phone: useSettingsStore((s) => s.institutePhone),
  };
  const printedBy = useAuthStore((s) => s.user?.name ?? 'Admin');

  const today = todayKey();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [layout, setLayout] = useState<StatementLayout>('Full');
  const [paper, setPaper] = useState<StatementPaper>('A4');
  const [preview, setPreview] = useState(false);

  const own = useMemo(() => entries.filter((entry) => entry.studentSno === student.sno), [entries, student.sno]);
  const statement = useMemo(
    () => studentStatement(own, { from, to, today, layout }),
    [own, from, to, today, layout],
  );
  // §55 keeps the preview behind the small dialog; the closing figure is shown first.
  const periodValid = from !== '' && to !== '' && from <= to;

  const subDef = getSubCourseDef(student.program);
  const system = subDef.course.system;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={preview ? 'max-w-3xl' : 'max-w-md'}>
        <DialogHeader>
          <DialogTitle>{preview ? 'Statement preview' : 'Print statement'}</DialogTitle>
          <DialogDescription>
            {student.name} · SNO {student.sno}
            {preview ? ' — Print or Save as PDF from the print dialog (§55).' : ' — choose the period and the layout, then Preview (§55).'}
          </DialogDescription>
        </DialogHeader>

        {preview ? (
          <DialogBody className="max-h-[70vh] overflow-auto bg-surface-sunken">
            <div className="print-area">
              <StatementDoc
                size={paper}
                institute={institute}
                student={{
                  name: student.name,
                  sno: student.sno,
                  fatherName: student.fatherName,
                  programLabel: `${subDef.course.label} — ${subDef.sub.label}`,
                  batchLabel: student.batch,
                  sessionLabel: `Session ${student.session}`,
                  termLabel: getTermLabel(system, student.semester),
                }}
                statement={statement}
                printedBy={printedBy}
                printedOn={today}
              />
            </div>
          </DialogBody>
        ) : (
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Period from *</Label>
                <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-control-sm text-meta" />
              </div>
              <div className="space-y-1.5">
                <Label>To *</Label>
                <Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="h-control-sm text-meta" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Layout</Label>
              <div className="flex gap-1.5">
                {(['Full', 'DuesOnly'] as const).map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={layout === option ? 'default' : 'outline'}
                    className="h-7 text-meta"
                    onClick={() => setLayout(option)}
                  >
                    {option === 'Full' ? 'Full statement' : 'Dues only'}
                  </Button>
                ))}
              </div>
              <p className="text-micro text-ink-muted">
                {layout === 'Full'
                  ? 'Brought forward, every entry with a running balance, the summary and the dues (§9.1).'
                  : 'Just the summary and the unpaid fee charges (§9.1).'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Paper</Label>
              <Select value={paper} onValueChange={(value) => setPaper(value as StatementPaper)}>
                <SelectTrigger className="h-control-sm w-[160px] text-meta" aria-label="Paper"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A4">A4</SelectItem>
                  <SelectItem value="80mm">80 mm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-control border border-hairline-soft bg-panel-soft px-3 py-2 text-meta text-ink-secondary">
              Closing balance {formatPKR(statement.summary.balance)} · {statement.unpaid.length}{' '}
              {statement.unpaid.length === 1 ? 'unpaid charge' : 'unpaid charges'} {formatPKR(statement.unpaidTotal)}
            </div>
          </DialogBody>
        )}

        <DialogFooter>
          {preview ? (
            <>
              <Button variant="ghost" onClick={() => setPreview(false)}>Change period</Button>
              <Button variant="outline" onClick={() => window.print()} title="Choose Save as PDF in the print dialog (§55)">
                <FileDown size={14} className="mr-1.5" /> Save as PDF
              </Button>
              <Button onClick={() => window.print()}>
                <Printer size={14} className="mr-1.5" /> Print
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => setPreview(true)} disabled={!periodValid}>Preview</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
