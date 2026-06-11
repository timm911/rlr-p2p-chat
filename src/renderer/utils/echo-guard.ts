/**
 * TTS echo detection.
 *
 * In "Talk to me" mode the app reads incoming messages aloud and then opens
 * the mic. If the mic picks up the speaker audio (no headphones, lingering
 * playback), the recognizer transcribes our own TTS and the app auto-sends it
 * back as a fake reply. This guard compares recognized speech against texts
 * TTS recently played and discards near-matches.
 */

export interface SpokenText {
  text: string
  time: number
}

const ECHO_WINDOW_MS = 30000

export function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s']/g, '').split(/\s+/).filter(Boolean)
}

/**
 * True when `recognized` looks like an echo of something TTS spoke within the
 * last 30s. Checks token overlap in both directions: the recognition can be a
 * subset of the spoken text (partial pickup) or contain it (real speech mixed
 * with echo — still unusable as a reply).
 */
export function isEchoOfRecentTTS(recognized: string, recentTTS: SpokenText[], now: number = Date.now()): boolean {
  const recTokens = tokenize(recognized)
  if (recTokens.length < 3) return false // too short to judge; let it through

  for (const entry of recentTTS) {
    if (now - entry.time > ECHO_WINDOW_MS) continue
    const ttsTokens = tokenize(entry.text)
    if (ttsTokens.length < 4) continue
    const ttsSet = new Set(ttsTokens)
    const recSet = new Set(recTokens)
    const recInTts = recTokens.filter((t) => ttsSet.has(t)).length / recTokens.length
    const ttsInRec = ttsTokens.filter((t) => recSet.has(t)).length / ttsTokens.length
    if (recInTts >= 0.6 || ttsInRec >= 0.75) {
      return true
    }
  }
  return false
}

/** Append a spoken text and prune entries older than the echo window. */
export function recordSpokenText(list: SpokenText[], text: string, now: number = Date.now()): SpokenText[] {
  return list.filter((e) => now - e.time < ECHO_WINDOW_MS).concat({ text, time: now })
}
