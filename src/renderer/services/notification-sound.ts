/**
 * Notification sound selection + playback.
 *
 * The user picks one of the bundled sounds, "Classic" (the synth beep),
 * "None", or a custom audio file (.wav/.mp3/.ogg/.m4a) from their computer.
 * The choice persists per machine. Data URLs are cached so playback is
 * instant.
 */
import { getSoundService } from './sound-service'

const SOUND_KEY = 'rlrchat-notif-sound'
const CUSTOM_PATH_KEY = 'rlrchat-notif-custom-path'

export interface SoundOption {
  id: string
  label: string
  /** 'classic' = synth beep, 'none' = silent, 'custom' = user file, else bundled wav */
  kind: 'classic' | 'none' | 'custom' | 'bundled'
}

export const BUNDLED_SOUNDS: { id: string; label: string }[] = [
  { id: 'chime', label: 'Chime' },
  { id: 'ding', label: 'Ding' },
  { id: 'pop', label: 'Pop' },
  { id: 'soft-pop', label: 'Soft Pop' },
  { id: 'knock', label: 'Knock' },
  { id: 'bell', label: 'Bell' },
  { id: 'marimba', label: 'Marimba' },
  { id: 'glass', label: 'Glass' },
  { id: 'pluck', label: 'Pluck' },
  { id: 'bloop', label: 'Bloop' }
]

export const SOUND_OPTIONS: SoundOption[] = [
  { id: 'classic', label: 'Classic beep', kind: 'classic' },
  ...BUNDLED_SOUNDS.map((s) => ({ id: s.id, label: s.label, kind: 'bundled' as const })),
  { id: 'none', label: 'None (silent)', kind: 'none' }
]

const dataUrlCache = new Map<string, string>()

export function getSelectedSound(): string {
  try {
    const v = localStorage.getItem(SOUND_KEY)
    if (v) return v
  } catch (_) {}
  return 'classic'
}

export function setSelectedSound(id: string): void {
  try { localStorage.setItem(SOUND_KEY, id) } catch (_) {}
}

export function getCustomSoundPath(): string | null {
  try { return localStorage.getItem(CUSTOM_PATH_KEY) } catch (_) { return null }
}

export function setCustomSoundPath(p: string): void {
  try { localStorage.setItem(CUSTOM_PATH_KEY, p) } catch (_) {}
  dataUrlCache.delete('custom')
}

/** Resolve a sound id to a playable data URL (cached). null = no audio file. */
async function resolveDataUrl(id: string): Promise<string | null> {
  if (id === 'classic' || id === 'none') return null
  if (dataUrlCache.has(id)) return dataUrlCache.get(id)!
  if (id === 'custom') {
    const p = getCustomSoundPath()
    if (!p) return null
    const r = await window.electronAPI.getFileDataUrl(p)
    if (r.success && r.dataUrl) { dataUrlCache.set('custom', r.dataUrl); return r.dataUrl }
    return null
  }
  const r = await window.electronAPI.getBundledSound(id)
  if (r.success && r.dataUrl) { dataUrlCache.set(id, r.dataUrl); return r.dataUrl }
  return null
}

// The most recent file playback — stopped before starting a new one so rapid
// consecutive messages (or preview clicks) don't stack overlapping copies.
let activeAudio: HTMLAudioElement | null = null

function playUrl(url: string): void {
  if (activeAudio) {
    try { activeAudio.pause() } catch (_) {}
    activeAudio = null
  }
  const audio = new Audio(url)
  audio.volume = getSoundService().getVolume()
  audio.onended = () => { if (activeAudio === audio) activeAudio = null }
  activeAudio = audio
  void audio.play().catch(() => {})
}

/**
 * Play a specific sound id once (used by the Settings preview buttons).
 * Previews always play — the user explicitly clicked ▶ — so the classic beep
 * bypasses the mute/enabled gates here.
 */
export async function previewSound(id: string): Promise<void> {
  if (id === 'none') return
  if (id === 'classic') { getSoundService().play('message-received', true); return }
  const url = await resolveDataUrl(id)
  if (url) playUrl(url)
}

/**
 * Play the currently-selected notification sound. Respects master mute. Used
 * for incoming messages (the caller decides the status/TTS gating, but we
 * double-check mute here as a safety net). If the selected file can't be
 * loaded (e.g. a custom file was moved or deleted), falls back to the classic
 * beep so incoming messages still ping.
 */
export async function playSelectedNotification(): Promise<void> {
  const svc = getSoundService()
  if (svc.isMuted()) return
  const id = getSelectedSound()
  if (id === 'none') return
  if (id === 'classic') { svc.play('message-received'); return }
  const url = await resolveDataUrl(id)
  if (url) { playUrl(url); return }
  svc.play('message-received')
}

/** Warm the cache for the selected sound so the first ping has no delay. */
export function preloadSelected(): void {
  void resolveDataUrl(getSelectedSound())
}
