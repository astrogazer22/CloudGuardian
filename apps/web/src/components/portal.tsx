'use client';

import { Cloud, Database, FileText, Key, Layers, LucideIcon, Server, Shield } from 'lucide-react';
import Link from 'next/link';

const ICONS: Record<string, LucideIcon> = { cloud: Cloud, key: Key, server: Server, layers: Layers, database: Database, shield: Shield };

export function CatalogTile({ item }: { item: any }) {
  const Icon = ICONS[item.icon] ?? FileText;
  return (
    <Link
      href={`/portal/catalog/${item.id}`}
      className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow dark:border-slate-800 dark:bg-slate-900"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block font-medium">{item.name}</span>
        <span className="line-clamp-2 text-sm text-slate-500">{item.description}</span>
      </span>
    </Link>
  );
}

export function friendlyStatus(category: string, name: string) {
  if (category === 'DONE') return { label: name, tone: 'green' as const };
  if (category === 'IN_PROGRESS') return { label: name, tone: 'indigo' as const };
  return { label: name, tone: 'slate' as const };
}
