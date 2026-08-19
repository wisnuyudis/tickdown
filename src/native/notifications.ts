import { NativeModules, Platform } from 'react-native';

/**
 * Thin wrapper over the iOS local-notification module.
 *
 * Absent on Android and in tests, so every call degrades to a no-op instead of
 * throwing.
 */
export type ScheduledAlert = {
  id: string;
  /** Epoch milliseconds. */
  fireAt: number;
  title: string;
  body: string;
};

export type PermissionState = 'granted' | 'denied' | 'undetermined';

type NotificationNative = {
  requestPermission(): Promise<boolean>;
  getPermission(): Promise<PermissionState>;
  sync(alerts: ScheduledAlert[]): Promise<number>;
  listPending(): Promise<string[]>;
};

const native: NotificationNative | undefined =
  Platform.OS === 'ios' ? NativeModules.NotificationManager : undefined;

export const hasNotificationModule = Boolean(native);

export async function requestPermission(): Promise<boolean> {
  if (!native) {
    return false;
  }
  try {
    return await native.requestPermission();
  } catch {
    return false;
  }
}

export async function getPermission(): Promise<PermissionState> {
  if (!native) {
    return 'denied';
  }
  try {
    return await native.getPermission();
  } catch {
    return 'denied';
  }
}

/** Replaces every pending Tickdown notification with exactly this set. */
export async function syncAlerts(alerts: ScheduledAlert[]): Promise<number> {
  if (!native) {
    return 0;
  }
  try {
    return await native.sync(alerts);
  } catch {
    return 0;
  }
}

export async function listPendingAlerts(): Promise<string[]> {
  if (!native) {
    return [];
  }
  try {
    return await native.listPending();
  } catch {
    return [];
  }
}
