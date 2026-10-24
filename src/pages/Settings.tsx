// ============================================
// MediCMS Desktop v4.0 - Settings
// ============================================

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Database, Printer, Server, Wifi, WifiOff, TestTube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSyncStore } from '@/stores/syncStore';
import { useSettingsStore, useReceiptBookStore, useLedgerStore } from '@/stores';
import { formatPKR, formatDateTime } from '@/lib/utils';
import { DEFAULT_FINANCE_LIMITS, FINANCE_LIMIT_LABELS, FINANCE_LIMIT_UNITS, type FinanceLimitUnit, type FinanceLimits } from '@/lib/finance';
import { BANK_INFO, INSTITUTE_INFO, PROGRAM_OPTIONS, getCourseOfProgram } from '@/lib/constants';
import { defaultTermsPerYear } from '@/lib/fee/templateRules';
import { bookStateOf, bookSummaries, formatReceiptNo, rangeLabel, receiptFactsOf, type PaymentSettings } from '@/lib/receipts';
import type { ProgramCode } from '@/types';

/** §65's numeric limits — everything in the payment settings except the footer note. */
type PaymentLimitKey = Exclude<keyof PaymentSettings, 'receiptFooter'>;

const PAYMENT_LIMIT_ROWS: readonly { key: PaymentLimitKey; label: string; hint: string }[] = [
  { key: 'backDateDays', label: 'Back-date limit for Accountant', hint: 'days — an Accountant posts up to this far back with a reason (§3, §65)' },
  { key: 'duplicateWindowMinutes', label: 'Duplicate payment warning window', hint: 'minutes — a same student, amount and mode inside this asks first (§17)' },
  { key: 'largeAmount', label: 'Large amount confirmation', hint: 'rupees — above this a second confirmation is required (§17)' },
  { key: 'creditConfirm', label: 'Credit confirmation', hint: 'rupees — credit above this needs an extra confirmation (§17)' },
  { key: 'adjustmentLimit', label: 'Adjustment limit (Accountant)', hint: 'rupees per entry (§42, §65)' },
  { key: 'writeOffLimit', label: 'Write-off limit (Accountant)', hint: 'rupees per student (§43, §65)' },
  { key: 'refundLimit', label: 'Refund limit (Accountant)', hint: 'rupees per refund (§44, §65)' },
  { key: 'lateFineAfterDays', label: 'Late fine suggestion after', hint: 'days overdue before a late fine is suggested (§41)' },
  { key: 'bounceFine', label: 'Cheque bounce fine', hint: 'rupees — 0 until the institute sets one (§35, §65)' },
  { key: 'lowStock', label: 'Low receipt stock warning', hint: 'receipts left before the counter is warned (§24)' },
  { key: 'receiptCopies', label: 'Receipt copies on A4', hint: '2 prints a student copy and an office copy (§61.1)' },
];

/** §77: a limit reads as money only for the rupee caps; the rest are plain
 *  counts, so a back-dating window never shows as ₨7. */
function financeLimitDefault(unit: FinanceLimitUnit, value: number): string {
  if (unit === 'PKR') return formatPKR(value);
  if (unit === 'percent') return `${value}%`;
  if (unit === 'months') return `${value} months`;
  return `${value} days`;
}

export default function Settings() {
  const navigate = useNavigate();
  const { status, lastSync, pendingCount, setSyncing, syncComplete } = useSyncStore();
  const {
    showTestRecords, setShowTestRecords, financeLimits, setFinanceLimits,
    financeAutoAcceptMatches, setFinanceAutoAcceptMatches,
  } = useSettingsStore();
  const books = useReceiptBookStore((s) => s.books);
  const bookEvents = useReceiptBookStore((s) => s.events);
  const reprints = useReceiptBookStore((s) => s.reprints);
  // §65 the payment and receipt limits, enforced by the payment and receipt cores.
  const paymentSettings = useReceiptBookStore((s) => s.paymentSettings);
  const savePaymentSettings = useReceiptBookStore((s) => s.savePaymentSettings);
  const [receiptFooterDraft, setReceiptFooterDraft] = useState(paymentSettings.receiptFooter);
  const ledgerEntries = useLedgerStore((s) => s.entries);
  const voucherPrefix = useSettingsStore((s) => s.voucherPrefix);
  const setVoucherPrefix = useSettingsStore((s) => s.setVoucherPrefix);
  const [voucherPrefixDraft, setVoucherPrefixDraft] = useState(voucherPrefix);
  // §24/§28 the summary here is the register's own answer, not a stored counter.
  const bookSlots = useMemo(
    () => bookSummaries(books, books.flatMap((book) => receiptFactsOf(ledgerEntries, book, new Map(Object.entries(reprints)))), bookEvents),
    [books, ledgerEntries, reprints, bookEvents],
  );
  const instituteName = useSettingsStore((s) => s.instituteName);
  const instituteAddress = useSettingsStore((s) => s.instituteAddress);
  const institutePhone = useSettingsStore((s) => s.institutePhone);
  const bankName = useSettingsStore((s) => s.bankName);
  const accountNo = useSettingsStore((s) => s.accountNo);
  const paperSize = useSettingsStore((s) => s.paperSize);
  const setInstitute = useSettingsStore((s) => s.setInstitute);
  const setBank = useSettingsStore((s) => s.setBank);
  const setPaperSize = useSettingsStore((s) => s.setPaperSize);
  const termsPerYearByProgram = useSettingsStore((s) => s.termsPerYearByProgram);
  const setTermsPerYear = useSettingsStore((s) => s.setTermsPerYear);
  const reAdmissionFee = useSettingsStore((s) => s.reAdmissionFee);
  const setReAdmissionFee = useSettingsStore((s) => s.setReAdmissionFee);
  const cancellationWindowDays = useSettingsStore((s) => s.cancellationWindowDays);
  const setCancellationWindowDays = useSettingsStore((s) => s.setCancellationWindowDays);
  void INSTITUTE_INFO;
  void BANK_INFO;
  const [serverUrl, setServerUrl] = useState('https://medicms-server.example.com');
  const [serverKey, setServerKey] = useState('••••••••••••');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSync = () => {
    setSyncing();
    setTimeout(() => syncComplete(0, 0), 1500);
  };

  return (
    <div className="w-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      </div>

      {/* Server Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server size={18} />
            Server Connection
          </CardTitle>
          <CardDescription>Configure cloud server for data sync between devices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Server URL</Label>
            <Input
              value={serverUrl}
              onChange={(e) => { setServerUrl(e.target.value); setConnectionStatus('idle'); }}
              placeholder="https://your-server.com"
            />
          </div>
          <div>
            <Label>API Key / Device Token</Label>
            <Input
              type="password"
              value={serverKey}
              onChange={(e) => { setServerKey(e.target.value); setConnectionStatus('idle'); }}
              placeholder="Enter API key"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setTestingConnection(true);
                setConnectionStatus('idle');
                setTimeout(() => {
                  setTestingConnection(false);
                  setConnectionStatus('success');
                }, 1200);
              }}
              disabled={testingConnection}
            >
              {testingConnection ? (
                <>
                  <RefreshCw size={14} className="mr-1 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <TestTube size={14} className="mr-1" />
                  Test Connection
                </>
              )}
            </Button>

            {connectionStatus === 'success' && (
              <div className="flex items-center gap-1.5 text-sm text-green-600">
                <Wifi size={14} />
                Connected successfully
              </div>
            )}
            {connectionStatus === 'error' && (
              <div className="flex items-center gap-1.5 text-sm text-red-600">
                <WifiOff size={14} />
                Connection failed — check URL and key
              </div>
            )}
          </div>

          <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 space-y-1">
            <div className="font-medium text-slate-700">How sync works:</div>
            <div>• Changes are saved locally first (offline-first)</div>
            <div>• Press F5 or click "Sync Now" to push changes to server</div>
            <div>• Conflicts are resolved by timestamp (latest wins)</div>
            <div>• All synced data is encrypted in transit (HTTPS)</div>
          </div>
        </CardContent>
      </Card>

      {/* Sync Status */}
      <Card>
        <CardHeader>
          <CardTitle>Sync Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500">Status</span>
              <div className="font-medium capitalize">{status}</div>
            </div>
            <div>
              <span className="text-slate-500">Last Sync</span>
              <div>{lastSync ? formatDateTime(lastSync) : 'Never'}</div>
            </div>
            <div>
              <span className="text-slate-500">Pending Records</span>
              <div>{pendingCount}</div>
            </div>
            <div>
              <span className="text-slate-500">Device ID</span>
              <div>PC-ADMIN-01</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSync}>
              <RefreshCw size={16} className="mr-1" />
              Sync Now
            </Button>
            <Button variant="outline">View Sync Log</Button>
          </div>
        </CardContent>
      </Card>

      {/* Institute Info */}
      <Card>
        <CardHeader>
          <CardTitle>Institute Info</CardTitle>
          <CardDescription>Used on all printed receipts and reports</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={instituteName} onChange={(e) => setInstitute(e.target.value, instituteAddress, institutePhone)} />
          </div>
          <div>
            <Label>Address</Label>
            <Input value={instituteAddress} onChange={(e) => setInstitute(instituteName, e.target.value, institutePhone)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={institutePhone} onChange={(e) => setInstitute(instituteName, instituteAddress, e.target.value)} />
          </div>
          <p className="text-xs text-slate-400">Saved automatically — used on all printed receipts.</p>
        </CardContent>
      </Card>

      {/* Bank Account */}
      <Card>
        <CardHeader>
          <CardTitle>Bank Account</CardTitle>
          <CardDescription>Shown on bank reports and statements</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Bank Name</Label>
            <Input value={bankName} onChange={(e) => setBank(e.target.value, accountNo)} />
          </div>
          <div>
            <Label>Account Number</Label>
            <Input value={accountNo} onChange={(e) => setBank(bankName, e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Receipt Books — a summary here, the register itself on its own screen (§24, §28) */}
      <Card>
        <CardHeader>
          <CardTitle>Receipt Books</CardTitle>
          <CardDescription>
            Pre-printed ranges with their next number and how many are left (§24). Adding a book,
            spoiling a slip and closing a book all happen on the receipt books screen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {bookSlots.length === 0 ? (
            <p className="text-meta text-ink-subtle">
              No receipt book yet. The counter cannot print a receipt until an Admin adds one.
            </p>
          ) : (
            <div className="space-y-2">
              {bookSlots.map(({ book, summary }) => {
                const status = bookStateOf(book, summary.nextNumber);
                return (
                  <div key={book.id} className="flex items-center justify-between rounded-control border border-hairline-soft p-3">
                    <div>
                      <div className="text-ui font-medium text-ink">{book.name} — {rangeLabel(book)}</div>
                      <div className="text-meta text-ink-3">
                        {status} · {summary.issued} used · next{' '}
                        {summary.nextNumber === null ? 'none' : formatReceiptNo(book.prefix, summary.nextNumber)}
                      </div>
                    </div>
                    <Badge variant="outline">{summary.left} left</Badge>
                  </div>
                );
              })}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate('/settings/receipt-books')}>
            Open receipt books
          </Button>
        </CardContent>
      </Card>

      {/* Payments and receipts (§65) — the caps the payment, void and reprint rules read */}
      <Card>
        <CardHeader>
          <CardTitle>Payments and receipts</CardTitle>
          <CardDescription>
            The limits the payment, cheque, receipt and register rules enforce (§65). Each one is
            read from here — no screen invents its own default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {PAYMENT_LIMIT_ROWS.map(({ key, label, hint }) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-control border border-hairline p-3">
                <div className="min-w-0">
                  <div className="text-meta font-medium">{label}</div>
                  <div className="text-micro text-ink-muted">{hint}</div>
                </div>
                <Input
                  type="number"
                  min={0}
                  className="w-[130px] text-right tabular-nums"
                  value={String(paymentSettings[key])}
                  onChange={(e) => savePaymentSettings({ [key]: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-control border border-hairline p-3">
            <div className="min-w-0">
              <div className="text-meta font-medium">Receipt footer note</div>
              <div className="text-micro text-ink-muted">printed under every receipt; empty prints nothing (§26, §65)</div>
            </div>
            <Input
              className="w-[280px]"
              value={receiptFooterDraft}
              onChange={(e) => setReceiptFooterDraft(e.target.value)}
              onBlur={() => savePaymentSettings({ receiptFooter: receiptFooterDraft })}
              placeholder="e.g. Fees once paid are not refundable"
            />
          </div>
          <p className="text-micro text-ink-muted">
            An amount above the back-date, adjustment, write-off or refund limit is blocked for an
            Accountant and needs an Admin (§3, §46).
          </p>
        </CardContent>
      </Card>

      {/* Budgets live on the finance page (§47, §68) */}
      <Card>
        <CardHeader>
          <CardTitle>Budgets</CardTitle>
          <CardDescription>
            One plan per cost category per month, with the paid and the still-unpaid parts and
            the 80 and 100 percent alerts (§47). An Admin edits them on the budgets page (§81.6).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={() => navigate('/finance/budgets')}>Open budgets</Button>
        </CardContent>
      </Card>

      {/* Finance entry limits (§77) — the caps the money screens check before an amount */}
      <Card>
        <CardHeader>
          <CardTitle>Finance limits</CardTitle>
          <CardDescription>
            The values the money screens enforce — rupee caps (payouts, petty vouchers, bill
            images, cash warnings) and the day, month and percent settings (back-dating, cheque
            staleness, petty-low and vendor terms). Change a value here; the screens that own
            each limit read it from here (§77).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(DEFAULT_FINANCE_LIMITS) as (keyof FinanceLimits)[]).map((key) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{FINANCE_LIMIT_LABELS[key]}</div>
                  <div className="text-xs text-slate-500">default {financeLimitDefault(FINANCE_LIMIT_UNITS[key], DEFAULT_FINANCE_LIMITS[key])}</div>
                </div>
                <Input
                  type="number"
                  min={0}
                  className="w-[130px] text-right tabular-nums"
                  value={String(financeLimits[key])}
                  onChange={(e) => setFinanceLimits({ [key]: parseInt(e.target.value, 10) || 0 } as Partial<FinanceLimits>)}
                />
              </div>
            ))}
          </div>
          {/* §77: the two settings of this table that are not a number. */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Accept exact statement matches automatically</div>
              <div className="text-xs text-slate-500">default off — every match is confirmed by a person (§77, §81.5)</div>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={financeAutoAcceptMatches}
              onChange={(e) => setFinanceAutoAcceptMatches(e.target.checked)}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Voucher prefix</div>
              <div className="text-xs text-slate-500">default PV- — every payment voucher number starts with it (§29, §77)</div>
            </div>
            <Input
              className="w-[130px]"
              value={voucherPrefixDraft}
              onChange={(e) => setVoucherPrefixDraft(e.target.value)}
              onBlur={() => setVoucherPrefix(voucherPrefixDraft)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Fee terms per year (§5.4) */}
      <Card>
        <CardHeader>
          <CardTitle>Terms Per Year (fees)</CardTitle>
          <CardDescription>
            How many terms make one academic year, per program — an "Every new year" fee falls
            due on the first term of each. Left blank, the program uses the value its course
            system implies.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {PROGRAM_OPTIONS.map((p) => {
              const derived = defaultTermsPerYear(getCourseOfProgram(p.value));
              const override = termsPerYearByProgram[p.value as ProgramCode];
              return (
                <div key={p.value} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.label}</div>
                    <div className="text-xs text-slate-500">{getCourseOfProgram(p.value)} · default {derived}</div>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={4}
                    className="w-[90px] text-right tabular-nums"
                    placeholder={String(derived)}
                    value={override ?? ''}
                    onChange={(e) => setTermsPerYear(p.value, parseInt(e.target.value, 10) || null)}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400">
            Applies to templates created or edited afterwards — a template already saved keeps the
            value it was built with until it is next edited.
          </p>
        </CardContent>
      </Card>

      {/* Re-admission fee (§26.3, §27.5) */}
      <Card>
        <CardHeader>
          <CardTitle>Re-admission fee</CardTitle>
          <CardDescription>
            The fee offered when a struck-off student is reinstated — posted as a special
            charge with a due date. Default 0 means the reinstatement screen suggests no fee.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3 rounded-card border border-hairline p-3">
            <div>
              <div className="text-meta font-medium">Default re-admission fee</div>
              <div className="text-micro text-ink-muted">Whole rupees — the reinstatement screen pre-fills it and can change it</div>
            </div>
            <Input
              type="number"
              min={0}
              className="w-[130px] text-right tabular-nums"
              value={String(reAdmissionFee)}
              onChange={(e) => setReAdmissionFee(parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-card border border-hairline p-3 mt-2">
            <div>
              <div className="text-meta font-medium">Admission cancellation window</div>
              <div className="text-micro text-ink-muted">Days after admission an Accountant may cancel without an Admin override (§27.3); 0 means same-day only</div>
            </div>
            <Input
              type="number"
              min={0}
              className="w-[130px] text-right tabular-nums"
              value={String(cancellationWindowDays)}
              onChange={(e) => setCancellationWindowDays(parseInt(e.target.value, 10) || 0)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Printer Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Printer Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Default Printer</div>
              <div className="text-sm text-slate-500">HP LaserJet 1020</div>
            </div>
            <Button variant="outline" size="sm">
              <Printer size={14} className="mr-1" />
              Test Print
            </Button>
          </div>
          <div>
            <Label>Receipt Paper Size (default for all receipts)</Label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="paper" checked={paperSize === 'A4'} onChange={() => setPaperSize('A4')} /> A4
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="paper" checked={paperSize === '80mm'} onChange={() => setPaperSize('80mm')} /> Thermal 80mm
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Show test records in lists</div>
              <div className="text-sm text-slate-500">Test entries like "Director Sb" SNO:146 hidden by default</div>
            </div>
            <input
              type="checkbox"
              checked={showTestRecords}
              onChange={(e) => setShowTestRecords(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
          </div>
          
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <div>
              <div className="font-medium">Recalculate all ledger balances</div>
              <div className="text-sm text-slate-500">Use if balances appear wrong after sync error</div>
            </div>
            <Button variant="outline" size="sm">
              <Database size={14} className="mr-1" />
              Recalculate
            </Button>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <div className="font-medium mb-2">Expense categories — rename unknowns</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-amber-600">W-1-N</Label>
                <Input placeholder="Rename before use" className="border-amber-300" />
              </div>
              <div>
                <Label className="text-amber-600">W-2-S</Label>
                <Input placeholder="Rename before use" className="border-amber-300" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backup & Restore */}
      <Card>
        <CardHeader>
          <CardTitle>Backup & Restore</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500">Auto-backup</span>
              <div>Daily at 11:00 PM</div>
            </div>
            <div>
              <span className="text-slate-500">Last backup</span>
              <div>23 Mar 2026, 11:00 PM ✅</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">Backup Now</Button>
            <Button variant="outline">Restore from Backup</Button>
            <Button variant="outline">Open Backup Folder</Button>
          </div>
          <div className="text-xs text-amber-600 bg-amber-50/50 p-3 rounded-xl">
            ⚠ Backups on the same PC are lost if the PC is stolen or damaged.
            Copy backup files to a USB drive weekly.
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">MediCMS Desktop</div>
              <div className="text-sm text-slate-500">Version 4.0.0</div>
            </div>
            <Button variant="outline" size="sm">Check for Updates</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
