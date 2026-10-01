'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cloud, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Badge, Button, Card, Empty, ErrorText, Field, Input, Modal, PageHeader, Spinner, Table, Tabs, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize, timeAgo } from '@/lib/format';

const statusTone = (s?: string) => (s === 'SUCCEEDED' ? 'green' : s === 'FAILED' ? 'red' : s ? 'amber' : 'slate') as any;
const authLabel: Record<string, string> = { default: 'API credential chain', keys: 'Access keys', role: 'AssumeRole', demo: 'Demo (disabled)' };

export default function AwsAccountsPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [adding, setAdding] = useState(false);
  const [runsFor, setRunsFor] = useState<any>(null);
  const [created, setCreated] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['aws-accounts'],
    queryFn: () => api<any[]>('/aws-accounts'),
    refetchInterval: (q) => (q.state.data?.some((a: any) => ['QUEUED', 'RUNNING'].includes(a.lastSyncStatus)) ? 2000 : 30_000),
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['aws-accounts'] });
    qc.invalidateQueries({ queryKey: ['assets'] });
    qc.invalidateQueries({ queryKey: ['reports'] });
  };
  const sync = useMutation({ mutationFn: (id: string) => api(`/aws-accounts/${id}/sync`, { method: 'POST' }), onSuccess: invalidate });
  const toggle = useMutation({ mutationFn: (a: any) => api(`/aws-accounts/${a.id}`, { method: 'PATCH', body: { enabled: !a.enabled } }), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => api(`/aws-accounts/${id}`, { method: 'DELETE' }), onSuccess: invalidate });

  const manage = can('inventory:manage');
  const live = data?.filter((a) => !a.mock) ?? [];

  return (
    <>
      <PageHeader
        title="AWS accounts"
        subtitle="Connect a live AWS identity. CloudGuardian then reads EC2, load balancers, IAM users, CloudWatch, Backup and Inspector from that account."
        actions={manage && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Connect AWS
          </Button>
        )}
      />
      <ErrorText error={sync.error || toggle.error || remove.error} />
      <Card bodyClassName="p-0">
        {isLoading ? (
          <Spinner />
        ) : !live.length ? (
          <Empty>
            No live AWS account connected.{' '}
            {manage ? 'Use Connect AWS to discover this environment or paste access keys.' : 'Ask an administrator to connect AWS.'}
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Account</Th>
                <Th>Regions</Th>
                <Th>Auth</Th>
                <Th>Assets</Th>
                <Th>Last sync</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {live.map((a) => (
                <tr key={a.id} className={a.enabled ? '' : 'opacity-60'}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Cloud className="size-4 text-orange-500" />
                      <div>
                        <div className="font-medium">{a.name}</div>
                        <div className="font-mono text-xs text-slate-500">{a.accountId}</div>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-xs">{a.regions.join(', ')}</Td>
                  <Td>
                    <Badge tone={a.authMode === 'role' ? 'indigo' : a.authMode === 'keys' ? 'amber' : 'green'}>{authLabel[a.authMode] ?? a.authMode}</Badge>
                    {a.roleArn && <div className="mt-1 max-w-xs truncate font-mono text-[11px] text-slate-500">{a.roleArn}</div>}
                  </Td>
                  <Td className="tabular-nums">{a._count.assets}</Td>
                  <Td className="text-xs text-slate-500">{a.lastSyncAt ? timeAgo(a.lastSyncAt) : 'never'}</Td>
                  <Td>
                    <button onClick={() => setRunsFor(a)}>
                      <Badge tone={statusTone(a.lastSyncStatus)}>{a.lastSyncStatus ? humanize(a.lastSyncStatus) : 'Not synced'}</Badge>
                    </button>
                    {a.lastRun?.error && (
                      <div className="mt-1 max-w-xs truncate text-xs text-red-600" title={a.lastRun.error}>
                        {a.lastRun.error}
                      </div>
                    )}
                  </Td>
                  <Td>
                    {manage && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => sync.mutate(a.id)} disabled={['QUEUED', 'RUNNING'].includes(a.lastSyncStatus)}>
                          <RefreshCw className={`size-3.5 ${['QUEUED', 'RUNNING'].includes(a.lastSyncStatus) ? 'animate-spin' : ''}`} /> Sync
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggle.mutate(a)}>
                          {a.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => confirm(`Remove ${a.name} and all its inventory?`) && remove.mutate(a.id)}>
                          <Trash2 className="size-3.5 text-red-600" />
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <AddAccountModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(a) => {
          setAdding(false);
          setCreated(a);
          invalidate();
        }}
      />
      {created && <OnboardingModal account={created} onClose={() => setCreated(null)} />}
      {runsFor && <RunsModal account={runsFor} onClose={() => setRunsFor(null)} />}
    </>
  );
}

function AddAccountModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (a: any) => void }) {
  const [tab, setTab] = useState<'env' | 'keys' | 'role'>('env');
  const [form, setForm] = useState({
    name: '',
    accountId: '',
    roleArn: '',
    accessKeyId: '',
    secretAccessKey: '',
    sessionToken: '',
    regions: 'us-east-1',
  });
  const identity = useQuery({
    queryKey: ['aws-identity'],
    queryFn: () => api<{ ok: boolean; identity?: { accountId: string; arn: string; userId: string }; message?: string }>('/aws-accounts/identity'),
    enabled: open && tab === 'env',
  });
  const probe = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; identity?: { accountId: string; arn: string }; message?: string }>('/aws-accounts/identity/probe', {
        body: { accessKeyId: form.accessKeyId, secretAccessKey: form.secretAccessKey, sessionToken: form.sessionToken || undefined, region: form.regions.split(',')[0] },
      }),
    onSuccess: (res) => {
      if (res.ok && res.identity) setForm((f) => ({ ...f, accountId: res.identity!.accountId, name: f.name || `AWS ${res.identity!.accountId}` }));
    },
  });
  const create = useMutation({
    mutationFn: () => {
      const regions = form.regions.split(',').map((r) => r.trim()).filter(Boolean);
      if (tab === 'env') {
        return api('/aws-accounts', { body: { name: form.name || undefined, regions, useDefaultCredentials: true } });
      }
      if (tab === 'keys') {
        return api('/aws-accounts', {
          body: {
            name: form.name || undefined,
            accountId: form.accountId || undefined,
            accessKeyId: form.accessKeyId,
            secretAccessKey: form.secretAccessKey,
            sessionToken: form.sessionToken || undefined,
            regions,
          },
        });
      }
      return api('/aws-accounts', {
        body: { name: form.name || undefined, accountId: form.accountId, roleArn: form.roleArn, regions },
      });
    },
    onSuccess: onCreated,
  });

  useEffect(() => {
    if (!open) {
      setTab('env');
      setForm({ name: '', accountId: '', roleArn: '', accessKeyId: '', secretAccessKey: '', sessionToken: '', regions: 'us-east-1' });
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Connect AWS"
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>
            Connect & sync
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-400">
        CloudGuardian calls AWS APIs (EC2, ELB, IAM, CloudWatch, Backup, Inspector). Demo inventory is no longer used.
      </p>
      <Tabs
        tabs={[
          { key: 'env', label: 'This environment' },
          { key: 'keys', label: 'Access keys' },
          { key: 'role', label: 'Assume role' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <form
        className="space-y-3 pt-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Display name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Production" />
        </Field>
        <Field label="Regions" hint="Comma separated. IAM users are always read from the global IAM endpoint.">
          <Input value={form.regions} onChange={(e) => setForm({ ...form, regions: e.target.value })} />
        </Field>

        {tab === 'env' && (
          <div className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
            {identity.isLoading ? (
              <Spinner />
            ) : identity.data?.ok && identity.data.identity ? (
              <>
                <div className="font-medium text-emerald-700 dark:text-emerald-300">AWS identity found</div>
                <div className="mt-1 font-mono text-xs text-slate-600 dark:text-slate-400">Account {identity.data.identity.accountId}</div>
                <div className="truncate font-mono text-xs text-slate-500">{identity.data.identity.arn}</div>
                <p className="mt-2 text-xs text-slate-500">Uses the API process credential chain: environment variables, instance/task role, or the shared AWS config file.</p>
              </>
            ) : (
              <div>
                <div className="font-medium text-amber-700 dark:text-amber-300">No AWS identity on this API yet</div>
                <p className="mt-1 text-xs text-slate-500">
                  Set <code>AWS_ACCESS_KEY_ID</code>, <code>AWS_SECRET_ACCESS_KEY</code> and <code>AWS_REGION</code> on the API, or use Access keys / Assume role.
                </p>
                {identity.data?.message && <p className="mt-1 text-xs text-red-600">{identity.data.message}</p>}
              </div>
            )}
          </div>
        )}

        {tab === 'keys' && (
          <>
            <Field label="Access key ID">
              <Input value={form.accessKeyId} onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Secret access key">
              <Input type="password" value={form.secretAccessKey} onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Session token" hint="Optional. Needed for temporary credentials.">
              <Input value={form.sessionToken} onChange={(e) => setForm({ ...form, sessionToken: e.target.value })} autoComplete="off" />
            </Field>
            <Button type="button" size="sm" onClick={() => probe.mutate()} loading={probe.isPending}>
              Verify with STS
            </Button>
            {probe.data?.ok && probe.data.identity && (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Verified account {probe.data.identity.accountId}</p>
            )}
            {probe.data && !probe.data.ok && <p className="text-xs text-red-600">{probe.data.message}</p>}
          </>
        )}

        {tab === 'role' && (
          <>
            <Field label="AWS account ID">
              <Input value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} placeholder="123456789012" />
            </Field>
            <Field label="Read-only role ARN" hint="Deploy the CloudFormation template shown after connecting, then paste RoleArn.">
              <Input value={form.roleArn} onChange={(e) => setForm({ ...form, roleArn: e.target.value })} placeholder="arn:aws:iam::123456789012:role/CloudGuardianInventory" />
            </Field>
          </>
        )}
        <ErrorText error={create.error} />
      </form>
    </Modal>
  );
}

function OnboardingModal({ account, onClose }: { account: any; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['onboarding', account.externalId],
    queryFn: () => api('/aws-accounts/onboarding/template', { query: { externalId: account.externalId } }),
    enabled: account.authMode === 'role',
  });
  return (
    <Modal open onClose={onClose} title={`${account.name} connected`} wide footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <p className="text-sm">A live inventory sync has been queued. Servers, load balancers and IAM users will appear when it finishes.</p>
      {account.authMode === 'role' && (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Deploy this CloudFormation template in account <b>{account.accountId}</b>. It creates a read-only role trusted only by CloudGuardian with external ID{' '}
            <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{account.externalId}</code>.
          </p>
          <pre className="max-h-80 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{data?.template ?? 'Loading…'}</pre>
        </>
      )}
    </Modal>
  );
}

function RunsModal({ account, onClose }: { account: any; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['sync-runs', account.id], queryFn: () => api<any[]>(`/aws-accounts/${account.id}/runs`) });
  return (
    <Modal open onClose={onClose} title={`Sync history — ${account.name}`} wide>
      {isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Started</Th>
              <Th>Status</Th>
              <Th>Duration</Th>
              <Th>Result</Th>
            </tr>
          </thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.id}>
                <Td className="text-xs">{formatDate(r.startedAt)}</Td>
                <Td>
                  <Badge tone={statusTone(r.status)}>{humanize(r.status)}</Badge>
                </Td>
                <Td className="text-xs">{r.finishedAt ? `${((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000).toFixed(1)}s` : '—'}</Td>
                <Td className="text-xs">
                  {r.error ? (
                    <span className="text-red-600">{r.error}</span>
                  ) : r.stats ? (
                    `${r.stats.discovered} found · ${r.stats.created} new · ${r.stats.modified} changed · ${r.stats.removed} removed`
                  ) : (
                    '—'
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Modal>
  );
}
