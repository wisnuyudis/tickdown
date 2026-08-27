import type { ThreatKey } from '../native/appSealing';
import type { SecurityAlert } from '../state/useSecurityAlert';

/**
 * Every word the security sheet can show, in one place.
 *
 * Nothing else in the app builds these strings. `SecuritySheet` renders whatever
 * `securityMessage()` hands it, so changing wording — or translating the lot —
 * only ever means editing this file.
 */

export type SecurityMessage = {
  title: string;
  body: string;
  /** Label of the single button. */
  action: string;
  /** One line per thing the SDK found. */
  reasons: string[];
};

const SHEETS = {
  environment: {
    title: 'Permintaan tidak dapat diproses',
    body:
      'Perangkat ini tidak memenuhi syarat keamanan untuk menjalankan Tickdown. Demi keamanan data ' +
      'Anda, gunakan perangkat dengan sistem operasi yang resmi dan aplikasi yang diunduh dari App Store.',
    action: 'Tutup aplikasi',
  },
  callBlocking: {
    title: 'Panggilan terdeteksi',
    body:
      'Demi keamanan, Tickdown ditutup selama panggilan berlangsung. Jangan pernah mengikuti arahan ' +
      'siapa pun melalui telepon untuk membuka aplikasi ini. Aplikasi akan tertutup otomatis.',
    action: 'Tutup aplikasi',
  },
  callWarning: {
    title: 'Aktivitas panggilan terdeteksi',
    body:
      'Pastikan Anda tidak sedang dipandu orang lain melalui telepon. Jangan pernah membagikan isi ' +
      'layar ini kepada siapa pun.',
    action: 'Saya mengerti',
  },
} as const;

const REASONS: Record<ThreatKey, string> = {
  jailbroken: 'Perangkat dimodifikasi (jailbreak)',
  unencryptedExecutable: 'Aplikasi tidak terenkripsi',
  debuggerAttached: 'Terdeteksi debugger',
  integrityBroken: 'Integritas aplikasi rusak',
  executableCorrupted: 'Berkas aplikasi rusak',
  resigned: 'Aplikasi ditandatangani ulang',
  blacklistCorrupted: 'Daftar keamanan rusak',
  cheatTool: 'Terdeteksi alat manipulasi',
  methodSwizzling: 'Terdeteksi method swizzling',
  methodHooking: 'Terdeteksi method hooking',
  abnormalEnvironment: 'Lingkungan tidak wajar',
  activeCall: 'Panggilan sedang berlangsung',
  possibleCall: 'Kemungkinan aktivitas panggilan',
};

/** Everything the sheet needs, from one call. */
export function securityMessage(alert: SecurityAlert): SecurityMessage {
  const sheet =
    alert.kind === 'environment'
      ? SHEETS.environment
      : alert.blocking
        ? SHEETS.callBlocking
        : SHEETS.callWarning;

  return { ...sheet, reasons: alert.threats.map(key => REASONS[key]) };
}
