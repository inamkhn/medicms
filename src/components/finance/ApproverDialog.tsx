// ============================================
// MediCMS Desktop — Finance: approver password (§32)
// Above the Accountant's limit a payment, or its reversal, needs an Admin to
// approve with their own password. This is the one dialog for that: it verifies
// the named account really is an active Admin and the password matches, then
// hands back the approver's name for the entry's `approvedBy`. The pure posting
// helpers still insist on an `approvedBy` when approval was required, so the
// gate cannot be skipped by closing this early.
// ============================================

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { verifyPassword } from '@/lib/crypto';
import { useUserStore } from '@/stores';
import { isLockedOut } from '@/stores/userStore';

interface Props {
  title: string;
  /** Why it is being asked — the amount and the limit that was crossed. */
  blurb: string;
  onApprove: (approverName: string) => void;
  onClose: () => void;
}

export function ApproverDialog({ title, blurb, onApprove, onClose }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    const account = useUserStore.getState().findByUsername(username);
    if (!account || account.role !== 'Admin' || account.status !== 'Active' || isLockedOut(account)) {
      setError('An active Admin must approve this (§32).');
      return;
    }
    const ok = await verifyPassword(password, account.passwordSalt, account.passwordHash);
    if (!ok) {
      setError('The approver password is not correct (§32).');
      return;
    }
    onApprove(account.name);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{blurb}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label>Admin username *</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Approver password *</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">{error}</div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!username.trim() || !password}>Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
