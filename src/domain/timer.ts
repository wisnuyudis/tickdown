/**
 * Timer lifecycle.
 *
 * The invariant that keeps the rest of the app simple: while a timer is
 * running, `deadlineAt` is a fixed wall-clock instant. Nothing has to tick it
 * forward, so a countdown is plain subtraction and a notification is a plain
 * scheduled date. Pausing converts that instant back into a business-minute
 * budget; resuming converts the budget into a fresh instant.
 */

import { addBusinessTime, businessTimeBetween } from './businessTime';
import type { BusinessCalendar, Policy, SlaTimer } from './types';

const MINUTE = 60_000;

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function startTimer(input: {
  title: string;
  ref: string;
  policy: Policy;
  calendar: BusinessCalendar;
  startedAt: Date;
}): SlaTimer {
  const deadline = addBusinessTime(input.startedAt, input.policy.durationMinutes, input.calendar);
  return {
    id: newId(),
    title: input.title.trim(),
    ref: input.ref.trim(),
    policyId: input.policy.id,
    startedAt: input.startedAt.toISOString(),
    deadlineAt: deadline.toISOString(),
    remainingAtPause: null,
    pauses: [],
    status: 'running',
    closedAt: null,
  };
}

export function pauseTimer(timer: SlaTimer, calendar: BusinessCalendar, now: Date): SlaTimer {
  if (timer.status !== 'running') {
    return timer;
  }
  return {
    ...timer,
    status: 'paused',
    remainingAtPause: businessTimeBetween(now, new Date(timer.deadlineAt), calendar),
    pauses: [...timer.pauses, { from: now.toISOString(), to: null }],
  };
}

export function resumeTimer(timer: SlaTimer, calendar: BusinessCalendar, now: Date): SlaTimer {
  if (timer.status !== 'paused') {
    return timer;
  }
  const budget = timer.remainingAtPause ?? 0;
  const pauses = timer.pauses.map((pause, index) =>
    index === timer.pauses.length - 1 && pause.to === null
      ? { ...pause, to: now.toISOString() }
      : pause,
  );
  return {
    ...timer,
    status: 'running',
    deadlineAt: addBusinessTime(now, budget, calendar).toISOString(),
    remainingAtPause: null,
    pauses,
  };
}

export function resolveTimer(timer: SlaTimer, now: Date): SlaTimer {
  if (timer.status === 'resolved') {
    return timer;
  }
  const pauses = timer.pauses.map((pause, index) =>
    index === timer.pauses.length - 1 && pause.to === null
      ? { ...pause, to: now.toISOString() }
      : pause,
  );
  return { ...timer, status: 'resolved', closedAt: now.toISOString(), pauses };
}

export function reopenTimer(timer: SlaTimer, calendar: BusinessCalendar, now: Date): SlaTimer {
  if (timer.status !== 'resolved') {
    return timer;
  }
  // Give back whatever budget was left when it was closed.
  const closedAt = timer.closedAt ? new Date(timer.closedAt) : now;
  const budget = businessTimeBetween(closedAt, new Date(timer.deadlineAt), calendar);
  return {
    ...timer,
    status: 'running',
    closedAt: null,
    deadlineAt: addBusinessTime(now, budget, calendar).toISOString(),
    remainingAtPause: null,
  };
}

/** Business minutes still on the clock. Zero once the budget is spent. */
export function remainingBusinessMinutes(
  timer: SlaTimer,
  calendar: BusinessCalendar,
  now: Date,
): number {
  if (timer.status === 'paused') {
    return Math.max(0, timer.remainingAtPause ?? 0);
  }
  const reference = timer.status === 'resolved' && timer.closedAt ? new Date(timer.closedAt) : now;
  return businessTimeBetween(reference, new Date(timer.deadlineAt), calendar);
}

/** The moment a breach is judged against: when it was closed, or right now. */
function judgedAt(timer: SlaTimer, now: Date): Date {
  return timer.status === 'resolved' && timer.closedAt ? new Date(timer.closedAt) : now;
}

export function didBreach(timer: SlaTimer, now: Date): boolean {
  // A held timer keeps a frozen deadline, so the wall clock says nothing about
  // it. What is left of the budget does.
  if (timer.status === 'paused') {
    return (timer.remainingAtPause ?? 0) <= 0;
  }
  return judgedAt(timer, now).getTime() > new Date(timer.deadlineAt).getTime();
}

/** Milliseconds until the deadline. Zero once it has passed — see overdueMillis. */
export function millisToDeadline(timer: SlaTimer, now: Date): number {
  return Math.max(0, new Date(timer.deadlineAt).getTime() - judgedAt(timer, now).getTime());
}

/**
 * Working time spent past the deadline, in milliseconds, counting up.
 *
 * Once the budget is gone the useful number is no longer "how long is left"
 * but "how late is this", so the display flips rather than going negative.
 *
 * Lateness is measured on the same business clock as the budget: an SLA that
 * expires on Friday evening is not eight hours later by Saturday morning, it
 * is late by however much of Monday has been burned. A 24/7 policy makes this
 * identical to wall-clock time. A held timer accrues nothing.
 */
export function overdueMillis(timer: SlaTimer, calendar: BusinessCalendar, now: Date): number {
  if (timer.status === 'paused') {
    return 0;
  }
  const deadline = new Date(timer.deadlineAt);
  const at = judgedAt(timer, now);
  if (at <= deadline) {
    return 0;
  }
  return businessTimeBetween(deadline, at, calendar) * MINUTE;
}

/** Share of the budget consumed, clamped to 0..1. */
export function consumedFraction(
  timer: SlaTimer,
  policy: Policy,
  calendar: BusinessCalendar,
  now: Date,
): number {
  if (policy.durationMinutes <= 0) {
    return 1;
  }
  const left = remainingBusinessMinutes(timer, calendar, now);
  const consumed = policy.durationMinutes - left;
  return Math.min(1, Math.max(0, consumed / policy.durationMinutes));
}

/**
 * How close to the deadline a Live Activity is worth putting on the Lock Screen.
 *
 * iOS ends a Live Activity after about eight hours, so anything started earlier
 * would simply die before it mattered. Gating on the time left rather than on
 * the policy means a 24/7 P1 qualifies the moment it is created, while a
 * multi-day policy picks up its activity in the final stretch — which is the
 * part anyone actually watches.
 */
export const LIVE_ACTIVITY_WINDOW_MS = 8 * 60 * 60 * 1000;

/** Whether this timer should currently own a Live Activity. */
export function wantsLiveActivity(
  timer: SlaTimer,
  now: Date,
  windowMillis: number = LIVE_ACTIVITY_WINDOW_MS,
): boolean {
  if (timer.status !== 'running') {
    return false;
  }
  return new Date(timer.deadlineAt).getTime() - now.getTime() <= windowMillis;
}

export type Urgency = 'calm' | 'warning' | 'critical' | 'breached';

export function urgencyOf(
  timer: SlaTimer,
  policy: Policy,
  calendar: BusinessCalendar,
  now: Date,
): Urgency {
  if (didBreach(timer, now)) {
    return 'breached';
  }
  const consumed = consumedFraction(timer, policy, calendar, now);
  if (consumed >= 0.9) {
    return 'critical';
  }
  if (consumed >= 0.75) {
    return 'warning';
  }
  return 'calm';
}

export type AlertKind = 'half' | 'stretch' | 'final' | 'breach';

export type TimerAlert = {
  /** Stable across reschedules, so the pending set can be reconciled. */
  id: string;
  kind: AlertKind;
  fireAt: Date;
  title: string;
  body: string;
};

const FINAL_WARNING_MINUTES = 15;

/**
 * The moments worth interrupting someone for.
 *
 * Each one is an absolute instant derived from the business clock, which is
 * what lets them be handed to iOS as plain scheduled dates: no background
 * work, no server, and they still fire when the app has not been opened for
 * days. Thresholds are spent budget, so they land inside working hours.
 */
export function alertsFor(
  timer: SlaTimer,
  policy: Policy,
  calendar: BusinessCalendar,
  now: Date = new Date(),
): TimerAlert[] {
  if (timer.status !== 'running') {
    return [];
  }

  const startedAt = new Date(timer.startedAt);
  const deadline = new Date(timer.deadlineAt);
  const budget = policy.durationMinutes;
  const label = timer.ref ? `${timer.ref} · ${timer.title}` : timer.title;

  const spent = (share: number) => addBusinessTime(startedAt, budget * share, calendar);

  const candidates: Array<{ kind: AlertKind; fireAt: Date; title: string; body: string }> = [
    {
      kind: 'half',
      fireAt: spent(0.5),
      title: label,
      body: `Half the SLA is gone — ${formatMinutes(budget / 2)} of working time left.`,
    },
    {
      kind: 'stretch',
      fireAt: spent(0.9),
      title: label,
      body: `90% spent — ${formatMinutes(budget * 0.1)} of working time left.`,
    },
    {
      kind: 'final',
      fireAt: addBusinessTime(startedAt, Math.max(0, budget - FINAL_WARNING_MINUTES), calendar),
      title: label,
      body: `${FINAL_WARNING_MINUTES} minutes left before this breaches.`,
    },
    { kind: 'breach', fireAt: deadline, title: label, body: 'SLA breached — this is now overdue.' },
  ];

  const seen = new Set<number>();
  return candidates
    .filter(candidate => candidate.fireAt.getTime() > now.getTime())
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
    .filter(candidate => {
      // Short budgets collapse several thresholds onto the same minute; one
      // buzz is enough.
      const minute = Math.floor(candidate.fireAt.getTime() / 60_000);
      if (seen.has(minute)) {
        return false;
      }
      seen.add(minute);
      return true;
    })
    .map(candidate => ({ ...candidate, id: `${timer.id}:${candidate.kind}` }));
}

function formatMinutes(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) {
    return `${rest}m`;
  }
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export const MINUTE_MS = MINUTE;
