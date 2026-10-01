'use client';

import clsx from 'clsx';
import { LifeBuoy, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, Suspense, useEffect } from 'react';
import { NotificationsBell } from '@/components/app-shell';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const NAV = [
  { href: '/portal', label: 'Home' },
  { href: '/portal/kb', label: 'Knowledge base' },
  { href: '/portal/catalog', label: 'Request something' },
  { href: '/portal/requests', label: 'My requests' },
];

export default function PortalLayout({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  if (loading || !user) return <Spinner className="h-screen" />;

  const active = (href: string) => (href === '/portal' ? pathname === href : pathname.startsWith(href));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/portal" className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-indigo-600 text-white"><LifeBuoy className="size-4" /></span>
            Help Center
          </Link>
          <nav className="hidden gap-1 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={clsx('rounded-md px-3 py-1.5 text-sm', active(n.href) ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800')}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user.role !== 'REQUESTER' && (
              <Link href="/dashboard" className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                Agent workspace
              </Link>
            )}
            <NotificationsBell />
            <span className="hidden text-sm text-slate-600 sm:block dark:text-slate-300">{user.name}</span>
            <button onClick={logout} title="Sign out" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={clsx('whitespace-nowrap rounded-md px-3 py-1 text-sm', active(n.href) ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600')}>
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <Suspense fallback={<Spinner />}>{children}</Suspense>
      </main>
    </div>
  );
}
