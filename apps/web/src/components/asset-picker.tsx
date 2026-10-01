'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AssetStateBadge, ASSET_TYPE_LABEL } from './badges';
import { Input } from './ui';

export function AssetPicker({ onPick, exclude = [] }: { onPick: (asset: any) => void; exclude?: string[] }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data } = useQuery({
    queryKey: ['asset-picker', debounced],
    queryFn: () => api('/assets', { query: { q: debounced, pageSize: 10 } }),
    enabled: debounced.length >= 2,
  });
  const items = (data?.items ?? []).filter((a: any) => !exclude.includes(a.id));
  return (
    <div className="space-y-1">
      <Input placeholder="Search servers, load balancers, target groups…" value={q} onChange={(e) => setQ(e.target.value)} />
      {debounced.length >= 2 && (
        <ul className="max-h-56 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
          {!items.length && <li className="px-3 py-2 text-xs text-slate-500">No matching assets</li>}
          {items.map((a: any) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(a);
                  setQ('');
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="flex-1 truncate">{a.name}</span>
                <span className="text-xs text-slate-400">{ASSET_TYPE_LABEL[a.type as keyof typeof ASSET_TYPE_LABEL]} · {a.region}</span>
                <AssetStateBadge state={a.state} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
