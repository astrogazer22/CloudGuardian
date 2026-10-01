'use client';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Markdown } from './kb';
import { Button, ErrorText, Field, Input, Select, Textarea } from './ui';

export interface ArticleDraft {
  title: string;
  body: string;
  excerpt: string;
  categoryId: string;
  visibility: 'PUBLIC' | 'INTERNAL';
  tags: string;
}

export function ArticleEditor({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: ArticleDraft;
  onSave: (d: ArticleDraft) => void;
  onCancel: () => void;
  saving?: boolean;
  error?: unknown;
}) {
  const [d, setD] = useState(initial);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const cats = useQuery({ queryKey: ['kb-categories'], queryFn: () => api<any[]>('/kb/categories') });
  return (
    <div className="space-y-4">
      <Field label="Title"><Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="How to…" /></Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Category">
          <Select value={d.categoryId} onChange={(e) => setD({ ...d, categoryId: e.target.value })}>
            <option value="">Uncategorized</option>
            {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Visibility" hint={d.visibility === 'PUBLIC' ? 'Visible to requesters in the portal' : 'Agents only (runbooks, internal notes)'}>
          <Select value={d.visibility} onChange={(e) => setD({ ...d, visibility: e.target.value as ArticleDraft['visibility'] })}>
            <option value="PUBLIC">Public</option>
            <option value="INTERNAL">Internal</option>
          </Select>
        </Field>
        <Field label="Tags" hint="Comma separated — improves suggestions"><Input value={d.tags} onChange={(e) => setD({ ...d, tags: e.target.value })} /></Field>
      </div>
      <Field label="Summary" hint="Shown in search results and suggestions"><Input value={d.excerpt} onChange={(e) => setD({ ...d, excerpt: e.target.value })} /></Field>
      <div>
        <div className="mb-1 flex gap-1 text-xs">
          {(['write', 'preview'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={clsx('rounded px-2 py-1 capitalize', tab === t ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800')}>
              {t}
            </button>
          ))}
          <span className="ml-auto self-center text-slate-400">Markdown supported: headings, lists, tables, `code`, links</span>
        </div>
        {tab === 'write' ? (
          <Textarea rows={18} className="font-mono text-xs" value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} />
        ) : (
          <div className="min-h-64 rounded-md border border-slate-200 p-4 dark:border-slate-700"><Markdown>{d.body || '_Nothing to preview_'}</Markdown></div>
        )}
      </div>
      <ErrorText error={error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" loading={saving} disabled={d.title.trim().length < 3} onClick={() => onSave(d)}>Save</Button>
      </div>
    </div>
  );
}

export const toArticleBody = (d: ArticleDraft) => ({
  title: d.title,
  body: d.body,
  excerpt: d.excerpt || undefined,
  categoryId: d.categoryId || null,
  visibility: d.visibility,
  tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean),
});
