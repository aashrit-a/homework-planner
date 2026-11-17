/**
 * Date helpers. All due dates are stored as local `YYYY-MM-DD` keys so a
 * deadline never shifts because of time-zone conversion.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function todayKey(): string {
  return toKey(new Date());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addDaysKey(key: string, n: number): string {
  return toKey(addDays(fromKey(key), n));
}

/** Monday-based start of week. */
export function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (r.getDay() + 6) % 7; // 0 = Monday
  r.setDate(r.getDate() - day);
  return r;
}

export function weekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Whole days from `a` to `b` (b - a). */
export function diffDays(a: string, b: string): number {
  const ms = fromKey(b).getTime() - fromKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function isValidKey(key: unknown): key is string {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(fromKey(key).getTime());
}

export function isValidTime(t: unknown): t is string {
  return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

/** Deadline as a Date. Assignments with no time are due at the end of the day. */
export function dueDateTime(dueDate: string, dueTime: string | null): Date {
  const d = fromKey(dueDate);
  if (dueTime) {
    const [h, m] = dueTime.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  } else {
    d.setHours(23, 59, 59, 999);
  }
  return d;
}

export function formatTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${pad(m)} ${suffix}`;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const weekdayShort = (d: Date) => WEEKDAY_SHORT[d.getDay()];
export const weekdayLong = (d: Date) => WEEKDAY_LONG[d.getDay()];
export const monthShort = (d: Date) => MONTH_SHORT[d.getMonth()];
export const monthLong = (d: Date) => MONTH_LONG[d.getMonth()];

/** "Today", "Tomorrow", "Yesterday", "Wed", or "Nov 24". */
export function relativeDay(key: string, today = todayKey()): string {
  const diff = diffDays(today, key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = fromKey(key);
  if (diff > 1 && diff < 7) return weekdayLong(d);
  const sameYear = d.getFullYear() === fromKey(today).getFullYear();
  return `${monthShort(d)} ${d.getDate()}${sameYear ? '' : `, ${d.getFullYear()}`}`;
}

export function formatDue(dueDate: string, dueTime: string | null, today = todayKey()): string {
  const day = relativeDay(dueDate, today);
  return dueTime ? `${day}, ${formatTime(dueTime)}` : day;
}

export function formatLongDate(d: Date): string {
  return `${weekdayLong(d)}, ${monthLong(d)} ${d.getDate()}`;
}

export function formatRange(start: Date, end: Date): string {
  if (start.getMonth() === end.getMonth()) {
    return `${monthShort(start)} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${monthShort(start)} ${start.getDate()} – ${monthShort(end)} ${end.getDate()}, ${end.getFullYear()}`;
}

export function formatMinutes(min: number | null | undefined): string {
  if (!min) return '—';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Human "in 5h", "in 2 days", "3 days ago". */
export function timeUntil(target: Date, now = new Date()): string {
  const ms = target.getTime() - now.getTime();
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  let s: string;
  if (mins < 60) s = `${Math.max(mins, 1)}m`;
  else if (hours < 36) s = `${hours}h`;
  else s = `${days} day${days === 1 ? '' : 's'}`;
  return ms >= 0 ? `in ${s}` : `${s} ago`;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
