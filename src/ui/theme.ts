import type { Urgency } from '../domain/timer';

export type Palette = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  onAccent: string;
  calm: string;
  warning: string;
  critical: string;
  breached: string;
};

export const light: Palette = {
  bg: '#f4f4f6',
  surface: '#ffffff',
  surfaceAlt: '#ebebef',
  border: '#dcdce2',
  text: '#111113',
  muted: '#60606a',
  faint: '#8f8f99',
  accent: '#111113',
  onAccent: '#ffffff',
  calm: '#30a46c',
  warning: '#ffb224',
  critical: '#f76b15',
  breached: '#e5484d',
};

export const dark: Palette = {
  bg: '#0e0e10',
  surface: '#18181b',
  surfaceAlt: '#212126',
  border: '#2c2c33',
  text: '#f4f4f6',
  muted: '#a0a0aa',
  faint: '#6e6e78',
  accent: '#f4f4f6',
  onAccent: '#111113',
  calm: '#3dd68c',
  warning: '#ffcb47',
  critical: '#ff8b3d',
  breached: '#ff6369',
};

export function urgencyColor(urgency: Urgency, palette: Palette): string {
  switch (urgency) {
    case 'breached':
      return palette.breached;
    case 'critical':
      return palette.critical;
    case 'warning':
      return palette.warning;
    default:
      return palette.calm;
  }
}
