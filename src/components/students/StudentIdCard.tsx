// Student module — CR80 ID card print component (spec §8.5)
// Fixed physical size 85.6mm x 54mm landscape; screen shows preview scale.

import { User } from 'lucide-react';
import type { Student } from '@/types';

export function StudentIdCard({ student, courseLabel, programLabel, instituteName, instituteLocation }: {
  student: Student;
  courseLabel: string;
  programLabel: string;
  instituteName: string;
  instituteLocation: string;
}) {
  return (
    <div
      className="id-card-cr80 mx-auto bg-white text-black overflow-hidden"
      style={{ width: '85.6mm', minHeight: '54mm' }}
    >
      <div className="p-2 flex gap-2 items-center" style={{ width: '85.6mm', height: '54mm' }}>
        <div className="shrink-0 rounded overflow-hidden bg-slate-100 border border-black flex items-center justify-center" style={{ width: '22mm', height: '28mm' }}>
          {student.photoUrl
            ? <img src={student.photoUrl} alt={student.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <User size={20} className="text-slate-400" />}
        </div>
        <div className="min-w-0 flex-1" style={{ fontSize: '8pt', lineHeight: 1.35 }}>
          <div className="font-bold truncate" style={{ fontSize: '7pt' }}>{instituteName}</div>
          <div className="font-bold truncate" style={{ fontSize: '10pt' }}>{student.name}</div>
          <div>S/O {student.fatherName}</div>
          <div className="font-bold tabular-nums">SNO: {student.sno}</div>
          <div className="truncate">{courseLabel} — {programLabel}</div>
          <div>{student.batch} · Session {student.session}</div>
          <div className="mt-1 inline-block px-1 font-bold" style={{ background: '#2451B8', color: '#fff', fontSize: '7pt' }}>
            {student.session}
          </div>
        </div>
      </div>
      <div className="px-2 pb-1 text-[7pt] text-black/70">
        {instituteLocation}
        {student.cnic ? ` · CNIC ${student.cnic}` : ''}{student.contact ? ` · ${student.contact}` : ''}
      </div>
    </div>
  );
}
