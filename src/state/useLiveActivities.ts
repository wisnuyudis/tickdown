import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { remainingBusinessMinutes, wantsLiveActivity } from '../domain/timer';
import type { BusinessCalendar, Policy, SlaTimer } from '../domain/types';
import {
  endActivity,
  listActiveActivities,
  startActivity,
  type LiveActivityPayload,
} from '../native/liveActivity';

/** How often to re-check, so a timer entering the window gets its activity. */
const SWEEP_MS = 60_000;

/**
 * Keeps Lock Screen activities in step with the timers.
 *
 * Reconciliation rather than event handling: work out what should be showing,
 * compare with what is, and fix the difference. That survives app restarts,
 * activities the user swiped away, and timers that quietly aged into the
 * window while the app was closed.
 */
export function useLiveActivities(input: {
  ready: boolean;
  timers: SlaTimer[];
  policyById: (id: string) => Policy | undefined;
  calendarForTimer: (timer: SlaTimer) => BusinessCalendar;
}) {
  const { ready, timers, policyById, calendarForTimer } = input;

  // The sweep reads the latest data without being a dependency of the timers
  // that schedule it, so the interval is installed once.
  const latest = useRef({ timers, policyById, calendarForTimer });
  latest.current = { timers, policyById, calendarForTimer };

  const running = useRef(false);

  const reconcile = useCallback(async () => {
    if (running.current) {
      return;
    }
    running.current = true;
    try {
      const { timers: current, policyById: policyOf, calendarForTimer: calendarOf } = latest.current;
      const now = new Date();
      const onScreen = await listActiveActivities();
      const shouldShow = new Set<string>();

      for (const timer of current) {
        const policy = policyOf(timer.policyId);
        if (!policy) {
          continue;
        }
        const calendar = calendarOf(timer);
        const held = timer.status === 'paused';
        // A held timer keeps whatever it already had on screen, but never earns
        // a new activity — there is no live number to show.
        const wanted = wantsLiveActivity(timer, now) || (held && onScreen.includes(timer.id));
        if (!wanted) {
          continue;
        }

        shouldShow.add(timer.id);
        const payload: LiveActivityPayload = {
          timerId: timer.id,
          title: timer.title,
          reference: timer.ref,
          policyName: policy.name,
          tintHex: policy.color,
          deadline: new Date(timer.deadlineAt).getTime(),
          countsUpWhenLate: calendar.alwaysOn,
          isOnHold: held,
          heldMinutes: remainingBusinessMinutes(timer, calendar, now),
        };
        await startActivity(payload);
      }

      for (const id of onScreen) {
        if (!shouldShow.has(id)) {
          await endActivity(id);
        }
      }
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }
    reconcile().catch(() => {});
  }, [ready, reconcile, timers]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const handle = setInterval(() => {
      reconcile().catch(() => {});
    }, SWEEP_MS);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        reconcile().catch(() => {});
      }
    });
    return () => {
      clearInterval(handle);
      subscription.remove();
    };
  }, [ready, reconcile]);
}
