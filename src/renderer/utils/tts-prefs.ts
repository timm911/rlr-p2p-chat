/**
 * Persisted TTS voice choice, per machine. The main-process TTS config isn't
 * saved across restarts, so we remember the user's pick here and re-apply it
 * on launch. When nothing has been chosen yet, a per-identity default is used
 * (RLRJupiter → Joe, Ripster → Alan).
 */
const KEY = 'rlrchat-tts-voice'

// Sentinel stored when the user explicitly picks "System Default"
const DEFAULT_SENTINEL = 'default'

export const IDENTITY_DEFAULT_VOICE: Record<'RLRJupiter' | 'Ramjet' | 'Ripster', string> = {
  RLRJupiter: 'piper:en_US-joe-medium',
  Ramjet: 'piper:en_US-joe-medium',
  Ripster: 'piper:en_GB-alan-medium'
}

/** Returns the saved voice id, null for system-default, or undefined if never set. */
export function getSavedVoice(): string | null | undefined {
  try {
    const v = localStorage.getItem(KEY)
    if (v === null) return undefined
    return v === DEFAULT_SENTINEL ? null : v
  } catch (_) {
    return undefined
  }
}

/** Persist the chosen voice (null = system default). */
export function setSavedVoice(voice: string | null): void {
  try {
    localStorage.setItem(KEY, voice ?? DEFAULT_SENTINEL)
  } catch (_) {}
}

/** The voice to use on launch for this identity: saved pick, else identity default. */
export function resolveInitialVoice(identity: 'RLRJupiter' | 'Ramjet' | 'Ripster'): string | null {
  const saved = getSavedVoice()
  if (saved !== undefined) return saved
  return IDENTITY_DEFAULT_VOICE[identity]
}
