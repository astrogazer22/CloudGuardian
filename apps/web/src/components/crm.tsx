'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { humanize } from '@/lib/format';
import { api } from '@/lib/api';
import { useOrganizations } from '@/lib/hooks';
import { TIERS } from '@/lib/types';
import { Button, ErrorText, Field, Input, Modal, Select } from './ui';

export const tierTone = (t: string) => (t === 'ENTERPRISE' ? 'purple' : t === 'PREMIUM' ? 'indigo' : 'slate') as any;

export function OrgModal({ org, onClose }: { org?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: org?.name ?? '', domain: org?.domain ?? '', tier: org?.tier ?? 'STANDARD', industry: org?.industry ?? '', notes: org?.notes ?? '' });
  const save = useMutation({
    mutationFn: () => (org ? api(`/organizations/${org.id}`, { method: 'PATCH', body: form }) : api('/organizations', { body: form })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organizations'] });
      qc.invalidateQueries({ queryKey: ['organization'] });
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title={org ? 'Edit organization' : 'New organization'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
      <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tier" hint="Drives SLA targets">
          <Select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
            {TIERS.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
          </Select>
        </Field>
        <Field label="Industry"><Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></Field>
      </div>
      <Field label="Domain"><Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} /></Field>
      <Field label="Notes"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      <ErrorText error={save.error} />
    </Modal>
  );
}

export function ContactModal({ organizationId, onClose }: { organizationId?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const orgs = useOrganizations();
  const [form, setForm] = useState({ name: '', email: '', title: '', phone: '', organizationId: organizationId ?? '' });
  const save = useMutation({
    mutationFn: () => api('/contacts', { body: { ...form, organizationId: form.organizationId || undefined } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['organizations'] });
      qc.invalidateQueries({ queryKey: ['organization'] });
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title="New contact" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
      </div>
      <Field label="Organization">
        <Select value={form.organizationId} onChange={(e) => setForm({ ...form, organizationId: e.target.value })}>
          <option value="">—</option>
          {orgs.data?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      </Field>
      <ErrorText error={save.error} />
    </Modal>
  );
}
