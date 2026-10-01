'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, ErrorText, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanize, timeAgo } from '@/lib/format';
import { useTeams } from '@/lib/hooks';

const useRoles = () => useQuery({ queryKey: ['roles'], queryFn: () => api<any[]>('/roles') });

export default function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const teams = useTeams();
  const roles = useRoles();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [resetting, setResetting] = useState<any>(null);

  const { data, isLoading } = useQuery({ queryKey: ['users', q], queryFn: () => api<any[]>('/users', { query: { q } }) });
  const update = useMutation({
    mutationFn: ({ id, ...body }: any) => api(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['directory'] });
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
  });

  return (
    <>
      <PageHeader title="Users" subtitle="Accounts, roles and team membership" actions={<Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> Add user</Button>} />
      <div className="mb-3"><Input className="max-w-xs" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <ErrorText error={update.error} />
      <Card bodyClassName="p-0">
        {isLoading ? <Spinner /> : (
          <Table>
            <thead><tr><Th>User</Th><Th>Role</Th><Th>Teams</Th><Th>Status</Th><Th>Last login</Th><Th /></tr></thead>
            <tbody>
              {data?.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                  <Td>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-slate-500">{u.email}{u.title && ` · ${u.title}`}</div>
                  </Td>
                  <Td>
                    <Select className="h-8 w-48" value={u.roleDef?.id ?? ''} disabled={u.id === me?.id} onChange={(e) => update.mutate({ id: u.id, roleId: e.target.value })}>
                      {!u.roleDef && <option value="">{humanize(u.role)}</option>}
                      {roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {u.teams.map((t: any) => <Badge key={t.team.id}>{t.team.name}</Badge>)}
                      {!u.teams.length && <span className="text-xs text-slate-400">—</span>}
                    </div>
                  </Td>
                  <Td>{u.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}</Td>
                  <Td className="text-xs text-slate-500">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'never'}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => setResetting(u)} title="Reset password"><KeyRound className="size-3.5" /></Button>
                      {u.id !== me?.id && (
                        <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: u.id, active: !u.active })}>
                          {u.active ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {(creating || editing) && <UserModal user={editing} teams={teams.data ?? []} onClose={() => { setCreating(false); setEditing(null); }} />}
      {resetting && <ResetModal user={resetting} onClose={() => setResetting(null)} />}
    </>
  );
}

function UserModal({ user, teams, onClose }: { user?: any; teams: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const roles = useRoles();
  const [form, setForm] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    title: user?.title ?? '',
    roleId: (user?.roleDef?.id ?? '') as string,
    password: '',
    skills: user?.skills?.join(', ') ?? '',
    teamIds: user?.teams.map((t: any) => t.team.id) ?? ([] as string[]),
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        title: form.title || undefined,
        roleId: form.roleId || roles.data?.find((r) => r.key === 'AGENT')?.id,
        teamIds: form.teamIds,
        skills: form.skills.split(',').map((s: string) => s.trim()).filter(Boolean),
      };
      return user
        ? api(`/users/${user.id}`, { method: 'PATCH', body })
        : api('/users', { body: { ...body, email: form.email, password: form.password } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['directory'] });
      qc.invalidateQueries({ queryKey: ['teams'] });
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title={user ? `Edit ${user.name}` : 'Add user'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={form.email} disabled={!!user} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Job title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Role">
          <Select value={form.roleId || roles.data?.find((r) => r.key === 'AGENT')?.id || ''} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
            {roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        {roles.data?.find((r) => r.id === (form.roleId || roles.data?.find((x) => x.key === 'AGENT')?.id))?.description}
      </p>
      {!user && <Field label="Initial password" hint="At least 8 characters"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>}
      <Field label="Skills" hint="Comma separated — used for routing"><Input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></Field>
      <Field label="Teams">
        <div className="grid grid-cols-2 gap-1.5">
          {teams.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.teamIds.includes(t.id)}
                onChange={(e) => setForm({ ...form, teamIds: e.target.checked ? [...form.teamIds, t.id] : form.teamIds.filter((x: string) => x !== t.id) })}
              />
              {t.name}
            </label>
          ))}
        </div>
      </Field>
      <ErrorText error={save.error} />
    </Modal>
  );
}

function ResetModal({ user, onClose }: { user: any; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const reset = useMutation({ mutationFn: () => api(`/users/${user.id}/reset-password`, { body: { password } }), onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Reset password — ${user.name}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={reset.isPending} onClick={() => reset.mutate()}>Reset</Button></>}>
      <Field label="New password" hint="At least 8 characters"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <ErrorText error={reset.error} />
    </Modal>
  );
}
