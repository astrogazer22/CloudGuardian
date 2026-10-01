export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type WeeklyHours = Record<Weekday, [string, string][]>;

export interface CalendarLike {
  timezone: string;
  hours: unknown;
  holidays: string[];
}

const HHMM = /^([01]\d|2[0-4]):([0-5]\d)$/;

export function validateWeeklyHours(hours: unknown): string | null {
  if (!hours || typeof hours !== 'object') return 'hours must be an object keyed by weekday';
  for (const day of WEEKDAYS) {
    const ranges = (hours as Record<string, unknown>)[day] ?? [];
    if (!Array.isArray(ranges)) return `${day} must be a list of [start, end] ranges`;
    for (const r of ranges) {
      if (!Array.isArray(r) || r.length !== 2 || !HHMM.test(r[0]) || !HHMM.test(r[1]) || r[0] >= r[1]) {
        return `${day} has an invalid range ${JSON.stringify(r)} — use ["09:00","18:00"]`;
      }
    }
  }
  return null;
}

export function validateTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

function localParts(ms: number, tz: string) {
  const p = Object.fromEntries(formatter(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Offset (local − UTC) in ms for the given instant in `tz`. */
function offsetMs(ms: number, tz: string) {
  const l = localParts(ms, tz);
  return Date.UTC(l.y, l.m - 1, l.d, l.h, l.mi, l.s) - Math.floor(ms / 1000) * 1000;
}

/** UTC instant for a wall-clock time in `tz` (handles DST by re-checking the offset). */
function zonedToUtc(y: number, m: number, d: number, hhmm: string, tz: string) {
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off = offsetMs(guess, tz);
  let t = guess - off;
  const off2 = offsetMs(t, tz);
  if (off2 !== off) t = guess - off2;
  return t;
}

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function workingIntervals(y: number, m: number, d: number, cal: CalendarLike): [number, number][] {
  if (cal.holidays.includes(ymd(y, m, d))) return [];
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const ranges = ((cal.hours as WeeklyHours)[weekday] ?? []) as [string, string][];
  return ranges.map(([s, e]) => [zonedToUtc(y, m, d, s, cal.timezone), zonedToUtc(y, m, d, e, cal.timezone)]);
}

function hasAnyHours(cal: CalendarLike) {
  return WEEKDAYS.some((d) => ((cal.hours as WeeklyHours)[d] ?? []).length > 0);
}

function* days(fromMs: number, tz: string, max = 400) {
  const l = localParts(fromMs, tz);
  for (let i = 0; i < max; i++) {
    const dt = new Date(Date.UTC(l.y, l.m - 1, l.d + i));
    yield [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()] as const;
  }
}

/** Adds `ms` of working time to `from` according to the calendar. */
export function addBusinessTime(from: Date, ms: number, cal: CalendarLike): Date {
  if (!hasAnyHours(cal)) return new Date(from.getTime() + ms);
  let remaining = ms;
  const start = from.getTime();
  for (const [y, m, d] of days(start, cal.timezone)) {
    for (const [s, e] of workingIntervals(y, m, d, cal)) {
      const begin = Math.max(s, start);
      if (e <= begin) continue;
      const avail = e - begin;
      if (avail >= remaining) return new Date(begin + remaining);
      remaining -= avail;
    }
  }
  return new Date(start + ms);
}

/** Working time between two instants (0 if `to` <= `from`). */
export function businessTimeBetween(from: Date, to: Date, cal: CalendarLike): number {
  const a = from.getTime();
  const b = to.getTime();
  if (b <= a) return 0;
  if (!hasAnyHours(cal)) return b - a;
  let total = 0;
  for (const [y, m, d] of days(a, cal.timezone)) {
    const intervals = workingIntervals(y, m, d, cal);
    for (const [s, e] of intervals) total += Math.max(0, Math.min(e, b) - Math.max(s, a));
    if (Date.UTC(y, m - 1, d) > b + 86_400_000) break;
  }
  return total;
}
