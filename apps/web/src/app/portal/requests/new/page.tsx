'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { KbSuggestions } from '@/components/kb';
import { Button, Card, ErrorText, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';

const URGENCY = [
  { value: 'P4', label: 'Low — whenever you can' },
  { value: 'P3', label: 'Normal — it slows me down' },
  { value: 'P2', label: 'High — I am blocked' },
];

export default function ReportProblem() {
  const router = useRouter();
  const params = useSearchParams();
  const [title, setTitle] = useState(params.get('title') ?? '');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('P3');
  const create = useMutation({
    mutationFn: () => api('/tickets', { body: { title, description, priority, type: 'INCIDENT', tags: ['portal'] } }),
    onSuccess: (t) => router.push(`/portal/requests/${t.id}?submitted=1`),
  });
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Report a problem" subtitle="Tell us what's wrong. We'll suggest articles as you type." />
      <Card>
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label="What's the problem?"><Input required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. VPN disconnects every 30 minutes" /></Field>
          <KbSuggestions text={`${title} ${description}`} hrefFor={(a) => `/portal/kb/${a.slug}`} />
          <Field label="Details"><Textarea required rows={6} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When did it start? What have you tried? Any error messages?" /></Field>
          <Field label="How urgent is it?">
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {URGENCY.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </Select>
          </Field>
          <ErrorText error={create.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" variant="primary" loading={create.isPending}>Submit</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
