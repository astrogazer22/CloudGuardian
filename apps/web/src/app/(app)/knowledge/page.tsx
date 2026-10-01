'use client';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Eye, Lock, Plus, ThumbsUp } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, Empty, Input, PageHeader, Spinner, Tabs } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanize, timeAgo } from '@/lib/format';

type StatusTab = '' | 'PUBLISHED' | 'IN_REVIEW' | 'DRAFT' | 'ARCHIVED';
const kbStatusTone = (s: string) => (s === 'PUBLISHED' ? 'green' : s === 'IN_REVIEW' ? 'amber' : s === 'ARCHIVED' ? 'slate' : 'blue') as any;

export default function KnowledgePage() {
  const { can } = useAuth();
  const router = useRouter();
  const author = can('kb:write') || can('kb:publish');
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<StatusTab>(author ? '' : 'PUBLISHED');
  const cats = useQuery({ queryKey: ['kb-categories'], queryFn: () => api<any[]>('/kb/categories') });
  const { data, isLoading } = useQuery({
    queryKey: ['kb-articles', q, categoryId, status],
    queryFn: () => api<any[]>('/kb/articles', { query: { q, categoryId, status } }),
  });

  return (
    <>
      <PageHeader
        title="Knowledge base"
        subtitle="How-to guides for requesters and internal runbooks for agents"
        actions={can('kb:write') && <Button variant="primary" onClick={() => router.push('/knowledge/new')}><Plus className="size-4" /> New article</Button>}
      />
      {author && (
        <Tabs
          value={status}
          onChange={setStatus}
          tabs={[
            { key: '', label: 'All' },
            { key: 'PUBLISHED', label: 'Published' },
            { key: 'IN_REVIEW', label: 'In review' },
            { key: 'DRAFT', label: 'Drafts' },
            { key: 'ARCHIVED', label: 'Archived' },
          ]}
        />
      )}
      <div className="my-3 flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Search articles…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={() => setCategoryId('')} className={clsx('rounded-full px-3 py-1 text-xs', !categoryId ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>All categories</button>
        {cats.data?.map((c) => (
          <button key={c.id} onClick={() => setCategoryId(c.id)} className={clsx('rounded-full px-3 py-1 text-xs', categoryId === c.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
            {c.name} <span className="opacity-60">{c.articleCount}</span>
          </button>
        ))}
      </div>
      {isLoading ? <Spinner /> : !data?.length ? <Card><Empty>No articles found.</Empty></Card> : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((a) => (
            <Link key={a.id} href={`/knowledge/${a.id}`} className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                {author && <Badge tone={kbStatusTone(a.status)}>{humanize(a.status)}</Badge>}
                {a.visibility === 'INTERNAL' && <Badge tone="purple"><Lock className="size-3" /> Internal</Badge>}
                {a.category && <span className="text-xs text-slate-500">{a.category.name}</span>}
              </div>
              <div className="font-medium">{a.title}</div>
              {a.excerpt && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{a.excerpt}</p>}
              <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1"><Eye className="size-3" /> {a.views}</span>
                <span className="flex items-center gap-1"><ThumbsUp className="size-3" /> {a.helpfulYes}</span>
                <span>v{a.version} · {a.author.name} · updated {timeAgo(a.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
