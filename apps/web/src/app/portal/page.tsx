'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, MessageSquarePlus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CatalogTile, friendlyStatus } from '@/components/portal';
import { Badge, Card, Empty } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';

export default function PortalHome() {
  const { user } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState('');
  const popular = useQuery({ queryKey: ['kb-articles', 'popular'], queryFn: () => api<any[]>('/kb/articles', { query: { sort: 'popular', take: 6, status: 'PUBLISHED' } }) });
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => api<any[]>('/catalog') });
  const mine = useQuery({ queryKey: ['tickets', 'portal-mine'], queryFn: () => api('/tickets', { query: { requesterId: 'me', view: 'open', pageSize: 5 } }) });

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 px-6 py-10 text-center text-white shadow-lg">
        <h1 className="text-2xl font-semibold sm:text-3xl">Hi {user?.name.split(' ')[0]}, how can we help?</h1>
        <p className="mt-1 text-indigo-100">Search the knowledge base, request something, or report a problem.</p>
        <form
          className="mx-auto mt-6 flex max-w-xl items-center gap-2 rounded-xl bg-white p-1.5 shadow"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/portal/kb?q=${encodeURIComponent(q)}`);
          }}
        >
          <Search className="ml-2 size-5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. VPN keeps disconnecting" className="h-10 flex-1 bg-transparent text-slate-900 outline-none" />
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium">Search</button>
        </form>
        <div className="mt-4 flex justify-center gap-3 text-sm">
          <Link href="/portal/requests/new" className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 hover:bg-white/25"><MessageSquarePlus className="size-4" /> Report a problem</Link>
          <Link href="/portal/catalog" className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 hover:bg-white/25">Browse the catalog <ArrowRight className="size-4" /></Link>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Popular requests</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {catalog.data?.slice(0, 6).map((i) => <CatalogTile key={i.id} item={i} />)}
          </div>
        </section>
        <section>
          <h2 className="mb-3 font-semibold">My open requests</h2>
          <Card bodyClassName="p-0">
            {!mine.data?.items.length ? <Empty>No open requests.</Empty> : (
              <ul>
                {mine.data.items.map((t: any) => {
                  const s = friendlyStatus(t.statusCategory, t.statusName);
                  return (
                    <li key={t.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <Link href={`/portal/requests/${t.id}`} className="block px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <div className="truncate text-sm font-medium">{t.title}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500"><Badge tone={s.tone}>{s.label}</Badge> #{t.number} · {timeAgo(t.updatedAt)}</div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>
      </div>

      <section>
        <h2 className="mb-3 font-semibold">Popular articles</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {popular.data?.map((a) => (
            <Link key={a.id} href={`/portal/kb/${a.slug}`} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900">
              <BookOpen className="mt-0.5 size-4 shrink-0 text-indigo-500" />
              <span>
                <span className="block text-sm font-medium">{a.title}</span>
                <span className="line-clamp-2 text-xs text-slate-500">{a.excerpt}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
