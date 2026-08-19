import type { BusinessCalendar, Policy, TimeWindow } from './types';

export const OFFICE_CALENDAR_ID = 'office';
export const ALWAYS_ON_CALENDAR_ID = 'always-on';

const NINE_TO_FIVE: TimeWindow = { start: 9 * 60, end: 17 * 60 };

/** The device's zone, falling back to WIB if the platform will not tell us. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta';
  } catch {
    return 'Asia/Jakarta';
  }
}

export function defaultCalendars(): BusinessCalendar[] {
  const timeZone = deviceTimeZone();
  return [
    {
      id: OFFICE_CALENDAR_ID,
      name: 'Office hours',
      timeZone,
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
    },
    {
      id: ALWAYS_ON_CALENDAR_ID,
      name: 'Around the clock',
      timeZone,
      windows: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
      holidays: [],
      alwaysOn: true,
    },
  ];
}

export function defaultPolicies(): Policy[] {
  return [
    {
      id: 'p1',
      name: 'P1 · Critical',
      durationMinutes: 4 * 60,
      calendarId: ALWAYS_ON_CALENDAR_ID,
      color: '#e5484d',
    },
    {
      id: 'p2',
      name: 'P2 · High',
      durationMinutes: 8 * 60,
      calendarId: OFFICE_CALENDAR_ID,
      color: '#f76b15',
    },
    {
      id: 'p3',
      name: 'P3 · Medium',
      durationMinutes: 24 * 60,
      calendarId: OFFICE_CALENDAR_ID,
      color: '#ffb224',
    },
    {
      id: 'p4',
      name: 'P4 · Low',
      durationMinutes: 40 * 60,
      calendarId: OFFICE_CALENDAR_ID,
      color: '#3e63dd',
    },
  ];
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
