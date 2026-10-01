'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Bell,
  BookOpen,
  Building2,
  KeyRound,
  LayoutGrid,
  MessagesSquare,
  CheckSquare,
  ClipboardList,
  Cloud,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  PieChart,
  Moon,
  Network,
  Plus,
  ScrollText,
  Search,
  Server,
  Shield,
  Sun,
  Timer,
  UserCog,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanize, timeAgo } from '@/lib/format';
import { CommandPalette } from './command-palette';
import { Button } from './ui';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  permission?: string;
  badge?: number;
}

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('cg_theme', next ? 'dark' : 'light');
    setDark(next);
  };
  return { dark, toggle };
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout, can } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const { dark, toggle } = useTheme();

  const { data: approvals } = useQuery({
    queryKey: ['approvals'],
    queryFn: () => api<any[]>('/approvals'),
    enabled: can('approvals:decide'),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setMobileNav(false), [pathname]);

  const sections: { title?: string; items: NavItem[] }[] = [
    {
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="size-4" /> },
        { href: '/tickets', label: 'Tickets', icon: <ClipboardList className="size-4" />, permission: 'tickets:read' },
        {
          href: '/approvals',
          label: 'Approvals',
          icon: <CheckSquare className="size-4" />,
          permission: 'approvals:decide',
          badge: approvals?.length,
        },
        { href: '/knowledge', label: 'Knowledge base', icon: <BookOpen className="size-4" />, permission: 'kb:read' },
        { href: '/reports', label: 'Reports', icon: <PieChart className="size-4" />, permission: 'reports:read' },
        { href: '/portal', label: 'Self-service portal', icon: <LayoutGrid className="size-4" />, permission: 'tickets:create' },
      ],
    },
    {
      title: 'Inventory',
      items: [
        { href: '/inventory?type=EC2_INSTANCE', label: 'Servers', icon: <Server className="size-4" />, permission: 'inventory:read' },
        { href: '/inventory?type=LOAD_BALANCER', label: 'Load Balancers', icon: <Network className="size-4" />, permission: 'inventory:read' },
        { href: '/inventory?type=IAM_USER', label: 'IAM users', icon: <Users className="size-4" />, permission: 'inventory:read' },
        { href: '/inventory/accounts', label: 'AWS Accounts', icon: <Cloud className="size-4" />, permission: 'inventory:read' },
      ],
    },
    {
      title: 'CRM',
      items: [{ href: '/customers', label: 'Customers', icon: <Building2 className="size-4" />, permission: 'crm:read' }],
    },
    {
      title: 'Admin',
      items: [
        { href: '/admin/users', label: 'Users', icon: <UserCog className="size-4" />, permission: 'users:manage' },
        { href: '/admin/teams', label: 'Teams', icon: <Users className="size-4" />, permission: 'users:manage' },
        { href: '/admin/roles', label: 'Roles & permissions', icon: <KeyRound className="size-4" />, permission: 'roles:manage' },
        { href: '/admin/workflows', label: 'Workflows', icon: <GitBranch className="size-4" />, permission: 'settings:manage' },
        { href: '/admin/sla', label: 'SLA & Escalation', icon: <Timer className="size-4" />, permission: 'settings:manage' },
        { href: '/admin/catalog', label: 'Service catalog', icon: <LayoutGrid className="size-4" />, permission: 'catalog:manage' },
        { href: '/admin/integrations', label: 'Slack & Teams', icon: <MessagesSquare className="size-4" />, permission: 'integrations:manage' },
        { href: '/admin/audit', label: 'Audit Log', icon: <ScrollText className="size-4" />, permission: 'audit:read' },
      ],
    },
  ];

  const isActive = (href: string) => {
    const [path, query] = href.split('?');
    if (path === '/inventory') {
      const type = new URLSearchParams(query).get('type');
      const current = searchParams.get('type') ?? 'EC2_INSTANCE';
      return pathname === '/inventory' && (current === type || (type === 'LOAD_BALANCER' && current === 'TARGET_GROUP'));
    }
    return pathname === path || pathname.startsWith(path + '/');
  };

  const nav = (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-4">
      <Link href="/dashboard" className="flex items-center gap-2 px-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-indigo-600 text-white">
          <Shield className="size-4" />
        </span>
        <span className="font-semibold tracking-tight">CloudGuardian</span>
      </Link>
      {sections.map((s, i) => {
        const items = s.items.filter((it) => !it.permission || can(it.permission));
        if (!items.length) return null;
        return (
          <div key={i}>
            {s.title && <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{s.title}</div>}
            <ul className="space-y-0.5">
              {items.map((it) => (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    className={clsx(
                      'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm',
                      isActive(it.href)
                        ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
                    )}
                  >
                    {it.icon}
                    <span className="flex-1">{it.label}</span>
                    {!!it.badge && <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">{it.badge}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">{nav}</aside>
      {mobileNav && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setMobileNav(false)}>
          <aside className="h-full w-64 bg-white dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
          <button className="rounded p-1.5 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800" onClick={() => setMobileNav(true)}>
            <Menu className="size-5" />
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 max-w-md flex-1 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="rounded border border-slate-200 bg-white px-1.5 text-[10px] dark:border-slate-600 dark:bg-slate-900">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            {can('tickets:create') && (
              <Button variant="primary" size="sm" onClick={() => router.push('/tickets/new')}>
                <Plus className="size-3.5" /> New ticket
              </Button>
            )}
            <button onClick={toggle} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Toggle theme">
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <NotificationsBell />
            <UserMenu name={user?.name ?? ''} role={user?.roleName ?? ''} email={user?.email ?? ''} onLogout={logout} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] p-4 sm:p-6">{children}</div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOutside();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onOutside]);
  return ref;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const router = useRouter();
  const ref = useClickOutside(() => setOpen(false));
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: any[]; unread: number }>('/notifications'),
    refetchInterval: 30_000,
  });
  const readAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const open1 = async (n: any) => {
    setOpen(false);
    if (!n.read) api(`/notifications/${n.id}/read`, { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
    if (n.link) router.push(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
        <Bell className="size-4" />
        {!!data?.unread && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
            <span className="text-sm font-semibold">Notifications</span>
            <button className="text-xs text-indigo-600 hover:underline" onClick={() => readAll.mutate()}>
              Mark all read
            </button>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {!data?.items.length && <li className="px-3 py-6 text-center text-sm text-slate-500">You&apos;re all caught up</li>}
            {data?.items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => open1(n)}
                  className={clsx(
                    'block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800',
                    !n.read && 'bg-indigo-50/50 dark:bg-indigo-950/30',
                  )}
                >
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.body && <div className="truncate text-xs text-slate-500">{n.body}</div>}
                  <div className="mt-0.5 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function UserMenu({ name, role, email, onLogout }: { name: string; role: string; email: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="ml-1 flex size-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <div className="text-sm font-medium">{name}</div>
            <div className="truncate text-xs text-slate-500">{email}</div>
            <div className="mt-1 text-[11px] font-medium uppercase text-indigo-600">{role}</div>
          </div>
          <Link href="/settings" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
            Account settings
          </Link>
          <button onClick={onLogout} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-slate-50 dark:hover:bg-slate-800">
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
