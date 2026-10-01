'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { BookOpen, Check, ChevronRight, Copy, Lock, Plus, ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ReactNode, useMemo, useState } from 'react';
import { AssetPicker } from '@/components/asset-picker';
import { AssetStateBadge, PriorityBadge, SlaIndicator, StatusBadge, TypeBadge } from '@/components/badges';
import { Badge, Button, Card, ErrorText, Field, Input, KeyValue, Modal, Select, Spinner, Tabs, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize, timeAgo } from '@/lib/format';
import { useDirectory, useTeams } from '@/lib/hooks';
import { PRIORITIES, WorkflowStatus, WorkflowTransition } from '@/lib/types';

const CATEGORIES = ['Infrastructure', 'Networking', 'Database', 'Security', 'Access', 'Application', 'Other'];
const TERMINAL_SIDE_STATUSES = ['cancelled', 'rejected', 'failed'];

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { user, can } = useAuth();
  const directory = useDirectory();
  const teams = useTeams();
  const [tab, setTab] = useState<'conversation' | 'history' | 'approvals'>('conversation');
  const [transition, setTransition] = useState<WorkflowTransition | null>(null);

  const { data: t, isLoading, error } = useQuery({ queryKey: ['ticket', id], queryFn: () => api(`/tickets/${id}`) });

  const refresh = (data?: any) => {
    if (data?.id) qc.setQueryData(['ticket', id], data);
    else qc.invalidateQueries({ queryKey: ['ticket', id] });
    qc.invalidateQueries({ queryKey: ['tickets'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const update = useMutation({ mutationFn: (body: any) => api(`/tickets/${id}`, { method: 'PATCH', body }), onSuccess: refresh });

  const names = useMemo(() => {
    const m = new Map<string, string>();
    directory.data?.forEach((u) => m.set(u.id, u.name));
    teams.data?.forEach((tm) => m.set(tm.id, tm.name));
    return m;
  }, [directory.data, teams.data]);

  if (isLoading) return <Spinner />;
  if (error || !t) return <ErrorText error={error ?? 'Ticket not found'} />;

  const internalAccess = can('tickets:view_internal');
  const canEdit = can('tickets:edit');
  const canAssign = can('tickets:assign');
  const statuses: WorkflowStatus[] = t.workflow.statuses;
  const mainPath = statuses.filter((s) => !TERMINAL_SIDE_STATUSES.includes(s.key) || s.key === t.status);
  const currentIdx = mainPath.findIndex((s) => s.key === t.status);

  return (
    <>
      <div className="mb-1 flex items-center gap-1 text-sm text-slate-500">
        <Link href="/tickets" className="hover:text-indigo-600">Tickets</Link>
        <ChevronRight className="size-3.5" />
        <span>#{t.number}</span>
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <TypeBadge type={t.type} />
            <PriorityBadge priority={t.priority} />
            <StatusBadge category={t.statusCategory} name={t.statusName} />
            <SlaIndicator ticket={t} />
            {t.tags.map((tag: string) => <Badge key={tag}>{tag}</Badge>)}
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Opened by {t.requester.name} {timeAgo(t.createdAt)} · {t.workflow.name} v{t.workflow.version}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {t.availableTransitions.map((tr: WorkflowTransition) => (
            <Button key={tr.key} variant={tr.to === 'resolved' || tr.to === 'completed' ? 'primary' : 'secondary'} onClick={() => setTransition(tr)}>
              {tr.requiresApproval && <ShieldCheck className="size-3.5" />}
              {tr.name}
            </Button>
          ))}
        </div>
      </div>

      {t.pendingApproval && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <ShieldCheck className="size-4" />
          Awaiting {humanize(t.pendingApproval.approverRole)} approval for <b>{humanize(t.pendingApproval.transitionKey)}</b>, requested by{' '}
          {t.pendingApproval.requestedBy.name} {timeAgo(t.pendingApproval.createdAt)}.
          {can('approvals:decide') && <Link href="/approvals" className="ml-auto font-medium underline">Review</Link>}
        </div>
      )}

      <Card className="mb-4" bodyClassName="px-4 py-3">
        <ol className="flex flex-wrap items-center gap-y-2">
          {mainPath.map((s, i) => (
            <li key={s.key} className="flex items-center">
              <span
                className={clsx(
                  'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
                  i === currentIdx
                    ? 'bg-indigo-600 text-white'
                    : i < currentIdx
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800',
                )}
              >
                {i < currentIdx && <Check className="size-3" />}
                {s.name}
              </span>
              {i < mainPath.length - 1 && <span className="mx-1 h-px w-4 bg-slate-300 dark:bg-slate-700" />}
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <Card title="Description">
            <div className="prose-ticket">{t.description}</div>
          </Card>

          <Card bodyClassName="p-0">
            <div className="px-4 pt-2">
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { key: 'conversation', label: 'Conversation', count: t.comments.length },
                  { key: 'history', label: 'History', count: t.events.length },
                  { key: 'approvals', label: 'Approvals', count: t.approvals.length },
                ]}
              />
            </div>
            <div className="p-4">
              {tab === 'conversation' && <Conversation ticket={t} onPosted={() => refresh()} internalAccess={internalAccess} />}
              {tab === 'history' && <History events={t.events} names={names} />}
              {tab === 'approvals' && <Approvals approvals={t.approvals} />}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Details">
            <div className="space-y-3">
              <SideField label="Priority">
                {canEdit ? (
                  <Select value={t.priority} onChange={(e) => update.mutate({ priority: e.target.value })}>
                    {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                  </Select>
                ) : (
                  <PriorityBadge priority={t.priority} />
                )}
              </SideField>
              <SideField label="Assignee">
                {canAssign ? (
                  <Select value={t.assigneeId ?? ''} onChange={(e) => update.mutate({ assigneeId: e.target.value || null })}>
                    <option value="">Unassigned</option>
                    {directory.data?.filter((u) => ['ADMIN', 'AGENT'].includes(u.role!)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </Select>
                ) : (
                  t.assignee?.name ?? 'Unassigned'
                )}
              </SideField>
              <SideField label="Team">
                {canAssign ? (
                  <Select value={t.teamId ?? ''} onChange={(e) => update.mutate({ teamId: e.target.value || null })}>
                    <option value="">—</option>
                    {teams.data?.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                  </Select>
                ) : (
                  t.team?.name ?? '—'
                )}
              </SideField>
              <SideField label="Category">
                {canEdit ? (
                  <Select value={t.category ?? ''} onChange={(e) => update.mutate({ category: e.target.value || null })}>
                    <option value="">—</option>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </Select>
                ) : (
                  t.category ?? '—'
                )}
              </SideField>
              {canEdit && <TagEditor tags={t.tags} onSave={(tags) => update.mutate({ tags })} />}
              <ErrorText error={update.error} />
            </div>
          </Card>

          <Card title="People & customer">
            <KeyValue
              items={[
                ['Requester', t.requester.name],
                ['Organization', t.organization ? <Link className="text-indigo-600 hover:underline" href={`/customers/${t.organization.id}`}>{t.organization.name} <span className="text-xs text-slate-400">({humanize(t.organization.tier)})</span></Link> : '—'],
                ['Contact', t.contact ? `${t.contact.name} <${t.contact.email}>` : '—'],
              ]}
            />
          </Card>

          <Card title="SLA & dates">
            <KeyValue
              items={[
                ['Created', formatDate(t.createdAt)],
                ['First response due', formatDate(t.responseDueAt)],
                ['First responded', formatDate(t.firstRespondedAt)],
                ['Resolution due', formatDate(t.resolutionDueAt)],
                ['Resolved', formatDate(t.resolvedAt)],
                ['SLA', t.slaPausedAt ? 'Paused (waiting on requester)' : t.slaBreached ? <span className="text-red-600">Breached {t.slaBreachedAt && timeAgo(t.slaBreachedAt)}</span> : t.slaWarnedAt ? <span className="text-amber-600">At risk</span> : 'On track'],
                ...(t.escalationLevel ? [['Escalation', <Badge key="esc" tone="red">Level {t.escalationLevel}</Badge>] as [string, ReactNode]] : []),
              ]}
            />
          </Card>

          {internalAccess && can('kb:read') && <SuggestedArticles query={`${t.title} ${t.description}`} />}

          {internalAccess && <CustomFields fields={t.customFields} editable={canEdit} onSave={(customFields) => update.mutate({ customFields })} />}

          {can('inventory:read') && <LinkedAssets ticket={t} editable={canEdit} onChange={refresh} />}

          {(t.parent || t.children.length > 0) && (
            <Card title="Related tickets">
              <ul className="space-y-1.5 text-sm">
                {t.parent && (
                  <li>
                    <span className="text-xs text-slate-400">Parent: </span>
                    <Link className="hover:text-indigo-600" href={`/tickets/${t.parent.id}`}>#{t.parent.number} {t.parent.title}</Link>
                  </li>
                )}
                {t.children.map((c: any) => (
                  <li key={c.id}>
                    <span className="text-xs text-slate-400">Child: </span>
                    <Link className="hover:text-indigo-600" href={`/tickets/${c.id}`}>#{c.number} {c.title}</Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {transition && (
        <TransitionModal
          ticket={t}
          transition={transition}
          statuses={statuses}
          onClose={() => setTransition(null)}
          onDone={(data) => {
            setTransition(null);
            refresh(data);
          }}
        />
      )}
    </>
  );
}

function SideField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function TagEditor({ tags, onSave }: { tags: string[]; onSave: (tags: string[]) => void }) {
  const [value, setValue] = useState('');
  return (
    <SideField label="Tags">
      <div className="flex flex-wrap items-center gap-1">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
            {tag}
            <button onClick={() => onSave(tags.filter((x) => x !== tag))}><X className="size-3" /></button>
          </span>
        ))}
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              onSave([...new Set([...tags, value.trim()])]);
              setValue('');
            }
          }}
          placeholder="+ add"
          className="w-16 bg-transparent text-xs outline-none"
        />
      </div>
    </SideField>
  );
}

function SuggestedArticles({ query }: { query: string }) {
  const { data } = useQuery({ queryKey: ['kb-suggest', query], queryFn: () => api<any[]>('/kb/suggest', { query: { q: query.slice(0, 500) } }) });
  const [copied, setCopied] = useState<string | null>(null);
  if (!data?.length) return null;
  return (
    <Card title={<span className="flex items-center gap-1.5"><BookOpen className="size-3.5" /> Suggested articles</span>}>
      <ul className="space-y-2.5">
        {data.map((a) => (
          <li key={a.id} className="text-sm">
            <div className="flex items-start gap-2">
              <Link href={`/knowledge/${a.id}`} className="flex-1 font-medium hover:text-indigo-600">{a.title}</Link>
              <button
                title="Copy portal link to share with the requester"
                className="text-slate-400 hover:text-indigo-600"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/portal/kb/${a.slug}`);
                  setCopied(a.id);
                  setTimeout(() => setCopied(null), 1500);
                }}
              >
                {copied === a.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </button>
            </div>
            <p className="line-clamp-2 text-xs text-slate-500">{a.excerpt}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Conversation({ ticket, onPosted, internalAccess }: { ticket: any; onPosted: () => void; internalAccess: boolean }) {
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const post = useMutation({
    mutationFn: () => api(`/tickets/${ticket.id}/comments`, { body: { body, internal } }),
    onSuccess: () => {
      setBody('');
      onPosted();
    },
  });
  return (
    <div className="space-y-4">
      {!ticket.comments.length && <p className="text-sm text-slate-500">No replies yet.</p>}
      {ticket.comments.map((c: any) => (
        <div
          key={c.id}
          className={clsx(
            'rounded-lg border p-3',
            c.internal ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30' : 'border-slate-200 dark:border-slate-800',
          )}
        >
          <div className="mb-1 flex items-center gap-2 text-xs">
            <span className="font-medium text-slate-800 dark:text-slate-200">{c.author.name}</span>
            {c.internal && <span className="flex items-center gap-0.5 text-amber-700 dark:text-amber-300"><Lock className="size-3" /> Internal note</span>}
            <span className="text-slate-400">{timeAgo(c.createdAt)}</span>
          </div>
          <div className="prose-ticket">{c.body}</div>
        </div>
      ))}

      <div className={clsx('rounded-lg border p-3', internal ? 'border-amber-300 dark:border-amber-800' : 'border-slate-200 dark:border-slate-700')}>
        {internalAccess && (
          <div className="mb-2 flex gap-1 text-xs">
            <button onClick={() => setInternal(false)} className={clsx('rounded px-2 py-1', !internal ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800')}>
              Public reply
            </button>
            <button onClick={() => setInternal(true)} className={clsx('rounded px-2 py-1', internal ? 'bg-amber-500 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800')}>
              Internal note
            </button>
          </div>
        )}
        <Textarea
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={internal ? 'Visible to agents only. Mention teammates with @email' : 'Write a reply…'}
          className="border-0 shadow-none focus:ring-0"
        />
        <ErrorText error={post.error} />
        <div className="mt-2 flex justify-end">
          <Button variant="primary" size="sm" disabled={!body.trim()} loading={post.isPending} onClick={() => post.mutate()}>
            {internal ? 'Add note' : 'Send reply'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function History({ events, names }: { events: any[]; names: Map<string, string> }) {
  const fmt = (field: string, v: any) => {
    if (v === null || v === undefined || v === '') return <i className="text-slate-400">none</i>;
    if (['assigneeId', 'teamId'].includes(field)) return names.get(v) ?? v;
    if (Array.isArray(v)) return v.join(', ') || <i className="text-slate-400">none</i>;
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };
  const describe = (e: any): ReactNode => {
    const d = e.data ?? {};
    switch (e.type) {
      case 'created':
        return 'created the ticket';
      case 'status.changed':
        return <>moved <b>{d.fromName}</b> → <b>{d.toName}</b> <span className="text-slate-400">({d.transition})</span></>;
      case 'field.changed':
        return d.field === 'description' ? 'edited the description' : <>changed <b>{humanize(d.field.replace(/Id$/, ''))}</b> from {fmt(d.field, d.from)} to {fmt(d.field, d.to)}</>;
      case 'approval.requested':
        return <>requested approval for <b>{d.transition}</b></>;
      case 'approval.approved':
        return <>approved the request{d.comment && <> — “{d.comment}”</>}</>;
      case 'approval.rejected':
        return <>rejected the request{d.comment && <> — “{d.comment}”</>}</>;
      case 'automation.applied':
        return <>Automation rule <b>{d.rule}</b> applied</>;
      case 'auto_assigned':
        return <>Auto-assigned to <b>{names.get(d.assigneeId) ?? 'agent'}</b> (round robin)</>;
      case 'sla.breached':
        return <span className="text-red-600">SLA breached — {humanize(d.kind)} target missed</span>;
      case 'sla.warning':
        return <span className="text-amber-600">SLA at risk — {d.minutesLeft} min left on {humanize(d.kind)} target</span>;
      case 'sla.escalated':
        return <span className="text-red-600">Escalated to level {d.level} ({d.policy}){d.actions?.length ? ` — ${d.actions.join(', ')}` : ''}</span>;
      case 'asset.linked':
        return 'linked an AWS resource';
      case 'asset.unlinked':
        return 'unlinked an AWS resource';
      default:
        return e.type;
    }
  };
  return (
    <ol className="relative space-y-3 border-l border-slate-200 pl-4 dark:border-slate-800">
      {events.map((e) => (
        <li key={e.id} className="text-sm">
          <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-white bg-slate-300 dark:border-slate-900 dark:bg-slate-600" />
          <span className="font-medium">{e.actor?.name ?? 'System'}</span> {describe(e)}
          <div className="text-xs text-slate-400">{formatDate(e.createdAt)}</div>
        </li>
      ))}
    </ol>
  );
}

function Approvals({ approvals }: { approvals: any[] }) {
  if (!approvals.length) return <p className="text-sm text-slate-500">No approvals on this ticket.</p>;
  return (
    <ul className="space-y-2">
      {approvals.map((a) => (
        <li key={a.id} className="flex items-center gap-3 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
          <Badge tone={a.state === 'APPROVED' ? 'green' : a.state === 'REJECTED' ? 'red' : 'amber'}>{humanize(a.state)}</Badge>
          <div className="flex-1">
            <b>{humanize(a.transitionKey)}</b> — requested by {a.requestedBy.name} {timeAgo(a.createdAt)}
            {a.decidedBy && <div className="text-xs text-slate-500">Decided by {a.decidedBy.name} {timeAgo(a.decidedAt)}{a.comment && ` — “${a.comment}”`}</div>}
          </div>
          <span className="text-xs text-slate-400">{humanize(a.approverRole)}</span>
        </li>
      ))}
    </ul>
  );
}

function CustomFields({ fields, editable, onSave }: { fields: Record<string, any>; editable: boolean; onSave: (f: Record<string, any>) => void }) {
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const entries = Object.entries(fields ?? {});
  return (
    <Card
      title="Custom fields"
      actions={editable && <Button size="sm" variant="ghost" onClick={() => setAdding((a) => !a)}><Plus className="size-3.5" /></Button>}
    >
      {!entries.length && !adding && <p className="text-sm text-slate-500">None</p>}
      <div className="space-y-2">
        {entries.map(([k, v]) => (
          <div key={k} className="text-sm">
            <div className="text-xs text-slate-500">{humanize(k.replace(/([A-Z])/g, '_$1'))}</div>
            {editable ? (
              <Input defaultValue={String(v ?? '')} onBlur={(e) => e.target.value !== String(v ?? '') && onSave({ [k]: e.target.value })} className="h-8" />
            ) : (
              <div>{String(v)}</div>
            )}
          </div>
        ))}
        {adding && (
          <div className="space-y-1.5 rounded-md bg-slate-50 p-2 dark:bg-slate-800/50">
            <Input className="h-8" placeholder="Field key (e.g. rootCause)" value={key} onChange={(e) => setKey(e.target.value)} />
            <Input className="h-8" placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} />
            <Button size="sm" variant="primary" disabled={!key} onClick={() => { onSave({ [key]: value }); setKey(''); setValue(''); setAdding(false); }}>
              Add field
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function LinkedAssets({ ticket, editable, onChange }: { ticket: any; editable: boolean; onChange: (data?: any) => void }) {
  const [picking, setPicking] = useState(false);
  const link = useMutation({ mutationFn: (assetId: string) => api(`/tickets/${ticket.id}/assets`, { body: { assetId } }), onSuccess: onChange });
  const unlink = useMutation({ mutationFn: (assetId: string) => api(`/tickets/${ticket.id}/assets/${assetId}`, { method: 'DELETE' }), onSuccess: onChange });
  return (
    <Card title="Affected AWS resources" actions={editable && <Button size="sm" variant="ghost" onClick={() => setPicking((p) => !p)}><Plus className="size-3.5" /></Button>}>
      {picking && (
        <div className="mb-3">
          <AssetPicker exclude={ticket.assets.map((a: any) => a.asset.id)} onPick={(a) => { link.mutate(a.id); setPicking(false); }} />
        </div>
      )}
      {!ticket.assets.length ? (
        <p className="text-sm text-slate-500">No linked resources</p>
      ) : (
        <ul className="space-y-1.5">
          {ticket.assets.map(({ asset }: any) => (
            <li key={asset.id} className="flex items-center gap-2 text-sm">
              <Link href={`/inventory/${asset.id}`} className="flex-1 truncate hover:text-indigo-600">{asset.name}</Link>
              <AssetStateBadge state={asset.state} />
              {editable && <button onClick={() => unlink.mutate(asset.id)} className="text-slate-400 hover:text-red-600"><X className="size-3.5" /></button>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TransitionModal({
  ticket,
  transition,
  statuses,
  onClose,
  onDone,
}: {
  ticket: any;
  transition: WorkflowTransition;
  statuses: WorkflowStatus[];
  onClose: () => void;
  onDone: (data: any) => void;
}) {
  const directory = useDirectory();
  const [comment, setComment] = useState('');
  const [assigneeId, setAssigneeId] = useState(ticket.assigneeId ?? '');
  const [category, setCategory] = useState(ticket.category ?? '');
  const [custom, setCustom] = useState<Record<string, string>>({});
  const target = statuses.find((s) => s.key === transition.to);
  const required = transition.requiredFields ?? [];
  const customRequired = required.filter((f) => f.startsWith('customFields.')).map((f) => f.slice('customFields.'.length));

  const run = useMutation({
    mutationFn: () =>
      api(`/tickets/${ticket.id}/transitions`, {
        body: {
          transitionKey: transition.key,
          comment: comment || undefined,
          fields: {
            ...(required.includes('assigneeId') && assigneeId ? { assigneeId } : {}),
            ...(required.includes('category') && category ? { category } : {}),
            ...(customRequired.length ? { customFields: custom } : {}),
          },
        },
      }),
    onSuccess: onDone,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={transition.name}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={run.isPending} onClick={() => run.mutate()}>
            {transition.requiresApproval ? 'Request approval' : `Move to ${target?.name}`}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {ticket.statusName} → <b>{target?.name}</b>
        {target?.pausesSla && <span className="ml-1 text-xs text-slate-500">(SLA clock pauses in this status)</span>}
      </p>
      {transition.requiresApproval && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          This transition requires approval from a {humanize(transition.requiresApproval.approverRole)}. The ticket will move once approved.
        </div>
      )}
      {required.includes('assigneeId') && (
        <Field label="Assignee (required)">
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Select…</option>
            {directory.data?.filter((u) => ['ADMIN', 'AGENT'].includes(u.role!)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
      )}
      {required.includes('category') && (
        <Field label="Category (required)">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Select…</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
      )}
      {customRequired.map((k) => (
        <Field key={k} label={`${humanize(k.replace(/([A-Z])/g, '_$1'))} (required)`}>
          <Input defaultValue={ticket.customFields?.[k] ?? ''} onChange={(e) => setCustom((c) => ({ ...c, [k]: e.target.value }))} />
        </Field>
      ))}
      <Field label={transition.requireComment ? 'Comment (required)' : 'Comment (optional)'}>
        <Textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add context for this change…" />
      </Field>
      <ErrorText error={run.error} />
    </Modal>
  );
}
