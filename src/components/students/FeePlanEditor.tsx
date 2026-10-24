// ============================================
// MediCMS Desktop v4.0 - Admission fee plan editor (§13.2-§13.7)
//
// Step 3 of the admission wizard: the template's lines are read-only, and every
// reduction is a stored concession record - a target (component or whole plan), a
// kind, an amount, the terms it reaches, and a reason. The table and the preview
// come from the fee engine through `planPreview`, so what the operator sees here
// is exactly what the ledger will bill (§7.10, §13.3, §13.7).
// ============================================

import { useState } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatPKR } from '@/lib/utils';
import type { ConcessionLine } from '@/lib/fee/concessions';
import { concessionValueLabel, scopeLabel, type PreviewTerm } from '@/lib/fee/planPreview';
import type { ConcessionKind, ConcessionRecord, TermScope } from '@/lib/fee/types';

/** §13.5 - the reasons the doc lists for a reduction. */
const REASON_CATEGORIES = ['Merit', 'Sibling', 'Staff child', 'Need-based', 'Management decision', 'Other'];

type ScopeMode = TermScope['mode'];

interface FeePlanEditorProps {
  /** The joining term's lines after the live records (engine output). */
  lines: ConcessionLine[];
  templateTotal: number;
  totalConcession: number;
  netTotal: number;
  warnings: string[];
  records: readonly ConcessionRecord[];
  /** Every billed term from the joining term to the end (§13.7 table). */
  preview: PreviewTerm[];
  startTerm: number;
  totalTerms: number;
  /** "3rd Semester" / "2nd Year" — the screen owns the naming. */
  termLabel: (term: number) => string;
  onAdd: (record: ConcessionRecord) => void;
  onRemove: (id: string) => void;
}

export function FeePlanEditor({
  lines, templateTotal, totalConcession, netTotal, warnings, records,
  preview, startTerm, totalTerms, termLabel, onAdd, onRemove,
}: FeePlanEditorProps) {
  const [target, setTarget] = useState('plan');
  const [kind, setKind] = useState<ConcessionKind>('waive');
  const [value, setValue] = useState('');
  const [scopeMode, setScopeMode] = useState<ScopeMode>('termOnly');
  const [fromTerm, setFromTerm] = useState(String(startTerm));
  const [toTerm, setToTerm] = useState(String(totalTerms));
  const [category, setCategory] = useState('Sibling');
  const [note, setNote] = useState('');

  const needsValue = kind !== 'waive';
  const numValue = Number(value);
  const valueOk = !needsValue
    ? true
    : value.trim() === '' || !Number.isFinite(numValue)
      ? false
      : kind === 'percent'
        ? numValue > 0 && numValue <= 100
        : kind === 'fixed'
          ? numValue > 0
          : numValue >= 0; // setAmount: 0 is a full waiver of that target
  const fromNum = parseInt(fromTerm, 10);
  const toNum = parseInt(toTerm, 10);
  const scopeOk = scopeMode !== 'specificTerms'
    || (Number.isFinite(fromNum) && Number.isFinite(toNum)
      && fromNum >= startTerm && toNum >= fromNum && toNum <= totalTerms);
  const noteOk = category !== 'Other' || note.trim().length >= 3;
  const canAdd = valueOk && scopeOk && noteOk;

  const planConcession = Math.max(0, totalConcession - lines.reduce((sum, l) => sum + l.concession, 0));

  const targetName = (record: ConcessionRecord): string => {
    const t = record.target;
    if (t.kind === 'plan') return 'Whole plan';
    return lines.find((l) => l.componentId === t.componentId)?.name ?? 'Component';
  };

  const add = () => {
    if (!canAdd) return;
    const scope: TermScope = scopeMode === 'termOnly'
      ? { mode: 'termOnly', term: startTerm }
      : scopeMode === 'remainingTerms'
        ? { mode: 'remainingTerms', fromTerm: startTerm }
        : { mode: 'specificTerms', from: fromNum, to: toNum };
    onAdd({
      id: crypto.randomUUID(),
      target: target === 'plan' ? { kind: 'plan' } : { kind: 'component', componentId: target },
      kind,
      value: needsValue ? numValue : 0,
      scope,
      reasonCategory: category,
      note: note.trim(),
      approvedBy: null,
    });
    setValue('');
    setNote('');
  };

  return (
    <div className="space-y-5">
      {/* The joining term, component by component (§13.2) */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-400">
            <th className="py-1 font-medium">Component</th>
            <th className="py-1 text-right font-medium">Template</th>
            <th className="py-1 text-right font-medium">Concession</th>
            <th className="py-1 text-right font-medium">This student</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.componentId} className="border-t border-dotted border-slate-200">
              <td className="py-1.5 text-slate-700">{line.name}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-500">{formatPKR(line.amount)}</td>
              <td className="py-1.5 text-right tabular-nums text-amber-700">{line.concession > 0 ? `- ${formatPKR(line.concession)}` : '-'}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-900">{formatPKR(line.net)}</td>
            </tr>
          ))}
          {planConcession > 0 && (
            <tr className="border-t border-dotted border-slate-200">
              <td className="py-1.5 text-slate-700">Whole-plan concession</td>
              <td className="py-1.5 text-right tabular-nums text-slate-500">-</td>
              <td className="py-1.5 text-right tabular-nums text-amber-700">- {formatPKR(planConcession)}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-900">-</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 font-semibold">
            <td className="py-2">Total for {termLabel(startTerm)}</td>
            <td className="py-2 text-right tabular-nums">{formatPKR(templateTotal)}</td>
            <td className="py-2 text-right tabular-nums text-amber-700">{totalConcession > 0 ? `- ${formatPKR(totalConcession)}` : '-'}</td>
            <td className="py-2 text-right tabular-nums">{formatPKR(netTotal)}</td>
          </tr>
        </tfoot>
      </table>

      {/* The record builder (§13.3-§13.5) */}
      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-900">Concede something</h4>
          <span className="text-xs text-slate-400">Every reduction is stored as a record with a reason (§13.5).</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label>Applies to</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="plan">Whole plan</SelectItem>
                {lines.map((l) => <SelectItem key={l.componentId} value={l.componentId}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>How</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ConcessionKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="waive">Waive fully</SelectItem>
                <SelectItem value="fixed">Fixed amount off</SelectItem>
                <SelectItem value="percent">Percent off</SelectItem>
                <SelectItem value="setAmount">Set amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{kind === 'percent' ? 'Percent' : 'Amount (PKR)'}</Label>
            <Input
              type="number"
              min={0}
              max={kind === 'percent' ? 100 : undefined}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={!needsValue}
              placeholder={needsValue ? (kind === 'percent' ? '20' : '5000') : 'Full amount'}
              className={!valueOk ? 'border-red-300' : ''}
            />
          </div>
          <div>
            <Label>For which terms</Label>
            <Select value={scopeMode} onValueChange={(v) => setScopeMode(v as ScopeMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="termOnly">This term only</SelectItem>
                <SelectItem value="remainingTerms">All remaining terms</SelectItem>
                <SelectItem value="specificTerms">Specific terms</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {scopeMode === 'specificTerms' && (
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <div>
              <Label>From term</Label>
              <Input type="number" min={startTerm} max={totalTerms} value={fromTerm} onChange={(e) => setFromTerm(e.target.value)} />
            </div>
            <div>
              <Label>To term</Label>
              <Input type="number" min={fromTerm} max={totalTerms} value={toTerm} onChange={(e) => setToTerm(e.target.value)} />
            </div>
            {!scopeOk && <p className="text-xs text-red-500 col-span-2">Terms must sit between {startTerm} and {totalTerms}, and end no earlier than they start.</p>}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label>Reason</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASON_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Note {category === 'Other' ? '*' : '(optional)'}</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={category === 'Other' ? 'Say why (required)' : 'e.g. sibling of SNO 1032'}
              className={!noteOk ? 'border-red-300' : ''}
            />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={add} disabled={!canAdd}>
              <Plus size={14} className="mr-1" /> Add concession
            </Button>
          </div>
        </div>
      </div>

      {/* The records as stored */}
      {records.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {records.map((record) => (
            <li key={record.id} className="flex items-start gap-3 px-3 py-2 text-sm">
              <div className="flex-1">
                <span className="font-medium text-slate-900">{targetName(record)}</span>
                <span className="text-slate-600"> · {concessionValueLabel(record, formatPKR)} · {scopeLabel(record.scope)}</span>
                <div className="text-xs text-slate-400">{record.reasonCategory}{record.note ? ` - ${record.note}` : ''}</div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(record.id)} aria-label="Remove concession">
                <Trash2 size={14} className="text-slate-400" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* §13.3 - a record larger than its target is capped, and says so */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 space-y-1">
          {warnings.map((w) => (
            <p key={w} className="flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{w}</p>
          ))}
        </div>
      )}
      {templateTotal > 0 && netTotal === 0 && (
        <p className="text-xs text-emerald-600">Full waiver - a zero net fee is allowed with a reason (§22).</p>
      )}

      {/* §13.7 - the whole plan, term by term */}
      <div>
        <h4 className="text-sm font-semibold text-slate-900 mb-2">Plan, term by term (§13.7)</h4>
        <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-400">
              <tr>
                <th className="py-1.5 px-3 text-left font-medium">Term</th>
                <th className="py-1.5 px-3 text-right font-medium">Template</th>
                <th className="py-1.5 px-3 text-right font-medium">Concession</th>
                <th className="py-1.5 px-3 text-right font-medium">Pays</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.term} className={row.term === startTerm ? 'bg-blue-50/60 font-medium' : 'border-t border-dotted border-slate-200'}>
                  <td className="py-1.5 px-3 text-slate-700">
                    {termLabel(row.term)}{row.term === startTerm ? ' (joining)' : ''}
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-slate-500">{formatPKR(row.template)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-amber-700">{row.concession > 0 ? `- ${formatPKR(row.concession)}` : '-'}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-slate-900">{formatPKR(row.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Recomputed from the engine whenever a record changes - the same numbers the ledger bills at each term (§6, §13.7).
        </p>
      </div>
    </div>
  );
}
