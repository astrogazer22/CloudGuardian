'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AssetStateBadge } from '@/components/badges';
import { Badge, Card, Empty, Input, PageHeader, Pagination, Select, Spinner, Table, Tabs, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useAwsAccounts } from '@/lib/hooks';
import type { AssetType, Paged } from '@/lib/types';

export default function InventoryPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const accounts = useAwsAccounts();

  const type = (params.get('type') as AssetType) ?? 'EC2_INSTANCE';
  const page = Number(params.get('page') ?? 1);
  const filters = {
    awsAccountId: params.get('awsAccountId') ?? '',
    region: params.get('region') ?? '',
    environment: params.get('environment') ?? '',
    state: params.get('state') ?? '',
    q: params.get('q') ?? '',
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

  const facets = useQuery({ queryKey: ['asset-facets', type], queryFn: () => api('/assets/facets', { query: { type } }) });
  const { data, isLoading } = useQuery({
    queryKey: ['assets', type, page, filters],
    queryFn: () => api<Paged<any>>('/assets', { query: { type, page, pageSize: 50, ...filters } }),
    placeholderData: keepPreviousData,
  });

  const title = { EC2_INSTANCE: 'Servers', LOAD_BALANCER: 'Load balancers', TARGET_GROUP: 'Target groups', IAM_USER: 'IAM users' }[type];

  return (
    <>
      <PageHeader title={title} subtitle="Read live from AWS after you connect an account. Nothing here is generated." />
      <Tabs
        value={type}
        onChange={(v) => router.replace(`${pathname}?type=${v}`)}
        tabs={[
          { key: 'EC2_INSTANCE', label: 'EC2 instances' },
          { key: 'LOAD_BALANCER', label: 'Load balancers' },
          { key: 'TARGET_GROUP', label: 'Target groups' },
          { key: 'IAM_USER', label: 'IAM users' },
        ]}
      />
      <div className="my-3 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search name, ID, ARN, owner" defaultValue={filters.q} onKeyDown={(e) => e.key === 'Enter' && set({ q: (e.target as HTMLInputElement).value })} />
        <Select className="w-48" value={filters.awsAccountId} onChange={(e) => set({ awsAccountId: e.target.value })}>
          <option value="">All accounts</option>
          {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select className="w-40" value={filters.region} onChange={(e) => set({ region: e.target.value })}>
          <option value="">All regions</option>
          {facets.data?.regions.map((r: any) => <option key={r.value} value={r.value}>{r.value} ({r.count})</option>)}
        </Select>
        <Select className="w-40" value={filters.environment} onChange={(e) => set({ environment: e.target.value })}>
          <option value="">All environments</option>
          {facets.data?.environments.map((r: any) => <option key={r.value} value={r.value}>{r.value} ({r.count})</option>)}
        </Select>
        <Select className="w-36" value={filters.state} onChange={(e) => set({ state: e.target.value })}>
          <option value="">All states</option>
          {facets.data?.states.map((r: any) => <option key={r.value} value={r.value}>{r.value} ({r.count})</option>)}
        </Select>
      </div>

      <Card bodyClassName="p-0">
        {isLoading || !data ? (
          <Spinner />
        ) : !data.items.length ? (
          <Empty>
            No live AWS resources yet.{' '}
            <Link href="/inventory/accounts" className="font-medium text-indigo-600 hover:underline">
              Connect an AWS account
            </Link>{' '}
            and run a sync to pull EC2, load balancers and IAM users from AWS.
          </Empty>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  {type === 'EC2_INSTANCE' && (<><Th>Instance ID</Th><Th>Type</Th><Th>Private IP</Th><Th>AZ</Th></>)}
                  {type === 'LOAD_BALANCER' && (<><Th>Type</Th><Th>Scheme</Th><Th>DNS name</Th></>)}
                  {type === 'TARGET_GROUP' && (<><Th>Protocol : port</Th><Th>Target health</Th></>)}
                  {type === 'IAM_USER' && (<><Th>User ID</Th><Th>Console</Th><Th>MFA</Th><Th>Access keys</Th><Th>Groups</Th></>)}
                  <Th>State</Th>
                  <Th>Env</Th>
                  <Th>Owner</Th>
                  <Th>Account / region</Th>
                  <Th>Open tickets</Th>
                  <Th>Last seen</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => {
                  const at = a.attributes ?? {};
                  return (
                    <tr key={a.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => router.push(`/inventory/${a.id}`)}>
                      <Td className="font-medium">
                        <Link href={`/inventory/${a.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-indigo-600">{a.name}</Link>
                      </Td>
                      {type === 'EC2_INSTANCE' && (
                        <>
                          <Td className="font-mono text-xs">{a.resourceId}</Td>
                          <Td>{at.instanceType}</Td>
                          <Td className="font-mono text-xs">{at.privateIp ?? '—'}</Td>
                          <Td className="text-xs">{at.availabilityZone}</Td>
                        </>
                      )}
                      {type === 'LOAD_BALANCER' && (
                        <>
                          <Td>{at.lbType}</Td>
                          <Td>{at.scheme}</Td>
                          <Td className="max-w-xs truncate font-mono text-xs">{at.dnsName}</Td>
                        </>
                      )}
                      {type === 'TARGET_GROUP' && (
                        <>
                          <Td>{at.protocol}:{at.port}</Td>
                          <Td>
                            <span className="text-emerald-600">{at.healthyCount ?? 0} healthy</span>
                            {!!at.unhealthyCount && <span className="ml-2 text-red-600">{at.unhealthyCount} unhealthy</span>}
                          </Td>
                        </>
                      )}
                      {type === 'IAM_USER' && (
                        <>
                          <Td className="font-mono text-xs">{at.userId ?? a.resourceId}</Td>
                          <Td>{at.consoleAccess ? <Badge tone="blue">Console</Badge> : <span className="text-slate-400">API only</span>}</Td>
                          <Td>{at.mfaEnabled ? <Badge tone="green">MFA</Badge> : <Badge tone="amber">No MFA</Badge>}</Td>
                          <Td className="tabular-nums">{Array.isArray(at.accessKeys) ? at.accessKeys.length : 0}</Td>
                          <Td className="max-w-xs truncate text-xs">{Array.isArray(at.groups) ? at.groups.join(', ') || '—' : '—'}</Td>
                        </>
                      )}
                      <Td><AssetStateBadge state={a.state} /></Td>
                      <Td>{a.environment ? <Badge tone={a.environment === 'prod' ? 'purple' : 'slate'}>{a.environment}</Badge> : '—'}</Td>
                      <Td className="text-xs text-slate-500">{a.owner ?? '—'}</Td>
                      <Td className="whitespace-nowrap text-xs text-slate-500">{a.awsAccount.name} · {a.region}</Td>
                      <Td>{a._count.tickets ? <Badge tone="amber">{a._count.tickets}</Badge> : <span className="text-slate-400">0</span>}</Td>
                      <Td className="whitespace-nowrap text-xs text-slate-500">{timeAgo(a.lastSeenAt)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p })} />
          </>
        )}
      </Card>
    </>
  );
}
