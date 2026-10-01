'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AssetPicker } from '@/components/asset-picker';
import { KbSuggestions } from '@/components/kb';
import { Button, Card, ErrorText, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanize } from '@/lib/format';
import { useDirectory, useOrganizations, useTeams } from '@/lib/hooks';
import { Priority, PRIORITIES, TICKET_TYPES, TicketType } from '@/lib/types';

const CATEGORIES = ['Infrastructure', 'Networking', 'Database', 'Security', 'Access', 'Application', 'Other'];

const TYPE_HELP: Record<TicketType, string> = {
  INCIDENT: 'Something is broken or degraded and needs restoring.',
  SERVICE_REQUEST: 'A standard request — access, new resources, information.',
  CHANGE: 'A planned change to production. Requires a change window and rollback plan; scheduling needs approval.',
  PROBLEM: 'Investigate the root cause of recurring incidents.',
  TASK: 'Internal work item.',
};

export default function NewTicketPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, can } = useAuth();
  const canAssign = can('tickets:assign');
  const directory = useDirectory();
  const teams = useTeams();
  const orgs = useOrganizations(can('crm:read'));

  const [form, setForm] = useState({
    type: 'INCIDENT' as TicketType,
    priority: 'P3' as Priority,
    title: '',
    description: '',
    category: '',
    teamId: '',
    assigneeId: '',
    requesterId: '',
    organizationId: '',
    contactId: '',
    tags: '',
    changeWindow: '',
    rollbackPlan: '',
  });
  const [assets, setAssets] = useState<any[]>([]);
  const upd = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const presetAssetId = params.get('assetId');
  const preset = useQuery({
    queryKey: ['asset', presetAssetId],
    queryFn: () => api(`/assets/${presetAssetId}`),
    enabled: !!presetAssetId,
  });
  useEffect(() => {
    if (preset.data && !assets.some((a) => a.id === preset.data.id)) {
      setAssets((a) => [...a, preset.data]);
      upd({ category: 'Infrastructure', title: form.title || `Issue with ${preset.data.name}` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset.data]);

  const contacts = useQuery({
    queryKey: ['contacts', form.organizationId],
    queryFn: () => api<any[]>('/contacts', { query: { organizationId: form.organizationId } }),
    enabled: !!form.organizationId,
  });

  const teamMembers = useMemo(() => {
    const team = teams.data?.find((t) => t.id === form.teamId);
    return team ? team.members.map((m: any) => m.user) : directory.data?.filter((u) => u.role !== 'REQUESTER' && u.role !== 'VIEWER');
  }, [teams.data, directory.data, form.teamId]);

  const create = useMutation({
    mutationFn: () =>
      api('/tickets', {
        body: {
          type: form.type,
          priority: form.priority,
          title: form.title,
          description: form.description,
          category: form.category || undefined,
          teamId: form.teamId || undefined,
          assigneeId: form.assigneeId || undefined,
          requesterId: form.requesterId || undefined,
          organizationId: form.organizationId || undefined,
          contactId: form.contactId || undefined,
          tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
          customFields:
            form.type === 'CHANGE' ? { changeWindow: form.changeWindow, rollbackPlan: form.rollbackPlan } : undefined,
          assetIds: assets.map((a) => a.id),
        },
      }),
    onSuccess: (t) => router.push(`/tickets/${t.id}`),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <>
      <PageHeader title="New ticket" subtitle="Routing rules and round-robin assignment run automatically on create." />
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type" hint={TYPE_HELP[form.type]}>
                <Select value={form.type} onChange={(e) => upd({ type: e.target.value as TicketType })}>
                  {TICKET_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={form.priority} onChange={(e) => upd({ priority: e.target.value as Priority })}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p} — {{ P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low' }[p]}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Title">
              <Input required minLength={3} value={form.title} onChange={(e) => upd({ title: e.target.value })} placeholder="Short summary of the issue or request" />
            </Field>
            <Field label="Description">
              <Textarea required rows={8} value={form.description} onChange={(e) => upd({ description: e.target.value })} placeholder="What happened? What's the impact? Steps to reproduce…" />
            </Field>
            {can('kb:read') && <KbSuggestions text={`${form.title} ${form.description}`} hrefFor={(a) => `/knowledge/${a.id}`} />}
            {form.type === 'CHANGE' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Change window" hint="Required before submitting for review">
                  <Input value={form.changeWindow} onChange={(e) => upd({ changeWindow: e.target.value })} placeholder="Sat 02:00–04:00 UTC" />
                </Field>
                <Field label="Rollback plan" hint="Required before submitting for review">
                  <Input value={form.rollbackPlan} onChange={(e) => upd({ rollbackPlan: e.target.value })} placeholder="How to revert if it goes wrong" />
                </Field>
              </div>
            )}
            {can('inventory:read') && (
              <Field label="Affected AWS resources">
                <div className="space-y-2">
                  {!!assets.length && (
                    <div className="flex flex-wrap gap-1.5">
                      {assets.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                          {a.name}
                          <button type="button" onClick={() => setAssets((xs) => xs.filter((x) => x.id !== a.id))}>
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <AssetPicker exclude={assets.map((a) => a.id)} onPick={(a) => setAssets((xs) => [...xs, a])} />
                </div>
              </Field>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Classification & routing">
            <div className="space-y-3">
              <Field label="Category">
                <Select value={form.category} onChange={(e) => upd({ category: e.target.value })}>
                  <option value="">—</option>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Tags" hint="Comma separated">
                <Input value={form.tags} onChange={(e) => upd({ tags: e.target.value })} />
              </Field>
              {canAssign && (
                <>
                  <Field label="Team" hint="Leave blank to let routing rules decide">
                    <Select value={form.teamId} onChange={(e) => upd({ teamId: e.target.value, assigneeId: '' })}>
                      <option value="">Auto</option>
                      {teams.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Assignee" hint="Blank = round-robin within team">
                    <Select value={form.assigneeId} onChange={(e) => upd({ assigneeId: e.target.value })}>
                      <option value="">Auto</option>
                      {teamMembers?.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Requester">
                    <Select value={form.requesterId} onChange={(e) => upd({ requesterId: e.target.value })}>
                      <option value="">Me ({user?.name})</option>
                      {directory.data?.filter((u) => u.id !== user?.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </Select>
                  </Field>
                </>
              )}
            </div>
          </Card>
          {can('crm:read') && (
            <Card title="Customer">
              <div className="space-y-3">
                <Field label="Organization" hint="Enterprise & Premium customers get tighter SLAs">
                  <Select value={form.organizationId} onChange={(e) => upd({ organizationId: e.target.value, contactId: '' })}>
                    <option value="">—</option>
                    {orgs.data?.map((o) => <option key={o.id} value={o.id}>{o.name} ({humanize(o.tier)})</option>)}
                  </Select>
                </Field>
                {form.organizationId && (
                  <Field label="Contact">
                    <Select value={form.contactId} onChange={(e) => upd({ contactId: e.target.value })}>
                      <option value="">—</option>
                      {contacts.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </Field>
                )}
              </div>
            </Card>
          )}
          <ErrorText error={create.error} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={create.isPending} className="flex-1">
              Create ticket
            </Button>
            <Button type="button" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
