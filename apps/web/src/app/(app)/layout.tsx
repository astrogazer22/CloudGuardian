'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, Suspense, useEffect } from 'react';
import { AppShell } from '@/components/app-shell';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function AuthedLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isRequester = user?.role === 'REQUESTER';
  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (isRequester) router.replace('/portal');
  }, [loading, user, isRequester, router, pathname]);

  if (loading || !user || isRequester) return <Spinner className="h-screen" />;
  return (
    <Suspense fallback={<Spinner className="h-screen" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
