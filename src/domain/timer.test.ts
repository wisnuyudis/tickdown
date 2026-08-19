import { defaultCalendars, defaultPolicies, OFFICE_CALENDAR_ID } from './defaults';
import {
  alertsFor,
  consumedFraction,
  didBreach,
  wantsLiveActivity,
  millisToDeadline,
  overdueMillis,
  pauseTimer,
  remainingBusinessMinutes,
  resolveTimer,
  resumeTimer,
  startTimer,
  urgencyOf,
} from './timer';
import type { BusinessCalendar, Policy } from './types';

const office: BusinessCalendar = {
  ...defaultCalendars().find(c => c.id === OFFICE_CALENDAR_ID)!,
  timeZone: 'Asia/Jakarta',
};

const p2: Policy = defaultPolicies().find(p => p.id === 'p2')!; // 8 business hours

const FRIDAY_9AM = new Date('2026-08-21T09:00:00+07:00');

function freshTimer(startedAt = FRIDAY_9AM) {
  return startTimer({ title: 'Payment gateway down', ref: 'INC-1234', policy: p2, calendar: office, startedAt });
}

describe('startTimer', () => {
  it('turns a business-minute budget into an absolute deadline', () => {
    const timer = freshTimer();
    expect(timer.deadlineAt).toBe('2026-08-21T10:00:00.000Z'); // Fri 17:00 WIB
    expect(timer.status).toBe('running');
  });

  it('pushes the deadline past the weekend when the budget cannot fit', () => {
    const timer = freshTimer(new Date('2026-08-21T16:00:00+07:00'));
    expect(timer.deadlineAt).toBe('2026-08-24T09:00:00.000Z'); // Mon 16:00 WIB
  });
});

describe('pause and resume', () => {
  it('freezes the remaining budget instead of the wall clock', () => {
    const paused = pauseTimer(freshTimer(), office, new Date('2026-08-21T12:00:00+07:00'));
    expect(paused.status).toBe('paused');
    expect(paused.remainingAtPause).toBe(5 * 60);
    expect(paused.pauses).toEqual([{ from: '2026-08-21T05:00:00.000Z', to: null }]);
  });

  it('hands the frozen budget back on resume, skipping the weekend', () => {
    const paused = pauseTimer(freshTimer(), office, new Date('2026-08-21T12:00:00+07:00'));
    const resumed = resumeTimer(paused, office, new Date('2026-08-24T09:00:00+07:00'));
    expect(resumed.status).toBe('running');
    expect(resumed.deadlineAt).toBe('2026-08-24T07:00:00.000Z'); // Mon 14:00 WIB
    expect(resumed.remainingAtPause).toBeNull();
    expect(resumed.pauses[0].to).toBe('2026-08-24T02:00:00.000Z');
  });

  it('does not lose budget when resumed outside working hours', () => {
    const paused = pauseTimer(freshTimer(), office, new Date('2026-08-21T12:00:00+07:00'));
    const resumed = resumeTimer(paused, office, new Date('2026-08-22T10:00:00+07:00')); // Saturday
    expect(resumed.deadlineAt).toBe('2026-08-24T07:00:00.000Z'); // still Mon 14:00 WIB
  });

  it('ignores pause on a timer that is not running', () => {
    const resolved = resolveTimer(freshTimer(), new Date('2026-08-21T10:00:00+07:00'));
    expect(pauseTimer(resolved, office, new Date()).status).toBe('resolved');
  });
});

describe('remaining budget', () => {
  it('counts down in business minutes while running', () => {
    const timer = freshTimer();
    const left = remainingBusinessMinutes(timer, office, new Date('2026-08-21T12:00:00+07:00'));
    expect(left).toBe(5 * 60);
  });

  it('does not drain overnight', () => {
    const timer = freshTimer(new Date('2026-08-21T16:00:00+07:00'));
    const fridayEvening = remainingBusinessMinutes(timer, office, new Date('2026-08-21T20:00:00+07:00'));
    const sundayNoon = remainingBusinessMinutes(timer, office, new Date('2026-08-23T12:00:00+07:00'));
    expect(fridayEvening).toBe(7 * 60);
    expect(sundayNoon).toBe(7 * 60);
  });

  it('stops at zero once spent', () => {
    const timer = freshTimer();
    expect(remainingBusinessMinutes(timer, office, new Date('2026-08-25T12:00:00+07:00'))).toBe(0);
  });
});

describe('breach', () => {
  it('is false before the deadline and true after', () => {
    const timer = freshTimer();
    expect(didBreach(timer, new Date('2026-08-21T16:59:00+07:00'))).toBe(false);
    expect(didBreach(timer, new Date('2026-08-21T17:01:00+07:00'))).toBe(true);
  });

  it('is judged against the closing time once resolved', () => {
    const onTime = resolveTimer(freshTimer(), new Date('2026-08-21T16:00:00+07:00'));
    const late = resolveTimer(freshTimer(), new Date('2026-08-24T10:00:00+07:00'));
    // Long after closing, the on-time one is still on time.
    const muchLater = new Date('2027-01-01T00:00:00+07:00');
    expect(didBreach(onTime, muchLater)).toBe(false);
    expect(didBreach(late, muchLater)).toBe(true);
  });
});

describe('urgency', () => {
  it('escalates as the budget is spent', () => {
    const timer = freshTimer();
    const at = (iso: string) => urgencyOf(timer, p2, office, new Date(iso));
    expect(at('2026-08-21T09:30:00+07:00')).toBe('calm');
    expect(at('2026-08-21T15:15:00+07:00')).toBe('warning'); // 78% spent
    expect(at('2026-08-21T16:30:00+07:00')).toBe('critical'); // 94% spent
    expect(at('2026-08-21T17:30:00+07:00')).toBe('breached');
  });

  it('reports consumption as a fraction of the budget', () => {
    const timer = freshTimer();
    expect(consumedFraction(timer, p2, office, FRIDAY_9AM)).toBe(0);
    expect(consumedFraction(timer, p2, office, new Date('2026-08-21T13:00:00+07:00'))).toBe(0.5);
  });
});

describe('overdue', () => {
  const HOUR_MS = 60 * 60 * 1000;

  it('does not accrue outside working hours', () => {
    // Due Friday 17:00. The evening and the weekend add nothing.
    const timer = freshTimer();
    expect(overdueMillis(timer, office, new Date('2026-08-21T18:30:00+07:00'))).toBe(0);
    expect(overdueMillis(timer, office, new Date('2026-08-23T12:00:00+07:00'))).toBe(0);
  });

  it('counts up once the office reopens', () => {
    const timer = freshTimer();
    expect(overdueMillis(timer, office, new Date('2026-08-24T10:00:00+07:00'))).toBe(HOUR_MS);
    expect(overdueMillis(timer, office, new Date('2026-08-24T12:30:00+07:00'))).toBe(3.5 * HOUR_MS);
  });

  it('is zero while there is still time', () => {
    const timer = freshTimer();
    expect(overdueMillis(timer, office, new Date('2026-08-21T16:00:00+07:00'))).toBe(0);
  });

  it('matches wall-clock time for a round-the-clock policy', () => {
    const always = { ...office, alwaysOn: true };
    const timer = startTimer({
      title: 'Gateway down',
      ref: 'INC-1',
      policy: { ...p2, calendarId: always.id },
      calendar: always,
      startedAt: FRIDAY_9AM,
    });
    // Due Friday 17:00 with the clock never stopping; Saturday 05:00 is 12h late.
    expect(overdueMillis(timer, always, new Date('2026-08-22T05:00:00+07:00'))).toBe(12 * HOUR_MS);
  });

  it('never goes negative on the countdown side', () => {
    const timer = freshTimer();
    expect(millisToDeadline(timer, new Date('2026-08-21T18:00:00+07:00'))).toBe(0);
    expect(millisToDeadline(timer, new Date('2026-08-21T16:00:00+07:00'))).toBe(HOUR_MS);
  });

  it('stops growing once the timer is closed', () => {
    const late = resolveTimer(freshTimer(), new Date('2026-08-24T10:00:00+07:00'));
    const shortlyAfter = overdueMillis(late, office, new Date('2026-08-24T10:30:00+07:00'));
    const muchLater = overdueMillis(late, office, new Date('2027-01-01T00:00:00+07:00'));
    expect(shortlyAfter).toBe(HOUR_MS);
    expect(muchLater).toBe(HOUR_MS);
  });

  it('does not accrue while the timer is on hold', () => {
    const paused = pauseTimer(freshTimer(), office, new Date('2026-08-21T12:00:00+07:00'));
    expect(overdueMillis(paused, office, new Date('2026-08-25T12:00:00+07:00'))).toBe(0);
  });
});

describe('breach while on hold', () => {
  it('stays false for a held timer that still has budget', () => {
    // Held on Friday with five hours left; the frozen deadline says Friday 17:00,
    // but days of wall-clock time passing must not turn that into a breach.
    const paused = pauseTimer(freshTimer(), office, new Date('2026-08-21T12:00:00+07:00'));
    expect(paused.remainingAtPause).toBe(5 * 60);
    expect(didBreach(paused, new Date('2026-08-26T12:00:00+07:00'))).toBe(false);
  });

  it('is true for a held timer whose budget is already gone', () => {
    const spent = pauseTimer(freshTimer(), office, new Date('2026-08-21T17:00:00+07:00'));
    expect(spent.remainingAtPause).toBe(0);
    expect(didBreach(spent, new Date('2026-08-21T17:00:00+07:00'))).toBe(true);
  });
});

describe('wantsLiveActivity', () => {
  it('takes a 24/7 timer straight away — four hours fits inside the window', () => {
    const p1 = defaultPolicies().find(p => p.id === 'p1')!;
    const always = { ...office, alwaysOn: true };
    const timer = startTimer({ title: 'Gateway down', ref: 'INC-1', policy: p1, calendar: always, startedAt: FRIDAY_9AM });
    expect(wantsLiveActivity(timer, FRIDAY_9AM)).toBe(true);
  });

  it('waits for a long policy to reach its final stretch', () => {
    const p3 = defaultPolicies().find(p => p.id === 'p3')!; // 24 business hours
    const timer = startTimer({ title: 'Slow report', ref: 'INC-2', policy: p3, calendar: office, startedAt: FRIDAY_9AM });
    // Due the following Wednesday: nothing to show yet.
    expect(wantsLiveActivity(timer, FRIDAY_9AM)).toBe(false);
    // Eight hours before the deadline it earns its place.
    const soon = new Date(new Date(timer.deadlineAt).getTime() - 7 * 60 * 60 * 1000);
    expect(wantsLiveActivity(timer, soon)).toBe(true);
  });

  it('keeps showing once overdue, and stops when resolved or held', () => {
    const timer = freshTimer();
    const late = new Date('2026-08-24T10:00:00+07:00');
    expect(wantsLiveActivity(timer, late)).toBe(true);
    expect(wantsLiveActivity(resolveTimer(timer, late), late)).toBe(false);
    expect(wantsLiveActivity(pauseTimer(timer, office, new Date('2026-08-21T12:00:00+07:00')), late)).toBe(false);
  });
});

describe('alertsFor', () => {
  it('schedules the four warnings inside working hours', () => {
    const timer = freshTimer(); // P2, 8 business hours from Friday 09:00
    const alerts = alertsFor(timer, p2, office, FRIDAY_9AM);
    expect(alerts.map(a => a.kind)).toEqual(['half', 'stretch', 'final', 'breach']);
    expect(alerts.map(a => a.fireAt.toISOString())).toEqual([
      '2026-08-21T06:00:00.000Z', // 13:00 WIB — half the budget
      '2026-08-21T09:12:00.000Z', // 16:12 WIB — 90% spent
      '2026-08-21T09:45:00.000Z', // 16:45 WIB — fifteen minutes left
      '2026-08-21T10:00:00.000Z', // 17:00 WIB — breach
    ]);
  });

  it('pushes warnings past the weekend rather than firing at midnight', () => {
    // Filed Friday afternoon, so half the budget lands on Monday lunchtime.
    const timer = freshTimer(new Date('2026-08-21T16:00:00+07:00'));
    const half = alertsFor(timer, p2, office, new Date('2026-08-21T16:00:00+07:00'))
      .find(alert => alert.kind === 'half');
    expect(half?.fireAt.toISOString()).toBe('2026-08-24T05:00:00.000Z'); // Mon 12:00 WIB
  });

  it('drops warnings that have already passed', () => {
    const timer = freshTimer();
    const alerts = alertsFor(timer, p2, office, new Date('2026-08-21T16:30:00+07:00'));
    expect(alerts.map(a => a.kind)).toEqual(['final', 'breach']);
  });

  it('collapses thresholds that fall in the same minute', () => {
    const tiny: Policy = { ...p2, durationMinutes: 2 };
    const timer = startTimer({ title: 'Blip', ref: '', policy: tiny, calendar: office, startedAt: FRIDAY_9AM });
    const alerts = alertsFor(timer, tiny, office, FRIDAY_9AM);
    expect(alerts.map(a => a.kind)).toEqual(['half', 'breach']);
  });

  it('says nothing for a timer that is not running', () => {
    const held = pauseTimer(freshTimer(), office, new Date('2026-08-21T12:00:00+07:00'));
    const done = resolveTimer(freshTimer(), new Date('2026-08-21T12:00:00+07:00'));
    expect(alertsFor(held, p2, office, FRIDAY_9AM)).toEqual([]);
    expect(alertsFor(done, p2, office, FRIDAY_9AM)).toEqual([]);
  });

  it('gives every alert an id derived from its timer', () => {
    const timer = freshTimer();
    const alerts = alertsFor(timer, p2, office, FRIDAY_9AM);
    expect(alerts.every(alert => alert.id === `${timer.id}:${alert.kind}`)).toBe(true);
  });
});
