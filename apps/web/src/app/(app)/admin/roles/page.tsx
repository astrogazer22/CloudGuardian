'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Copy, Lock, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, ErrorText, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { humanize } from '@/lib/format';
import { ROLES } from '@/lib/types';

interface RoleDef {
  id?: string;
  key: string;
  name: string;
  description?: string | null;
  baseRole: string;
  permissions: string[];
  ticketScope: 'ALL' | 'TEAM' | 'OWN';
  inventoryEnvironments: string[];
  isSystem?: boolean;
  _count?: { users: number };
}

const SCOPES = [
  { key: 'ALL', label: 'All tickets', help: 'Every ticket in the system' },
  { key: 'TEAM', label: 'Team tickets', help: "Tickets owned by the user's teams, plus ones they raised or are assigned" },
  { key: 'OWN', label: 'Own tickets', help: 'Only tickets they raised or are assigned to' },
] as const;

const BASE_HELP: Record<string, string> = {
  ADMIN: 'Full administrator',
  AGENT: 'Works in the agent workspace; appears in assignee pickers',
  APPROVER: 'Matches workflow approvals addressed to "APPROVER"',
  VIEWER: 'Read-only persona',
  REQUESTER: 'Uses the self-service portal instead of the agent workspace',
};

const blank = (): RoleDef => ({ key: '', name: '', description: '', baseRole: 'AGENT', permissions: ['tickets:read'], ticketScope: 'ALL', inventoryEnvironments: [] });

export default function RolesPage() {
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<RoleDef[]>('/roles') });
  const catalog = useQuery({ queryKey: ['permission-catalog'], queryFn: () => api<{ group: string; items: { key: string; label: string }[] }[]>('/roles/permissions') });
  const envs = useQuery({ queryKey: ['asset-facets'], queryFn: () => api('/assets/facets') });
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<RoleDef | null>(null);

  useEffect(() => {
    if (selectedId === null && roles.data?.length) setSelectedId(roles.data[0].id!);
  }, [roles.data, selectedId]);
  useEffect(() => {
    if (selectedId === 'new') return;
    const r = roles.data?.find((x) => x.id === selectedId);
    if (r) setDraft(structuredClone(r));
  }, [selectedId, roles.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['roles'] });
    qc.invalidateQueries({ queryKey: ['users'] });
  };
  const save = useMutation({
    mutationFn: (r: RoleDef) => {
      const body = {
        name: r.name,
        description: r.description || undefined,
        baseRole: r.baseRole,
        permissions: r.permissions,
        ticketScope: r.ticketScope,
        inventoryEnvironments: r.inventoryEnvironments,
      };
      if (!r.id) return api('/roles', { body: { ...body, key: r.key } });
      if (r.key === 'ADMIN') return api(`/roles/${r.id}`, { method: 'PATCH', body: { name: r.name, description: r.description } });
      return api(`/roles/${r.id}`, { method: 'PATCH', body: r.isSystem ? { ...body, baseRole: undefined } : body });
    },
    onSuccess: (res) => {
      invalidate();
      setSelectedId(res.id);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/roles/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      setSelectedId(null);
    },
  });

  if (roles.isLoading || catalog.isLoading) return <Spinner />;
  const locked = draft?.key === 'ADMIN';
  const envOptions: string[] = [...new Set([...(envs.data?.environments.map((e: any) => e.value) ?? []), ...(draft?.inventoryEnvironments ?? [])])];
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        subtitle="Define what each role can do and which data it can see. Workflows can reference role keys in allowed roles and approvals."
        actions={
          <Button variant="primary" onClick={() => { setSelectedId('new'); setDraft(blank()); }}>
            <Plus className="size-4" /> New role
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card bodyClassName="p-2">
          <ul className="space-y-0.5">
            {roles.data?.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelectedId(r.id!)}
                  className={clsx('w-full rounded-md px-3 py-2 text-left', selectedId === r.id ? 'bg-indigo-50 dark:bg-indigo-950' : 'hover:bg-slate-50 dark:hover:bg-slate-800')}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {r.name}
                    {r.isSystem && <Badge>System</Badge>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <code>{r.key}</code> · {r._count?.users ?? 0} users · {humanize(r.ticketScope)} tickets
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {draft && (
          <div className="space-y-4">
            <Card
              title={draft.id ? draft.name : 'New role'}
              actions={
                <div className="flex gap-1">
                  {draft.id && (
                    <Button size="sm" variant="ghost" onClick={() => { setSelectedId('new'); setDraft({ ...structuredClone(draft), id: undefined, key: `${draft.key}_COPY`, name: `${draft.name} (copy)`, isSystem: false }); }}>
                      <Copy className="size-3.5" /> Duplicate
                    </Button>
                  )}
                  {draft.id && !draft.isSystem && (
                    <Button size="sm" variant="ghost" onClick={() => confirm(`Delete role ${draft.name}?`) && remove.mutate(draft.id!)}>
                      <Trash2 className="size-3.5 text-red-600" />
                    </Button>
                  )}
                </div>
              }
            >
              {locked && (
                <p className="mb-3 flex items-center gap-1.5 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <Lock className="size-3.5" /> The Administrator role always has every permission and sees all data.
                </p>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
                <Field label="Key" hint="Referenced by workflows (allowedRoles / approverRole)">
                  <Input value={draft.key} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} />
                </Field>
                <Field label="Base role" hint={BASE_HELP[draft.baseRole]}>
                  <Select value={draft.baseRole} disabled={!!draft.isSystem} onChange={(e) => setDraft({ ...draft, baseRole: e.target.value })}>
                    {ROLES.filter((r) => r !== 'ADMIN').map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
                    {draft.baseRole === 'ADMIN' && <option value="ADMIN">Admin</option>}
                  </Select>
                </Field>
                <Field label="Description"><Input value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
              </div>
            </Card>

            <Card title="Data scope">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">Ticket visibility</div>
                  <div className="space-y-2">
                    {SCOPES.map((s) => (
                      <label key={s.key} className={clsx('flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm', draft.ticketScope === s.key ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-700', locked && 'pointer-events-none opacity-60')}>
                        <input type="radio" className="mt-1" checked={draft.ticketScope === s.key} onChange={() => setDraft({ ...draft, ticketScope: s.key })} />
                        <span><span className="font-medium">{s.label}</span><span className="block text-xs text-slate-500">{s.help}</span></span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">Inventory environments</div>
                  <p className="mb-2 text-xs text-slate-500">Leave all unchecked to allow every environment.</p>
                  <div className="space-y-1.5">
                    {envOptions.map((env) => (
                      <label key={env} className={clsx('flex items-center gap-2 text-sm', locked && 'opacity-60')}>
                        <input type="checkbox" disabled={locked} checked={draft.inventoryEnvironments.includes(env)} onChange={() => setDraft({ ...draft, inventoryEnvironments: toggle(draft.inventoryEnvironments, env) })} />
                        {env}
                      </label>
                    ))}
                    {!envOptions.length && <p className="text-xs text-slate-400">No environments discovered yet.</p>}
                  </div>
                </div>
              </div>
            </Card>

            <Card title={`Permissions (${locked ? 'all' : draft.permissions.length})`}>
              <div className="grid gap-5 md:grid-cols-2">
                {catalog.data?.map((g) => (
                  <div key={g.group}>
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase text-slate-500">{g.group}</h4>
                      {!locked && (
                        <button
                          className="text-xs text-indigo-600 hover:underline"
                          onClick={() => {
                            const keys = g.items.map((i) => i.key);
                            const all = keys.every((k) => draft.permissions.includes(k));
                            setDraft({ ...draft, permissions: all ? draft.permissions.filter((p) => !keys.includes(p)) : [...new Set([...draft.permissions, ...keys])] });
                          }}
                        >
                          Toggle all
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {g.items.map((p) => (
                        <label key={p.key} className={clsx('flex items-start gap-2 text-sm', locked && 'opacity-60')}>
                          <input type="checkbox" className="mt-1" disabled={locked} checked={locked || draft.permissions.includes(p.key)} onChange={() => setDraft({ ...draft, permissions: toggle(draft.permissions, p.key) })} />
                          <span>
                            {p.label}
                            <code className="ml-1 text-[10px] text-slate-400">{p.key}</code>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <ErrorText error={save.error || remove.error} />
            <div className="flex justify-end gap-2">
              <Button onClick={() => { setSelectedId(roles.data?.[0]?.id ?? null); }}>Cancel</Button>
              <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(draft)}>
                {draft.id ? 'Save changes' : 'Create role'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
