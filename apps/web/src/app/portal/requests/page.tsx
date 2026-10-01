'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { friendlyStatus } from '@/components/portal';
import { Badge, Button, Card, Empty, PageHeader, Spinner, Tabs } from '@/components/ui';
import { api } from '@/lib/api';
import { humanize, timeAgo } from '@/lib/format';

export default function MyRequests() {
  const [view, setView] = useState<'open' | 'done'>('open');
  const { data, isLoading } = useQuery({
    queryKey: ['tickets', 'portal-requests', view],
    queryFn: () => api('/tickets', { query: { requesterId: 'me', view, pageSize: 100, sort: 'updatedAt' } }),
  });
  return (
    <>
      <PageHeader title="My requests" actions={<Link href="/portal/requests/new"><Button variant="primary"><Plus className="size-4" /> New request</Button></Link>} />
      <Tabs value={view} onChange={setView} tabs={[{ key: 'open', label: 'Open' }, { key: 'done', label: 'Resolved & closed' }]} />
      <Card className="mt-3" bodyClassName="p-0">
        {isLoading ? <Spinner /> : !data?.items.length ? <Empty>Nothing here.</Empty> : (
          <ul>
            {data.items.map((t: any) => {
              const s = friendlyStatus(t.statusCategory, t.statusName);
              return (
                <li key={t.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <Link href={`/portal/requests/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <span className="w-14 text-xs text-slate-400">#{t.number}</span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{t.title}</span>
                      <span className="text-xs text-slate-500">{humanize(t.type)} · opened {timeAgo(t.createdAt)}</span>
                    </span>
                    <Badge tone={s.tone}>{s.label}</Badge>
                    <span className="hidden w-24 text-right text-xs text-slate-400 sm:block">{timeAgo(t.updatedAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
