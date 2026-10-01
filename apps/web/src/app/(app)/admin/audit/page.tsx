'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge, Card, Empty, PageHeader, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';

const ENTITIES = ['User', 'Team', 'Ticket', 'Workflow', 'SlaPolicy', 'AutomationRule', 'AwsAccount', 'Organization', 'Contact'];

export default function AuditPage() {
  const [entity, setEntity] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['audit', entity], queryFn: () => api<any[]>('/audit', { query: { entity, take: 300 } }) });
  return (
    <>
      <PageHeader title="Audit log" subtitle="Security-relevant and administrative actions" />
      <div className="mb-3">
        <Select className="w-52" value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">All entities</option>
          {ENTITIES.map((e) => <option key={e}>{e}</option>)}
        </Select>
      </div>
      <Card bodyClassName="p-0">
        {isLoading ? <Spinner /> : !data?.length ? <Empty>No entries.</Empty> : (
          <Table>
            <thead><tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>Details</Th></tr></thead>
            <tbody>
              {data.map((l) => (
                <tr key={l.id}>
                  <Td className="whitespace-nowrap text-xs text-slate-500">{formatDate(l.createdAt)}</Td>
                  <Td className="whitespace-nowrap">{l.actor?.name ?? 'System'}</Td>
                  <Td><Badge tone={l.action.includes('deleted') ? 'red' : l.action.includes('created') ? 'green' : 'slate'}>{l.action}</Badge></Td>
                  <Td className="text-xs">{l.entity} <span className="font-mono text-slate-400">{l.entityId?.slice(-8)}</span></Td>
                  <Td className="max-w-md truncate font-mono text-xs text-slate-500">{Object.keys(l.data ?? {}).length ? JSON.stringify(l.data) : ''}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
