'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Copy, Plus, Send, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { PriorityBadge } from '@/components/badges';
import { Badge, Button, Card, Empty, ErrorText, Field, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useTeams } from '@/lib/hooks';
import { Priority, PRIORITIES } from '@/lib/types';

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const channels = useQuery({ queryKey: ['channels'], queryFn: () => api<any[]>('/integrations/channels') });
  const events = useQuery({ queryKey: ['integration-events'], queryFn: () => api<{ key: string; label: string }[]>('/integrations/events') });
  const slack = useQuery({ queryKey: ['slack-status'], queryFn: () => api('/integrations/slack/status') });
  const teams = useTeams();
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  const invalidate = () => qc.invalidateQueries({ queryKey: ['channels'] });
  const toggle = useMutation({ mutationFn: (c: any) => api(`/integrations/channels/${c.id}`, { method: 'PATCH', body: { enabled: !c.enabled } }), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => api(`/integrations/channels/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
  const test = useMutation({
    mutationFn: (id: string) => api(`/integrations/channels/${id}/test`, { method: 'POST' }),
    onSuccess: (_d, id) => { setTestResult((r) => ({ ...r, [id]: 'ok' })); invalidate(); },
    onError: (e, id) => { setTestResult((r) => ({ ...r, [id]: (e as Error).message })); invalidate(); },
  });

  const eventLabel = (k: string) => events.data?.find((e) => e.key === k)?.label ?? k;

  return (
    <>
      <PageHeader
        title="Slack & Microsoft Teams"
        subtitle="Post ticket, SLA and approval events to chat channels, and let people raise tickets and approve changes from Slack."
        actions={<Button variant="primary" onClick={() => setEditing('new')}><Plus className="size-4" /> Add channel</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card title="Channels" bodyClassName="p-0">
          {channels.isLoading ? <Spinner /> : !channels.data?.length ? (
            <Empty>No channels yet. Add a Slack or Teams incoming-webhook URL to start posting notifications.</Empty>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {channels.data.map((c) => (
                <div key={c.id} className={`px-4 py-3 ${c.enabled ? '' : 'opacity-50'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={c.kind === 'SLACK' ? 'purple' : 'blue'}>{c.kind === 'SLACK' ? 'Slack' : 'Teams'}</Badge>
                    <span className="font-medium">{c.name}</span>
                    <code className="text-xs text-slate-400">{c.webhookUrlMasked}</code>
                    <div className="ml-auto flex items-center gap-1">
                      <label className="mr-2 flex items-center gap-1 text-xs"><input type="checkbox" checked={c.enabled} onChange={() => toggle.mutate(c)} /> Enabled</label>
                      <Button size="sm" onClick={() => test.mutate(c.id)} loading={test.isPending && test.variables === c.id}><Send className="size-3.5" /> Test</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => confirm(`Remove ${c.name}?`) && remove.mutate(c.id)}><Trash2 className="size-3.5 text-red-600" /></Button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.events.map((e: string) => <Badge key={e}>{eventLabel(e)}</Badge>)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>Priorities: {c.priorities.length ? c.priorities.map((p: Priority) => <PriorityBadge key={p} priority={p} short />) : 'all'}</span>
                    <span>· Teams: {c.teamIds.length ? c.teamIds.map((id: string) => teams.data?.find((t) => t.id === id)?.name ?? id).join(', ') : 'all'}</span>
                    <span>· Last delivery: {c.lastDeliveryAt ? timeAgo(c.lastDeliveryAt) : 'never'}</span>
                  </div>
                  {(testResult[c.id] || c.lastError) && (
                    <p className={`mt-2 flex items-center gap-1 text-xs ${testResult[c.id] === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {testResult[c.id] === 'ok' ? <><CheckCircle2 className="size-3.5" /> Test message delivered</> : <><XCircle className="size-3.5" /> {testResult[c.id] || c.lastError}</>}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Slack app (slash command & buttons)">
            <ul className="mb-3 space-y-1.5 text-sm">
              <StatusLine ok={slack.data?.signingSecretConfigured} label="SLACK_SIGNING_SECRET configured" />
              <StatusLine ok={slack.data?.botTokenConfigured} label="SLACK_BOT_TOKEN configured (maps Slack users by email)" />
            </ul>
            <ol className="list-decimal space-y-2 pl-4 text-xs text-slate-600 dark:text-slate-400">
              <li>Create a Slack app, enable <b>Incoming Webhooks</b> and add one per channel — paste the URLs here.</li>
              <li>Add a slash command <code>/cg</code> with request URL: <CopyText text={slack.data?.commandUrl} /></li>
              <li>Enable <b>Interactivity</b> with request URL: <CopyText text={slack.data?.interactionsUrl} /></li>
              <li>Add bot scopes <code>users:read</code> and <code>users:read.email</code>, install the app, then set <code>SLACK_SIGNING_SECRET</code> and <code>SLACK_BOT_TOKEN</code> in the API environment.</li>
            </ol>
            <p className="mt-3 text-xs text-slate-500">Commands: <code>/cg new P2 incident Title | details</code>, <code>/cg status 123</code>, <code>/cg mine</code>. Approval messages include Approve/Reject buttons.</p>
          </Card>
          <Card title="Microsoft Teams">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              In the Teams channel choose <b>Connectors / Workflows → Incoming webhook</b>, copy the URL and add it here as a Teams channel. Messages include an “Open in CloudGuardian” button.
            </p>
          </Card>
        </div>
      </div>

      {editing && <ChannelModal channel={editing === 'new' ? null : editing} events={events.data ?? []} teams={teams.data ?? []} onClose={() => setEditing(null)} />}
    </>
  );
}

function StatusLine({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      {ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-slate-400" />}
      <span className={ok ? '' : 'text-slate-500'}>{label}</span>
    </li>
  );
}

function CopyText({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <button onClick={() => navigator.clipboard.writeText(text)} className="mt-0.5 flex max-w-full items-center gap-1 break-all rounded bg-slate-100 px-1.5 py-0.5 text-left font-mono text-[11px] dark:bg-slate-800">
      {text} <Copy className="size-3 shrink-0" />
    </button>
  );
}

function ChannelModal({ channel, events, teams, onClose }: { channel: any | null; events: { key: string; label: string }[]; teams: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: channel?.name ?? '',
    kind: channel?.kind ?? 'SLACK',
    webhookUrl: '',
    events: (channel?.events ?? ['sla.breached', 'sla.escalated', 'approval.requested']) as string[],
    priorities: (channel?.priorities ?? []) as Priority[],
    teamIds: (channel?.teamIds ?? []) as string[],
  });
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const save = useMutation({
    mutationFn: () => {
      const body: any = { name: f.name, events: f.events, priorities: f.priorities, teamIds: f.teamIds };
      if (f.webhookUrl) body.webhookUrl = f.webhookUrl;
      return channel ? api(`/integrations/channels/${channel.id}`, { method: 'PATCH', body }) : api('/integrations/channels', { body: { ...body, kind: f.kind } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels'] });
      onClose();
    },
  });
  return (
    <Modal open wide onClose={onClose} title={channel ? `Edit ${channel.name}` : 'Add channel'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
      <div className="grid grid-cols-[1fr_160px] gap-3">
        <Field label="Channel name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="#ops-alerts" /></Field>
        <Field label="Platform">
          <Select value={f.kind} disabled={!!channel} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="SLACK">Slack</option>
            <option value="TEAMS">Microsoft Teams</option>
          </Select>
        </Field>
      </div>
      <Field label="Incoming webhook URL" hint={channel ? `Currently ${channel.webhookUrlMasked} — leave blank to keep` : 'Stored securely; only a masked version is shown later'}>
        <Input value={f.webhookUrl} onChange={(e) => setF({ ...f, webhookUrl: e.target.value })} placeholder={f.kind === 'SLACK' ? 'https://hooks.slack.com/services/…' : 'https://…webhook.office.com/…'} />
      </Field>
      <Field label="Events">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {events.map((e) => (
            <label key={e.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.events.includes(e.key)} onChange={() => setF({ ...f, events: toggle(f.events, e.key) })} /> {e.label}</label>
          ))}
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Only these priorities" hint="None = all">
          <div className="flex gap-3">
            {PRIORITIES.map((p) => <label key={p} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={f.priorities.includes(p)} onChange={() => setF({ ...f, priorities: toggle(f.priorities, p) })} /> {p}</label>)}
          </div>
        </Field>
        <Field label="Only these teams" hint="None = all">
          <div className="grid grid-cols-2 gap-1">
            {teams.map((t) => <label key={t.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={f.teamIds.includes(t.id)} onChange={() => setF({ ...f, teamIds: toggle(f.teamIds, t.id) })} /> {t.name}</label>)}
          </div>
        </Field>
      </div>
      <ErrorText error={save.error} />
    </Modal>
  );
}
