'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRight, ThumbsDown, ThumbsUp } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Markdown } from '@/components/kb';
import { Button, Card, ErrorText, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';

export default function PortalArticle() {
  const { slug } = useParams<{ slug: string }>();
  const [voted, setVoted] = useState<boolean | null>(null);
  const { data: a, isLoading, error } = useQuery({ queryKey: ['kb-article', slug], queryFn: () => api(`/kb/articles/${slug}`, { query: { view: 1 } }) });
  const feedback = useMutation({ mutationFn: (helpful: boolean) => api(`/kb/articles/${a.id}/feedback`, { body: { helpful } }), onSuccess: (_d, helpful) => setVoted(helpful) });

  if (isLoading) return <Spinner />;
  if (error || !a) return <ErrorText error={error ?? 'Article not found'} />;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-2 flex items-center gap-1 text-sm text-slate-500">
        <Link href="/portal/kb" className="hover:text-indigo-600">Knowledge base</Link>
        <ChevronRight className="size-3.5" />
        <span>{a.category?.name ?? 'General'}</span>
      </div>
      <Card>
        <h1 className="text-2xl font-semibold tracking-tight">{a.title}</h1>
        <p className="mb-6 mt-1 text-xs text-slate-400">Updated {timeAgo(a.updatedAt)}</p>
        <Markdown>{a.body}</Markdown>
        <div className="mt-8 border-t border-slate-100 pt-4 dark:border-slate-800">
          {voted === null ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-500">Did this solve your problem?</span>
              <Button size="sm" onClick={() => feedback.mutate(true)}><ThumbsUp className="size-3.5" /> Yes</Button>
              <Button size="sm" onClick={() => feedback.mutate(false)}><ThumbsDown className="size-3.5" /> No</Button>
            </div>
          ) : voted ? (
            <p className="text-sm text-emerald-600">Great — glad it helped!</p>
          ) : (
            <p className="text-sm">
              Sorry about that. <Link href={`/portal/requests/new?title=${encodeURIComponent(a.title)}`} className="font-medium text-indigo-600 hover:underline">Raise a request</Link> and the team will help.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
