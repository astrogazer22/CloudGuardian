'use client';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, CheckSquare, Clock, Cloud, Gauge, Inbox, Network, Server, Target, UserCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { ReactNode } from 'react';
import { PriorityBadge, SlaIndicator, StatusBadge } from '@/components/badges';
import { Card, Empty, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanize, timeAgo } from '@/lib/format';
import type { Paged, Priority, TicketListItem } from '@/lib/types';

function Kpi({ label, value, icon, href, tone = 'slate' }: { label: string; value: ReactNode; icon: ReactNode; href?: string; tone?: 'slate' | 'red' | 'amber' | 'green' | 'indigo' }) {
  const body = (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow dark:border-slate-800 dark:bg-slate-900">
      <span
        className={clsx('flex size-10 items-center justify-center rounded-lg', {
          slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
          red: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300',
          amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300',
          green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300',
          indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300',
        }[tone])}
      >
        {icon}
      </span>
      <div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Bars({ rows, max }: { rows: { label: ReactNode; value: number; color?: string }[]; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0 truncate text-slate-600 dark:text-slate-400">{r.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <span className={clsx('block h-full rounded-full', r.color ?? 'bg-indigo-500')} style={{ width: `${(r.value / m) * 100}%` }} />
          </span>
          <span className="w-8 text-right tabular-nums">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api('/dashboard'), refetchInterval: 60_000 });
  const mine = useQuery({
    queryKey: ['tickets', 'dashboard-mine'],
    queryFn: () =>
      api<Paged<TicketListItem>>('/tickets', {
        query: user?.role === 'REQUESTER' ? { view: 'open', pageSize: 8 } : { view: 'mine', pageSize: 8, sort: 'priority' },
      }),
  });

  if (isLoading || !data) return <Spinner />;
  const t = data.tickets;
  const maxTrend = Math.max(1, ...t.trend.map((d: any) => Math.max(d.created, d.resolved)));
  const priorityColors: Record<Priority, string> = { P1: 'bg-red-500', P2: 'bg-orange-500', P3: 'bg-sky-500', P4: 'bg-slate-400' };

  return (
    <>
      <PageHeader title={`Welcome back, ${user?.name.split(' ')[0]}`} subtitle="Here's what's happening across your services today." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Open tickets" value={t.open} icon={<Inbox className="size-5" />} href="/tickets?view=open" tone="indigo" />
        {user?.role !== 'REQUESTER' && <Kpi label="Assigned to me" value={t.mine} icon={<UserCheck className="size-5" />} href="/tickets?view=mine" />}
        {user?.role !== 'REQUESTER' && <Kpi label="Unassigned" value={t.unassigned} icon={<Inbox className="size-5" />} href="/tickets?view=unassigned" tone="amber" />}
        <Kpi label="SLA breached (open)" value={t.breached} icon={<AlertTriangle className="size-5" />} href="/tickets?view=breached" tone="red" />
        <Kpi label="SLA compliance (30d)" value={t.slaCompliance === null ? '—' : `${t.slaCompliance}%`} icon={<Gauge className="size-5" />} tone="green" />
        <Kpi label="Mean time to resolve (30d)" value={t.mttrHours === null ? '—' : `${t.mttrHours}h`} icon={<Clock className="size-5" />} />
        {can('approvals:decide') && <Kpi label="Pending approvals" value={data.approvals.pending} icon={<CheckSquare className="size-5" />} href="/approvals" tone="amber" />}
        {can('inventory:read') && (
          <Kpi label="Degraded target groups" value={data.inventory.degradedTargetGroups} icon={<Target className="size-5" />} href="/inventory?type=TARGET_GROUP&state=degraded" tone={data.inventory.degradedTargetGroups ? 'red' : 'green'} />
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Ticket volume — last 14 days" className="lg:col-span-2">
          <div className="flex h-44 items-end gap-1.5">
            {t.trend.map((d: any) => (
              <div key={d.date} className="group flex flex-1 flex-col items-center gap-1">
                <div className="flex h-36 w-full items-end justify-center gap-0.5">
                  <div className="w-1/2 rounded-t bg-indigo-500" style={{ height: `${(d.created / maxTrend) * 100}%` }} title={`${d.created} created`} />
                  <div className="w-1/2 rounded-t bg-emerald-400" style={{ height: `${(d.resolved / maxTrend) * 100}%` }} title={`${d.resolved} resolved`} />
                </div>
                <span className="text-[10px] text-slate-400">{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-indigo-500" /> Created</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-emerald-400" /> Resolved</span>
          </div>
        </Card>

        <Card title="Open by priority">
          <Bars rows={(['P1', 'P2', 'P3', 'P4'] as Priority[]).map((p) => ({ label: <PriorityBadge priority={p} />, value: t.byPriority[p] ?? 0, color: priorityColors[p] }))} />
          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <h4 className="mb-3 text-xs font-medium uppercase text-slate-500">By type</h4>
            <Bars rows={Object.entries(t.byType).map(([k, v]) => ({ label: humanize(k), value: v as number, color: 'bg-purple-500' }))} />
          </div>
        </Card>

        <Card title={user?.role === 'REQUESTER' ? 'My open requests' : 'My queue'} className="lg:col-span-2" bodyClassName="p-0">
          {!mine.data?.items.length ? (
            <Empty>Nothing here — nice work.</Empty>
          ) : (
            <ul>
              {mine.data.items.map((tk) => (
                <li key={tk.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <Link href={`/tickets/${tk.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <PriorityBadge priority={tk.priority} short />
                    <span className="w-14 text-xs text-slate-400">#{tk.number}</span>
                    <span className="flex-1 truncate text-sm">{tk.title}</span>
                    <StatusBadge category={tk.statusCategory} name={tk.statusName} />
                    <SlaIndicator ticket={tk} />
                    <span className="hidden w-20 text-right text-xs text-slate-400 sm:block">{timeAgo(tk.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          {user?.role !== 'REQUESTER' && (
            <Card title="Open by team">
              <Bars rows={t.byTeam.map((r: any) => ({ label: r.team, value: r.count, color: 'bg-sky-500' }))} />
            </Card>
          )}
          {can('inventory:read') && (
            <Card title="AWS inventory">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Link href="/inventory/accounts" className="flex items-center gap-2"><Cloud className="size-4 text-slate-400" />{data.inventory.accounts} accounts</Link>
                <Link href="/inventory?type=EC2_INSTANCE" className="flex items-center gap-2"><Server className="size-4 text-slate-400" />{data.inventory.byType.EC2_INSTANCE ?? 0} servers</Link>
                <Link href="/inventory?type=LOAD_BALANCER" className="flex items-center gap-2"><Network className="size-4 text-slate-400" />{data.inventory.byType.LOAD_BALANCER ?? 0} load balancers</Link>
                <Link href="/inventory?type=TARGET_GROUP" className="flex items-center gap-2"><Target className="size-4 text-slate-400" />{data.inventory.byType.TARGET_GROUP ?? 0} target groups</Link>
                <Link href="/inventory?type=IAM_USER" className="flex items-center gap-2"><Users className="size-4 text-slate-400" />{data.inventory.byType.IAM_USER ?? 0} IAM users</Link>
              </div>
              {can('reports:read') && (
                <Link href="/reports" className="mt-3 block text-xs font-medium text-indigo-600 hover:underline">
                  Open live CloudWatch, Backup and Inspector reports →
                </Link>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
