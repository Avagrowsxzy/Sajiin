// Utilitas lockout login: durasi backoff bertingkat (menit) tanpa blokir permanen.
// Dipakai untuk lockout per-akun (tabel users) maupun per (IP + username) (tabel login_attempts).

export const LOCKOUT_THRESHOLD = 5;

// 5 gagal -> 15m, 6 -> 30m, 7 -> 60m, 8 -> 2 jam, 9+ -> 4 jam (batas atas).
// Tidak ada blokir permanen agar akun asli tidak bisa dikunci selamanya oleh penyerang.
const BACKOFF_MINUTES = [15, 30, 60, 120, 240] as const;

/**
 * Mengembalikan durasi kunci (menit) untuk sejumlah kegagalan, atau null bila belum perlu dikunci.
 */
export function lockDurationMinutes(failedAttempts: number): number | null {
  if (failedAttempts < LOCKOUT_THRESHOLD) return null;
  const index = Math.min(failedAttempts - LOCKOUT_THRESHOLD, BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[index];
}
