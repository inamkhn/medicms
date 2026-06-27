// ============================================
// MediCMS Desktop v4.0 - Student List
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useUIStore } from '@/stores';

import { getStudentsWithBalance } from '@/lib/mockData';
import { PROGRAM_OPTIONS, BATCH_OPTIONS, SESSION_OPTIONS, SEMESTER_OPTIONS } from '@/lib/constants';
import type { StudentBadgeType } from '@/types';

function StatusBadge({ badge, balance }: { badge: StudentBadgeType; balance: number }) {
  const config: Record<StudentBadgeType, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-emerald-50 text-emerald-600 border border-emerald-100' },
    dues: { label: `PKR ${balance.toLocaleString()} due`, className: 'bg-amber-50 text-amber-600 border border-amber-100' },
    credit: { label: `Credit PKR ${Math.abs(balance).toLocaleString()}`, className: 'bg-blue-50 text-blue-600 border border-blue-100' },
    struck_off: { label: 'Struck Off', className: 'bg-red-50 text-red-600 border border-red-100' },
    struck_off_dues: { label: `Struck Off + PKR ${balance.toLocaleString()}`, className: 'bg-red-50 text-red-600 border border-red-100' },
    struck_off_credit: { label: 'Struck Off + Credit', className: 'bg-red-50 text-red-600 border border-red-100' },
  };

  const { label, className } = config[badge];
  return <Badge className={className}>{label}</Badge>;
}

export default function StudentList() {
  const navigate = useNavigate();
  const openDrawer = useUIStore((s) => s.openDrawer);
  
  const [search, setSearch] = useState('');
  const [programFilter, setProgramFilter] = useState<string>('all');
  const [batchFilter, setBatchFilter] = useState<string>('all');
  const [sessionFilter, setSessionFilter] = useState<string>('all');
  const [semesterFilter, setSemesterFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const allStudents = getStudentsWithBalance().filter(s => !s.isTestRecord);

  // Apply filters
  const filteredStudents = allStudents.filter(s => {
    if (search) {
      const q = search.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && 
          !s.sno.toString().includes(q) &&
          !s.fatherName.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (programFilter !== 'all' && s.program !== programFilter) return false;
    if (batchFilter !== 'all' && s.batch !== batchFilter) return false;
    if (sessionFilter !== 'all' && s.session.toString() !== sessionFilter) return false;
    if (semesterFilter !== 'all' && s.semester !== semesterFilter) return false;
    
    // Status filter
    if (statusFilter === 'active' && s.struckOff) return false;
    if (statusFilter === 'struck_off' && !s.struckOff) return false;
    if (statusFilter === 'dues' && (s.computedBalance <= 0 || s.struckOff)) return false;
    if (statusFilter === 'credit' && s.computedBalance >= 0) return false;
    
    return true;
  });

  const totalPages = Math.ceil(filteredStudents.length / PAGE_SIZE);
  const paginatedStudents = filteredStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Stats
  const activeCount = allStudents.filter(s => !s.struckOff).length;
  const struckOffCount = allStudents.filter(s => s.struckOff).length;
  const creditCount = allStudents.filter(s => s.computedBalance < 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Students</h1>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant="secondary" className="text-xs">{activeCount} Active</Badge>
            <Badge variant="secondary" className="text-xs bg-red-50 text-red-600 border border-red-100">{struckOffCount} Struck Off</Badge>
            <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-600 border border-blue-100">{creditCount} Credit</Badge>
          </div>
        </div>
        <Button onClick={() => navigate('/admissions/new')}>
          <Plus size={16} className="mr-2" />
          New Admission
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center p-4 bg-white rounded-2xl shadow-sm border border-slate-100/60">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SNO, father..."
            className="pl-10"
          />
        </div>

        <Select value={programFilter} onValueChange={setProgramFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Program" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programs</SelectItem>
            {PROGRAM_OPTIONS.map(p => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={batchFilter} onValueChange={setBatchFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Batch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Batches</SelectItem>
            {BATCH_OPTIONS.map(b => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sessionFilter} onValueChange={setSessionFilter}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Session" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sessions</SelectItem>
            {SESSION_OPTIONS.map(y => (
              <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={semesterFilter} onValueChange={setSemesterFilter}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Semester" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Semesters</SelectItem>
            {SEMESTER_OPTIONS.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="struck_off">Struck Off</SelectItem>
            <SelectItem value="dues">With Dues</SelectItem>
            <SelectItem value="credit">Credit Balance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">SNO</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedStudents.map((student) => (
              <TableRow
                key={student.sno}
                className="cursor-pointer"
                onClick={() => openDrawer(student)}
              >
                <TableCell className="font-medium text-slate-900">{student.sno}</TableCell>
                <TableCell>
                  <div className="font-medium text-slate-900">{student.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{student.fatherName}</div>
                </TableCell>
                <TableCell className="text-slate-600">{student.program}</TableCell>
                <TableCell className="text-slate-600">{student.batch}</TableCell>
                <TableCell>
                  <StatusBadge badge={student.badge} balance={student.computedBalance} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {filteredStudents.length === 0 && (
          <div className="text-center py-14 text-slate-400 text-sm">
            No students found matching your filters
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-5 border-t border-slate-100/60">
            <div className="text-sm text-slate-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft size={14} className="mr-1" />
                Prev
              </Button>
              <span className="text-sm text-slate-500">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
                <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
