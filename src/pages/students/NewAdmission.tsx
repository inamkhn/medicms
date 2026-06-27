// ============================================
// MediCMS Desktop v4.0 - New Admission
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { PROGRAM_OPTIONS, BATCH_OPTIONS, SESSION_OPTIONS } from '@/lib/constants';
import { formatPKR, computeFeeTemplateTotal } from '@/lib/utils';
import { MOCK_FEE_TEMPLATES } from '@/lib/mockData';
import type { ProgramCode, BatchName } from '@/types';

type Step = 1 | 2 | 3;

interface FormData {
  name: string;
  fatherName: string;
  contact: string;
  cnic: string;
  address: string;
  regDate: string;
  program: ProgramCode | '';
  batch: BatchName | '';
  session: number | '';
}

export default function NewAdmission() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    fatherName: '',
    contact: '',
    cnic: '',
    address: '',
    regDate: new Date().toISOString().split('T')[0],
    program: '',
    batch: '17th Batch',
    session: 2026,
  });

  // Find matching fee template
  const feeTemplate = MOCK_FEE_TEMPLATES.find(t => 
    t.program === formData.program && 
    t.semester === '1st'
  );

  const totalFee = feeTemplate ? computeFeeTemplateTotal(feeTemplate) : 0;

  // Duplicate check (mock)
  const similarNames = formData.name.length >= 3 ? ['Anwar Ali'] : [];

  const handleNext = () => {
    if (step < 3) setStep((step + 1) as Step);
  };

  const handleBack = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  const handleSubmit = async () => {
    setLoading(true);
    // Simulate save
    await new Promise(r => setTimeout(r, 1000));
    setLoading(false);
    navigate('/students');
  };

  return (
    <div className="w-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">New Admission</h1>
          <p className="text-sm text-slate-500 mt-1">Step {step} of 3</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
              s <= step ? 'bg-gradient-to-r from-blue-500 to-blue-600' : 'bg-slate-100'
            }`}
          />
        ))}
      </div>

      {/* Step 1: Personal Info */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter full name"
              />
            </div>

            <div>
              <Label htmlFor="fatherName">Father Name *</Label>
              <Input
                id="fatherName"
                value={formData.fatherName}
                onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                placeholder="Enter father name"
              />
            </div>

            <div>
              <Label htmlFor="contact">Contact Number</Label>
              <Input
                id="contact"
                value={formData.contact}
                onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                placeholder="+92..."
              />
            </div>

            <div>
              <Label htmlFor="cnic">CNIC / B-Form</Label>
              <Input
                id="cnic"
                value={formData.cnic}
                onChange={(e) => setFormData({ ...formData, cnic: e.target.value })}
                placeholder="Optional — leave blank if not available"
              />
              <p className="text-xs text-slate-400 mt-1">
                Do NOT type "nil" or "n/a" — leave blank instead
              </p>
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Enter address"
              />
            </div>

            <div>
              <Label htmlFor="regDate">Registration Date</Label>
              <Input
                id="regDate"
                type="date"
                value={formData.regDate}
                onChange={(e) => setFormData({ ...formData, regDate: e.target.value })}
              />
            </div>

            {/* Duplicate Check */}
            {similarNames.length > 0 && (
              <div className="bg-amber-50/80 border border-amber-100 rounded-xl p-3.5 text-sm text-amber-600">
                Similar name found: {similarNames.join(', ')} — confirm this is a different person
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Program & Batch */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Program & Batch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Program *</Label>
              <Select
                value={formData.program}
                onValueChange={(v) => setFormData({ ...formData, program: v as ProgramCode })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select program" />
                </SelectTrigger>
                <SelectContent>
                  {PROGRAM_OPTIONS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Semester</Label>
              <div className="text-sm text-slate-600">1st (always for new students)</div>
            </div>

            <div>
              <Label>Batch *</Label>
              <Select
                value={formData.batch}
                onValueChange={(v) => setFormData({ ...formData, batch: v as BatchName })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent>
                  {BATCH_OPTIONS.map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Session (Year)</Label>
              <Select
                value={formData.session?.toString()}
                onValueChange={(v) => setFormData({ ...formData, session: parseInt(v) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select session" />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_OPTIONS.map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Review & Submit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Name</span>
                  <div className="font-medium text-slate-900">{formData.name || '-'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Father</span>
                  <div className="font-medium text-slate-900">{formData.fatherName || '-'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Contact</span>
                  <div className="text-slate-700">{formData.contact || 'Not entered'}</div>
                </div>
                <div>
                  <span className="text-slate-500">CNIC</span>
                  <div className="text-slate-700">{formData.cnic || 'Not entered'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Program</span>
                  <div className="font-medium text-slate-900">{formData.program || '-'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Batch</span>
                  <div className="text-slate-700">{formData.batch}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Initial Fee Demand */}
          {feeTemplate && (
            <Card>
              <CardHeader>
                <CardTitle>Initial Fee Demand (auto-loaded from template)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Admission Fee</span>
                    <span>{formatPKR(feeTemplate.admissionFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tuition Fee</span>
                    <span>{formatPKR(feeTemplate.tuitionFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ID Card Fee</span>
                    <span>{formatPKR(feeTemplate.idCardFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Enrollment Fee</span>
                    <span>{formatPKR(feeTemplate.enrollmentFee)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Annual Charges</span>
                    <span>ⓘ Applies Sem 3+</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Clinical Charges</span>
                    <span>ⓘ Applies Sem 3</span>
                  </div>
                  <div className="flex justify-between font-bold pt-3 border-t border-slate-100">
                    <span>TOTAL DEMAND</span>
                    <span>{formatPKR(totalFee)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={step === 1 ? () => navigate(-1) : handleBack}>
          {step === 1 ? 'Cancel' : 'Back'}
        </Button>
        
        {step < 3 ? (
          <Button onClick={handleNext}>
            Next: {step === 1 ? 'Program' : 'Review'}
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : 'Save Admission'}
          </Button>
        )}
      </div>
    </div>
  );
}
