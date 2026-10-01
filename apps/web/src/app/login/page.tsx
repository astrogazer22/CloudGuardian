'use client';

import { Shield } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { Button, ErrorText, Field, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const DEMO = [
  ['Admin', 'admin@cloudguardian.local', 'Admin@123'],
  ['Agent', 'alice@cloudguardian.local', 'Password@123'],
  ['Approver', 'erin@cloudguardian.local', 'Password@123'],
  ['Requester', 'grace@cloudguardian.local', 'Password@123'],
];

function LoginForm() {
  const { login, user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const next = params.get('next') || '/dashboard';

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      router.replace(next);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-indigo-50 p-4 dark:from-slate-950 dark:to-indigo-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="flex size-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg">
            <Shield className="size-6" />
          </span>
          <h1 className="text-xl font-semibold">Sign in to CloudGuardian</h1>
          <p className="text-sm text-slate-500">Tickets, workflows &amp; AWS inventory</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <Field label="Email">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <ErrorText error={error} />
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Sign in
          </Button>
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="mb-2 text-xs text-slate-500">Demo accounts</p>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO.map(([label, e, p]) => (
                <button
                  type="button"
                  key={e}
                  onClick={() => {
                    setEmail(e);
                    setPassword(p);
                  }}
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
