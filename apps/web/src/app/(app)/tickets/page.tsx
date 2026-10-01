'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Columns3, List, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PriorityBadge, SlaIndicator, StatusBadge, TypeBadge } from '@/components/badges';
import { Button, Card, Empty, Input, PageHeader, Pagination, Select, Spinner, Table, Tabs, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanize, timeAgo } from '@/lib/format';
import { useTeams } from '@/lib/hooks';
import { Paged, PRIORITIES, StatusCategory, TICKET_TYPES, TicketListItem } from '@/lib/types';

type View = 'open' | 'mine' | 'unassigned' | 'breached' | 'done' | 'all';

export default function TicketsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user, can } = useAuth();
  const teams = useTeams();

  const view = (params.get('view') as View) ?? 'open';
  const layout = params.get('layout') ?? 'list';
  const page = Number(params.get('page') ?? 1);
  const filters = {
    type: params.get('type') ?? '',
    priority: params.get('priority') ?? '',
    teamId: params.get('teamId') ?? '',
    q: params.get('q') ?? '',
    sort: params.get('sort') ?? 'createdAt',
  };

  const set = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in patch)) next.delete('page');
    router.replace(`${pathname}?${next.toString()}`);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', view, layout, page, filters],
    queryFn: () =>
      api<Paged<TicketListItem>>('/tickets', {
        query: { view, ...filters, page, pageSize: layout === 'board' ? 200 : 25 },
      }),
    placeholderData: keepPreviousData,
  });

  const isRequester = user?.role === 'REQUESTER';
  const tabs: { key: View; label: string }[] = isRequester
    ? [
        { key: 'open', label: 'Open' },
        { key: 'done', label: 'Resolved' },
        { key: 'all', label: 'All' },
      ]
    : [
        { key: 'open', label: 'All open' },
        { key: 'mine', label: 'Assigned to me' },
        { key: 'unassigned', label: 'Unassigned' },
        { key: 'breached', label: 'SLA breached' },
        { key: 'done', label: 'Resolved' },
        { key: 'all', label: 'All' },
      ];

  return (
    <>
      <PageHeader
        title={isRequester ? 'My requests' : 'Tickets'}
        subtitle="Incidents, service requests, changes, problems and tasks"
        actions={
          <>
            <div className="flex rounded-md border border-slate-300 dark:border-slate-700">
              {[
                ['list', <List key="l" className="size-4" />],
                ['board', <Columns3 key="b" className="size-4" />],
              ].map(([k, icon]) => (
                <button
                  key={k as string}
                  onClick={() => set({ layout: k === 'list' ? undefined : (k as string) })}
                  className={clsx('px-2.5 py-1.5', layout === k ? 'bg-slate-100 dark:bg-slate-800' : 'text-slate-400')}
                  title={k === 'list' ? 'List view' : 'Board view'}
                >
                  {icon}
                </button>
              ))}
            </div>
            {can('tickets:create') && (
              <Button variant="primary" onClick={() => router.push('/tickets/new')}>
                <Plus className="size-4" /> New ticket
              </Button>
            )}
          </>
        }
      />

      <Tabs tabs={tabs} value={view} onChange={(v) => set({ view: v === 'open' ? undefined : v })} />

      <div className="my-3 flex flex-wrap gap-2">
        <Input placeholder="Search title, description or #number" defaultValue={filters.q} onKeyDown={(e) => e.key === 'Enter' && set({ q: (e.target as HTMLInputElement).value })} className="max-w-xs" />
        <Select value={filters.type} onChange={(e) => set({ type: e.target.value })} className="w-44">
          <option value="">All types</option>
          {TICKET_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
        </Select>
        <Select value={filters.priority} onChange={(e) => set({ priority: e.target.value })} className="w-36">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        {!isRequester && (
          <Select value={filters.teamId} onChange={(e) => set({ teamId: e.target.value })} className="w-44">
            <option value="">All teams</option>
            {teams.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        )}
        {layout === 'list' && (
          <Select value={filters.sort} onChange={(e) => set({ sort: e.target.value })} className="w-44">
            <option value="createdAt">Newest first</option>
            <option value="updatedAt">Recently updated</option>
            <option value="priority">Priority</option>
            <option value="resolutionDueAt">SLA due</option>
          </Select>
        )}
      </div>

      {isLoading || !data ? (
        <Spinner />
      ) : layout === 'board' ? (
        <Board items={data.items} />
      ) : (
        <Card bodyClassName="p-0">
          {!data.items.length ? (
            <Empty>No tickets match these filters.</Empty>
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>#</Th>
                    <Th>Title</Th>
                    <Th>Type</Th>
                    <Th>Priority</Th>
                    <Th>Status</Th>
                    {!isRequester && <Th>Assignee</Th>}
                    {!isRequester && <Th>Team</Th>}
                    <Th>SLA</Th>
                    <Th>Updated</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((t) => (
                    <tr key={t.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => router.push(`/tickets/${t.id}`)}>
                      <Td className="text-slate-400">{t.number}</Td>
                      <Td className="max-w-md">
                        <Link href={`/tickets/${t.id}`} className="font-medium hover:text-indigo-600" onClick={(e) => e.stopPropagation()}>
                          {t.title}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-slate-400">
                          {t.organization && <span>{t.organization.name} ·</span>}
                          {t.category && <span>{t.category}</span>}
                          {t.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded bg-slate-100 px-1 dark:bg-slate-800">{tag}</span>)}
                        </div>
                      </Td>
                      <Td><TypeBadge type={t.type} /></Td>
                      <Td><PriorityBadge priority={t.priority} short /></Td>
                      <Td><StatusBadge category={t.statusCategory} name={t.statusName} /></Td>
                      {!isRequester && <Td className="whitespace-nowrap">{t.assignee?.name ?? <span className="text-slate-400">Unassigned</span>}</Td>}
                      {!isRequester && <Td className="whitespace-nowrap text-slate-500">{t.team?.name ?? '—'}</Td>}
                      <Td><SlaIndicator ticket={t} /></Td>
                      <Td className="whitespace-nowrap text-xs text-slate-500">{timeAgo(t.updatedAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p })} />
            </>
          )}
        </Card>
      )}
    </>
  );
}

function Board({ items }: { items: TicketListItem[] }) {
  const columns: { key: StatusCategory; label: string }[] = [
    { key: 'TODO', label: 'To do' },
    { key: 'IN_PROGRESS', label: 'In progress' },
    { key: 'DONE', label: 'Done' },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {columns.map((col) => {
        const list = items.filter((t) => t.statusCategory === col.key);
        return (
          <div key={col.key} className="rounded-lg bg-slate-100 p-2 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase text-slate-500">
              {col.label}
              <span>{list.length}</span>
            </div>
            <div className="space-y-2">
              {list.map((t) => (
                <Link
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  className="block rounded-md border border-slate-200 bg-white p-3 shadow-sm hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-950"
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <PriorityBadge priority={t.priority} short />
                    <TypeBadge type={t.type} />
                    <span className="ml-auto text-xs text-slate-400">#{t.number}</span>
                  </div>
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <StatusBadge category={t.statusCategory} name={t.statusName} />
                    <span>{t.assignee?.name ?? 'Unassigned'}</span>
                  </div>
                  <div className="mt-1.5"><SlaIndicator ticket={t} /></div>
                </Link>
              ))}
              {!list.length && <div className="py-6 text-center text-xs text-slate-400">Empty</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
