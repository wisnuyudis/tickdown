import { useCallback, useEffect, useState } from 'react';

import type { CallRisk, ThreatKey } from '../native/appSealing';
import { startSecurityMonitoring, subscribeToCallRisk } from '../native/appSealing';

export type SecurityAlert = {
  kind: 'environment' | 'call';
  threats: ThreatKey[];
  /** False only for a call signal weak enough to be something other than a call. */
  blocking: boolean;
};

/**
 * Single source of truth for the security sheet.
 *
 * Two independent AppSealing signals feed it: the environment checks
 * (jailbreak, re-signing, debugger) and Call Risk Protection. A compromised
 * environment is terminal, so it outranks a phone call and is never replaced.
 *
 * This hook only decides what to show. Closing the app is never its job — the
 * SDK handles it for environment threats, and `CallRiskMonitor` handles it
 * natively for calls, so neither depends on this code still being trustworthy.
 */
export function useSecurityAlert(): {
  alert: SecurityAlert | null;
  dismiss: () => void;
} {
  const [alert, setAlert] = useState<SecurityAlert | null>(null);

  useEffect(
    () =>
      startSecurityMonitoring(threats =>
        setAlert({ kind: 'environment', threats, blocking: true }),
      ),
    [],
  );

  useEffect(
    () =>
      subscribeToCallRisk((risk: CallRisk) =>
        setAlert(current =>
          current?.kind === 'environment'
            ? current
            : {
                kind: 'call',
                threats: [risk.confidence === 'high' ? 'activeCall' : 'possibleCall'],
                blocking: risk.confidence === 'high',
              },
        ),
      ),
    [],
  );

  const dismiss = useCallback(() => {
    setAlert(current => (current?.blocking ? current : null));
  }, []);

  return { alert, dismiss };
}
