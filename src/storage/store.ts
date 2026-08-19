import AsyncStorage from '@react-native-async-storage/async-storage';

import { defaultCalendars, defaultPolicies } from '../domain/defaults';
import type { BusinessCalendar, Policy, SlaTimer } from '../domain/types';

const STORAGE_KEY = 'tickdown/state/v1';

export type PersistedState = {
  version: 1;
  calendars: BusinessCalendar[];
  policies: Policy[];
  timers: SlaTimer[];
};

export function initialState(): PersistedState {
  return {
    version: 1,
    calendars: defaultCalendars(),
    policies: defaultPolicies(),
    timers: [],
  };
}

/**
 * Everything lives on the device. A corrupt or unreadable blob falls back to
 * a fresh state rather than blocking the app — there is no server to ask.
 */
export async function loadState(): Promise<PersistedState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return initialState();
    }
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.calendars) || !Array.isArray(parsed.policies)) {
      return initialState();
    }
    return {
      version: 1,
      calendars: parsed.calendars,
      policies: parsed.policies,
      timers: Array.isArray(parsed.timers) ? parsed.timers : [],
    };
  } catch {
    return initialState();
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
