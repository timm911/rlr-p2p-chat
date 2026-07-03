/**
 * Quiet hours (scheduled Do-Not-Disturb), per machine. When active, the app
 * suppresses notification sounds, the nudge buzz/shake, TTS reading, and
 * reminder chimes — messages still arrive silently and the unread badge still
 * updates. Independent of the master mute (either one silences output).
 *
 * Stored in localStorage like the other renderer prefs (see auto-away.ts).
 * `isQuietNow` is a pure function (unit-tested) so the overnight-wraparound
 * logic is verified without a running app.
 */

export interface QuietHoursConfig {
  enabled: boolean
  /** "HH:MM" 24-hour local time. */
  start: string
  /** "HH:MM" 24-hour local time. */
  end: string
}

const KEY = 'rlrchat-quiet-hours'
const DEFAULT: QuietHoursConfig = { enabled: false, start: '22:00', end: '08:00' }

/** Parse "HH:MM" → minutes-since-midnight, or null if malformed/out-of-range. */
function parseHM(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((v || '').trim())
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

export function getQuietHours(): QuietHoursConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT }
    const parsed = JSON.parse(raw)
    return {
      enabled: !!parsed.enabled,
      start: typeof parsed.start === 'string' && parseHM(parsed.start) !== null ? parsed.start : DEFAULT.start,
      end: typeof parsed.end === 'string' && parseHM(parsed.end) !== null ? parsed.end : DEFAULT.end
    }
  } catch (_) {
    return { ...DEFAULT }
  }
}

export function setQuietHours(cfg: QuietHoursConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg))
  } catch (_) {}
}

/**
 * Whether `now` falls inside the configured quiet-hours window. Pure.
 * Handles overnight ranges (start > end, e.g. 22:00–08:00). A zero-length
 * window (start === end) is treated as "never quiet".
 */
export function isQuietNow(cfg: QuietHoursConfig, now: Date): boolean {
  if (!cfg || !cfg.enabled) return false
  const s = parseHM(cfg.start)
  const e = parseHM(cfg.end)
  if (s === null || e === null || s === e) return false
  const m = now.getHours() * 60 + now.getMinutes()
  if (s < e) return m >= s && m < e // same-day window
  return m >= s || m < e // overnight wraparound
}
