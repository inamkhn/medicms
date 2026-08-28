// ============================================
// MediCMS Desktop v4.0 - Data Import Wizard
// Module 0 - 5-step import wizard for migrating data
// Steps: Students → Fee Templates → Ledger → Bank → Expenses → Verify
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, AlertTriangle, X,
  Upload, Users, FileText, CreditCard, Building2, Receipt, ShieldCheck,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MOCK_IMPORT_STEPS } from '@/lib/mockData';
import type { ImportStep } from '@/types';

const STEP_ICONS: Record<string, React.ReactNode> = {
  students: <Users size={20} />,
  templates: <FileText size={20} />,
  ledger: <CreditCard size={20} />,
  bank: <Building2 size={20} />,
  expenses: <Receipt size={20} />,
  verify: <ShieldCheck size={20} />,
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-50 text-slate-500 border border-slate-100',
  in_progress: 'bg-blue-50 text-blue-600 border border-blue-100',
  completed: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
  warning: 'bg-amber-50 text-amber-600 border border-amber-100',
  error: 'bg-red-50 text-red-600 border border-red-100',
};

export default function DataImport() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<ImportStep[]>(MOCK_IMPORT_STEPS);
  const [running, setRunning] = useState(false);
  const [importComplete, setImportComplete] = useState(false);

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isVerifyStep = step.id === 'verify';

  const handleRunStep = () => {
    setRunning(true);
    // Simulate processing
    setTimeout(() => {
      setSteps((prev) =>
        prev.map((s, i) => {
          if (i !== currentStep) return s;
          if (s.status === 'warning') return { ...s, status: 'warning' };
          return { ...s, status: 'completed' as const };
        })
      );
      setRunning(false);
    }, 1200);
  };

  const handleNext = () => {
    if (isLastStep) {
      setImportComplete(true);
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const totalRecords = steps.reduce((sum, s) => sum + (s.recordsCount ?? 0), 0);
  const completedSteps = steps.filter((s) => s.status === 'completed').length;
  const warningSteps = steps.filter((s) => s.status === 'warning').length;

  if (importComplete) {
    return (
      <div className="w-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={16} />
          </Button>
          <h1 className="text-2xl font-bold text-slate-900">Import Complete</h1>
        </div>

        <Card className="border-emerald-100 bg-emerald-50/50">
          <CardContent className="py-8 text-center">
            <Check size={48} className="mx-auto text-green-600 mb-4" />
            <h2 className="text-xl font-bold text-emerald-800 mb-2">Data Import Successful</h2>
            <p className="text-sm text-emerald-700 mb-6">
              All data has been imported and verified. {totalRecords} records processed across{' '}
              {steps.length} categories.
            </p>
            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-6">
              <div>
                <div className="text-2xl font-bold text-emerald-700">{completedSteps}</div>
                <div className="text-xs text-emerald-600">Completed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-600">{warningSteps}</div>
                <div className="text-xs text-amber-600">Warnings</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-700">{totalRecords}</div>
                <div className="text-xs text-slate-600">Records</div>
              </div>
            </div>
            <Button onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>

        {warningSteps > 0 && (
          <Card className="border-amber-200">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-500" />
                Warnings to Review
              </CardTitle>
            </CardHeader>
            <CardContent>
              {steps
                .filter((s) => s.status === 'warning')
                .map((s) => (
                  <div key={s.id} className="flex items-start gap-3 p-3 bg-amber-50/50 rounded-xl mb-2 last:mb-0">
                    <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-medium text-sm">{s.name}</div>
                      {s.warnings?.map((w, i) => (
                        <div key={i} className="text-xs text-amber-600 mt-1">
                          {w}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="w-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Import Wizard</h1>
          <p className="text-sm text-slate-500">
            Import data from legacy system — follow each step in order
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-700">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="text-sm text-slate-500">
              {completedSteps} completed · {totalRecords} records
            </span>
          </div>
          <div className="flex gap-1">
            {steps.map((s, i) => (
              <div
                key={s.id}
                className={`h-2 flex-1 rounded-full transition-colors ${
                  s.status === 'completed'
                    ? 'bg-green-500'
                    : s.status === 'warning'
                      ? 'bg-amber-500'
                      : s.status === 'error'
                        ? 'bg-red-500'
                        : i === currentStep
                          ? 'bg-blue-500'
                          : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step Navigation Sidebar + Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Sidebar: Step List */}
        <div className="space-y-2">
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setCurrentStep(i)}
              className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                i === currentStep
                  ? 'border-blue-500 bg-blue-50/50'
                  : s.status === 'completed'
                    ? 'border-emerald-100 bg-emerald-50/50'
                    : s.status === 'warning'
                      ? 'border-amber-100 bg-amber-50/50'
                      : 'border-slate-100/60 hover:border-slate-200'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  s.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-600'
                    : i === currentStep
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {s.status === 'completed' ? <Check size={16} /> : STEP_ICONS[s.id]}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${
                  i === currentStep ? 'text-blue-700' : 'text-slate-700'
                }`}>
                  {s.name}
                </div>
                {s.recordsCount !== undefined && (
                  <div className="text-xs text-slate-400">{s.recordsCount} records</div>
                )}
              </div>
              <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_COLORS[s.status] ?? ''}`}>
                {s.status}
              </Badge>
            </button>
          ))}
        </div>

        {/* Main Content */}
        <div className="col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                  {STEP_ICONS[step.id]}
                </div>
                <div>
                  <CardTitle className="text-base">{step.name}</CardTitle>
                  <CardDescription>
                    {step.status === 'completed'
                      ? 'Step completed successfully'
                      : step.status === 'warning'
                        ? 'Completed with warnings — review below'
                        : step.status === 'in_progress'
                          ? 'Processing...'
                          : 'Ready to process'}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Step Details */}
              {step.id === 'students' && (
                <div className="text-sm text-slate-600 space-y-2">
                  <p>Import student records from the legacy database or Excel file.</p>
                  <ul className="list-disc list-inside text-slate-500 space-y-1">
                    <li>Maps old student IDs to new SNO numbers</li>
                    <li>Validates CNIC format (null if invalid)</li>
                    <li>Detects test records automatically</li>
                  </ul>
                  <div className="flex items-center gap-2 p-3 bg-blue-50/50 rounded-xl">
                    <Upload size={16} className="text-blue-500" />
                    <span className="text-sm text-blue-700">Select file or drag & drop</span>
                  </div>
                </div>
              )}

              {step.id === 'templates' && (
                <div className="text-sm text-slate-600 space-y-2">
                  <p>Import fee templates with course/sub-course and semester/year fee structures.</p>
                  <ul className="list-disc list-inside text-slate-500 space-y-1">
                    <li>All 8 fee components mapped correctly</li>
                    <li>Business rules validated (Annual Sem 3+, Clinical Sem 3, Diploma Sem 4)</li>
                    <li>Duplicates detected by course+program+semester+batch</li>
                  </ul>
                </div>
              )}

              {step.id === 'ledger' && (
                <div className="text-sm text-slate-600 space-y-2">
                  <p>Map ledger transactions to imported student SNOs.</p>
                  <ul className="list-disc list-inside text-slate-500 space-y-1">
                    <li>Links by old student ID → new SNO mapping</li>
                    <li>Unmatched entries flagged as warnings</li>
                    <li>Balance recomputed from transactions</li>
                  </ul>
                </div>
              )}

              {step.id === 'bank' && (
                <div className="text-sm text-slate-600 space-y-2">
                  <p>Import bank ledger entries (deposits and withdrawals).</p>
                  <ul className="list-disc list-inside text-slate-500 space-y-1">
                    <li>Running balance verified against bank statement</li>
                    <li>Personal transactions flagged separately</li>
                  </ul>
                </div>
              )}

              {step.id === 'expenses' && (
                <div className="text-sm text-slate-600 space-y-2">
                  <p>Import expense records and auto-link to bank withdrawals where possible.</p>
                  <ul className="list-disc list-inside text-slate-500 space-y-1">
                    <li>Categories mapped to standard expense codes</li>
                    <li>Unknown categories flagged for renaming</li>
                    <li>Amount + date matching with bank withdrawals</li>
                  </ul>
                </div>
              )}

              {step.id === 'verify' && (
                <div className="text-sm text-slate-600 space-y-3">
                  <p className="font-medium">Final verification before committing import:</p>
                  <div className="space-y-2">
                    {steps.filter((s) => s.id !== 'verify').map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                        <span>{s.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">{s.recordsCount ?? 0} records</span>
                          {s.status === 'completed' ? (
                            <Check size={14} className="text-green-600" />
                          ) : s.status === 'warning' ? (
                            <AlertTriangle size={14} className="text-amber-500" />
                          ) : (
                            <X size={14} className="text-red-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {warningSteps > 0 && (
                    <div className="flex items-start gap-2 bg-amber-50/50 p-3 rounded-xl text-amber-700">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      <span>
                        {warningSteps} step{warningSteps > 1 ? 's have' : ' has'} warnings.
                        Review and accept before proceeding.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Warnings */}
              {step.warnings && step.warnings.length > 0 && (
                <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3">
                  <div className="font-medium text-amber-800 text-sm mb-1">Warnings:</div>
                  {step.warnings.map((w, i) => (
                    <div key={i} className="text-sm text-amber-700 flex items-start gap-2">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Record Count */}
              {step.recordsCount !== undefined && step.status === 'completed' && (
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50/50 p-3 rounded-xl">
                  <Check size={16} />
                  <span className="text-sm font-medium">
                    {step.recordsCount} records imported successfully
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex justify-between mt-4">
            <Button
              variant="outline"
              onClick={handlePrev}
              disabled={currentStep === 0}
            >
              <ArrowLeft size={16} className="mr-1" />
              Previous
            </Button>

            <div className="flex gap-2">
              {step.status === 'pending' && !isVerifyStep && (
                <Button onClick={handleRunStep} disabled={running}>
                  {running ? (
                    <>
                      <Loader2 size={16} className="mr-1 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload size={16} className="mr-1" />
                      Run Import
                    </>
                  )}
                </Button>
              )}

              <Button
                onClick={handleNext}
                disabled={step.status === 'pending' && !isVerifyStep}
              >
                {isLastStep ? (
                  <>
                    <Check size={16} className="mr-1" />
                    Confirm & Finish
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight size={16} className="ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
