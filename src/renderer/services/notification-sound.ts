/**
 * Notification sound selection + playback.
 *
 * The user picks one of the bundled sounds, "Classic" (the synth beep),
 * "None", or one of their SAVED custom audio files (.wav/.mp3/.ogg/.m4a).
 * Custom files are kept as a list ({ id, name, path }[]) so several can be
 * saved and switched between. The choice persists per machine. Data URLs are
 * cached so playback is instant.
 *
 * Migration: older versions stored a SINGLE custom file under
 * 'rlrchat-notif-custom-path' with the selection id 'custom'. On first load
 * that path is converted into a list entry that KEEPS the id 'custom', so an
 * existing selection continues to work unchanged.
 */
import { getSoundService } from './sound-service'

const SOUND_KEY = 'rlrchat-notif-sound'
const CUSTOM_LIST_KEY = 'rlrchat-notif-custom-sounds'
const LEGACY_CUSTOM_PATH_KEY = 'rlrchat-notif-custom-path'

export interface SoundOption {
  id: string
  label: string
  /** 'classic' = synth beep, 'none' = silent, 'custom' = user file, else bundled wav */
  kind: 'classic' | 'none' | 'custom' | 'bundled'
}

/** A user-saved custom sound file (name = file basename, shown in Settings). */
export interface CustomSound {
  id: string
  name: string
  path: string
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

function basename(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

function readCustomList(): CustomSound[] {
  try {
    const raw = localStorage.getItem(CUSTOM_LIST_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.filter(
      (s): s is CustomSound =>
        !!s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.path === 'string'
    )
  } catch (_) {
    return []
  }
}

function writeCustomList(list: CustomSound[]): void {
  try { localStorage.setItem(CUSTOM_LIST_KEY, JSON.stringify(list)) } catch (_) {}
}

// One-time conversion of the old single-custom storage into the list.
let migrated = false
function migrateLegacyCustom(): void {
  if (migrated) return
  migrated = true
  try {
    const legacyPath = localStorage.getItem(LEGACY_CUSTOM_PATH_KEY)
    if (!legacyPath) return
    const list = readCustomList()
    if (!list.some((s) => s.id === 'custom' || s.path === legacyPath)) {
      // Keep the legacy id 'custom' so a saved selection of 'custom' still resolves.
      list.push({ id: 'custom', name: basename(legacyPath), path: legacyPath })
      writeCustomList(list)
    }
    localStorage.removeItem(LEGACY_CUSTOM_PATH_KEY)
  } catch (_) {}
}

/** All saved custom sounds (runs the legacy single-custom migration first). */
export function listCustomSounds(): CustomSound[] {
  migrateLegacyCustom()
  return readCustomList()
}

/**
 * Save a custom sound file and return its id. Re-adding a path that is
 * already in the list just returns the existing entry's id.
 */
export function addCustomSound(path: string): string {
  migrateLegacyCustom()
  const list = readCustomList()
  const existing = list.find((s) => s.path === path)
  if (existing) return existing.id
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  writeCustomList([...list, { id, name: basename(path), path }])
  return id
}

/**
 * Delete a saved custom sound. If it was the selected notification sound,
 * the selection falls back to 'classic'.
 */
export function removeCustomSound(id: string): void {
  migrateLegacyCustom()
  writeCustomList(readCustomList().filter((s) => s.id !== id))
  dataUrlCache.delete(id)
  if (getSelectedSound() === id) setSelectedSound('classic')
}

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

/** Resolve a sound id to a playable data URL (cached). null = no audio file. */
async function resolveDataUrl(id: string): Promise<string | null> {
  if (id === 'classic' || id === 'none') return null
  if (dataUrlCache.has(id)) return dataUrlCache.get(id)!
  const custom = listCustomSounds().find((s) => s.id === id)
  if (custom) {
    const r = await window.electronAPI.getFileDataUrl(custom.path)
    if (r.success && r.dataUrl) { dataUrlCache.set(id, r.dataUrl); return r.dataUrl }
    return null
  }
  if (!BUNDLED_SOUNDS.some((s) => s.id === id)) return null // unknown/deleted custom id
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
 * loaded (e.g. a custom file was moved, deleted from the list, or removed
 * from disk), falls back to the classic beep so incoming messages still ping.
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

// Test hook: the Playwright smoke tests drive the custom-sound list through
// window.evaluate (the OS file picker can't be automated). Not part of the
// app's API surface.
if (typeof window !== 'undefined') {
  ;(window as any).__rlrNotifSoundTest = {
    listCustomSounds,
    addCustomSound,
    removeCustomSound,
    getSelectedSound,
    setSelectedSound,
    previewSound,
    playSelectedNotification
  }
}
