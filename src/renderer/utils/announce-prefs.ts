/**
 * "Speak announcements" preference, per machine. When on AND the local user is
 * in a speech status ("Talk to me"/"Listen only"), the app reads out peer
 * events (status changes, incoming calls, reconnects) so a voice-first user who
 * isn't looking at the screen still hears them. Default OFF.
 *
 * Stored as a plain boolean flag in localStorage, like the other renderer prefs
 * (see auto-away.ts / tts-prefs.ts). Announcements always go through TTS the
 * same way spoken messages do; the caller is responsible for not talking over a
 * message being read (see announceEvent in ChatWindow).
 */
const KEY = 'rlrchat-speak-announcements'

/** True if spoken announcements are enabled. Default false (never set → off). */
export function getSpeakAnnouncements(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true'
  } catch (_) {
    return false
  }
}

/** Persist the spoken-announcements preference. */
export function setSpeakAnnouncements(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, enabled ? 'true' : 'false')
  } catch (_) {}
}
