import {
  addBusinessTime,
  businessTimeBetween,
  isWithinBusinessHours,
  nextBusinessOpening,
} from './businessTime';
import type { BusinessCalendar, TimeWindow } from './types';

const NINE_TO_FIVE: TimeWindow = { start: 9 * 60, end: 17 * 60 };

function calendar(overrides: Partial<BusinessCalendar> = {}): BusinessCalendar {
  return {
    id: 'test',
    name: 'Office',
    timeZone: 'Asia/Jakarta',
    windows: {
      0: [],
      1: [NINE_TO_FIVE],
      2: [NINE_TO_FIVE],
      3: [NINE_TO_FIVE],
      4: [NINE_TO_FIVE],
      5: [NINE_TO_FIVE],
      6: [],
    },
    holidays: [],
    alwaysOn: false,
    ...overrides,
  };
}

const HOURS = 60;

describe('addBusinessTime', () => {
  it('stays inside the same day when the budget fits', () => {
    // Wednesday 10:00 + 3h
    const due = addBusinessTime(new Date('2026-08-19T10:00:00+07:00'), 3 * HOURS, calendar());
    expect(due.toISOString()).toBe('2026-08-19T06:00:00.000Z'); // 13:00 WIB
  });

  it('carries the remainder across the weekend', () => {
    // The headline case: Friday 16:00 + 8h lands on Monday 16:00, not Saturday.
    const due = addBusinessTime(new Date('2026-08-21T16:00:00+07:00'), 8 * HOURS, calendar());
    expect(due.toISOString()).toBe('2026-08-24T09:00:00.000Z'); // Mon 16:00 WIB
  });

  it('starts the clock at the next opening when filed outside working hours', () => {
    // Saturday 10:00 + 2h — the weekend contributes nothing.
    const due = addBusinessTime(new Date('2026-08-22T10:00:00+07:00'), 2 * HOURS, calendar());
    expect(due.toISOString()).toBe('2026-08-24T04:00:00.000Z'); // Mon 11:00 WIB
  });

  it('skips holidays', () => {
    const withHoliday = calendar({ holidays: ['2026-08-24'] });
    const due = addBusinessTime(new Date('2026-08-21T16:00:00+07:00'), 8 * HOURS, withHoliday);
    expect(due.toISOString()).toBe('2026-08-25T09:00:00.000Z'); // Tue 16:00 WIB
  });

  it('does not count the lunch break in a split shift', () => {
    const split: TimeWindow[] = [
      { start: 8 * 60, end: 12 * 60 },
      { start: 13 * 60, end: 17 * 60 },
    ];
    const withBreak = calendar({
      windows: { 0: [], 1: split, 2: split, 3: split, 4: split, 5: split, 6: [] },
    });
    // Wednesday 11:00 + 2h: one hour before noon, one hour after one.
    const due = addBusinessTime(new Date('2026-08-19T11:00:00+07:00'), 2 * HOURS, withBreak);
    expect(due.toISOString()).toBe('2026-08-19T07:00:00.000Z'); // 14:00 WIB
  });

  it('runs straight through for a 24/7 policy', () => {
    const always = calendar({ alwaysOn: true });
    const due = addBusinessTime(new Date('2026-08-22T10:00:00+07:00'), 2 * HOURS, always);
    expect(due.toISOString()).toBe('2026-08-22T05:00:00.000Z'); // Sat 12:00 WIB
  });

  it('keeps wall-clock office hours across a DST transition', () => {
    // US clocks jump forward on 2026-03-08, so Friday 16:00 + 8h is 71
    // wall-clock hours later even though it is still "Monday at 16:00".
    const newYork = calendar({ timeZone: 'America/New_York' });
    const due = addBusinessTime(new Date('2026-03-06T16:00:00-05:00'), 8 * HOURS, newYork);
    expect(due.toISOString()).toBe('2026-03-09T20:00:00.000Z'); // Mon 16:00 EDT
  });

  it('treats a zero budget as "the next working instant"', () => {
    const due = addBusinessTime(new Date('2026-08-22T10:00:00+07:00'), 0, calendar());
    expect(due.toISOString()).toBe('2026-08-24T02:00:00.000Z'); // Mon 09:00 WIB
  });

  it('rejects a negative budget', () => {
    expect(() => addBusinessTime(new Date(), -1, calendar())).toThrow(RangeError);
  });

  it('gives up rather than looping forever on a calendar that never opens', () => {
    const closed = calendar({
      windows: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
    });
    expect(() => addBusinessTime(new Date(), 60, closed)).toThrow(/ten years/);
  });
});

describe('businessTimeBetween', () => {
  it('counts only working minutes across a weekend', () => {
    const minutes = businessTimeBetween(
      new Date('2026-08-21T16:00:00+07:00'),
      new Date('2026-08-24T16:00:00+07:00'),
      calendar(),
    );
    expect(minutes).toBe(8 * HOURS);
  });

  it('returns zero for an empty or inverted range', () => {
    const at = new Date('2026-08-19T10:00:00+07:00');
    expect(businessTimeBetween(at, at, calendar())).toBe(0);
    expect(businessTimeBetween(at, new Date(at.getTime() - 1000), calendar())).toBe(0);
  });

  it('returns zero for a range that sits entirely outside working hours', () => {
    const minutes = businessTimeBetween(
      new Date('2026-08-22T09:00:00+07:00'),
      new Date('2026-08-23T17:00:00+07:00'),
      calendar(),
    );
    expect(minutes).toBe(0);
  });

  it('inverts addBusinessTime', () => {
    const start = new Date('2026-08-21T16:00:00+07:00');
    for (const budget of [0, 30, 8 * HOURS, 40 * HOURS]) {
      const due = addBusinessTime(start, budget, calendar());
      expect(businessTimeBetween(start, due, calendar())).toBe(budget);
    }
  });
});

describe('isWithinBusinessHours', () => {
  it('recognises open and closed moments', () => {
    expect(isWithinBusinessHours(new Date('2026-08-19T10:00:00+07:00'), calendar())).toBe(true);
    expect(isWithinBusinessHours(new Date('2026-08-19T18:00:00+07:00'), calendar())).toBe(false);
    expect(isWithinBusinessHours(new Date('2026-08-22T10:00:00+07:00'), calendar())).toBe(false);
  });

  it('treats the closing minute as outside', () => {
    expect(isWithinBusinessHours(new Date('2026-08-19T17:00:00+07:00'), calendar())).toBe(false);
  });

  it('is always open for a 24/7 policy', () => {
    expect(isWithinBusinessHours(new Date('2026-08-22T03:00:00+07:00'), calendar({ alwaysOn: true }))).toBe(true);
  });
});

describe('nextBusinessOpening', () => {
  it('leaves an already-open instant alone', () => {
    const at = new Date('2026-08-19T10:00:00+07:00');
    expect(nextBusinessOpening(at, calendar()).toISOString()).toBe(at.toISOString());
  });

  it('jumps to Monday morning from a Saturday', () => {
    const at = new Date('2026-08-22T10:00:00+07:00');
    expect(nextBusinessOpening(at, calendar()).toISOString()).toBe('2026-08-24T02:00:00.000Z');
  });
});
