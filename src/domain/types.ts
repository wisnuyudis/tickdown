/**
 * Core domain types for Tickdown.
 *
 * Everything here is plain data so it can be persisted as JSON and
 * exercised by tests without touching React Native.
 */

/** 0 = Sunday ... 6 = Saturday, matching `Date.getDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A stretch of working time, in minutes from local midnight. `end` is exclusive. */
export type TimeWindow = {
  start: number;
  end: number;
};

export type BusinessCalendar = {
  id: string;
  name: string;
  /** IANA zone, e.g. "Asia/Jakarta". All windows are interpreted in it. */
  timeZone: string;
  /** Working windows per weekday. An empty array means the day is off. */
  windows: Record<Weekday, TimeWindow[]>;
  /** Non-working local dates, formatted YYYY-MM-DD. */
  holidays: string[];
  /** When true the clock never stops — for 24/7 policies. */
  alwaysOn: boolean;
};

export type Policy = {
  id: string;
  name: string;
  /** Budget in *business* minutes, not wall-clock minutes. */
  durationMinutes: number;
  calendarId: string;
  color: string;
};

/**
 * A breach is never stored — it is derived by comparing the deadline with
 * `now` (or with `closedAt` once the timer is done), so it can never go stale.
 */
export type TimerStatus = 'running' | 'paused' | 'resolved';

export type Pause = {
  from: string;
  /** Null while the pause is still open. */
  to: string | null;
};

export type SlaTimer = {
  id: string;
  title: string;
  /** Free-form external reference, e.g. "INC-1234". */
  ref: string;
  policyId: string;
  startedAt: string;
  /**
   * Absolute wall-clock instant the SLA expires. Recomputed whenever the
   * timer starts or resumes; stable while running, which is what lets
   * countdowns, notifications and widgets work without any background work.
   */
  deadlineAt: string;
  /** Business minutes left at the moment of the last pause. */
  remainingAtPause: number | null;
  pauses: Pause[];
  status: TimerStatus;
  closedAt: string | null;
};
