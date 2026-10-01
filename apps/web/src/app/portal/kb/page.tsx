'use client';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Card, Empty, Input, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

export default function PortalKb() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [categoryId, setCategoryId] = useState('');
  const cats = useQuery({ queryKey: ['kb-categories'], queryFn: () => api<any[]>('/kb/categories') });
  const { data, isLoading } = useQuery({
    queryKey: ['kb-articles', 'portal', q, categoryId],
    queryFn: () => api<any[]>('/kb/articles', { query: { q, categoryId, status: 'PUBLISHED' } }),
  });
  return (
    <>
      <PageHeader title="Knowledge base" subtitle="Answers to common questions and how-to guides" />
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <aside className="space-y-1">
          <button onClick={() => setCategoryId('')} className={clsx('block w-full rounded-md px-3 py-1.5 text-left text-sm', !categoryId ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}>All articles</button>
          {cats.data?.filter((c) => c.articleCount > 0).map((c) => (
            <button key={c.id} onClick={() => setCategoryId(c.id)} className={clsx('flex w-full justify-between rounded-md px-3 py-1.5 text-left text-sm', categoryId === c.id ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}>
              {c.name} <span className="text-slate-400">{c.articleCount}</span>
            </button>
          ))}
        </aside>
        <div>
          <Input className="mb-4" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {isLoading ? <Spinner /> : !data?.length ? (
            <Card><Empty>No articles match. <Link href="/portal/requests/new" className="text-indigo-600 hover:underline">Raise a request</Link> and we&apos;ll help.</Empty></Card>
          ) : (
            <ul className="space-y-2">
              {data.map((a) => (
                <li key={a.id}>
                  <Link href={`/portal/kb/${a.slug}`} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900">
                    <BookOpen className="mt-0.5 size-4 shrink-0 text-indigo-500" />
                    <span>
                      <span className="block font-medium">{a.title}</span>
                      <span className="text-sm text-slate-500">{a.excerpt}</span>
                      {a.category && <span className="mt-1 block text-xs text-slate-400">{a.category.name}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
