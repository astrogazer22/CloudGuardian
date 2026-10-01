'use client';

import { useMemo, useState } from 'react';

export interface PieSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

function polar(cx: number, cy: number, r: number, angle: number) {
  const a = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, inner: number, start: number, end: number) {
  const large = end - start > 180 ? 1 : 0;
  const s = polar(cx, cy, r, end);
  const e = polar(cx, cy, r, start);
  const si = polar(cx, cy, inner, end);
  const ei = polar(cx, cy, inner, start);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y} L ${ei.x} ${ei.y} A ${inner} ${inner} 0 ${large} 1 ${si.x} ${si.y} Z`;
}

export function PieChart({
  slices,
  size = 220,
  activeKey,
  onSelect,
  centerLabel,
  centerValue,
}: {
  slices: PieSlice[];
  size?: number;
  activeKey?: string | null;
  onSelect?: (key: string | null) => void;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = Math.max(0, slices.reduce((s, x) => s + x.value, 0));
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  const inner = r * 0.62;

  const arcs = useMemo(() => {
    if (!total) return [];
    let angle = 0;
    return slices
      .filter((s) => s.value > 0)
      .map((s) => {
        const sweep = (s.value / total) * 360;
        const start = angle;
        const end = angle + sweep;
        angle = end;
        return { ...s, start, end: end === 360 ? 359.999 : end };
      });
  }, [slices, total]);

  const highlighted = hover ?? activeKey ?? null;
  const focus = slices.find((s) => s.key === highlighted);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
        role="img"
        aria-label={centerLabel ?? 'Pie chart'}
      >
        {total === 0 && <circle cx={cx} cy={cy} r={r} className="fill-slate-100 dark:fill-slate-800" />}
        {arcs.map((a) => (
          <path
            key={a.key}
            d={arcPath(cx, cy, r, inner, a.start, a.end)}
            fill={a.color}
            className="cursor-pointer transition-opacity"
            opacity={highlighted && highlighted !== a.key ? 0.35 : 1}
            onMouseEnter={() => setHover(a.key)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelect?.(activeKey === a.key ? null : a.key)}
          >
            <title>
              {a.label}: {a.value}
            </title>
          </path>
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-slate-900 text-[22px] font-semibold dark:fill-slate-100">
          {focus ? focus.value : (centerValue ?? total)}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-slate-500 text-[11px]">
          {focus ? focus.label : (centerLabel ?? 'Total')}
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {slices.map((s) => {
          const pct = total ? Math.round((s.value / total) * 1000) / 10 : 0;
          const selected = activeKey === s.key;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => onSelect?.(selected ? null : s.key)}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
                className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left ${selected ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
              >
                <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
                <span className="flex-1 text-slate-600 dark:text-slate-300">{s.label}</span>
                <span className="tabular-nums font-medium">{s.value}</span>
                <span className="w-12 text-right text-xs text-slate-400">{pct}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
