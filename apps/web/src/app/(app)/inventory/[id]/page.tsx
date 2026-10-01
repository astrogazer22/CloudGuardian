'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronRight, Copy, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { AssetStateBadge, ASSET_TYPE_LABEL, PriorityBadge, StatusBadge } from '@/components/badges';
import { Badge, Button, Card, Empty, ErrorText, KeyValue, Spinner, Table, Tabs, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize, timeAgo } from '@/lib/format';

type Tab = 'overview' | 'relations' | 'tags' | 'tickets' | 'history';

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const { data: a, isLoading, error } = useQuery({ queryKey: ['asset', id], queryFn: () => api(`/assets/${id}`) });

  if (isLoading) return <Spinner />;
  if (error || !a) return <ErrorText error={error ?? 'Not found'} />;
  const at = a.attributes ?? {};
  const openTickets = a.tickets.filter((t: any) => t.ticket.statusCategory !== 'DONE').length;

  const skip = new Set(['listeners', 'targets', 'securityGroups', 'volumes', 'healthCheck', 'availabilityZones']);
  const simpleAttrs = Object.entries(at).filter(([k, v]) => !skip.has(k) && (typeof v !== 'object' || v === null));

  return (
    <>
      <div className="mb-1 flex items-center gap-1 text-sm text-slate-500">
        <Link href={`/inventory?type=${a.type}`} className="hover:text-indigo-600">{ASSET_TYPE_LABEL[a.type as keyof typeof ASSET_TYPE_LABEL]}s</Link>
        <ChevronRight className="size-3.5" />
        <span>{a.name}</span>
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge tone="indigo">{ASSET_TYPE_LABEL[a.type as keyof typeof ASSET_TYPE_LABEL]}</Badge>
            <AssetStateBadge state={a.state} />
            {a.environment && <Badge tone={a.environment === 'prod' ? 'purple' : 'slate'}>{a.environment}</Badge>}
            {a.deletedAt && <Badge tone="red">Removed from AWS {timeAgo(a.deletedAt)}</Badge>}
          </div>
          <h1 className="text-xl font-semibold">{a.name}</h1>
          <button
            onClick={() => navigator.clipboard.writeText(a.arn)}
            className="mt-0.5 flex items-center gap-1 font-mono text-xs text-slate-500 hover:text-indigo-600"
            title="Copy ARN"
          >
            {a.arn} <Copy className="size-3" />
          </button>
        </div>
        {can('tickets:create') && (
          <Button variant="primary" onClick={() => router.push(`/tickets/new?assetId=${a.id}`)}>
            <Plus className="size-4" /> Create ticket
          </Button>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Account', `${a.awsAccount.name} (${a.awsAccount.accountId})`],
          ['Region', a.region],
          ['Owner', a.owner ?? '—'],
          ['Open tickets', openTickets],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-slate-500">{k}</div>
            <div className="truncate text-sm font-medium">{v}</div>
          </div>
        ))}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'relations', label: 'Relationships', count: a.outgoing.length + a.incoming.length },
          { key: 'tags', label: 'Tags', count: Object.keys(a.tags ?? {}).length },
          { key: 'tickets', label: 'Tickets', count: a.tickets.length },
          { key: 'history', label: 'Change history', count: a.changes.length },
        ]}
      />

      <div className="mt-4 space-y-4">
        {tab === 'overview' && (
          <>
            <Card title="Attributes">
              <KeyValue
                items={[
                  ['Resource ID', <span className="font-mono text-xs">{a.resourceId}</span>],
                  ...simpleAttrs.map(([k, v]) => [humanize(k.replace(/([A-Z])/g, '_$1')), String(v ?? '—')] as [string, string]),
                  ['First discovered', formatDate(a.createdAt)],
                  ['Last seen', formatDate(a.lastSeenAt)],
                ]}
              />
            </Card>
            {at.securityGroups?.length > 0 && (
              <Card title="Security groups">
                <div className="flex flex-wrap gap-1.5">
                  {at.securityGroups.map((g: any) => <Badge key={g.id ?? g}>{g.name ?? g} {g.id && <span className="font-mono text-slate-400">{g.id}</span>}</Badge>)}
                </div>
              </Card>
            )}
            {at.listeners && (
              <Card title="Listeners" bodyClassName="p-0">
                <Table>
                  <thead><tr><Th>Port</Th><Th>Protocol</Th><Th>Default action</Th><Th>Certificates</Th></tr></thead>
                  <tbody>
                    {at.listeners.map((l: any, i: number) => (
                      <tr key={i}><Td>{l.port}</Td><Td>{l.protocol}</Td><Td>{l.defaultAction}</Td><Td className="text-xs">{l.certificates?.length ?? 0}</Td></tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            )}
            {at.targets && (
              <Card title={`Targets — ${at.healthyCount} healthy, ${at.unhealthyCount} unhealthy`} bodyClassName="p-0">
                <Table>
                  <thead><tr><Th>Target</Th><Th>Port</Th><Th>Health</Th><Th>Reason</Th></tr></thead>
                  <tbody>
                    {at.targets.map((t: any) => (
                      <tr key={t.id}><Td className="font-mono text-xs">{t.id}</Td><Td>{t.port}</Td><Td><AssetStateBadge state={t.state} /></Td><Td className="text-xs text-slate-500">{t.reason ?? '—'}</Td></tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            )}
            {at.healthCheck && (
              <Card title="Health check">
                <KeyValue items={Object.entries(at.healthCheck).map(([k, v]) => [humanize(k), String(v ?? '—')])} />
              </Card>
            )}
          </>
        )}

        {tab === 'relations' && (
          <Card>
            {!a.outgoing.length && !a.incoming.length ? (
              <Empty>No relationships discovered.</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {a.incoming.map((r: any) => (
                  <li key={`in-${r.from.id}-${r.type}`} className="flex items-center gap-2">
                    <Link href={`/inventory/${r.from.id}`} className="font-medium hover:text-indigo-600">{r.from.name}</Link>
                    <span className="flex items-center gap-1 text-xs text-slate-400">{humanize(r.type)} <ArrowRight className="size-3" /></span>
                    <span className="text-slate-500">this</span>
                    <AssetStateBadge state={r.from.state} />
                  </li>
                ))}
                {a.outgoing.map((r: any) => (
                  <li key={`out-${r.to.id}-${r.type}`} className="flex items-center gap-2">
                    <span className="text-slate-500">this</span>
                    <span className="flex items-center gap-1 text-xs text-slate-400">{humanize(r.type)} <ArrowRight className="size-3" /></span>
                    <Link href={`/inventory/${r.to.id}`} className="font-medium hover:text-indigo-600">{r.to.name}</Link>
                    <span className="text-xs text-slate-400">{ASSET_TYPE_LABEL[r.to.type as keyof typeof ASSET_TYPE_LABEL]}</span>
                    <AssetStateBadge state={r.to.state} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === 'tags' && (
          <Card>
            {!Object.keys(a.tags ?? {}).length ? <Empty>No tags</Empty> : <KeyValue items={Object.entries(a.tags).map(([k, v]) => [k, String(v)])} />}
          </Card>
        )}

        {tab === 'tickets' && (
          <Card bodyClassName="p-0">
            {!a.tickets.length ? (
              <Empty>No tickets reference this resource.</Empty>
            ) : (
              <ul>
                {a.tickets.map(({ ticket: t }: any) => (
                  <li key={t.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <Link href={`/tickets/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <PriorityBadge priority={t.priority} short />
                      <span className="text-xs text-slate-400">#{t.number}</span>
                      <span className="flex-1 truncate text-sm">{t.title}</span>
                      <StatusBadge category={t.statusCategory} name={humanize(t.status)} />
                      <span className="text-xs text-slate-400">{timeAgo(t.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === 'history' && (
          <Card>
            {!a.changes.length ? (
              <Empty>No changes recorded.</Empty>
            ) : (
              <ol className="space-y-4">
                {a.changes.map((c: any) => (
                  <li key={c.id} className="text-sm">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge tone={c.kind === 'discovered' ? 'green' : c.kind === 'removed' ? 'red' : 'amber'}>{humanize(c.kind)}</Badge>
                      <span className="text-xs text-slate-400">{formatDate(c.createdAt)}</span>
                    </div>
                    {Array.isArray(c.changes) && c.changes.length > 0 && (
                      <ul className="ml-2 space-y-0.5 border-l border-slate-200 pl-3 font-mono text-xs dark:border-slate-700">
                        {c.changes.map((d: any, i: number) => (
                          <li key={i} className="break-all">
                            <span className="text-slate-500">{d.field}:</span>{' '}
                            <span className="text-red-600 line-through">{short(d.from)}</span> → <span className="text-emerald-600">{short(d.to)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

function short(v: unknown) {
  if (v === null || v === undefined) return 'null';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 120 ? s.slice(0, 117) + '…' : s;
}
