export function humanize(value?: string | null) {
  if (!value) return '';
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatDate(value?: string | Date | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(ms: number) {
  const abs = Math.abs(ms);
  const m = Math.round(abs / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function timeAgo(value?: string | Date | null) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return 'just now';
  return `${formatDuration(diff)} ago`;
}

export function minutesLabel(mins: number) {
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) return `${+(mins / 60).toFixed(1)} h`;
  return `${+(mins / 1440).toFixed(1)} d`;
}
