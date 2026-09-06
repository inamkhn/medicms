// ============================================
// MediCMS - Batches (per-program CRUD)
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { COURSES, SESSION_OPTIONS, getCourseDef, getSubCourseDef } from '@/lib/constants';
import { useBatchStore } from '@/stores/batchStore';
import { useAuditStore, useAuthStore, useStudentStore } from '@/stores';
import type { Batch, CourseCode, ProgramCode } from '@/types';

export default function Batches() {
  const navigate = useNavigate();
  const batches = useBatchStore((s) => s.batches);
  const addBatch = useBatchStore((s) => s.addBatch);
  const renameBatch = useBatchStore((s) => s.renameBatch);
  const setActive = useBatchStore((s) => s.setActive);

  const [course, setCourse] = useState<CourseCode | ''>('');
  const [program, setProgram] = useState<ProgramCode | ''>('');
  const [name, setName] = useState('');
  const [session, setSession] = useState(String(new Date().getFullYear()));
  const [filterProgram, setFilterProgram] = useState<string>('all');
  const [error, setError] = useState('');

  const programOptions = course ? getCourseDef(course).subCourses : [];

  const filtered = batches.filter((b) => {
    if (filterProgram !== 'all' && b.program !== filterProgram) return false;
    return true;
  });

  const handleAdd = () => {
    setError('');
    if (!program || !name.trim()) {
      setError('Program and batch name are required.');
      return;
    }
    const created = addBatch(program as ProgramCode, name.trim(), parseInt(session, 10) || new Date().getFullYear());
    if (!created) {
      setError('A batch with this name already exists for the selected program.');
      return;
    }
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Data Import',
      details: `Batch created: ${created.name} · ${getSubCourseDef(created.program).sub.label} · Session ${created.session}`,
    });
    setName('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Batches</h1>
          <p className="text-sm text-slate-500">Each batch belongs to one program — admission shows only that program's batches</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Batch</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Course *</Label>
              <Select
                value={course}
                onValueChange={(v) => {
                  setCourse(v as CourseCode);
                  const def = getCourseDef(v as CourseCode);
                  setProgram(def.subCourses.length === 1 ? def.subCourses[0].value : ('' as any));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                <SelectContent>
                  {COURSES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Program *</Label>
              <Select value={program} onValueChange={(v) => setProgram(v as ProgramCode)} disabled={!course}>
                <SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger>
                <SelectContent>
                  {programOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Batch name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 1st Batch, Batch-A 2026" />
            </div>
            <div>
              <Label>Session</Label>
              <Select value={session} onValueChange={setSession}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SESSION_OPTIONS.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{error}</div>}
          <Button onClick={handleAdd} disabled={!program || !name.trim()}>
            <Plus size={16} className="mr-1" /> Add Batch
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Batches ({filtered.length})</CardTitle>
            <Select value={filterProgram} onValueChange={setFilterProgram}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="All programs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All programs</SelectItem>
                {COURSES.flatMap((c) => c.subCourses).map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[140px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => (
                <BatchRow
                  key={b.id}
                  batch={b}
                  onRename={(name, session) => {
                    const clash = batches.some(
                      (x) => x.id !== b.id && x.program === b.program && x.name.toLowerCase() === name.trim().toLowerCase()
                    );
                    if (!name.trim()) { setError('Batch name cannot be empty.'); return; }
                    if (clash) { setError(`"${name.trim()}" already exists for ${getSubCourseDef(b.program).sub.label}.`); return; }
                    renameBatch(b.id, name.trim(), session);
                  }}
                  onToggle={() => {
                    if (b.isActive) {
                      const inUse = useStudentStore.getState().students.some(
                        (s) => s.program === b.program && s.batch === b.name
                      );
                      if (inUse && !window.confirm(`"${b.name}" has students. Disable anyway? Existing students keep history; new admissions won't see it.`)) return;
                    }
                    setActive(b.id, !b.isActive);
                  }}
                />
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                    No batches — add one above
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="p-3 text-xs text-slate-400">
            Rename updates the batch record; students already admitted keep their saved batch name — re-link them via Edit if needed.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BatchRow({ batch: b, onRename, onToggle }: {
  batch: Batch;
  onRename: (name: string, session: number) => void;
  onToggle: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(b.name);
  const [session, setSession] = useState(String(b.session));
  if (!editing) {
    return (
      <TableRow>
        <TableCell className="font-medium">{b.name}</TableCell>
        <TableCell>{getSubCourseDef(b.program).sub.label}</TableCell>
        <TableCell>{b.session}</TableCell>
        <TableCell>
          <Badge variant="outline" className={b.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-500'}>
            {b.isActive ? 'Active' : 'Disabled'}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => { setName(b.name); setSession(String(b.session)); setEditing(true); }}>Rename</Button>
            <Button variant="outline" size="sm" onClick={onToggle}>{b.isActive ? 'Disable' : 'Enable'}</Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }
  return (
    <TableRow>
      <TableCell><Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" /></TableCell>
      <TableCell>{getSubCourseDef(b.program).sub.label}</TableCell>
      <TableCell>
        <Select value={session} onValueChange={setSession}>
          <SelectTrigger className="h-8 w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SESSION_OPTIONS.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={b.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-500'}>
          {b.isActive ? 'Active' : 'Disabled'}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button size="sm" onClick={() => { onRename(name, parseInt(session, 10) || b.session); setEditing(false); }}>Save</Button>
          <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
