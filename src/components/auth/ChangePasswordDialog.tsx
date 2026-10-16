import { useState } from 'react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/authStore';
import { toastSuccess } from '@/lib/toast';

// ============================================
// ChangePasswordDialog — Feature 1 §7
// Used two ways: from the account menu (voluntary) and forced after an admin
// reset (mustChangePassword). The current password is always required, because
// even a temporary reset password is one the user was told and now types.
// ============================================

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful change (used to leave the forced-change screen). */
  onDone?: () => void;
  /** True when the user cannot dismiss the dialog until they change it. */
  forced?: boolean;
}

export function ChangePasswordDialog({ open, onOpenChange, onDone, forced = false }: ChangePasswordDialogProps) {
  const changePassword = useAuthStore((s) => s.changePassword);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError('');
  };

  const close = (o: boolean) => {
    if (forced && !o) return; // a forced change cannot be dismissed by Escape/backdrop
    if (!o) reset();
    onOpenChange(o);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    const res = await changePassword(current, next);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not change the password.');
      return;
    }
    toastSuccess({ title: 'Password changed' });
    reset();
    onDone?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-sm" showClose={!forced}>
        <DialogHeader>
          <DialogTitle>{forced ? 'Choose a new password' : 'Change password'}</DialogTitle>
          <DialogDescription>
            {forced
              ? 'An administrator reset your password. Set your own before continuing.'
              : 'Pick a password you have not used here before.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cp-current">Current password</Label>
              <Input id="cp-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-new">New password</Label>
              <Input id="cp-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-confirm">Confirm new password</Label>
              <Input id="cp-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>
            <p className="text-micro text-ink-subtle">At least 8 characters, and not equal to your username.</p>

            {error ? (
              <div className="rounded-control border border-danger/30 bg-danger-soft p-3 text-body text-danger" role="alert">
                {error}
              </div>
            ) : null}

            <DialogFooter className="border-0 p-0">
              {!forced && (
                <Button type="button" variant="ghost" onClick={() => close(false)}>
                  Cancel
                </Button>
              )}
              <Button type="submit" loading={busy} disabled={busy}>
                Save new password
              </Button>
            </DialogFooter>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
