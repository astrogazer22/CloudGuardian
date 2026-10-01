'use client';

import { useQuery } from '@tanstack/react-query';
import { MessageSquarePlus } from 'lucide-react';
import Link from 'next/link';
import { CatalogTile } from '@/components/portal';
import { PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

export default function PortalCatalog() {
  const { data, isLoading } = useQuery({ queryKey: ['catalog'], queryFn: () => api<any[]>('/catalog') });
  const groups = (data ?? []).reduce<Record<string, any[]>>((acc, i) => ((acc[i.category] ??= []).push(i), acc), {});
  return (
    <>
      <PageHeader title="Request something" subtitle="Pick a standard request — the right team gets it automatically." />
      {isLoading ? <Spinner /> : (
        <div className="space-y-6">
          {Object.entries(groups).map(([cat, items]) => (
            <section key={cat}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{cat}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((i) => <CatalogTile key={i.id} item={i} />)}</div>
            </section>
          ))}
          <Link href="/portal/requests/new" className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 p-4 text-sm hover:border-indigo-400 dark:border-slate-700">
            <MessageSquarePlus className="size-5 text-indigo-500" />
            <span><b>Something else?</b> Describe your problem and we&apos;ll route it.</span>
          </Link>
        </div>
      )}
    </>
  );
}
