'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PriorityBadge, StatusBadge } from '@/components/badges';
import { Badge, Button, Card, Empty, ErrorText, KeyValue, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanize, timeAgo } from '@/lib/format';
import { ContactModal, OrgModal, tierTone } from '@/components/crm';

export default function OrganizationPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [modal, setModal] = useState<'edit' | 'contact' | null>(null);
  const { data: o, isLoading, error } = useQuery({ queryKey: ['organization', id], queryFn: () => api(`/organizations/${id}`) });

  if (isLoading) return <Spinner />;
  if (error || !o) return <ErrorText error={error ?? 'Not found'} />;
  const open = o.tickets.filter((t: any) => t.statusCategory !== 'DONE');

  return (
    <>
      <div className="mb-1 flex items-center gap-1 text-sm text-slate-500">
        <Link href="/customers" className="hover:text-indigo-600">Customers</Link>
        <ChevronRight className="size-3.5" />
        <span>{o.name}</span>
      </div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{o.name}</h1>
          <div className="mt-1 flex gap-2"><Badge tone={tierTone(o.tier)}>{humanize(o.tier)}</Badge>{o.industry && <Badge>{o.industry}</Badge>}</div>
        </div>
        {can('crm:write') && <Button onClick={() => setModal('edit')}><Pencil className="size-3.5" /> Edit</Button>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="Profile">
            <KeyValue items={[['Domain', o.domain], ['Tier', humanize(o.tier)], ['Open tickets', open.length], ['Total tickets', o.tickets.length], ['Notes', o.notes]]} />
          </Card>
          <Card title="Contacts" actions={can('crm:write') && <Button size="sm" variant="ghost" onClick={() => setModal('contact')}><Plus className="size-3.5" /></Button>}>
            {!o.contacts.length ? <p className="text-sm text-slate-500">No contacts</p> : (
              <ul className="space-y-2.5">
                {o.contacts.map((c: any) => (
                  <li key={c.id} className="text-sm">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-slate-500">{[c.title, c.email, c.phone].filter(Boolean).join(' · ')}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title="Tickets" className="lg:col-span-2" bodyClassName="p-0">
          {!o.tickets.length ? <Empty>No tickets for this organization.</Empty> : (
            <ul>
              {o.tickets.map((t: any) => (
                <li key={t.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <Link href={`/tickets/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <PriorityBadge priority={t.priority} short />
                    <span className="text-xs text-slate-400">#{t.number}</span>
                    <span className="flex-1 truncate text-sm">{t.title}</span>
                    {t.slaBreached && <Badge tone="red">SLA</Badge>}
                    <StatusBadge category={t.statusCategory} name={humanize(t.status)} />
                    <span className="w-20 text-right text-xs text-slate-400">{timeAgo(t.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {modal === 'edit' && <OrgModal org={o} onClose={() => setModal(null)} />}
      {modal === 'contact' && <ContactModal organizationId={o.id} onClose={() => setModal(null)} />}
    </>
  );
}
