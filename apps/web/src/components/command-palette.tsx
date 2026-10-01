'use client';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { BookOpen, Building2, LayoutDashboard, PieChart, Plus, Search, Server, Ticket, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

interface Item {
  key: string;
  label: ReactNode;
  hint?: string;
  icon: ReactNode;
  href: string;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
    }
  }, [open]);

  const { data } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api('/search', { query: { q: debounced } }),
    enabled: open && debounced.trim().length >= 2,
  });

  const items: Item[] = useMemo(() => {
    const quick: Item[] = [
      { key: 'new', label: 'Create ticket', icon: <Plus className="size-4" />, href: '/tickets/new' },
      { key: 'dash', label: 'Go to dashboard', icon: <LayoutDashboard className="size-4" />, href: '/dashboard' },
      { key: 'mine', label: 'My open tickets', icon: <Ticket className="size-4" />, href: '/tickets?view=mine' },
      { key: 'inv', label: 'Server inventory', icon: <Server className="size-4" />, href: '/inventory' },
      { key: 'rep', label: 'Reports', icon: <PieChart className="size-4" />, href: '/reports' },
    ];
    if (debounced.trim().length < 2 || !data) {
      return quick.filter((i) => !q || String(i.label).toLowerCase().includes(q.toLowerCase()));
    }
    return [
      ...data.tickets.map((t: any) => ({
        key: `t${t.id}`,
        label: `#${t.number} ${t.title}`,
        hint: `${t.priority} · ${t.status}`,
        icon: <Ticket className="size-4" />,
        href: `/tickets/${t.id}`,
      })),
      ...data.assets.map((a: any) => ({
        key: `a${a.id}`,
        label: a.name,
        hint: `${a.type.replace('_', ' ').toLowerCase()} · ${a.region} · ${a.state}`,
        icon: <Server className="size-4" />,
        href: `/inventory/${a.id}`,
      })),
      ...(data.articles ?? []).map((a: any) => ({
        key: `k${a.id}`,
        label: a.title,
        hint: 'Knowledge article',
        icon: <BookOpen className="size-4" />,
        href: `/knowledge/${a.id}`,
      })),
      ...data.organizations.map((o: any) => ({
        key: `o${o.id}`,
        label: o.name,
        hint: 'Organization',
        icon: <Building2 className="size-4" />,
        href: `/customers/${o.id}`,
      })),
      ...data.contacts.map((c: any) => ({
        key: `c${c.id}`,
        label: c.name,
        hint: c.email,
        icon: <User className="size-4" />,
        href: c.organizationId ? `/customers/${c.organizationId}` : '/customers?tab=contacts',
      })),
    ];
  }, [data, debounced, q]);

  useEffect(() => setActive(0), [items.length]);

  if (!open) return null;

  const go = (item?: Item) => {
    if (!item) return;
    onClose();
    router.push(item.href);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-800">
          <Search className="size-4 text-slate-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === 'Enter') go(items[active]);
            }}
            placeholder="Search tickets, servers, load balancers, customers…"
            className="h-12 flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="rounded border border-slate-200 px-1.5 text-[10px] text-slate-400 dark:border-slate-700">ESC</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">No results</li>}
          {items.map((item, i) => (
            <li key={item.key}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={clsx(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm',
                  i === active ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : '',
                )}
              >
                <span className="text-slate-400">{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.hint && <span className="truncate text-xs text-slate-400">{item.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
