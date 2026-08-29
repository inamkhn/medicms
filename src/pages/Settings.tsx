// ============================================
// MediCMS Desktop v4.0 - Settings
// ============================================

import { useState } from 'react';
import { RefreshCw, Database, Printer, Server, Wifi, WifiOff, TestTube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSyncStore } from '@/stores/syncStore';
import { useSettingsStore, useReceiptBookStore, useBudgetStore } from '@/stores';
import { formatDateTime } from '@/lib/utils';
import { BANK_INFO, INSTITUTE_INFO, EXPENSE_CATEGORY_OPTIONS } from '@/lib/constants';

export default function Settings() {
  const { status, lastSync, pendingCount, setSyncing, syncComplete } = useSyncStore();
  const { showTestRecords, setShowTestRecords } = useSettingsStore();
  const { books, addBook } = useReceiptBookStore();
  const { budgets, setBudget } = useBudgetStore();
  const [budgetMonth, setBudgetMonth] = useState(new Date().toISOString().slice(0,7));
  const [newBookNo, setNewBookNo] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [newAssigned, setNewAssigned] = useState('Admin Khalid');
  const [instituteName, setInstituteName] = useState(INSTITUTE_INFO.name);
  const [instituteAddress, setInstituteAddress] = useState(INSTITUTE_INFO.location);
  const [institutePhone, setInstitutePhone] = useState(INSTITUTE_INFO.phone);
  const [bankName, setBankName] = useState(BANK_INFO.name);
  const [accountNo, setAccountNo] = useState(BANK_INFO.accountNo);
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
            <Input value={instituteName} onChange={(e) => setInstituteName(e.target.value)} />
          </div>
          <div>
            <Label>Address</Label>
            <Input value={instituteAddress} onChange={(e) => setInstituteAddress(e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={institutePhone} onChange={(e) => setInstitutePhone(e.target.value)} />
          </div>
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
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </div>
          <div>
            <Label>Account Number</Label>
            <Input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Receipt Books */}
      <Card>
        <CardHeader>
          <CardTitle>Receipt Books</CardTitle>
          <CardDescription>Pre-printed receipt ranges — auto-fills next number in Record Payment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {books.map(b => (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100">
                <div>
                  <div className="font-medium text-sm">{b.bookNo} — {b.start} to {b.end}</div>
                  <div className="text-xs text-slate-500">Assigned to {b.assignedTo} · Next #{b.current} {b.current > b.end ? '(exhausted)' : ''} · {b.isActive ? 'Active' : 'Inactive'}</div>
                </div>
                <Badge variant="outline" className={b.current <= b.end ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}>{b.current <= b.end ? `${b.end - b.current + 1} left` : 'Exhausted'}</Badge>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-100">
            <Input placeholder="Book No e.g. Book-03" value={newBookNo} onChange={e=>setNewBookNo(e.target.value)} />
            <Input placeholder="Start e.g. 2001" value={newStart} onChange={e=>setNewStart(e.target.value)} />
            <Input placeholder="End e.g. 3000" value={newEnd} onChange={e=>setNewEnd(e.target.value)} />
            <Input placeholder="Assigned To" value={newAssigned} onChange={e=>setNewAssigned(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={()=>{
            const s=parseInt(newStart,10), e=parseInt(newEnd,10);
            if(!newBookNo.trim() || isNaN(s) || isNaN(e) || s>=e) { alert('Enter Book No and valid start < end'); return; }
            addBook({ bookNo: newBookNo.trim(), start: s, end: e, assignedTo: newAssigned.trim() || 'Admin', isActive: true });
            setNewBookNo(''); setNewStart(''); setNewEnd('');
          }}>Add Book</Button>
        </CardContent>
      </Card>

      {/* Budget Management */}
      <Card>
        <CardHeader>
          <CardTitle>Budgets</CardTitle>
          <CardDescription>Monthly budget per expense category — shown on Expenses page</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Label>Month</Label>
            <Input type="month" value={budgetMonth} onChange={e=>setBudgetMonth(e.target.value)} className="w-[160px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {EXPENSE_CATEGORY_OPTIONS.map(cat => {
              const val = budgets.find(b=>b.category===cat.value && b.month===budgetMonth)?.amount ?? '';
              return (
                <div key={cat.value} className="flex items-center gap-2">
                  <Label className="w-32 text-xs">{cat.label}</Label>
                  <Input type="number" placeholder="0" value={String(val)} onChange={e=> setBudget(cat.value as any, budgetMonth, parseInt(e.target.value,10)||0)} className="flex-1 h-8" />
                </div>
              );
            })}
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
            <Label>Receipt Paper Size</Label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2">
                <input type="radio" name="paper" /> A4
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="paper" /> A5
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="paper" defaultChecked /> Thermal 80mm
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
