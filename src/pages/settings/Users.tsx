// ============================================
// Users management — Feature 1 §7 (Admin only)
// Add, edit, disable and reset accounts. Users are never deleted, only disabled,
// so old audit rows still resolve to a real name. Every mutation here writes an
// audit event (§8). The route to this page is already gated by user.manage; the
// buttons below are a convenience, not the protection.
// ============================================

import { useMemo, useState } from 'react';
import { Plus, Pencil, RotateCcw, Ban, CheckCircle2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { validatePassword } from '@/lib/crypto';
import { formatDateTime } from '@/lib/utils';
import { ROLE_LABELS, type AppUser, type UserRole } from '@/types';
import { normalizeUsername, useUserStore } from '@/stores/userStore';
import { useAuthStore } from '@/stores/authStore';
import { useAuditStore } from '@/stores/auditStore';
import { useReceiptBookStore } from '@/stores/receiptBookStore';
import { toast, toastError, toastSuccess } from '@/lib/toast';

const ROLES = Object.keys(ROLE_LABELS) as UserRole[];
const NONE_BOOK = 'none';

interface Draft {
  id: string | null;      // null = creating
  name: string;
  username: string;
  role: UserRole;
  status: 'Active' | 'Disabled';
  receiptBookId: string;
  password: string;
}

const emptyDraft = (): Draft => ({
  id: null, name: '', username: '', role: 'Counter', status: 'Active', receiptBookId: NONE_BOOK, password: '',
});

export default function Users() {
  const users = useUserStore((s) => s.users);
  const createUser = useUserStore((s) => s.createUser);
  const updateUser = useUserStore((s) => s.updateUser);
  const setStatus = useUserStore((s) => s.setStatus);
  const resetPassword = useUserStore((s) => s.resetPassword);
  const isUsernameTaken = useUserStore((s) => s.isUsernameTaken);

  const session = useAuthStore((s) => s.user);
  const addLog = useAuditStore((s) => s.addLog);
  const books = useReceiptBookStore((s) => s.books);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [resetFor, setResetFor] = useState<AppUser | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [error, setError] = useState('');

  const actor = session?.name ?? 'system';
  const bookLabel = (id: string | null) => books.find((b) => b.id === id)?.name ?? '—';

  const activeAdmins = useMemo(() => users.filter((u) => u.role === 'Admin' && u.status === 'Active').length, [users]);

  const openAdd = () => { setError(''); setDraft(emptyDraft()); };
  const openEdit = (u: AppUser) => {
    setError('');
    setDraft({ id: u.id, name: u.name, username: u.username, role: u.role, status: u.status, receiptBookId: u.receiptBookId ?? NONE_BOOK, password: '' });
  };

  const guardLastAdmin = (target: AppUser, next: { role?: UserRole; status?: 'Active' | 'Disabled' }): boolean => {
    const stillAdmin = (next.role ?? target.role) === 'Admin';
    const stillActive = (next.status ?? target.status) === 'Active';
    const wasAdmin = target.role === 'Admin' && target.status === 'Active';
    // Losing this user as an active admin would leave none.
    if (wasAdmin && (!stillAdmin || !stillActive) && activeAdmins <= 1) {
      toastError({ title: 'Cannot do that', description: 'At least one active Admin must remain.' });
      return false;
    }
    return true;
  };

  const save = async () => {
    if (!draft) return;
    setError('');
    const username = normalizeUsername(draft.username);
    if (!draft.name.trim() || !username) {
      setError('Full name and username are required.');
      return;
    }
    if (isUsernameTaken(username, draft.id ?? undefined)) {
      setError('That username is already taken.');
      return;
    }

    if (draft.id === null) {
      // Creating: password must satisfy the rules.
      const pwProblem = validatePassword(draft.password, username);
      if (pwProblem) { setError(pwProblem); return; }
      const created = await createUser({
        username, name: draft.name.trim(), role: draft.role, password: draft.password,
        receiptBookId: draft.receiptBookId === NONE_BOOK ? null : draft.receiptBookId,
      });
      addLog({ user: actor, action: 'User Created', details: `${created.name} (${ROLE_LABELS[created.role]})` });
      toastSuccess({ title: 'User created', description: created.name });
      setDraft(null);
      return;
    }

    const target = users.find((u) => u.id === draft.id);
    if (!target) return;
    if (!guardLastAdmin(target, { role: draft.role, status: draft.status })) return;
    if (target.id === session?.id && draft.status === 'Disabled') {
      setError('You cannot disable your own account.');
      return;
    }

    updateUser(target.id, {
      name: draft.name.trim(),
      role: draft.role,
      receiptBookId: draft.receiptBookId === NONE_BOOK ? null : draft.receiptBookId,
    });
    if (target.status !== draft.status) setStatus(target.id, draft.status);
    if (target.role !== draft.role) {
      addLog({ user: actor, action: 'Role Changed', details: `${target.name}: ${ROLE_LABELS[target.role]} → ${ROLE_LABELS[draft.role]}` });
    }
    if (target.status !== draft.status) {
      addLog({ user: actor, action: 'User Disabled', details: `${target.name} set to ${draft.status}` });
    }
    toast({ title: 'User updated', description: draft.name });
    if (target.id === session?.id) useAuthStore.getState().refreshUser();
    setDraft(null);
  };

  const toggleStatus = (u: AppUser) => {
    if (u.status === 'Active') {
      if (u.id === session?.id) { toastError({ title: 'Cannot disable yourself' }); return; }
      if (!guardLastAdmin(u, { status: 'Disabled' })) return;
      setStatus(u.id, 'Disabled');
      addLog({ user: actor, action: 'User Disabled', details: `${u.name} disabled` });
      toast({ title: 'User disabled', description: u.name });
    } else {
      setStatus(u.id, 'Active');
      addLog({ user: actor, action: 'User Disabled', details: `${u.name} re-enabled` });
      toastSuccess({ title: 'User enabled', description: u.name });
    }
  };

  const doReset = async () => {
    if (!resetFor) return;
    const problem = validatePassword(resetPw, resetFor.username);
    if (problem) { setError(problem); return; }
    await resetPassword(resetFor.id, resetPw);
    addLog({ user: actor, action: 'Password Reset', details: `Temporary password issued to ${resetFor.name}` });
    toastSuccess({ title: 'Password reset', description: `${resetFor.name} must choose a new one at next sign-in.` });
    setResetFor(null);
    setResetPw('');
    setError('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-page font-semibold text-ink">Users</h1>
          <p className="text-meta text-ink-muted">Accounts are traceable to a name; users are disabled, never deleted.</p>
        </div>
        <Button onClick={openAdd}><Plus size={14} /> Add user</Button>
      </div>

      <div className="rounded-card border border-hairline bg-panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Full name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Receipt book</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium text-ink">
                  {u.name}
                  {u.id === session?.id ? <span className="ml-1.5 text-micro text-ink-subtle">(you)</span> : null}
                </TableCell>
                <TableCell className="text-ink-secondary">{u.username}</TableCell>
                <TableCell className="text-ink-secondary">{ROLE_LABELS[u.role]}</TableCell>
                <TableCell>
                  {u.status === 'Active'
                    ? <Badge variant="cleared">Active</Badge>
                    : <Badge variant="struckoff">Disabled</Badge>}
                </TableCell>
                <TableCell className="text-ink-secondary">{bookLabel(u.receiptBookId)}</TableCell>
                <TableCell className="text-ink-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal size={15} /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openEdit(u)}><Pencil size={14} /> Edit</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => { setResetFor(u); setResetPw(''); setError(''); }}>
                        <RotateCcw size={14} /> Reset password
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {u.status === 'Active' ? (
                        <DropdownMenuItem destructive onSelect={() => toggleStatus(u)}><Ban size={14} /> Disable</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => toggleStatus(u)}><CheckCircle2 size={14} /> Enable</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={draft !== null} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.id === null ? 'Add user' : 'Edit user'}</DialogTitle>
            <DialogDescription>Roles follow the shared permission set; the button and the route agree.</DialogDescription>
          </DialogHeader>
          {draft && (
            <DialogBody className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="u-name">Full name</Label>
                <Input id="u-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="u-username">Username</Label>
                  <Input id="u-username" value={draft.username} disabled={draft.id !== null} onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v as UserRole })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {draft.id === null ? (
                <div className="space-y-1.5">
                  <Label htmlFor="u-password">Initial password</Label>
                  <Input id="u-password" type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} autoComplete="new-password" />
                  <p className="text-micro text-ink-subtle">At least 8 characters, not equal to the username.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as 'Active' | 'Disabled' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Receipt book</Label>
                    <Select value={draft.receiptBookId} onValueChange={(v) => setDraft({ ...draft, receiptBookId: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_BOOK}>None</SelectItem>
                        {books.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {draft.id === null ? null : (
                <p className="text-micro text-ink-subtle">
                  To change this user's password, use <b>Reset password</b> in the row menu — the user then picks their own at next sign-in.
                </p>
              )}

              {error ? <div className="rounded-control border border-danger/30 bg-danger-soft p-3 text-body text-danger" role="alert">{error}</div> : null}

              <DialogFooter>
                <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
                <Button onClick={save}>{draft.id === null ? 'Create user' : 'Save changes'}</Button>
              </DialogFooter>
            </DialogBody>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={resetFor !== null} onOpenChange={(o) => { if (!o) { setResetFor(null); setError(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a temporary password for {resetFor?.name}. They will be required to choose a new one at next sign-in.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-pw">Temporary password</Label>
              <Input id="reset-pw" type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} autoComplete="new-password" />
              <p className="text-micro text-ink-subtle">At least 8 characters, not equal to the username.</p>
            </div>
            {error ? <div className="rounded-control border border-danger/30 bg-danger-soft p-3 text-body text-danger" role="alert">{error}</div> : null}
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setResetFor(null); setError(''); }}>Cancel</Button>
              <Button onClick={doReset}>Send reset</Button>
            </DialogFooter>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
