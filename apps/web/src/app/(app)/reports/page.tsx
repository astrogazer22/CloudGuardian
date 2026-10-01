'use client';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PieChart } from '@/components/charts';
import { Badge, Button, Card, Empty, PageHeader, Select, Spinner, Table, Tabs, Td, Th, type Tone } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize, timeAgo } from '@/lib/format';
import type { ReportsPayload } from '@/lib/types';

type Tab = 'cloudwatch' | 'backup' | 'trendmicro' | 'inspector';

const ALARM_COLOR = { OK: '#10b981', ALARM: '#ef4444', INSUFFICIENT_DATA: '#f59e0b' };
const SEV_COLOR = { CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#d97706', LOW: '#0ea5e9', INFORMATIONAL: '#64748b' };
const AGENT_COLOR = { online: '#10b981', offline: '#94a3b8', error: '#ef4444' };

function sourceTone(s: string): Tone {
  return s === 'live' ? 'green' : 'amber';
}

function alarmTone(s: string): Tone {
  return s === 'ALARM' ? 'red' : s === 'INSUFFICIENT_DATA' ? 'amber' : 'green';
}

function jobTone(s: string): Tone {
  if (['COMPLETED', 'COMPLETED_WITH_ISSUES'].includes(s)) return 'green';
  if (['FAILED', 'ABORTED', 'EXPIRED'].includes(s)) return 'red';
  if (['RUNNING', 'CREATED', 'PENDING'].includes(s)) return 'amber';
  return 'slate';
}

function sevTone(s: string): Tone {
  const u = s.toUpperCase();
  if (u === 'CRITICAL') return 'red';
  if (u === 'HIGH') return 'orange';
  if (u === 'MEDIUM') return 'amber';
  if (u === 'LOW') return 'blue';
  return 'slate';
}

function bytes(n?: number | null) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: Tone }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className={clsx('text-2xl font-semibold tabular-nums', tone === 'red' && 'text-red-600', tone === 'green' && 'text-emerald-600', tone === 'amber' && 'text-amber-600')}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}

export default function ReportsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('cloudwatch');
  const [accountId, setAccountId] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['reports', accountId],
    queryFn: () => api<ReportsPayload>('/reports', { query: { accountId: accountId || undefined } }),
    enabled: can('reports:read'),
  });

  if (!can('reports:read')) {
    return <Empty>You do not have permission to view reports.</Empty>;
  }
  if (isLoading || !data) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Live CloudWatch, Backup and Inspector data from connected AWS accounts. Trend Micro uses its own API when configured."
        actions={
          <div className="flex items-center gap-2">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-56">
              <option value="">All accounts</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.accountId})
                </option>
              ))}
            </Select>
            <Button
              loading={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  await api('/reports', { query: { accountId: accountId || undefined, refresh: 'true' } });
                  await refetch();
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              <RefreshCw className="size-3.5" /> Refresh
            </Button>
          </div>
        }
      />

      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Badge tone={sourceTone(data.source)}>{data.source === 'live' ? 'Live AWS data' : 'Not connected'}</Badge>
          <span>Generated {timeAgo(data.generatedAt)}</span>
        </div>
        {data.source === 'disconnected' && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Connect a live AWS account under{' '}
            <Link href="/inventory/accounts" className="font-medium underline">
              AWS Accounts
            </Link>{' '}
            to pull CloudWatch, Backup and Inspector from AWS. Nothing on this page is generated.
          </p>
        )}
        {!!data.errors.length && (
          <ul className="space-y-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {data.errors.map((e, i) => (
              <li key={i}>
                <span className="font-medium">{e.service}</span>
                {e.accountName !== '—' ? ` · ${e.accountName}` : ''}: {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Tabs
        tabs={[
          { key: 'cloudwatch', label: 'CloudWatch alarms', count: data.cloudwatch.totals.ALARM },
          { key: 'backup', label: 'AWS Backup', count: data.backup.summary.failed },
          { key: 'trendmicro', label: 'Trend Micro', count: data.trendmicro.summary.openThreats },
          { key: 'inspector', label: 'Inspector', count: data.inspector.summary.critical + data.inspector.summary.high },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="mt-4">
        {tab === 'cloudwatch' && <CloudWatchReport data={data.cloudwatch} />}
        {tab === 'backup' && <BackupReport data={data.backup} />}
        {tab === 'trendmicro' && <TrendReport data={data.trendmicro} />}
        {tab === 'inspector' && <InspectorReport data={data.inspector} />}
      </div>
    </>
  );
}

function CloudWatchReport({ data }: { data: ReportsPayload['cloudwatch'] }) {
  const [state, setState] = useState<string | null>(null);
  const slices = [
    { key: 'ALARM', label: 'In alarm', value: data.totals.ALARM, color: ALARM_COLOR.ALARM },
    { key: 'OK', label: 'OK', value: data.totals.OK, color: ALARM_COLOR.OK },
    { key: 'INSUFFICIENT_DATA', label: 'Insufficient data', value: data.totals.INSUFFICIENT_DATA, color: ALARM_COLOR.INSUFFICIENT_DATA },
  ];
  const rows = data.alarms.filter((a) => !state || a.state === state);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Alarm state" className="lg:col-span-2">
          <PieChart slices={slices} activeKey={state} onSelect={setState} centerLabel="Alarms" centerValue={data.totals.total} />
        </Card>
        <Card title="By namespace">
          <ul className="space-y-2 text-sm">
            {data.byNamespace.map((n) => (
              <li key={n.key} className="flex items-center justify-between gap-3">
                <span className="truncate font-mono text-xs text-slate-600 dark:text-slate-300">{n.label}</span>
                <span className="tabular-nums">{n.count}</span>
              </li>
            ))}
            {!data.byNamespace.length && <Empty>No alarms</Empty>}
          </ul>
        </Card>
      </div>
      <Card title={state === 'ALARM' ? 'In alarm' : state === 'INSUFFICIENT_DATA' ? 'Insufficient data' : state === 'OK' ? 'OK alarms' : 'All alarms'} bodyClassName="p-0">
        {!rows.length ? (
          <Empty>No alarms match this filter.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>State</Th>
                <Th>Alarm</Th>
                <Th>Metric</Th>
                <Th>Account</Th>
                <Th>Region</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={`${a.accountId}:${a.name}`}>
                  <Td>
                    <Badge tone={alarmTone(a.state)}>{humanize(a.state)}</Badge>
                  </Td>
                  <Td>
                    <div className="font-medium">{a.name}</div>
                    {a.reason && <div className="max-w-xl truncate text-xs text-slate-500">{a.reason}</div>}
                  </Td>
                  <Td className="font-mono text-xs">
                    {a.namespace}/{a.metric}
                    {a.threshold && <div className="text-slate-500">{a.statistic} {a.threshold}</div>}
                  </Td>
                  <Td>
                    <div>{a.accountName}</div>
                    <div className="font-mono text-xs text-slate-500">{a.accountId}</div>
                  </Td>
                  <Td className="text-xs">{a.region}</Td>
                  <Td className="text-xs text-slate-500">{timeAgo(a.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function BackupReport({ data }: { data: ReportsPayload['backup'] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Vaults" value={data.summary.vaults} />
        <Kpi label="Protected resources" value={data.summary.protectedResources} />
        <Kpi label="Recovery points" value={data.summary.recoveryPoints} />
        <Kpi label="Copied last 24h" value={bytes(data.summary.bytes24h)} />
        <Kpi label="Jobs (24h)" value={data.summary.jobs24h} />
        <Kpi label="Succeeded (24h)" value={data.summary.succeeded} tone="green" />
        <Kpi label="Failed (24h)" value={data.summary.failed} tone={data.summary.failed ? 'red' : 'green'} />
        <Kpi label="Running" value={data.summary.running} tone={data.summary.running ? 'amber' : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Vaults" bodyClassName="p-0">
          {!data.vaults.length ? (
            <Empty>No backup vaults.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Vault</Th>
                  <Th>Region</Th>
                  <Th>Points</Th>
                  <Th>Last backup</Th>
                </tr>
              </thead>
              <tbody>
                {data.vaults.map((v) => (
                  <tr key={`${v.accountId}:${v.region}:${v.name}`}>
                    <Td>
                      <div className="font-medium">{v.name}</div>
                      <div className="text-xs text-slate-500">
                        {v.accountName} · {v.encrypted ? 'Encrypted' : 'Unencrypted'}
                      </div>
                    </Td>
                    <Td className="text-xs">{v.region}</Td>
                    <Td className="tabular-nums">{v.recoveryPoints}</Td>
                    <Td className="text-xs text-slate-500">{v.lastBackupAt ? timeAgo(v.lastBackupAt) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="Protected resources" bodyClassName="p-0">
          {!data.protectedResources.length ? (
            <Empty>No protected resources.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Resource</Th>
                  <Th>Type</Th>
                  <Th>Last backup</Th>
                </tr>
              </thead>
              <tbody>
                {data.protectedResources.map((p) => (
                  <tr key={p.arn}>
                    <Td>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.accountName} · {p.region}</div>
                    </Td>
                    <Td>
                      <Badge>{p.type}</Badge>
                    </Td>
                    <Td className="text-xs text-slate-500">{p.lastBackupAt ? timeAgo(p.lastBackupAt) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
      <Card title="Recent backup jobs" bodyClassName="p-0">
        {!data.jobs.length ? (
          <Empty>No backup jobs.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Status</Th>
                <Th>Resource</Th>
                <Th>Type</Th>
                <Th>Size</Th>
                <Th>Started</Th>
                <Th>Completed</Th>
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((j) => (
                <tr key={j.id}>
                  <Td>
                    <Badge tone={jobTone(j.status)}>{humanize(j.status)}</Badge>
                  </Td>
                  <Td>
                    <div className="font-medium">{j.resourceName}</div>
                    <div className="text-xs text-slate-500">{j.accountName} · {j.region}</div>
                  </Td>
                  <Td className="text-xs">{j.resourceType}</Td>
                  <Td className="tabular-nums text-xs">{bytes(j.bytes)}</Td>
                  <Td className="text-xs text-slate-500">{formatDate(j.startedAt)}</Td>
                  <Td className="text-xs text-slate-500">{j.completedAt ? formatDate(j.completedAt) : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

const MODULE_LABEL: Record<string, string> = {
  antiMalware: 'Anti-malware',
  intrusionPrevention: 'Intrusion prevention',
  integrityMonitoring: 'Integrity monitoring',
  firewall: 'Firewall',
  webReputation: 'Web reputation',
  logInspection: 'Log inspection',
};

function TrendReport({ data }: { data: ReportsPayload['trendmicro'] }) {
  const [status, setStatus] = useState<string | null>(null);
  const slices = [
    { key: 'online', label: 'Online', value: data.summary.online, color: AGENT_COLOR.online },
    { key: 'offline', label: 'Offline', value: data.summary.offline, color: AGENT_COLOR.offline },
    { key: 'error', label: 'Error', value: data.summary.error, color: AGENT_COLOR.error },
  ];
  const computers = data.computers.filter((c) => !status || c.status === status);
  const maxMod = Math.max(1, ...Object.values(data.modules).map((m) => m.on + m.off));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Computers" value={data.summary.computers} />
        <Kpi label="Protected" value={data.summary.protected} tone="green" />
        <Kpi label="At risk" value={data.summary.atRisk} tone={data.summary.atRisk ? 'amber' : 'green'} />
        <Kpi label="Open threats" value={data.summary.openThreats} tone={data.summary.openThreats ? 'red' : 'green'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Agent status" className="lg:col-span-2">
          <PieChart slices={slices} activeKey={status} onSelect={setStatus} centerLabel="Agents" />
        </Card>
        <Card title="Module coverage">
          <ul className="space-y-2.5">
            {Object.entries(data.modules).map(([key, v]) => (
              <li key={key} className="text-sm">
                <div className="mb-1 flex justify-between text-xs">
                  <span>{MODULE_LABEL[key] ?? humanize(key)}</span>
                  <span className="tabular-nums text-slate-500">
                    {v.on}/{v.on + v.off}
                  </span>
                </div>
                <span className="block h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${(v.on / maxMod) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Computers" bodyClassName="p-0">
        {!computers.length ? (
          <Empty>No computers match this filter.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Host</Th>
                <Th>Status</Th>
                <Th>OS</Th>
                <Th>Agent</Th>
                <Th>Threats</Th>
                <Th>Last seen</Th>
              </tr>
            </thead>
            <tbody>
              {computers.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-slate-500">
                      {c.group} · {c.accountName}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={c.status === 'online' ? 'green' : c.status === 'error' ? 'red' : 'slate'}>{humanize(c.status)}</Badge>
                  </Td>
                  <Td className="text-xs">{c.os}</Td>
                  <Td className="font-mono text-xs">{c.agentVersion}</Td>
                  <Td className="tabular-nums">{c.threats}</Td>
                  <Td className="text-xs text-slate-500">{timeAgo(c.lastSeenAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card title="Recent threats" bodyClassName="p-0">
        {!data.threats.length ? (
          <Empty>No threats detected.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Severity</Th>
                <Th>Type</Th>
                <Th>Computer</Th>
                <Th>File</Th>
                <Th>Status</Th>
                <Th>Detected</Th>
              </tr>
            </thead>
            <tbody>
              {data.threats.map((t) => (
                <tr key={t.id}>
                  <Td>
                    <Badge tone={sevTone(t.severity)}>{humanize(t.severity)}</Badge>
                  </Td>
                  <Td>{t.type}</Td>
                  <Td className="text-sm">{t.computer}</Td>
                  <Td className="max-w-xs truncate font-mono text-xs">{t.file ?? '—'}</Td>
                  <Td>
                    <Badge tone={t.status === 'open' ? 'red' : t.status === 'cleaned' ? 'green' : 'amber'}>{humanize(t.status)}</Badge>
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDate(t.detectedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function InspectorReport({ data }: { data: ReportsPayload['inspector'] }) {
  const [sev, setSev] = useState<string | null>(null);
  const slices = [
    { key: 'CRITICAL', label: 'Critical', value: data.summary.critical, color: SEV_COLOR.CRITICAL },
    { key: 'HIGH', label: 'High', value: data.summary.high, color: SEV_COLOR.HIGH },
    { key: 'MEDIUM', label: 'Medium', value: data.summary.medium, color: SEV_COLOR.MEDIUM },
    { key: 'LOW', label: 'Low', value: data.summary.low, color: SEV_COLOR.LOW },
    { key: 'INFORMATIONAL', label: 'Info', value: data.summary.informational, color: SEV_COLOR.INFORMATIONAL },
  ];
  const rows = useMemo(
    () => data.findings.filter((f) => f.status === 'ACTIVE' && (!sev || f.severity === sev)),
    [data.findings, sev],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Active findings" value={data.summary.findings} />
        <Kpi label="Critical" value={data.summary.critical} tone={data.summary.critical ? 'red' : 'green'} />
        <Kpi label="High" value={data.summary.high} tone={data.summary.high ? 'amber' : 'green'} />
        <Kpi label="Resources scanned" value={data.summary.resourcesScanned} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Findings by severity" className="lg:col-span-2">
          <PieChart slices={slices} activeKey={sev} onSelect={setSev} centerLabel="Active" centerValue={data.summary.findings} />
        </Card>
        <Card title="By type">
          <ul className="space-y-2 text-sm">
            {data.byType.map((t) => (
              <li key={t.key} className="flex justify-between gap-3">
                <span className="text-slate-600 dark:text-slate-300">{humanize(t.label)}</span>
                <span className="tabular-nums">{t.count}</span>
              </li>
            ))}
            {!data.byType.length && <Empty>No findings</Empty>}
          </ul>
        </Card>
      </div>
      <Card title={sev ? `${humanize(sev)} findings` : 'Active findings'} bodyClassName="p-0">
        {!rows.length ? (
          <Empty>No findings match this filter.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Severity</Th>
                <Th>Finding</Th>
                <Th>Resource</Th>
                <Th>CVE / score</Th>
                <Th>Last seen</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <Td>
                    <Badge tone={sevTone(f.severity)}>{humanize(f.severity)}</Badge>
                  </Td>
                  <Td>
                    <div className="font-medium">{f.title}</div>
                    <div className="text-xs text-slate-500">{humanize(f.type)}</div>
                  </Td>
                  <Td>
                    <div>{f.resource}</div>
                    <div className="text-xs text-slate-500">
                      {humanize(f.resourceType)} · {f.accountName} · {f.region}
                    </div>
                  </Td>
                  <Td className="font-mono text-xs">
                    {f.cve ?? '—'}
                    {f.score != null && <div className="text-slate-500">CVSS {f.score}</div>}
                  </Td>
                  <Td className="text-xs text-slate-500">{timeAgo(f.lastSeenAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
