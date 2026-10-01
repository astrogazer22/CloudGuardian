'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ContactModal, OrgModal, tierTone } from '@/components/crm';
import { Badge, Button, Card, Empty, Input, PageHeader, Spinner, Table, Tabs, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanize } from '@/lib/format';
import { useOrganizations } from '@/lib/hooks';

export default function CustomersPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { can } = useAuth();
  const tab = (params.get('tab') as 'orgs' | 'contacts') ?? 'orgs';
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<'org' | 'contact' | null>(null);

  const orgs = useOrganizations();
  const contacts = useQuery({ queryKey: ['contacts', 'all', q], queryFn: () => api<any[]>('/contacts', { query: { q } }), enabled: tab === 'contacts' });

  const filteredOrgs = orgs.data?.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Organizations and contacts you support"
        actions={
          can('crm:write') && (
            <>
              <Button onClick={() => setModal('contact')}><Plus className="size-4" /> Contact</Button>
              <Button variant="primary" onClick={() => setModal('org')}><Plus className="size-4" /> Organization</Button>
            </>
          )
        }
      />
      <Tabs
        value={tab}
        onChange={(v) => router.replace(`${pathname}?tab=${v}`)}
        tabs={[
          { key: 'orgs', label: 'Organizations', count: orgs.data?.length },
          { key: 'contacts', label: 'Contacts' },
        ]}
      />
      <div className="my-3">
        <Input className="max-w-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card bodyClassName="p-0">
        {tab === 'orgs' ? (
          orgs.isLoading ? <Spinner /> : !filteredOrgs?.length ? <Empty>No organizations.</Empty> : (
            <Table>
              <thead><tr><Th>Name</Th><Th>Tier</Th><Th>Industry</Th><Th>Domain</Th><Th>Contacts</Th><Th>Open tickets</Th></tr></thead>
              <tbody>
                {filteredOrgs.map((o) => (
                  <tr key={o.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => router.push(`/customers/${o.id}`)}>
                    <Td className="font-medium"><Link href={`/customers/${o.id}`} className="hover:text-indigo-600">{o.name}</Link></Td>
                    <Td><Badge tone={tierTone(o.tier)}>{humanize(o.tier)}</Badge></Td>
                    <Td className="text-slate-500">{o.industry ?? '—'}</Td>
                    <Td className="text-slate-500">{o.domain ?? '—'}</Td>
                    <Td>{o._count.contacts}</Td>
                    <Td>{o._count.tickets}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )
        ) : contacts.isLoading ? <Spinner /> : !contacts.data?.length ? <Empty>No contacts.</Empty> : (
          <Table>
            <thead><tr><Th>Name</Th><Th>Email</Th><Th>Title</Th><Th>Phone</Th><Th>Organization</Th><Th>Open tickets</Th></tr></thead>
            <tbody>
              {contacts.data.map((c) => (
                <tr key={c.id}>
                  <Td className="font-medium">{c.name}</Td>
                  <Td className="text-slate-500">{c.email}</Td>
                  <Td className="text-slate-500">{c.title ?? '—'}</Td>
                  <Td className="text-slate-500">{c.phone ?? '—'}</Td>
                  <Td>{c.organization ? <Link href={`/customers/${c.organization.id}`} className="hover:text-indigo-600">{c.organization.name}</Link> : '—'}</Td>
                  <Td>{c._count.tickets}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {modal === 'org' && <OrgModal onClose={() => setModal(null)} />}
      {modal === 'contact' && <ContactModal onClose={() => setModal(null)} />}
    </>
  );
}
