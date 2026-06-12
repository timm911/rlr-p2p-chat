/**
 * User-defined custom statuses, per machine. Saved statuses show up in the
 * StatusDropdown alongside the presets so a favorite status ("Mowing",
 * "On the phone", …) is one click away instead of retyped every time.
 *
 * Custom statuses are plain: the speech statuses are exactly the strings
 * "Talk to me" and "Listen only", so a custom status behaves like Bed/Away
 * (notification sound plays, no TTS, no auto-away trigger). Adding a status
 * whose label collides with a preset or an existing custom is rejected.
 *
 * Add/remove dispatch CUSTOM_STATUSES_CHANGED_EVENT on window so a mounted
 * StatusDropdown refreshes live while the Settings panel edits the list.
 */

export interface CustomStatus {
  id: string
  emoji: string
  label: string
}

/** The built-in statuses (single source of truth, used by StatusDropdown). */
export const PRESET_STATUSES: { emoji: string; label: string }[] = [
  { emoji: '💬', label: 'Talk to me' },
  { emoji: '👂', label: 'Listen only' },
  { emoji: '⏰', label: 'BRB' },
  { emoji: '😴', label: 'Bed' },
  { emoji: '🍽️', label: 'Dinner' },
  { emoji: '📺', label: 'TV' },
  { emoji: '💤', label: 'Away' },
  { emoji: '👥', label: 'Company' }
]

export const DEFAULT_STATUS_EMOJI = '💬'
export const CUSTOM_STATUSES_CHANGED_EVENT = 'rlr:custom-statuses-changed'

const KEY = 'rlrchat-custom-statuses'

export function listCustomStatuses(): CustomStatus[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.filter(
      (s): s is CustomStatus =>
        !!s &&
        typeof s.id === 'string' &&
        typeof s.emoji === 'string' &&
        typeof s.label === 'string'
    )
  } catch (_) {
    return []
  }
}

function save(list: CustomStatus[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch (_) {}
  try { window.dispatchEvent(new Event(CUSTOM_STATUSES_CHANGED_EVENT)) } catch (_) {}
}

/**
 * Add a custom status. Returns the new status, or null when the trimmed
 * label is empty or collides (case-insensitive) with a preset — including
 * the speech statuses "Talk to me"/"Listen only" — or an existing custom.
 */
export function addCustomStatus(label: string, emoji?: string): CustomStatus | null {
  const trimmed = (label || '').trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  if (PRESET_STATUSES.some((p) => p.label.toLowerCase() === lower)) return null
  const list = listCustomStatuses()
  if (list.some((s) => s.label.toLowerCase() === lower)) return null
  const status: CustomStatus = {
    id: `cs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    emoji: (emoji || '').trim() || DEFAULT_STATUS_EMOJI,
    label: trimmed
  }
  save([...list, status])
  return status
}

/** Remove a custom status by id. Presets are not in the list, so they can't be removed. */
export function removeCustomStatus(id: string): void {
  const list = listCustomStatuses()
  const next = list.filter((s) => s.id !== id)
  if (next.length !== list.length) save(next)
}

/** Emoji for a status label — preset or saved custom — or null if unknown. */
export function getStatusEmoji(label: string): string | null {
  const preset = PRESET_STATUSES.find((s) => s.label === label)
  if (preset) return preset.emoji
  const custom = listCustomStatuses().find((s) => s.label === label)
  return custom ? custom.emoji : null
}
