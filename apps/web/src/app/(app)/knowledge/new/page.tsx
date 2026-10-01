'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArticleEditor, toArticleBody } from '@/components/kb-editor';
import { Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';

export default function NewArticlePage() {
  const router = useRouter();
  const create = useMutation({
    mutationFn: (body: any) => api('/kb/articles', { body }),
    onSuccess: (a) => router.push(`/knowledge/${a.id}`),
  });
  return (
    <>
      <PageHeader title="New article" subtitle="Saved as a draft. Submit it for review when it's ready." />
      <Card>
        <ArticleEditor
          initial={{ title: '', body: '## Overview\n\n## Steps\n\n1. \n', excerpt: '', categoryId: '', visibility: 'PUBLIC', tags: '' }}
          onSave={(d) => create.mutate(toArticleBody(d))}
          onCancel={() => router.back()}
          saving={create.isPending}
          error={create.error}
        />
      </Card>
    </>
  );
}
