'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Eye, History, Lock, Pencil, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Markdown } from '@/components/kb';
import { ArticleEditor, toArticleBody } from '@/components/kb-editor';
import { Badge, Button, Card, ErrorText, KeyValue, Modal, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize, timeAgo } from '@/lib/format';

const statusTone = (s: string) => (s === 'PUBLISHED' ? 'green' : s === 'IN_REVIEW' ? 'amber' : s === 'ARCHIVED' ? 'slate' : 'blue') as any;

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [voted, setVoted] = useState(false);
  const { data: a, isLoading, error } = useQuery({ queryKey: ['kb-article', id], queryFn: () => api(`/kb/articles/${id}`, { query: { view: 1 } }) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['kb-article', id] });
    qc.invalidateQueries({ queryKey: ['kb-articles'] });
  };
  const update = useMutation({ mutationFn: (body: any) => api(`/kb/articles/${id}`, { method: 'PATCH', body }), onSuccess: () => { setEditing(false); refresh(); } });
  const setStatus = useMutation({ mutationFn: (status: string) => api(`/kb/articles/${id}/status`, { body: { status } }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => api(`/kb/articles/${id}`, { method: 'DELETE' }), onSuccess: () => router.push('/knowledge') });
  const feedback = useMutation({ mutationFn: (helpful: boolean) => api(`/kb/articles/${id}/feedback`, { body: { helpful } }), onSuccess: () => { setVoted(true); refresh(); } });

  if (isLoading) return <Spinner />;
  if (error || !a) return <ErrorText error={error ?? 'Not found'} />;

  const canWrite = can('kb:write');
  const canPublish = can('kb:publish');
  const canEditThis = canWrite && (a.status !== 'PUBLISHED' || canPublish);

  const actions: { status: string; label: string; show: boolean; primary?: boolean }[] = [
    { status: 'IN_REVIEW', label: 'Submit for review', show: canWrite && a.status === 'DRAFT', primary: true },
    { status: 'PUBLISHED', label: 'Publish', show: canPublish && ['DRAFT', 'IN_REVIEW', 'ARCHIVED'].includes(a.status), primary: true },
    { status: 'DRAFT', label: 'Back to draft', show: canWrite && a.status === 'IN_REVIEW' },
    { status: 'ARCHIVED', label: 'Archive', show: canPublish && a.status === 'PUBLISHED' },
  ];

  return (
    <>
      <div className="mb-1 flex items-center gap-1 text-sm text-slate-500">
        <Link href="/knowledge" className="hover:text-indigo-600">Knowledge base</Link>
        <ChevronRight className="size-3.5" />
        <span>{a.category?.name ?? 'Uncategorized'}</span>
      </div>

      {editing ? (
        <Card title={`Editing — ${a.status === 'PUBLISHED' ? 'changes go live immediately' : humanize(a.status)}`}>
          <ArticleEditor
            initial={{ title: a.title, body: a.body, excerpt: a.excerpt ?? '', categoryId: a.categoryId ?? '', visibility: a.visibility, tags: a.tags.join(', ') }}
            onSave={(d) => update.mutate(toArticleBody(d))}
            onCancel={() => setEditing(false)}
            saving={update.isPending}
            error={update.error}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Card>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(a.status)}>{humanize(a.status)}</Badge>
              {a.visibility === 'INTERNAL' && <Badge tone="purple"><Lock className="size-3" /> Internal</Badge>}
              {a.tags.map((t: string) => <Badge key={t}>{t}</Badge>)}
            </div>
            <h1 className="mb-1 text-2xl font-semibold tracking-tight">{a.title}</h1>
            {a.excerpt && <p className="mb-4 text-slate-500">{a.excerpt}</p>}
            <Markdown>{a.body}</Markdown>
            {a.status === 'PUBLISHED' && (
              <div className="mt-8 flex items-center gap-3 border-t border-slate-100 pt-4 text-sm dark:border-slate-800">
                {voted ? <span className="text-emerald-600">Thanks for the feedback!</span> : (
                  <>
                    <span className="text-slate-500">Was this helpful?</span>
                    <Button size="sm" onClick={() => feedback.mutate(true)}><ThumbsUp className="size-3.5" /> Yes</Button>
                    <Button size="sm" onClick={() => feedback.mutate(false)}><ThumbsDown className="size-3.5" /> No</Button>
                  </>
                )}
              </div>
            )}
          </Card>

          <div className="space-y-4">
            {(canWrite || canPublish) && (
              <Card title="Actions">
                <div className="flex flex-col gap-2">
                  {actions.filter((x) => x.show).map((x) => (
                    <Button key={x.status} variant={x.primary ? 'primary' : 'secondary'} loading={setStatus.isPending && setStatus.variables === x.status} onClick={() => setStatus.mutate(x.status)}>
                      {x.label}
                    </Button>
                  ))}
                  {canEditThis && <Button onClick={() => setEditing(true)}><Pencil className="size-3.5" /> Edit</Button>}
                  {canWrite && <Button variant="ghost" onClick={() => setShowVersions(true)}><History className="size-3.5" /> Version history</Button>}
                  {canPublish && <Button variant="ghost" onClick={() => confirm('Delete this article permanently?') && remove.mutate()}><Trash2 className="size-3.5 text-red-600" /> Delete</Button>}
                </div>
                <ErrorText error={setStatus.error} />
              </Card>
            )}
            <Card title="Details">
              <KeyValue
                items={[
                  ['Author', a.author.name],
                  ['Version', `v${a.version}`],
                  ['Updated', timeAgo(a.updatedAt)],
                  ['Published', formatDate(a.publishedAt)],
                  ['Views', <span className="flex items-center gap-1"><Eye className="size-3" /> {a.views}</span>],
                  ['Helpful', `${a.helpfulYes} yes · ${a.helpfulNo} no`],
                  ['Portal link', a.visibility === 'PUBLIC' && a.status === 'PUBLISHED' ? <Link className="text-indigo-600 hover:underline" href={`/portal/kb/${a.slug}`}>/portal/kb/{a.slug}</Link> : '—'],
                ]}
              />
            </Card>
          </div>
        </div>
      )}
      {showVersions && <VersionsModal articleId={id} onClose={() => setShowVersions(false)} />}
    </>
  );
}

function VersionsModal({ articleId, onClose }: { articleId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['kb-versions', articleId], queryFn: () => api<any[]>(`/kb/articles/${articleId}/versions`) });
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Modal open wide onClose={onClose} title="Version history">
      {isLoading ? <Spinner /> : (
        <ul className="space-y-2">
          {data?.map((v) => (
            <li key={v.id} className="rounded-md border border-slate-200 dark:border-slate-700">
              <button className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm" onClick={() => setOpen(open === v.version ? null : v.version)}>
                <Badge>v{v.version}</Badge>
                <span className="flex-1 font-medium">{v.title}</span>
                <span className="text-xs text-slate-500">{v.editor.name} · {formatDate(v.createdAt)}</span>
              </button>
              {open === v.version && <div className="border-t border-slate-100 p-3 dark:border-slate-800"><Markdown>{v.body}</Markdown></div>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
