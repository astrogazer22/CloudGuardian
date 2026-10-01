'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PriorityBadge } from '@/components/badges';
import { Badge, Button, Card, Empty, ErrorText, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate, humanize, minutesLabel } from '@/lib/format';
import { useDirectory, useTeams } from '@/lib/hooks';
import { Priority, PRIORITIES, TICKET_TYPES } from '@/lib/types';

const DAYS = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
] as const;

const TIMEZONES = [
  'UTC', 'Asia/Singapore', 'Asia/Kolkata', 'Asia/Tokyo', 'Asia/Dubai', 'Australia/Sydney',
  'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles',
];

const NOTIFY_TARGETS = [
  ['assignee', 'Assignee'],
  ['team', 'Whole team'],
  ['team_lead', 'Team lead'],
  ['admins', 'Administrators'],
] as const;

export default function SlaAutomationPage() {
  return (
    <>
      <PageHeader title="SLA & escalation" subtitle="Targets, business hours, pre-breach warnings, escalation chains and routing rules" />
      <div className="space-y-6">
        <SlaPolicies />
        <Calendars />
        <EscalationPolicies />
        <AutomationRules />
      </div>
    </>
  );
}

function SlaPolicies() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['sla-policies'], queryFn: () => api<any[]>('/sla-policies') });
  const save = useMutation({
    mutationFn: (body: any) => api('/sla-policies', { method: 'PUT', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sla-policies'] }),
  });
  return (
    <Card title="SLA policies" bodyClassName="p-0">
      <p className="px-4 pt-3 text-xs text-slate-500">
        Targets in minutes. With <b>business hours</b> on, only working time on the ticket team&apos;s calendar counts (e.g. 540 min = one 9-hour day).
        Premium customers get 75% of these targets and Enterprise 50%. The clock pauses in statuses marked “pauses SLA”.
      </p>
      {isLoading ? <Spinner /> : (
        <Table>
          <thead><tr><Th>Priority</Th><Th>First response</Th><Th>Resolution</Th><Th>Clock</Th><Th>Warn before</Th><Th /></tr></thead>
          <tbody>
            {PRIORITIES.map((p) => {
              const pol = data?.find((x) => x.priority === p) ?? { firstResponseMins: 60, resolutionMins: 480, businessHours: true, warnBeforeMins: 30 };
              return <SlaRow key={`${p}-${pol.updatedAt}`} priority={p} policy={pol} onSave={(v) => save.mutate({ priority: p, ...v })} />;
            })}
          </tbody>
        </Table>
      )}
      <div className="px-4 pb-3"><ErrorText error={save.error} /></div>
    </Card>
  );
}

function SlaRow({ priority, policy, onSave }: { priority: Priority; policy: any; onSave: (v: any) => void }) {
  const [v, setV] = useState({
    firstResponseMins: policy.firstResponseMins,
    resolutionMins: policy.resolutionMins,
    businessHours: policy.businessHours,
    warnBeforeMins: policy.warnBeforeMins,
  });
  const dirty = (Object.keys(v) as (keyof typeof v)[]).some((k) => v[k] !== policy[k]);
  const num = (k: keyof typeof v) => (
    <div className="flex items-center gap-2">
      <Input type="number" min={0} className="h-8 w-24" value={v[k] as number} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} />
      <span className="text-xs text-slate-400">{minutesLabel(v[k] as number)}</span>
    </div>
  );
  return (
    <tr>
      <Td><PriorityBadge priority={priority} /></Td>
      <Td>{num('firstResponseMins')}</Td>
      <Td>{num('resolutionMins')}</Td>
      <Td>
        <Select className="h-8 w-40" value={v.businessHours ? 'bh' : '247'} onChange={(e) => setV({ ...v, businessHours: e.target.value === 'bh' })}>
          <option value="bh">Business hours</option>
          <option value="247">24 × 7</option>
        </Select>
      </Td>
      <Td>{num('warnBeforeMins')}</Td>
      <Td>{dirty && <Button size="sm" variant="primary" onClick={() => onSave(v)}>Save</Button>}</Td>
    </tr>
  );
}

function Calendars() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['calendars'], queryFn: () => api<any[]>('/business-calendars') });
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api(`/business-calendars/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendars'] }),
  });
  const summary = (hours: any) =>
    DAYS.filter(([d]) => hours[d]?.length)
      .map(([d, label]) => `${label.slice(0, 3)} ${hours[d].map((r: string[]) => r.join('–')).join(', ')}`)
      .join(' · ') || 'No working hours';
  return (
    <Card title="Business hours calendars" actions={<Button size="sm" variant="primary" onClick={() => setEditing('new')}><Plus className="size-3.5" /> New calendar</Button>} bodyClassName="p-0">
      <p className="px-4 pt-3 text-xs text-slate-500">Assign a calendar to a team on the Teams page. Teams without one use the default calendar.</p>
      {isLoading ? <Spinner /> : !data?.length ? <Empty>No calendars — SLAs run 24×7.</Empty> : (
        <Table>
          <thead><tr><Th>Calendar</Th><Th>Timezone</Th><Th>Working hours</Th><Th>Holidays</Th><Th>Teams</Th><Th /></tr></thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <Td className="font-medium">
                  <span className="flex items-center gap-1.5">{c.name}{c.isDefault && <Badge tone="indigo"><Star className="size-3" /> Default</Badge>}</span>
                </Td>
                <Td className="text-xs">{c.timezone}</Td>
                <Td className="max-w-sm text-xs text-slate-500">{summary(c.hours)}</Td>
                <Td className="text-xs">{c.holidays.length}</Td>
                <Td className="text-xs">{c.teams.map((t: any) => t.name).join(', ') || '—'}</Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm(`Delete ${c.name}?`) && remove.mutate(c.id)}><Trash2 className="size-3.5 text-red-600" /></Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <CalendarModal calendar={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function CalendarModal({ calendar, onClose }: { calendar: any | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(calendar?.name ?? '');
  const [timezone, setTimezone] = useState(calendar?.timezone ?? 'UTC');
  const [isDefault, setIsDefault] = useState(calendar?.isDefault ?? false);
  const [holidays, setHolidays] = useState((calendar?.holidays ?? []).join('\n'));
  const [hours, setHours] = useState<Record<string, { on: boolean; start: string; end: string }>>(() =>
    Object.fromEntries(
      DAYS.map(([d]) => {
        const r = calendar?.hours?.[d]?.[0];
        return [d, r ? { on: true, start: r[0], end: r[1] } : { on: !calendar && !['sat', 'sun'].includes(d), start: '09:00', end: '18:00' }];
      }),
    ),
  );
  const preview = useQuery({
    queryKey: ['calendar-preview', calendar?.id],
    queryFn: () => api(`/business-calendars/${calendar.id}/preview`, { query: { minutes: 480 } }),
    enabled: !!calendar?.id,
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        timezone,
        isDefault,
        holidays: holidays.split(/[\s,]+/).map((h: string) => h.trim()).filter(Boolean),
        hours: Object.fromEntries(DAYS.map(([d]) => [d, hours[d].on ? [[hours[d].start, hours[d].end]] : []])),
      };
      return calendar ? api(`/business-calendars/${calendar.id}`, { method: 'PATCH', body }) : api('/business-calendars', { body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendars'] });
      qc.invalidateQueries({ queryKey: ['calendar-preview'] });
      onClose();
    },
  });
  return (
    <Modal open wide onClose={onClose} title={calendar ? `Edit ${calendar.name}` : 'New calendar'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Timezone">
          <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {[...new Set([timezone, ...TIMEZONES])].map((tz) => <option key={tz}>{tz}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Working hours</div>
          {DAYS.map(([d, label]) => (
            <div key={d} className="flex items-center gap-2 text-sm">
              <label className="flex w-28 items-center gap-2">
                <input type="checkbox" checked={hours[d].on} onChange={(e) => setHours({ ...hours, [d]: { ...hours[d], on: e.target.checked } })} />
                {label}
              </label>
              <Input type="time" className="h-8 w-28" disabled={!hours[d].on} value={hours[d].start} onChange={(e) => setHours({ ...hours, [d]: { ...hours[d], start: e.target.value } })} />
              <span className="text-slate-400">to</span>
              <Input type="text" className="h-8 w-24" disabled={!hours[d].on} value={hours[d].end} onChange={(e) => setHours({ ...hours, [d]: { ...hours[d], end: e.target.value } })} placeholder="18:00 / 24:00" />
            </div>
          ))}
        </div>
        <Field label="Holidays" hint="One YYYY-MM-DD per line">
          <textarea className="h-48 w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900" value={holidays} onChange={(e) => setHolidays(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> Default calendar for teams without one
      </label>
      {preview.data && (
        <p className="flex items-center gap-1.5 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Clock className="size-3.5" /> A 480-minute target opened now would be due <b>{formatDate(preview.data.due)}</b> (your local time).
        </p>
      )}
      <ErrorText error={save.error} />
    </Modal>
  );
}

function EscalationPolicies() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['escalation-policies'], queryFn: () => api<any[]>('/escalation-policies') });
  const directory = useDirectory();
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['escalation-policies'] });
  const toggle = useMutation({ mutationFn: (p: any) => api(`/escalation-policies/${p.id}`, { method: 'PATCH', body: { enabled: !p.enabled } }), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => api(`/escalation-policies/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
  const userName = (id: string) => directory.data?.find((u) => u.id === id)?.name ?? id;
  return (
    <Card title="Escalation policies — after an SLA breach" actions={<Button size="sm" variant="primary" onClick={() => setEditing('new')}><Plus className="size-3.5" /> New policy</Button>} bodyClassName="p-0">
      <p className="px-4 pt-3 text-xs text-slate-500">
        The first enabled policy whose priorities match a breached ticket applies. Each level fires once, the given number of minutes after the breach.
        Pre-breach warnings are sent automatically using each SLA policy&apos;s “warn before” value.
      </p>
      {isLoading ? <Spinner /> : !data?.length ? <Empty>No escalation policies.</Empty> : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.map((p) => (
            <div key={p.id} className={`px-4 py-3 ${p.enabled ? '' : 'opacity-50'}`}>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-medium">{p.name}</span>
                {p.priorities.length ? p.priorities.map((x: Priority) => <PriorityBadge key={x} priority={x} short />) : <Badge>All priorities</Badge>}
                <div className="ml-auto flex items-center gap-1">
                  <label className="mr-2 flex items-center gap-1 text-xs"><input type="checkbox" checked={p.enabled} onChange={() => toggle.mutate(p)} /> Enabled</label>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => confirm(`Delete ${p.name}?`) && remove.mutate(p.id)}><Trash2 className="size-3.5 text-red-600" /></Button>
                </div>
              </div>
              <ol className="flex flex-wrap items-stretch gap-2">
                {p.levels.map((l: any, i: number) => (
                  <li key={i} className="min-w-44 rounded-md border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
                    <div className="font-semibold">L{i + 1} · +{minutesLabel(l.afterMins)}</div>
                    <div className="text-slate-500">Notify: {[...(l.notify ?? []).map((n: string) => humanize(n)), ...(l.userIds ?? []).map(userName)].join(', ') || '—'}</div>
                    {l.reassignToLead && <div className="text-amber-600">Reassign to team lead</div>}
                    {l.bumpPriority && <div className="text-red-600">Raise priority one level</div>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      {editing && <EscalationModal policy={editing === 'new' ? null : editing} nextOrder={(data?.at(-1)?.sortOrder ?? 0) + 10} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function EscalationModal({ policy, nextOrder, onClose }: { policy: any | null; nextOrder: number; onClose: () => void }) {
  const qc = useQueryClient();
  const directory = useDirectory();
  const [name, setName] = useState(policy?.name ?? '');
  const [priorities, setPriorities] = useState<Priority[]>(policy?.priorities ?? []);
  const [sortOrder, setSortOrder] = useState(policy?.sortOrder ?? nextOrder);
  const [levels, setLevels] = useState<any[]>(policy?.levels ?? [{ afterMins: 0, notify: ['assignee'] }]);
  const save = useMutation({
    mutationFn: () => {
      const body = { name, priorities, sortOrder, levels: levels.map((l) => ({ ...l, afterMins: Number(l.afterMins) })) };
      return policy ? api(`/escalation-policies/${policy.id}`, { method: 'PATCH', body }) : api('/escalation-policies', { body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['escalation-policies'] });
      onClose();
    },
  });
  const setLevel = (i: number, patch: any) => setLevels(levels.map((l, j) => (i === j ? { ...l, ...patch } : l)));
  const toggleIn = (list: string[] = [], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <Modal open wide onClose={onClose} title={policy ? `Edit ${policy.name}` : 'New escalation policy'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
      <div className="grid grid-cols-[1fr_100px] gap-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Order"><Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} /></Field>
      </div>
      <Field label="Applies to priorities" hint="None selected = all priorities">
        <div className="flex gap-3">
          {PRIORITIES.map((p) => (
            <label key={p} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={priorities.includes(p)} onChange={() => setPriorities(toggleIn(priorities, p) as Priority[])} /> {p}
            </label>
          ))}
        </div>
      </Field>
      <div className="space-y-2">
        {levels.map((l, i) => (
          <div key={i} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold">Level {i + 1}</span>
              <span className="text-xs text-slate-500">fires</span>
              <Input type="number" min={0} className="h-8 w-24" value={l.afterMins} onChange={(e) => setLevel(i, { afterMins: e.target.value })} />
              <span className="text-xs text-slate-500">minutes after breach</span>
              <button className="ml-auto text-slate-400 hover:text-red-600" onClick={() => setLevels(levels.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
              {NOTIFY_TARGETS.map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={l.notify?.includes(k) ?? false} onChange={() => setLevel(i, { notify: toggleIn(l.notify, k) })} /> {label}</label>
              ))}
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!l.reassignToLead} onChange={(e) => setLevel(i, { reassignToLead: e.target.checked })} /> Reassign to team lead</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!l.bumpPriority} onChange={(e) => setLevel(i, { bumpPriority: e.target.checked })} /> Raise priority</label>
            </div>
            <div className="mt-2">
              <Select
                className="h-8 max-w-xs"
                value=""
                onChange={(e) => e.target.value && setLevel(i, { userIds: [...new Set([...(l.userIds ?? []), e.target.value])] })}
              >
                <option value="">+ Also notify a specific person…</option>
                {directory.data?.filter((u) => u.role !== 'REQUESTER').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
              <div className="mt-1 flex flex-wrap gap-1">
                {(l.userIds ?? []).map((id: string) => (
                  <button key={id} onClick={() => setLevel(i, { userIds: l.userIds.filter((x: string) => x !== id) })}>
                    <Badge>{directory.data?.find((u) => u.id === id)?.name ?? id} ×</Badge>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
        <Button size="sm" onClick={() => setLevels([...levels, { afterMins: (Number(levels.at(-1)?.afterMins) || 0) + 60, notify: ['team_lead'] }])}>
          <Plus className="size-3.5" /> Add level
        </Button>
      </div>
      <ErrorText error={save.error} />
    </Modal>
  );
}

function AutomationRules() {
  const qc = useQueryClient();
  const teams = useTeams();
  const directory = useDirectory();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['automation-rules'], queryFn: () => api<any[]>('/automation-rules') });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['automation-rules'] });
  const toggle = useMutation({ mutationFn: (r: any) => api(`/automation-rules/${r.id}`, { method: 'PATCH', body: { enabled: !r.enabled } }), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => api(`/automation-rules/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
  const name = (id?: string) => teams.data?.find((t) => t.id === id)?.name ?? directory.data?.find((u) => u.id === id)?.name ?? id;

  return (
    <Card title="Automation rules — on ticket created" actions={<Button size="sm" variant="primary" onClick={() => setCreating(true)}><Plus className="size-3.5" /> New rule</Button>} bodyClassName="p-0">
      <p className="px-4 pt-3 text-xs text-slate-500">Rules run in order; later rules see earlier rules&apos; changes. If a team is set but no assignee, the ticket is round-robin assigned within the team.</p>
      {isLoading ? <Spinner /> : !data?.length ? <Empty>No rules yet.</Empty> : (
        <Table>
          <thead><tr><Th>#</Th><Th>Rule</Th><Th>When</Th><Th>Then</Th><Th>Enabled</Th><Th /></tr></thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id} className={r.enabled ? '' : 'opacity-50'}>
                <Td className="text-slate-400">{r.sortOrder}</Td>
                <Td className="font-medium">{r.name}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1 text-xs">
                    {r.conditions.type?.map((t: string) => <Badge key={t}>type = {humanize(t)}</Badge>)}
                    {r.conditions.priority?.map((p: string) => <Badge key={p}>priority = {p}</Badge>)}
                    {r.conditions.category?.map((c: string) => <Badge key={c}>category = {c}</Badge>)}
                    {r.conditions.titleContains && <Badge>title contains “{r.conditions.titleContains}”</Badge>}
                    {!Object.keys(r.conditions).length && <span className="text-slate-400">Always</span>}
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1 text-xs">
                    {r.actions.teamId && <Badge tone="indigo">team → {name(r.actions.teamId)}</Badge>}
                    {r.actions.assigneeId && <Badge tone="indigo">assign → {name(r.actions.assigneeId)}</Badge>}
                    {r.actions.priority && <Badge tone="indigo">priority → {r.actions.priority}</Badge>}
                    {r.actions.addTags?.map((t: string) => <Badge key={t} tone="indigo">+tag {t}</Badge>)}
                  </div>
                </Td>
                <Td><input type="checkbox" checked={r.enabled} onChange={() => toggle.mutate(r)} /></Td>
                <Td><Button size="sm" variant="ghost" onClick={() => confirm(`Delete rule “${r.name}”?`) && remove.mutate(r.id)}><Trash2 className="size-3.5 text-red-600" /></Button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {creating && <RuleModal onClose={() => setCreating(false)} nextOrder={(data?.at(-1)?.sortOrder ?? 0) + 10} />}
    </Card>
  );
}

function RuleModal({ onClose, nextOrder }: { onClose: () => void; nextOrder: number }) {
  const qc = useQueryClient();
  const teams = useTeams();
  const directory = useDirectory();
  const [f, setF] = useState({ name: '', type: '', priority: '', category: '', titleContains: '', teamId: '', assigneeId: '', setPriority: '', addTags: '', sortOrder: nextOrder });
  const save = useMutation({
    mutationFn: () =>
      api('/automation-rules', {
        body: {
          name: f.name,
          sortOrder: f.sortOrder,
          conditions: {
            ...(f.type && { type: [f.type] }),
            ...(f.priority && { priority: [f.priority] }),
            ...(f.category && { category: f.category.split(',').map((s) => s.trim()) }),
            ...(f.titleContains && { titleContains: f.titleContains }),
          },
          actions: {
            ...(f.teamId && { teamId: f.teamId }),
            ...(f.assigneeId && { assigneeId: f.assigneeId }),
            ...(f.setPriority && { priority: f.setPriority }),
            ...(f.addTags && { addTags: f.addTags.split(',').map((s) => s.trim()).filter(Boolean) }),
          },
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation-rules'] });
      onClose();
    },
  });
  return (
    <Modal open wide onClose={onClose} title="New automation rule" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Create rule</Button></>}>
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <Field label="Rule name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Order"><Input type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} /></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
          <h4 className="text-xs font-semibold uppercase text-slate-500">When (all must match)</h4>
          <Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">Any</option>{TICKET_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
          <Field label="Priority"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="">Any</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</Select></Field>
          <Field label="Category is one of" hint="Comma separated"><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
          <Field label="Title contains"><Input value={f.titleContains} onChange={(e) => setF({ ...f, titleContains: e.target.value })} /></Field>
        </div>
        <div className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
          <h4 className="text-xs font-semibold uppercase text-slate-500">Then</h4>
          <Field label="Route to team"><Select value={f.teamId} onChange={(e) => setF({ ...f, teamId: e.target.value })}><option value="">—</option>{teams.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Assign to"><Select value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}><option value="">—</option>{directory.data?.filter((u) => ['ADMIN', 'AGENT'].includes(u.role!)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
          <Field label="Set priority"><Select value={f.setPriority} onChange={(e) => setF({ ...f, setPriority: e.target.value })}><option value="">—</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</Select></Field>
          <Field label="Add tags" hint="Comma separated"><Input value={f.addTags} onChange={(e) => setF({ ...f, addTags: e.target.value })} /></Field>
        </div>
      </div>
      <ErrorText error={save.error} />
    </Modal>
  );
}
