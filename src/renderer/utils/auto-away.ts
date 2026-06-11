/**
 * Auto-away preference, per machine. After N minutes with no interaction the
 * app flips an "active" status (Talk to me / Listen only) to Away, and restores
 * it on the next interaction.
 */
const ENABLED_KEY = 'rlrchat-auto-away-enabled'
const MINUTES_KEY = 'rlrchat-auto-away-minutes'

export function getAutoAwayEnabled(): boolean {
  try {
    const v = localStorage.getItem(ENABLED_KEY)
    if (v === 'false') return false
    if (v === 'true') return true
  } catch (_) {}
  return true // on by default
}

export function setAutoAwayEnabled(enabled: boolean): void {
  try { localStorage.setItem(ENABLED_KEY, String(enabled)) } catch (_) {}
}

export function getAutoAwayMinutes(): number {
  try {
    const v = parseInt(localStorage.getItem(MINUTES_KEY) || '', 10)
    if (!isNaN(v) && v >= 1 && v <= 60) return v
  } catch (_) {}
  return 5
}

export function setAutoAwayMinutes(minutes: number): void {
  const clamped = Math.min(60, Math.max(1, Math.round(minutes)))
  try { localStorage.setItem(MINUTES_KEY, String(clamped)) } catch (_) {}
}
