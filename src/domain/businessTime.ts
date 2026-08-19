/**
 * The business-hours clock.
 *
 * A wall-clock timer runs 24 hours a day; an SLA does not. These two
 * functions are the whole difference, and everything else in the app —
 * countdowns, notifications, widgets — is derived from them:
 *
 *   addBusinessTime()      how much wall-clock time a budget really buys
 *   businessTimeBetween()  how much of the budget an interval consumed
 *
 * No dependencies: time-zone arithmetic goes through Intl, which Hermes
 * provides on iOS and Node provides in tests.
 */

import type { BusinessCalendar, TimeWindow, Weekday } from './types';

const MINUTE = 60_000;

/** Roughly ten years of day-steps; a calendar with no working days would otherwise spin forever. */
const DAY_GUARD = 3650;

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  /** Minutes from local midnight. */
  minutes: number;
  second: number;
  weekday: Weekday;
};

const WEEKDAY_INDEX: Record<string, Weekday> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function zonedParts(at: Date, timeZone: string): ZonedParts {
  const fields: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(at)) {
    fields[part.type] = part.value;
  }
  // Some ICU builds render local midnight as hour 24 rather than 0.
  const hour = Number(fields.hour) % 24;
  return {
    year: Number(fields.year),
    month: Number(fields.month),
    day: Number(fields.day),
    minutes: hour * 60 + Number(fields.minute),
    second: Number(fields.second),
    weekday: WEEKDAY_INDEX[fields.weekday],
  };
}

/** Offset of `timeZone` at `at`, as local-minus-UTC in milliseconds. */
function offsetAt(at: Date, timeZone: string): number {
  const parts = zonedParts(at, timeZone);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    Math.floor(parts.minutes / 60),
    parts.minutes % 60,
    parts.second,
  );
  // Both sides truncated to whole seconds so sub-second noise cancels out.
  return asIfUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * Turn a local date-and-time into an absolute instant.
 *
 * `day` and `minutes` may overflow their natural range (day 32, or 1500
 * minutes), which is what lets callers step forward without normalising
 * dates themselves.
 */
function zonedToInstant(
  year: number,
  month: number,
  day: number,
  minutes: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day) + minutes * MINUTE;
  const firstGuess = naive - offsetAt(new Date(naive), timeZone);
  // A second pass settles the DST edges, where the offset at the guessed
  // instant differs from the offset we started from.
  const settled = naive - offsetAt(new Date(firstGuess), timeZone);
  return new Date(settled);
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Working windows on the local day `parts` falls in, earliest first. */
function windowsOn(calendar: BusinessCalendar, parts: ZonedParts): TimeWindow[] {
  const key = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  if (calendar.holidays.includes(key)) {
    return [];
  }
  const windows = calendar.windows[parts.weekday] ?? [];
  return [...windows].sort((a, b) => a.start - b.start);
}

/**
 * The instant reached by spending `minutes` of *business* time from `start`.
 *
 * A budget of 0 returns the next instant that is inside business hours,
 * so a ticket filed on a Saturday is already anchored to Monday morning.
 */
export function addBusinessTime(
  start: Date,
  minutes: number,
  calendar: BusinessCalendar,
): Date {
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new RangeError(`addBusinessTime: minutes must be >= 0, got ${minutes}`);
  }
  if (calendar.alwaysOn) {
    return new Date(start.getTime() + minutes * MINUTE);
  }

  let remaining = minutes;
  let cursor = start;

  for (let step = 0; step < DAY_GUARD; step++) {
    const parts = zonedParts(cursor, calendar.timeZone);

    for (const window of windowsOn(calendar, parts)) {
      const opens = zonedToInstant(parts.year, parts.month, parts.day, window.start, calendar.timeZone);
      const closes = zonedToInstant(parts.year, parts.month, parts.day, window.end, calendar.timeZone);
      const from = cursor > opens ? cursor : opens;
      if (from >= closes) {
        continue;
      }
      const available = (closes.getTime() - from.getTime()) / MINUTE;
      if (available >= remaining) {
        return new Date(from.getTime() + remaining * MINUTE);
      }
      remaining -= available;
    }

    cursor = zonedToInstant(parts.year, parts.month, parts.day + 1, 0, calendar.timeZone);
  }

  throw new Error(
    'addBusinessTime: no working time found within ten years — does this calendar have any open windows?',
  );
}

/** Business minutes contained in `[from, to)`. Zero when the range is empty or inverted. */
export function businessTimeBetween(
  from: Date,
  to: Date,
  calendar: BusinessCalendar,
): number {
  if (to <= from) {
    return 0;
  }
  if (calendar.alwaysOn) {
    return (to.getTime() - from.getTime()) / MINUTE;
  }

  let total = 0;
  let cursor = from;

  for (let step = 0; step < DAY_GUARD; step++) {
    const parts = zonedParts(cursor, calendar.timeZone);

    for (const window of windowsOn(calendar, parts)) {
      const opens = zonedToInstant(parts.year, parts.month, parts.day, window.start, calendar.timeZone);
      const closes = zonedToInstant(parts.year, parts.month, parts.day, window.end, calendar.timeZone);
      const sliceStart = cursor > opens ? cursor : opens;
      const sliceEnd = to < closes ? to : closes;
      if (sliceEnd > sliceStart) {
        total += (sliceEnd.getTime() - sliceStart.getTime()) / MINUTE;
      }
    }

    const nextMidnight = zonedToInstant(parts.year, parts.month, parts.day + 1, 0, calendar.timeZone);
    if (nextMidnight >= to) {
      break;
    }
    cursor = nextMidnight;
  }

  return total;
}

/** Whether `at` falls inside a working window. */
export function isWithinBusinessHours(at: Date, calendar: BusinessCalendar): boolean {
  if (calendar.alwaysOn) {
    return true;
  }
  const parts = zonedParts(at, calendar.timeZone);
  return windowsOn(calendar, parts).some(window => {
    const opens = zonedToInstant(parts.year, parts.month, parts.day, window.start, calendar.timeZone);
    const closes = zonedToInstant(parts.year, parts.month, parts.day, window.end, calendar.timeZone);
    return at >= opens && at < closes;
  });
}

/** The next instant the clock is running — `at` itself if it already is. */
export function nextBusinessOpening(at: Date, calendar: BusinessCalendar): Date {
  return addBusinessTime(at, 0, calendar);
}
