/**
 * Calendar-date arithmetic on ISO `YYYY-MM-DD` strings.
 *
 * The intelligence layer never touches Date objects with time components:
 * everything is a user-local calendar date, computed here via UTC to avoid
 * DST edge cases. "Today" for a user is derived from their IANA timezone.
 */

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertISODate(iso: string): void {
  if (!ISO_RE.test(iso)) throw new Error(`Invalid ISO date: ${JSON.stringify(iso)}`);
}

function toUTC(iso: string): number {
  assertISODate(iso);
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

function fromUTC(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  return fromUTC(toUTC(iso) + days * 86_400_000);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

export function compareISO(a: string, b: string): number {
  assertISODate(a);
  assertISODate(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function firstOfMonth(iso: string): string {
  assertISODate(iso);
  return `${iso.slice(0, 7)}-01`;
}

export function firstOfNextMonth(iso: string): string {
  assertISODate(iso);
  const [y, m] = iso.split('-').map(Number);
  return m === 12 ? `${y! + 1}-01-01` : `${y}-${String(m! + 1).padStart(2, '0')}-01`;
}

/** Current calendar date in the given IANA timezone. */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now); // en-CA yields YYYY-MM-DD
}

export function formatShort(iso: string): string {
  assertISODate(iso);
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
