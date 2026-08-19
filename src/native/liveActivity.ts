import { NativeModules, Platform } from 'react-native';

/**
 * Thin wrapper over the iOS Live Activity module.
 *
 * Every call degrades to a no-op rather than throwing: the module is absent on
 * Android, in tests, and on iOS below 16.2, and none of those are errors.
 */
export type LiveActivityPayload = {
  timerId: string;
  title: string;
  reference: string;
  policyName: string;
  tintHex: string;
  /** Deadline as epoch milliseconds. */
  deadline: number;
  /** True for round-the-clock policies, which can count their lateness upward. */
  countsUpWhenLate: boolean;
  isOnHold: boolean;
  heldMinutes: number;
};

type LiveActivityNative = {
  isSupported(): Promise<boolean>;
  start(payload: LiveActivityPayload): Promise<boolean>;
  end(timerId: string): Promise<boolean>;
  listActive(): Promise<string[]>;
};

const native: LiveActivityNative | undefined =
  Platform.OS === 'ios' ? NativeModules.LiveActivityManager : undefined;

export const hasLiveActivityModule = Boolean(native);

export async function isSupported(): Promise<boolean> {
  if (!native) {
    return false;
  }
  try {
    return await native.isSupported();
  } catch {
    return false;
  }
}

/** Starts an activity, or updates the one already showing for this timer. */
export async function startActivity(payload: LiveActivityPayload): Promise<boolean> {
  if (!native) {
    return false;
  }
  try {
    return await native.start(payload);
  } catch {
    return false;
  }
}

export async function endActivity(timerId: string): Promise<boolean> {
  if (!native) {
    return false;
  }
  try {
    return await native.end(timerId);
  } catch {
    return false;
  }
}

export async function listActiveActivities(): Promise<string[]> {
  if (!native) {
    return [];
  }
  try {
    return await native.listActive();
  } catch {
    return [];
  }
}
