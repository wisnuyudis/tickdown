const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A span of wall-clock time, e.g. "2d 4h", "3h 12m", "48s".
 *
 * Always unsigned: a timer that has run out counts its lateness upward rather
 * than showing a negative number, so the caller supplies the label.
 */
export function formatDuration(millis: number): string {
  const value = Math.max(0, millis);
  if (value >= DAY) {
    return `${Math.floor(value / DAY)}d ${Math.floor((value % DAY) / HOUR)}h`;
  }
  if (value >= HOUR) {
    return `${Math.floor(value / HOUR)}h ${Math.floor((value % HOUR) / MINUTE)}m`;
  }
  if (value >= MINUTE) {
    return `${Math.floor(value / MINUTE)}m ${Math.floor((value % MINUTE) / 1000)}s`;
  }
  return `${Math.floor(value / 1000)}s`;
}

/** A budget of business minutes, e.g. "6h 20m" or "45m". */
export function formatBudget(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) {
    return `${rest}m`;
  }
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Minutes from midnight as "09:00". */
export function formatClock(minutesFromMidnight: number): string {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parts(at: Date, timeZone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).format(at);
}

/** "Mon 16:00" for anything within the week, "24 Aug 16:00" beyond it. */
export function formatDeadline(at: Date, timeZone: string, now: Date): string {
  const withinWeek = Math.abs(at.getTime() - now.getTime()) < 6 * DAY;
  return withinWeek
    ? parts(at, timeZone, { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    : parts(at, timeZone, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "21 Aug 2026, 16:00" — used where the exact moment matters. */
export function formatFull(at: Date, timeZone: string): string {
  return parts(at, timeZone, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Local YYYY-MM-DD in the given zone — the format holidays are stored in. */
export function toDateKey(at: Date, timeZone: string): string {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  return formatted;
}

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
  );
}
