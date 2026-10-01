'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, Empty, ErrorText, Field, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { humanize } from '@/lib/format';
import { useDirectory, useTeams } from '@/lib/hooks';

export default function TeamsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useTeams();
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api(`/teams/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });

  return (
    <>
      <PageHeader title="Teams" subtitle="Queues for routing and round-robin assignment" actions={<Button variant="primary" onClick={() => setEditing('new')}><Plus className="size-4" /> New team</Button>} />
      <ErrorText error={remove.error} />
      {isLoading ? <Spinner /> : !data?.length ? <Card><Empty>No teams yet.</Empty></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((t) => (
            <Card
              key={t.id}
              title={t.name}
              actions={
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => confirm(`Delete team ${t.name}?`) && remove.mutate(t.id)}><Trash2 className="size-3.5 text-red-600" /></Button>
                </div>
              }
            >
              <p className="mb-3 text-sm text-slate-500">{t.description || 'No description'}</p>
              <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-400">Lead</span><div className="font-medium">{t.lead?.name ?? '—'}</div></div>
                <div><span className="text-slate-400">Business hours</span><div className="font-medium">{t.calendar?.name ?? 'Default calendar'}</div></div>
              </div>
              <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                <span>{t.members.length} members</span>
                <Badge tone="indigo">{t._count.tickets} open tickets</Badge>
              </div>
              <ul className="space-y-1">
                {t.members.map((m: any) => (
                  <li key={m.user.id} className="flex items-center justify-between text-sm">
                    {m.user.name}
                    <span className="text-xs text-slate-400">{humanize(m.user.role)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {editing && <TeamModal team={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function TeamModal({ team, onClose }: { team: any | null; onClose: () => void }) {
  const qc = useQueryClient();
  const directory = useDirectory();
  const calendars = useQuery({ queryKey: ['calendars'], queryFn: () => api<any[]>('/business-calendars') });
  const [form, setForm] = useState({
    leadId: team?.lead?.id ?? '',
    calendarId: team?.calendar?.id ?? '',
    name: team?.name ?? '',
    description: team?.description ?? '',
    email: team?.email ?? '',
    memberIds: team?.members.map((m: any) => m.user.id) ?? ([] as string[]),
  });
  const save = useMutation({
    mutationFn: () => (team ? api(`/teams/${team.id}`, { method: 'PATCH', body: form }) : api('/teams', { body: form })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title={team ? `Edit ${team.name}` : 'New team'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
      <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="Team email"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Team lead" hint="Receives escalations">
          <Select value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })}>
            <option value="">—</option>
            {directory.data?.filter((u) => u.role !== 'REQUESTER').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="Business hours" hint="Used for SLA clocks">
          <Select value={form.calendarId} onChange={(e) => setForm({ ...form, calendarId: e.target.value })}>
            <option value="">Default calendar</option>
            {calendars.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Members">
        <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto">
          {directory.data?.filter((u) => u.role !== 'REQUESTER').map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.memberIds.includes(u.id)}
                onChange={(e) => setForm({ ...form, memberIds: e.target.checked ? [...form.memberIds, u.id] : form.memberIds.filter((x: string) => x !== u.id) })}
              />
              {u.name}
            </label>
          ))}
        </div>
      </Field>
      <ErrorText error={save.error} />
    </Modal>
  );
}
