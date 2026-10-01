'use client';

import { useMutation } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Button, Card, ErrorText, Field, Input, KeyValue, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanize } from '@/lib/format';

export default function SettingsPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [done, setDone] = useState(false);
  const change = useMutation({
    mutationFn: () => api('/auth/change-password', { body: { currentPassword, newPassword } }),
    onSuccess: () => {
      setDone(true);
      setCurrent('');
      setNew('');
    },
  });

  return (
    <>
      <PageHeader title="Account settings" />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Profile">
          <KeyValue
            items={[
              ['Name', user?.name],
              ['Email', user?.email],
              ['Role', user?.roleName],
              ['Ticket visibility', humanize(user?.ticketScope)],
              ['Inventory environments', user?.inventoryEnvironments.length ? user.inventoryEnvironments.join(', ') : 'All'],
              ['Teams', user?.teams.map((t) => t.name).join(', ') || '—'],
              ['Permissions', <span className="text-xs text-slate-500">{user?.permissions.join(', ')}</span>],
            ]}
          />
        </Card>
        <Card title="Change password">
          <form
            className="space-y-3"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setDone(false);
              change.mutate();
            }}
          >
            <Field label="Current password">
              <Input type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
            </Field>
            <Field label="New password" hint="At least 8 characters">
              <Input type="password" minLength={8} value={newPassword} onChange={(e) => setNew(e.target.value)} required />
            </Field>
            <ErrorText error={change.error} />
            {done && <p className="text-sm text-emerald-600">Password updated.</p>}
            <Button type="submit" variant="primary" loading={change.isPending}>
              Update password
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
