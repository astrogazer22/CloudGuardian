'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { PriorityBadge, TypeBadge } from '@/components/badges';
import { Button, Card, Empty, ErrorText, Input, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { humanize, timeAgo } from '@/lib/format';

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['approvals'], queryFn: () => api<any[]>('/approvals') });
  const [comments, setComments] = useState<Record<string, string>>({});
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api(`/approvals/${id}/decision`, { body: { approve, comment: comments[id] || undefined } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <>
      <PageHeader title="Approvals" subtitle="Workflow transitions waiting for your decision" />
      <ErrorText error={decide.error} />
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <Card><Empty>No approvals waiting on you.</Empty></Card>
      ) : (
        <div className="space-y-3">
          {data.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <TypeBadge type={a.ticket.type} />
                    <PriorityBadge priority={a.ticket.priority} short />
                    <span className="text-xs text-slate-400">#{a.ticket.number}</span>
                  </div>
                  <Link href={`/tickets/${a.ticket.id}`} className="font-medium hover:text-indigo-600">
                    {a.ticket.title}
                  </Link>
                  <p className="mt-1 text-sm text-slate-500">
                    {a.requestedBy.name} requested <b>{humanize(a.transitionKey)}</b> · {timeAgo(a.createdAt)} · approver role: {humanize(a.approverRole)}
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-80">
                  <Input
                    placeholder="Comment (optional)"
                    value={comments[a.id] ?? ''}
                    onChange={(e) => setComments((c) => ({ ...c, [a.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button variant="primary" className="flex-1" loading={decide.isPending && decide.variables?.id === a.id && decide.variables.approve} onClick={() => decide.mutate({ id: a.id, approve: true })}>
                      Approve
                    </Button>
                    <Button variant="danger" className="flex-1" loading={decide.isPending && decide.variables?.id === a.id && !decide.variables.approve} onClick={() => decide.mutate({ id: a.id, approve: false })}>
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
