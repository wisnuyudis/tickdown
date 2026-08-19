import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { alertsFor } from '../domain/timer';
import type { BusinessCalendar, Policy, SlaTimer } from '../domain/types';
import { getPermission, requestPermission, syncAlerts } from '../native/notifications';

/** Re-check often enough that a timer edited hours ago still holds true alerts. */
const SWEEP_MS = 5 * 60_000;

/**
 * Keeps the scheduled SLA warnings in step with the timers.
 *
 * These are what make the app useful when it is closed: a Live Activity only
 * exists once a timer is near its deadline and the app has been opened, but a
 * scheduled notification fires regardless.
 */
export function useNotifications(input: {
  ready: boolean;
  timers: SlaTimer[];
  policyById: (id: string) => Policy | undefined;
  calendarForTimer: (timer: SlaTimer) => BusinessCalendar;
}) {
  const { ready, timers, policyById, calendarForTimer } = input;

  const latest = useRef({ timers, policyById, calendarForTimer });
  latest.current = { timers, policyById, calendarForTimer };

  const asked = useRef(false);
  const running = useRef(false);

  const reconcile = useCallback(async () => {
    if (running.current) {
      return;
    }
    running.current = true;
    try {
      const { timers: current, policyById: policyOf, calendarForTimer: calendarOf } = latest.current;
      const live = current.filter(timer => timer.status === 'running');

      // Asked for on the first timer rather than at launch, so the prompt
      // arrives when the reason for it is on screen.
      if (live.length > 0 && !asked.current) {
        asked.current = true;
        if ((await getPermission()) === 'undetermined') {
          await requestPermission();
        }
      }

      const now = new Date();
      const alerts = live.flatMap(timer => {
        const policy = policyOf(timer.policyId);
        if (!policy) {
          return [];
        }
        return alertsFor(timer, policy, calendarOf(timer), now).map(alert => ({
          id: alert.id,
          fireAt: alert.fireAt.getTime(),
          title: alert.title,
          body: alert.body,
        }));
      });

      await syncAlerts(alerts);
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
