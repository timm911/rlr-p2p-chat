/**
 * Auto-trim: optionally drop chat messages older than a cutoff so history (and
 * the on-disk file) doesn't grow forever. Per-device setting; default OFF.
 */
const ENABLED_KEY = 'rlrchat-auto-trim'
export const TRIM_AGE_MS = 90 * 24 * 60 * 60 * 1000 // ~3 months

export function getAutoTrimEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) === 'true' } catch (_) { return false }
}

export function setAutoTrimEnabled(enabled: boolean): void {
  try { localStorage.setItem(ENABLED_KEY, String(enabled)) } catch (_) {}
}

/** Pure: keep only messages newer than the cutoff (default 3 months before now). */
export function trimOldMessages<T extends { timestamp: number }>(messages: T[], now: number = Date.now()): T[] {
  const cutoff = now - TRIM_AGE_MS
  return messages.filter((m) => (m?.timestamp || 0) >= cutoff)
}
