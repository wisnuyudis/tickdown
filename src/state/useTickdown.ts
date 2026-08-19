import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ALWAYS_ON_CALENDAR_ID, OFFICE_CALENDAR_ID } from '../domain/defaults';
import {
  pauseTimer,
  reopenTimer,
  resolveTimer,
  resumeTimer,
  startTimer,
} from '../domain/timer';
import type { BusinessCalendar, Policy, SlaTimer } from '../domain/types';
import { initialState, loadState, saveState, type PersistedState } from '../storage/store';

export type Tickdown = ReturnType<typeof useTickdown>;

export function useTickdown() {
  const [state, setState] = useState<PersistedState>(initialState);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadState().then(loaded => {
      if (!cancelled) {
        setState(loaded);
        hydrated.current = true;
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist after hydration only, so the empty initial state never overwrites
  // what is already on disk.
  useEffect(() => {
    if (hydrated.current) {
      // A failed write should not take the UI down; the in-memory state stands.
      saveState(state).catch(() => {});
    }
  }, [state]);

  const policyById = useCallback(
    (id: string) => state.policies.find(policy => policy.id === id),
    [state.policies],
  );

  const calendarById = useCallback(
    (id: string) => state.calendars.find(calendar => calendar.id === id),
    [state.calendars],
  );

  /** The calendar a timer is measured against, with sane fallbacks. */
  const calendarForTimer = useCallback(
    (timer: SlaTimer): BusinessCalendar => {
      const policy = policyById(timer.policyId);
      const calendar = policy ? calendarById(policy.calendarId) : undefined;
      return calendar ?? state.calendars[0];
    },
    [calendarById, policyById, state.calendars],
  );

  const mutate = useCallback((id: string, change: (timer: SlaTimer, calendar: BusinessCalendar) => SlaTimer) => {
    setState(current => ({
      ...current,
      timers: current.timers.map(timer => {
        if (timer.id !== id) {
          return timer;
        }
        const policy = current.policies.find(p => p.id === timer.policyId);
        const calendar =
          (policy && current.calendars.find(c => c.id === policy.calendarId)) ?? current.calendars[0];
        return change(timer, calendar);
      }),
    }));
  }, []);

  const actions = useMemo(
    () => ({
      add(input: { title: string; ref: string; policyId: string; startedAt: Date }) {
        setState(current => {
          const policy = current.policies.find(p => p.id === input.policyId) ?? current.policies[0];
          const calendar =
            current.calendars.find(c => c.id === policy.calendarId) ?? current.calendars[0];
          const timer = startTimer({
            title: input.title,
            ref: input.ref,
            policy,
            calendar,
            startedAt: input.startedAt,
          });
          return { ...current, timers: [timer, ...current.timers] };
        });
      },
      pause: (id: string) => mutate(id, (timer, calendar) => pauseTimer(timer, calendar, new Date())),
      resume: (id: string) => mutate(id, (timer, calendar) => resumeTimer(timer, calendar, new Date())),
      resolve: (id: string) => mutate(id, timer => resolveTimer(timer, new Date())),
      reopen: (id: string) => mutate(id, (timer, calendar) => reopenTimer(timer, calendar, new Date())),
      remove(id: string) {
        setState(current => ({ ...current, timers: current.timers.filter(t => t.id !== id) }));
      },
      updateCalendar(id: string, change: (calendar: BusinessCalendar) => BusinessCalendar) {
        setState(current => ({
          ...current,
          calendars: current.calendars.map(calendar =>
            calendar.id === id ? change(calendar) : calendar,
          ),
        }));
      },
      updatePolicy(id: string, change: (policy: Policy) => Policy) {
        setState(current => ({
          ...current,
          policies: current.policies.map(policy => (policy.id === id ? change(policy) : policy)),
        }));
      },
    }),
    [mutate],
  );

  const officeCalendar = calendarById(OFFICE_CALENDAR_ID) ?? state.calendars[0];
  const alwaysOnCalendar = calendarById(ALWAYS_ON_CALENDAR_ID);

  return {
    ready,
    timers: state.timers,
    policies: state.policies,
    calendars: state.calendars,
    officeCalendar,
    alwaysOnCalendar,
    policyById,
    calendarById,
    calendarForTimer,
    ...actions,
  };
}

/** A single shared clock, so every countdown on screen ticks together. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const handle = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(handle);
  }, [intervalMs]);
  return now;
}
