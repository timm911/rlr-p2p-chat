const KEY = 'voice-timeouts'

export interface VoiceTimeouts {
  silenceMs: number
  noSpeechMs: number
}

const DEFAULTS: VoiceTimeouts = {
  silenceMs: 3000,
  noSpeechMs: 5000
}

export function getVoiceTimeouts(): VoiceTimeouts {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<VoiceTimeouts>
      return {
        // 3s is the max (and default); options step down to 1s
        silenceMs: Math.min(3000, Math.max(1000, parsed.silenceMs ?? DEFAULTS.silenceMs)),
        noSpeechMs: Math.min(10000, Math.max(3000, parsed.noSpeechMs ?? DEFAULTS.noSpeechMs))
      }
    }
  } catch (_) {}
  return DEFAULTS
}

export function setVoiceTimeouts(t: Partial<VoiceTimeouts>): void {
  const current = getVoiceTimeouts()
  const next: VoiceTimeouts = {
    silenceMs: Math.min(3000, Math.max(1000, t.silenceMs ?? current.silenceMs)),
    noSpeechMs: Math.min(10000, Math.max(3000, t.noSpeechMs ?? current.noSpeechMs))
  }
  localStorage.setItem(KEY, JSON.stringify(next))
}

export function getSilenceTimeoutMs(): number {
  return getVoiceTimeouts().silenceMs
}

export function getNoSpeechTimeoutMs(): number {
  return getVoiceTimeouts().noSpeechMs
}
