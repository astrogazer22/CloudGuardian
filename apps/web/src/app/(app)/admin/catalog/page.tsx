'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PriorityBadge, TypeBadge } from '@/components/badges';
import { Badge, Button, Card, Empty, ErrorText, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Textarea, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { humanize } from '@/lib/format';
import { useTeams } from '@/lib/hooks';
import { PRIORITIES, TICKET_TYPES } from '@/lib/types';

const FIELD_TYPES = ['text', 'textarea', 'select', 'number', 'checkbox'] as const;

export default function CatalogAdminPage() {
  const qc = useQueryClient();
  const teams = useTeams();
  const { data, isLoading } = useQuery({ queryKey: ['catalog-manage'], queryFn: () => api<any[]>('/catalog/manage') });
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['catalog-manage'] });
    qc.invalidateQueries({ queryKey: ['catalog'] });
  };
  const toggle = useMutation({ mutationFn: (i: any) => api(`/catalog/${i.id}`, { method: 'PATCH', body: { active: !i.active } }), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => api(`/catalog/${id}`, { method: 'DELETE' }), onSuccess: invalidate });

  return (
    <>
      <PageHeader
        title="Service catalog"
        subtitle="Standard requests with their own forms. Submissions become tickets routed to the item's team."
        actions={<Button variant="primary" onClick={() => setEditing('new')}><Plus className="size-4" /> New item</Button>}
      />
      <Card bodyClassName="p-0">
        {isLoading ? <Spinner /> : !data?.length ? <Empty>No catalog items yet.</Empty> : (
          <Table>
            <thead><tr><Th>Item</Th><Th>Category</Th><Th>Creates</Th><Th>Routed to</Th><Th>Fields</Th><Th>Requests</Th><Th>Visibility</Th><Th /></tr></thead>
            <tbody>
              {data.map((i) => (
                <tr key={i.id} className={i.active ? '' : 'opacity-50'}>
                  <Td>
                    <div className="font-medium">{i.name}</div>
                    <div className="max-w-sm truncate text-xs text-slate-500">{i.description}</div>
                  </Td>
                  <Td>{i.category}</Td>
                  <Td><div className="flex gap-1"><TypeBadge type={i.ticketType} /><PriorityBadge priority={i.priority} short /></div></Td>
                  <Td className="text-xs">{teams.data?.find((t) => t.id === i.teamId)?.name ?? 'Routing rules'}</Td>
                  <Td>{i.fields.length}</Td>
                  <Td>{i._count.tickets}</Td>
                  <Td>{i.visibleToRequesters ? <Badge tone="green">Portal</Badge> : <Badge>Agents only</Badge>}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => toggle.mutate(i)}>{i.active ? 'Disable' : 'Enable'}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => confirm(`Delete ${i.name}?`) && remove.mutate(i.id)}><Trash2 className="size-3.5 text-red-600" /></Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <ItemModal item={editing === 'new' ? null : editing} teams={teams.data ?? []} onClose={() => setEditing(null)} />}
    </>
  );
}

function ItemModal({ item, teams, onClose }: { item: any | null; teams: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: item?.name ?? '',
    description: item?.description ?? '',
    category: item?.category ?? 'Access',
    ticketType: item?.ticketType ?? 'SERVICE_REQUEST',
    priority: item?.priority ?? 'P3',
    teamId: item?.teamId ?? '',
    visibleToRequesters: item?.visibleToRequesters ?? true,
    sortOrder: item?.sortOrder ?? 0,
  });
  const [fields, setFields] = useState<any[]>(item?.fields ?? [{ key: 'details', label: 'Details', type: 'textarea', required: true }]);
  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...f,
        teamId: f.teamId || null,
        fields: fields.map(({ keyTouched, optionsText, ...x }) => ({
          ...x,
          options: x.type === 'select' ? String(optionsText ?? x.options?.join(', ') ?? '').split(',').map((o: string) => o.trim()).filter(Boolean) : undefined,
        })),
      };
      return item ? api(`/catalog/${item.id}`, { method: 'PATCH', body }) : api('/catalog', { body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog-manage'] });
      qc.invalidateQueries({ queryKey: ['catalog'] });
      onClose();
    },
  });
  const setField = (i: number, patch: any) => setFields(fields.map((x, j) => (i === j ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => {
    const next = [...fields];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    setFields(next);
  };
  return (
    <Modal open wide onClose={onClose} title={item ? `Edit ${item.name}` : 'New catalog item'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Category"><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
      </div>
      <Field label="Description"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Ticket type"><Select value={f.ticketType} onChange={(e) => setF({ ...f, ticketType: e.target.value })}>{TICKET_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
        <Field label="Priority"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</Select></Field>
        <Field label="Route to team"><Select value={f.teamId} onChange={(e) => setF({ ...f, teamId: e.target.value })}><option value="">Use routing rules</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Order"><Input type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.visibleToRequesters} onChange={(e) => setF({ ...f, visibleToRequesters: e.target.checked })} /> Show in the self-service portal (otherwise agents only)</label>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Form fields</div>
        <div className="space-y-2">
          {fields.map((x, i) => (
            <div key={i} className="grid items-end gap-2 rounded-md border border-slate-200 p-2 md:grid-cols-[1fr_1fr_130px_auto] dark:border-slate-700">
              <Field label="Label"><Input className="h-8" value={x.label} onChange={(e) => setField(i, { label: e.target.value, key: x.keyTouched ? x.key : e.target.value.replace(/[^a-zA-Z0-9]+(.)?/g, (_m: string, c: string) => (c ? c.toUpperCase() : '')).replace(/^./, (c: string) => c.toLowerCase()) })} /></Field>
              <Field label="Key"><Input className="h-8 font-mono text-xs" value={x.key} onChange={(e) => setField(i, { key: e.target.value, keyTouched: true })} /></Field>
              <Field label="Type"><Select className="h-8" value={x.type} onChange={(e) => setField(i, { type: e.target.value })}>{FIELD_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
              <div className="flex items-center gap-1 pb-1">
                <label className="mr-1 flex items-center gap-1 text-xs"><input type="checkbox" checked={!!x.required} onChange={(e) => setField(i, { required: e.target.checked })} /> Required</label>
                <button disabled={i === 0} onClick={() => move(i, -1)} className="text-slate-400 disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                <button disabled={i === fields.length - 1} onClick={() => move(i, 1)} className="text-slate-400 disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                <button onClick={() => setFields(fields.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600"><Trash2 className="size-3.5" /></button>
              </div>
              {x.type === 'select' && (
                <Field label="Options (comma separated)" className="md:col-span-4">
                  <Input className="h-8" value={x.optionsText ?? x.options?.join(', ') ?? ''} onChange={(e) => setField(i, { optionsText: e.target.value })} />
                </Field>
              )}
            </div>
          ))}
          <Button size="sm" onClick={() => setFields([...fields, { key: `field${fields.length + 1}`, label: '', type: 'text' }])}><Plus className="size-3.5" /> Add field</Button>
        </div>
      </div>
      <ErrorText error={save.error} />
    </Modal>
  );
}
