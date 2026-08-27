import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

/**
 * Thin wrapper over the AppSealing security bridge (`AppSealingInterfaceBridge`).
 *
 * The SDK enforces on its own: on a jailbroken device, an unencrypted
 * executable, an attached debugger, or a re-signed binary it closes the app
 * after 20 seconds no matter what we do here. This module exists only so the
 * user sees *why* the app is about to close.
 *
 * Absent on Android, in tests, and in Debug builds where the framework is
 * swapped for the permissive variant, so every call degrades to a no-op.
 *
 * It reports what the SDK found, never how to word it — every user-facing
 * string lives in `src/ui/securityCopy.ts`.
 */

/** What the SDK can report. `src/ui/securityCopy.ts` gives each one a label. */
export type ThreatKey =
  | 'jailbroken'
  | 'unencryptedExecutable'
  | 'debuggerAttached'
  | 'integrityBroken'
  | 'executableCorrupted'
  | 'resigned'
  | 'blacklistCorrupted'
  | 'cheatTool'
  | 'methodSwizzling'
  | 'methodHooking'
  | 'abnormalEnvironment'
  | 'activeCall'
  | 'possibleCall';

/** Bit flags returned by the launch-time check. */
const LAUNCH_FLAGS: [number, ThreatKey][] = [
  [0x00000001, 'jailbroken'],
  [0x00000002, 'unencryptedExecutable'],
  [0x00000004, 'debuggerAttached'],
  [0x00000008, 'integrityBroken'],
  [0x00000010, 'executableCorrupted'],
  [0x00000020, 'integrityBroken'],
  [0x00000040, 'executableCorrupted'],
  [0x00000080, 'resigned'],
  [0x00000100, 'blacklistCorrupted'],
  [0x00000200, 'cheatTool'],
];

/** Single code returned by the periodic check; 0 and 7 mean "nothing found". */
const PERIODIC_CODES: Record<number, ThreatKey> = {
  1: 'jailbroken',
  2: 'methodSwizzling',
  3: 'methodHooking',
  4: 'cheatTool',
  5: 'integrityBroken',
  6: 'abnormalEnvironment',
};

const PERIODIC_INTERVAL_MS = 2000;
const LAUNCH_CHECK_DELAY_MS = 500;

type AppSealingNative = {
  IsAbnormalEnvironmentDetectedAsyncRN(): Promise<number>;
  IsSwizzlingDetectedReturnRN(): string;
  GetAppSealingDeviceIDRN(): string;
  ExitApp(): void;
};

const native: AppSealingNative | undefined =
  Platform.OS === 'ios' ? NativeModules.AppSealingInterfaceBridge : undefined;

export const hasAppSealingModule = Boolean(native);

/* eslint-disable-next-line no-bitwise -- the SDK reports every launch threat in one bit mask */
const isSet = (flags: number, bit: number) => (flags & bit) !== 0;

function decodeLaunchThreat(flags: number): ThreatKey[] {
  const found = LAUNCH_FLAGS.filter(([bit]) => isSet(flags, bit)).map(([, key]) => key);
  // Two bits can mean the same thing to the user — corrupted hash info and a
  // modified hash are both "integrity broken" — so collapse the duplicates.
  return [...new Set(found)];
}

/**
 * Starts AppSealing's launch-time and periodic environment checks.
 *
 * `onThreat` fires at most once — the SDK is already closing the app, so a
 * second report would only fight the sheet that is on screen. Safe to call
 * unconditionally; returns a stop function for unmount and for tests.
 */
export function startSecurityMonitoring(onThreat: (threats: ThreatKey[]) => void): () => void {
  if (!native) {
    return () => {};
  }

  let reported = false;
  const report = (threats: ThreatKey[]) => {
    if (reported || threats.length === 0) {
      return;
    }
    reported = true;
    onThreat(threats);
  };

  const launchCheck = setTimeout(async () => {
    try {
      const flags = await native.IsAbnormalEnvironmentDetectedAsyncRN();
      if (flags > 0) {
        report(decodeLaunchThreat(flags));
      }
    } catch {
      // A missing or failing check must never take the app down on its own.
    }
  }, LAUNCH_CHECK_DELAY_MS);

  const periodicCheck = setInterval(() => {
    if (reported) {
      return;
    }
    try {
      const key = PERIODIC_CODES[parseInt(native.IsSwizzlingDetectedReturnRN(), 10)];
      if (key) {
        report([key]);
      }
    } catch {
      // Same reasoning as above.
    }
  }, PERIODIC_INTERVAL_MS);

  return () => {
    clearTimeout(launchCheck);
    clearInterval(periodicCheck);
  };
}

/** Closes the app the way the SDK does, without waiting out its 20-second timer. */
export function exitApp(): void {
  native?.ExitApp();
}

/**
 * Call Risk Protection — sealed with `action=callback`, so the SDK reports
 * call-like activity and takes no action of its own. Closing the app is handled
 * natively in `ios/Tickdown/CallRiskMonitor.swift`; this event only drives the
 * sheet.
 */
export type CallRisk = {
  /** `callkit_call_active`, `audio_interruption_began`, … */
  reason: string;
  /** `high` for a real call; `medium` for signals other events can also cause. */
  confidence: 'high' | 'medium';
};

const callRiskNative = Platform.OS === 'ios' ? NativeModules.CallRiskMonitor : undefined;

export const hasCallRiskModule = Boolean(callRiskNative);

/**
 * Subscribes to call-risk events. Anything detected before this runs — a call
 * already in progress at launch — is held natively and delivered here.
 */
export function subscribeToCallRisk(listener: (risk: CallRisk) => void): () => void {
  if (!callRiskNative) {
    return () => {};
  }
  const emitter = new NativeEventEmitter(callRiskNative);
  const subscription = emitter.addListener('callRiskDetected', listener);
  return () => subscription.remove();
}
