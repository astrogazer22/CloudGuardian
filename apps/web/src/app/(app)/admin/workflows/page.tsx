'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowRight, Lock, MessageSquare, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TypeBadge } from '@/components/badges';
import { Badge, Button, Card, ErrorText, Modal, PageHeader, Spinner, Table, Td, Textarea, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate, humanize } from '@/lib/format';
import type { WorkflowStatus, WorkflowTransition } from '@/lib/types';

const catTone = { TODO: 'slate', IN_PROGRESS: 'indigo', DONE: 'green' } as const;

export default function WorkflowsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['workflows'], queryFn: () => api<any[]>('/workflows') });
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!selected && data?.length) setSelected(data[0].id);
  }, [data, selected]);

  const wf = data?.find((w) => w.id === selected);
  const versions = useQuery({ queryKey: ['workflow-versions', selected], queryFn: () => api<any[]>(`/workflows/${selected}/versions`), enabled: !!selected });

  if (isLoading) return <Spinner />;

  return (
    <>
      <PageHeader title="Workflows" subtitle="Statuses, transitions, guards and approval gates per ticket type. Publishing creates a new version; in-flight tickets keep theirs." />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card bodyClassName="p-2">
          <ul className="space-y-0.5">
            {data?.map((w) => (
              <li key={w.id}>
                <button
                  onClick={() => setSelected(w.id)}
                  className={clsx('w-full rounded-md px-3 py-2 text-left', selected === w.id ? 'bg-indigo-50 dark:bg-indigo-950' : 'hover:bg-slate-50 dark:hover:bg-slate-800')}
                >
                  <div className="text-sm font-medium">{w.name}</div>
                  <div className="mt-1 flex items-center gap-2"><TypeBadge type={w.ticketType} /><span className="text-xs text-slate-400">v{w.version} · {w._count.tickets} tickets</span></div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {wf && (
          <div className="space-y-4">
            <Card
              title={<span>{wf.name} <span className="font-normal text-slate-400">v{wf.version}</span></span>}
              actions={<Button size="sm" variant="primary" onClick={() => setEditing(true)}>Edit & publish new version</Button>}
            >
              <p className="mb-4 text-sm text-slate-500">{wf.description}</p>
              <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">Statuses</h4>
              <div className="flex flex-wrap gap-2">
                {wf.definition.statuses.map((s: WorkflowStatus) => (
                  <Badge key={s.key} tone={catTone[s.category]}>
                    {s.key === wf.definition.initialStatus && '▶ '}
                    {s.name}
                    {s.pausesSla && <span className="text-[10px] opacity-70">(pauses SLA)</span>}
                  </Badge>
                ))}
              </div>
            </Card>

            <Card title="Transitions" bodyClassName="p-0">
              <Table>
                <thead><tr><Th>Transition</Th><Th>From → To</Th><Th>Allowed roles</Th><Th>Guards</Th></tr></thead>
                <tbody>
                  {wf.definition.transitions.map((t: WorkflowTransition) => {
                    const name = (k: string) => (k === '*' ? 'Any' : (wf.definition.statuses.find((s: WorkflowStatus) => s.key === k)?.name ?? k));
                    return (
                      <tr key={t.key}>
                        <Td className="font-medium">{t.name}</Td>
                        <Td className="text-xs">
                          <span className="text-slate-500">{t.from.map(name).join(', ')}</span>
                          <ArrowRight className="mx-1 inline size-3" />
                          <b>{name(t.to)}</b>
                        </Td>
                        <Td className="text-xs">{t.allowedRoles?.length ? t.allowedRoles.map(humanize).join(', ') : 'Anyone with write'}</Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {t.requiresApproval && <Badge tone="amber"><ShieldCheck className="size-3" /> {humanize(t.requiresApproval.approverRole)} approval</Badge>}
                            {t.requireComment && <Badge><MessageSquare className="size-3" /> Comment</Badge>}
                            {t.requiredFields?.map((f) => <Badge key={f}><Lock className="size-3" /> {f.replace('customFields.', '')}</Badge>)}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>

            <Card title="Version history" bodyClassName="p-0">
              <Table>
                <thead><tr><Th>Version</Th><Th>Published</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {versions.data?.map((v) => (
                    <tr key={v.id}><Td>v{v.version}</Td><Td className="text-xs">{formatDate(v.createdAt)}</Td><Td>{v.isActive ? <Badge tone="green">Active</Badge> : <Badge>Retired</Badge>}</Td></tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>
        )}
      </div>
      {editing && wf && <EditModal wf={wf} onClose={() => setEditing(false)} onPublished={(id) => { setEditing(false); setSelected(id); }} />}
    </>
  );
}

function EditModal({ wf, onClose, onPublished }: { wf: any; onClose: () => void; onPublished: (id: string) => void }) {
  const qc = useQueryClient();
  const [json, setJson] = useState(JSON.stringify(wf.definition, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const publish = useMutation({
    mutationFn: (definition: any) => api('/workflows', { body: { name: wf.name, ticketType: wf.ticketType, description: wf.description, definition } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['workflows'] });
      qc.invalidateQueries({ queryKey: ['workflow-versions'] });
      onPublished(res.id);
    },
  });
  const submit = () => {
    try {
      const def = JSON.parse(json);
      setParseError(null);
      publish.mutate(def);
    } catch (e) {
      setParseError(`Invalid JSON: ${(e as Error).message}`);
    }
  };
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Edit ${wf.name}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={publish.isPending} onClick={submit}>Publish v{wf.version + 1}</Button></>}
    >
      <p className="text-xs text-slate-500">
        Statuses need <code>key</code>, <code>name</code>, <code>category</code> (TODO / IN_PROGRESS / DONE) and optional <code>pausesSla</code>. Transitions support{' '}
        <code>from</code> (use &quot;*&quot; for any), <code>to</code>, <code>allowedRoles</code>, <code>requiredFields</code> (e.g. assigneeId, category, customFields.rootCause),{' '}
        <code>requireComment</code> and <code>requiresApproval: {'{ approverRole }'}</code>.
      </p>
      <Textarea rows={22} value={json} onChange={(e) => setJson(e.target.value)} className="font-mono text-xs" spellCheck={false} />
      <ErrorText error={parseError || publish.error} />
    </Modal>
  );
}
