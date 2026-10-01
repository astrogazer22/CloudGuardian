'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Button, Card, ErrorText, Field, Input, Select, Spinner, Textarea } from '@/components/ui';
import { api } from '@/lib/api';

export default function CatalogRequestPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: item, isLoading, error } = useQuery({ queryKey: ['catalog-item', id], queryFn: () => api(`/catalog/${id}`) });
  const [values, setValues] = useState<Record<string, any>>({});
  const [summary, setSummary] = useState('');
  const submit = useMutation({
    mutationFn: () => api(`/catalog/${id}/request`, { body: { values, summary: summary || undefined } }),
    onSuccess: (t) => router.push(`/portal/requests/${t.id}?submitted=1`),
  });

  if (isLoading) return <Spinner />;
  if (error || !item) return <ErrorText error={error ?? 'Not found'} />;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 flex items-center gap-1 text-sm text-slate-500">
        <Link href="/portal/catalog" className="hover:text-indigo-600">Request something</Link>
        <ChevronRight className="size-3.5" />
        <span>{item.category}</span>
      </div>
      <Card>
        <h1 className="text-xl font-semibold">{item.name}</h1>
        <p className="mb-5 mt-1 text-sm text-slate-500">{item.description}</p>
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            submit.mutate();
          }}
        >
          <Field label="Short summary (optional)"><Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Shown in the request title" /></Field>
          {item.fields.map((f: any) => {
            const label = `${f.label}${f.required ? ' *' : ''}`;
            const set = (v: any) => setValues({ ...values, [f.key]: v });
            if (f.type === 'checkbox') {
              return (
                <label key={f.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!values[f.key]} onChange={(e) => set(e.target.checked)} /> {label}
                  {f.help && <span className="text-xs text-slate-500">— {f.help}</span>}
                </label>
              );
            }
            return (
              <Field key={f.key} label={label} hint={f.help}>
                {f.type === 'textarea' ? (
                  <Textarea rows={4} required={f.required} value={values[f.key] ?? ''} onChange={(e) => set(e.target.value)} />
                ) : f.type === 'select' ? (
                  <Select required={f.required} value={values[f.key] ?? ''} onChange={(e) => set(e.target.value)}>
                    <option value="">Select…</option>
                    {f.options?.map((o: string) => <option key={o}>{o}</option>)}
                  </Select>
                ) : (
                  <Input type={f.type === 'number' ? 'number' : 'text'} required={f.required} value={values[f.key] ?? ''} onChange={(e) => set(f.type === 'number' ? e.target.valueAsNumber : e.target.value)} />
                )}
              </Field>
            );
          })}
          <ErrorText error={submit.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" variant="primary" loading={submit.isPending}>Submit request</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
