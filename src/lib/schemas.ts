// ============================================
// MediCMS Desktop v4.0 - Zod Schemas
// ============================================

import { z } from 'zod';
import { isValidCNIC, normalizeCNIC, isValidContact } from '@/lib/utils';

export const admissionSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  fatherName: z.string().trim().min(1, 'Father name is required').max(100),
  contact: z.string().trim().refine(v => isValidContact(v), { message: 'Invalid PK number — use 03XX-XXXXXXX or +92XXXXXXXXXX' }),
  cnic: z.string().trim().refine(v => {
    const n = normalizeCNIC(v);
    return n === null || isValidCNIC(n);
  }, { message: 'CNIC must be 13 digits (XXXXX-XXXXXXX-X)' }),
  address: z.string().trim().max(200).optional(),
  regDate: z.string().min(1, 'Registration date required'),
  dob: z.string().optional().refine(v => !v || new Date(v) <= new Date(), { message: 'DOB cannot be in the future' }),
  gender: z.enum(['', 'Male', 'Female', 'Other']).optional(),
  domicile: z.string().trim().max(50).optional(),
  emergencyContact: z.string().trim().refine(v => isValidContact(v), { message: 'Invalid PK number' }),
  photoUrl: z.string().nullable().optional(),
  course: z.string().min(1, 'Course is required'),
  program: z.string().min(1, 'Sub-course is required'),
  semester: z.string().min(1),
  batch: z.string().min(1, 'Batch is required'),
  session: z.union([z.number(), z.string()]).refine(v => String(v).length === 4, { message: 'Session invalid' }),
});

export type AdmissionFormData = z.infer<typeof admissionSchema>;

export const editStudentSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  fatherName: z.string().trim().min(1, 'Father name is required'),
  contact: z.string().trim().refine(v => isValidContact(v), { message: 'Invalid PK number' }),
  cnic: z.string().trim().refine(v => {
    const n = normalizeCNIC(v);
    return n === null || isValidCNIC(n);
  }, { message: 'CNIC must be 13 digits' }),
  address: z.string().trim().max(200).optional(),
  dob: z.string().optional().refine(v => !v || new Date(v) <= new Date(), { message: 'DOB cannot be in the future' }),
  gender: z.enum(['', 'Male', 'Female', 'Other']).optional(),
  domicile: z.string().trim().max(50).optional(),
  emergencyContact: z.string().trim().refine(v => isValidContact(v), { message: 'Invalid PK number' }),
  photoUrl: z.string().nullable().optional(),
  semester: z.string().min(1),
  reason: z.string().trim().min(1, 'Reason is required for audit trail'),
});

export type EditStudentFormData = z.infer<typeof editStudentSchema>;
