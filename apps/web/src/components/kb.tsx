'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, Lightbulb } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-sm prose-slate max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-indigo-600 prose-table:text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

/** Live "these articles might solve it" panel while someone types a ticket — deflects avoidable tickets. */
export function KbSuggestions({ text, hrefFor }: { text: string; hrefFor: (a: { id: string; slug: string }) => string }) {
  const [debounced, setDebounced] = useState(text);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 400);
    return () => clearTimeout(t);
  }, [text]);
  const { data } = useQuery({
    queryKey: ['kb-suggest', debounced],
    queryFn: () => api<any[]>('/kb/suggest', { query: { q: debounced.slice(0, 500) } }),
    enabled: debounced.trim().length >= 8,
  });
  if (!data?.length) return null;
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900 dark:bg-indigo-950/40">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-indigo-800 dark:text-indigo-200">
        <Lightbulb className="size-4" /> These articles might solve it
      </div>
      <ul className="space-y-1.5">
        {data.map((a) => (
          <li key={a.id}>
            <Link href={hrefFor(a)} target="_blank" className="flex items-start gap-2 text-sm hover:text-indigo-600">
              <BookOpen className="mt-0.5 size-3.5 shrink-0 text-indigo-500" />
              <span>
                <span className="font-medium">{a.title}</span>
                <span className="block text-xs text-slate-500">{a.excerpt}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
