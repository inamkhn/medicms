// ============================================
// MediCMS Desktop v4.0 - Audit Trail
// Module 10 - Audit log viewer with detail panel
// Every action is logged: who, what, when, student
// ============================================

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Search, Filter, ChevronDown, ChevronUp,
  UserPlus, CreditCard, FileEdit, UserX, UserCheck,
  Database, ArrowRightLeft, LogIn, Download, PlusCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import { useAuditStore } from '@/stores';
import type { AuditAction } from '@/types';

// Action icon map
const ACTION_ICONS: Record<string, React.ReactNode> = {
  'Payment': <CreditCard size={14} />,
  'Fee Demand': <PlusCircle size={14} />,
  'Charge Added': <PlusCircle size={14} />,
  'Ledger Adjustment': <ArrowRightLeft size={14} />,
  'New Admission': <UserPlus size={14} />,
  'Student Edit': <FileEdit size={14} />,
  'Struck Off': <UserX size={14} />,
  'Struck Off Reversed': <UserCheck size={14} />,
  'Bank Entry': <Database size={14} />,
  'Expense Added': <PlusCircle size={14} />,
  'Fee Template Change': <FileEdit size={14} />,
  'Sync Event': <Database size={14} />,
  'Login': <LogIn size={14} />,
  'Data Import': <Download size={14} />,
};

// Action color
const ACTION_COLORS: Record<string, string> = {
  'Payment': 'bg-emerald-50 text-emerald-600 border border-emerald-100',
  'Fee Demand': 'bg-blue-50 text-blue-600 border border-blue-100',
  'Charge Added': 'bg-purple-50 text-purple-600 border border-purple-100',
  'Ledger Adjustment': 'bg-orange-50 text-orange-600 border border-orange-100',
  'New Admission': 'bg-emerald-50 text-emerald-600 border border-emerald-100',
  'Student Edit': 'bg-yellow-50 text-yellow-600 border border-yellow-100',
  'Struck Off': 'bg-red-50 text-red-600 border border-red-100',
  'Struck Off Reversed': 'bg-teal-50 text-teal-600 border border-teal-100',
  'Bank Entry': 'bg-indigo-50 text-indigo-600 border border-indigo-100',
  'Expense Added': 'bg-pink-50 text-pink-600 border border-pink-100',
  'Fee Template Change': 'bg-cyan-50 text-cyan-600 border border-cyan-100',
  'Sync Event': 'bg-slate-50 text-slate-600 border border-slate-100',
  'Login': 'bg-slate-50 text-slate-600 border border-slate-100',
  'Data Import': 'bg-violet-50 text-violet-600 border border-violet-100',
};

// All unique actions for filter
const ALL_ACTIONS: AuditAction[] = [
  'Payment', 'Fee Demand', 'Charge Added', 'Ledger Adjustment',
  'New Admission', 'Student Edit', 'Struck Off', 'Struck Off Reversed',
  'Bank Entry', 'Expense Added', 'Fee Template Change',
  'Sync Event', 'Login', 'Data Import',
];

export default function AuditTrail() {
  const navigate = useNavigate();
  const logs = useAuditStore((s) => s.logs);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [userFilter, setUserFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(true);

  // Get unique users for filter
  const users = useMemo(() => {
    return [...new Set(logs.map((a) => a.user))];
  }, [logs]);

  const filtered = useMemo(() => {
    let data = [...logs];

    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (a) =>
          a.details.toLowerCase().includes(q) ||
          a.user.toLowerCase().includes(q) ||
          a.action.toLowerCase().includes(q) ||
          (a.studentSno && a.studentSno.toString().includes(q))
      );
    }

    if (actionFilter) {
      data = data.filter((a) => a.action === actionFilter);
    }

    if (userFilter) {
      data = data.filter((a) => a.user === userFilter);
    }

    data.sort((a, b) => {
      const cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return sortDesc ? -cmp : cmp;
    });

    return data;
  }, [logs, search, actionFilter, userFilter, sortDesc]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Audit Trail</h1>
            <p className="text-sm text-slate-500">
              Complete log of every action — who did what, when, and to which student
            </p>
          </div>
        </div>
        <Badge variant="outline">{filtered.length} entries</Badge>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search by details, user, action, SNO..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter size={14} className="text-slate-400" />
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm bg-white"
              >
                <option value="">All Actions</option>
                {ALL_ACTIONS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm bg-white"
            >
              <option value="">All Users</option>
              {users.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortDesc(!sortDesc)}
            >
              {sortDesc ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              <span className="ml-1">{sortDesc ? 'Newest first' : 'Oldest first'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Audit Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>SNO</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                    No audit entries match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((log) => {
                  const isExpanded = expandedId === log.id;
                  const hasChanges = log.changes && log.changes.length > 0;

                  return (
                    <TableRow key={log.id} className="group">
                      <TableCell>
                        {hasChanges && (
                          <button
                            onClick={() => toggleExpand(log.id)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDateTime(log.timestamp)}
                      </TableCell>
                      <TableCell className="text-sm">{log.user}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs gap-1 ${ACTION_COLORS[log.action] ?? 'bg-slate-50 text-slate-600 border border-slate-100'}`}
                        >
                          {ACTION_ICONS[log.action]}
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {log.studentSno ? (
                          <button
                            onClick={() => navigate(`/students`)}
                            className="text-blue-600 hover:underline"
                          >
                            #{log.studentSno}
                          </button>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 max-w-xs truncate">
                        {log.details}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Expanded Detail Panel */}
      {expandedId && (
        <Card className="border-blue-100">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Change Details
              <Badge variant="outline" className="text-xs">
                {logs.find((a) => a.id === expandedId)?.action}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const log = logs.find((a) => a.id === expandedId);
              if (!log?.changes || log.changes.length === 0) {
                return <div className="text-slate-400 text-sm">No field-level changes recorded.</div>;
              }
              return (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-slate-500">
                      <th className="pb-2">Field</th>
                      <th className="pb-2">Before</th>
                      <th className="pb-2">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.changes.map((c, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 font-medium">{c.field}</td>
                        <td className="py-2 text-red-600 line-through">{c.before}</td>
                        <td className="py-2 text-green-600">{c.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Info Footer */}
      <div className="text-xs text-slate-400 text-center">
        Audit records are INSERT-ONLY — they cannot be edited or deleted. All actions are
        permanently recorded for accountability.
      </div>
    </div>
  );
}
