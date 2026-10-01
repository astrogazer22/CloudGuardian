'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, CheckCircle2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { friendlyStatus } from '@/components/portal';
import { Badge, Button, Card, ErrorText, KeyValue, Modal, Spinner, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate, humanize, timeAgo } from '@/lib/format';
import type { WorkflowTransition } from '@/lib/types';

export default function PortalRequest() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [reply, setReply] = useState('');
  const [transition, setTransition] = useState<WorkflowTransition | null>(null);
  const [comment, setComment] = useState('');
  const { data: t, isLoading, error } = useQuery({ queryKey: ['ticket', id], queryFn: () => api(`/tickets/${id}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['ticket', id] });
  const post = useMutation({ mutationFn: () => api(`/tickets/${id}/comments`, { body: { body: reply } }), onSuccess: () => { setReply(''); refresh(); } });
  const move = useMutation({
    mutationFn: () => api(`/tickets/${id}/transitions`, { body: { transitionKey: transition!.key, comment: comment || undefined } }),
    onSuccess: () => { setTransition(null); setComment(''); refresh(); },
  });

  if (isLoading) return <Spinner />;
  if (error || !t) return <ErrorText error={error ?? 'Request not found'} />;

  const s = friendlyStatus(t.statusCategory, t.statusName);
  const steps = t.workflow.statuses.filter((x: any) => !['cancelled', 'rejected', 'failed'].includes(x.key) || x.key === t.status);
  const idx = steps.findIndex((x: any) => x.key === t.status);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2 flex items-center gap-1 text-sm text-slate-500">
        <Link href="/portal/requests" className="hover:text-indigo-600">My requests</Link>
        <ChevronRight className="size-3.5" />
        <span>#{t.number}</span>
      </div>
      {params.get('submitted') && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <CheckCircle2 className="size-4" /> Request #{t.number} submitted{t.team ? ` to ${t.team.name}` : ''}. You&apos;ll be notified of updates.
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t.title}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500"><Badge tone={s.tone}>{s.label}</Badge> {humanize(t.type)} · opened {timeAgo(t.createdAt)}</div>
        </div>
        <div className="flex gap-2">
          {t.availableTransitions.map((tr: WorkflowTransition) => (
            <Button key={tr.key} onClick={() => setTransition(tr)}>{tr.name}</Button>
          ))}
        </div>
      </div>

      <Card className="mb-4" bodyClassName="px-4 py-3">
        <ol className="flex flex-wrap items-center gap-y-2">
          {steps.map((st: any, i: number) => (
            <li key={st.key} className="flex items-center">
              <span className={clsx('flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium', i === idx ? 'bg-indigo-600 text-white' : i < idx ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}>
                {i < idx && <Check className="size-3" />}{st.name}
              </span>
              {i < steps.length - 1 && <span className="mx-1 h-px w-4 bg-slate-300 dark:bg-slate-700" />}
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 md:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <Card title="Your request"><div className="prose-ticket">{t.description}</div></Card>
          <Card title="Conversation">
            <div className="space-y-3">
              {!t.comments.length && <p className="text-sm text-slate-500">No replies yet — the team will respond here.</p>}
              {t.comments.map((c: any) => (
                <div key={c.id} className={clsx('rounded-lg p-3', c.author.id === t.requester.id ? 'ml-8 bg-indigo-50 dark:bg-indigo-950/40' : 'mr-8 border border-slate-200 dark:border-slate-800')}>
                  <div className="mb-1 text-xs"><b>{c.author.id === t.requester.id ? 'You' : c.author.name}</b> <span className="text-slate-400">{timeAgo(c.createdAt)}</span></div>
                  <div className="prose-ticket">{c.body}</div>
                </div>
              ))}
              {t.statusCategory !== 'DONE' && (
                <div className="pt-2">
                  <Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Add a reply or more details…" />
                  <ErrorText error={post.error} />
                  <div className="mt-2 flex justify-end"><Button variant="primary" size="sm" disabled={!reply.trim()} loading={post.isPending} onClick={() => post.mutate()}>Send</Button></div>
                </div>
              )}
            </div>
          </Card>
        </div>
        <Card title="Details">
          <KeyValue
            items={[
              ['Status', t.statusName],
              ['Assigned to', t.assignee?.name ?? 'Being routed'],
              ['Team', t.team?.name ?? '—'],
              ['Priority', t.priority],
              ['Target resolution', formatDate(t.resolutionDueAt)],
              ['Resolved', formatDate(t.resolvedAt)],
            ]}
          />
        </Card>
      </div>

      {transition && (
        <Modal
          open
          onClose={() => setTransition(null)}
          title={transition.name}
          footer={<><Button onClick={() => setTransition(null)}>Cancel</Button><Button variant="primary" loading={move.isPending} onClick={() => move.mutate()}>{transition.name}</Button></>}
        >
          <Textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={transition.requireComment ? 'Please add a comment (required)' : 'Add a comment (optional)'} />
          <ErrorText error={move.error} />
        </Modal>
      )}
    </div>
  );
}
