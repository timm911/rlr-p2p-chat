const KEY = 'rlrchat-accent'
export type AccentName = 'violet' | 'blue' | 'green' | 'amber' | 'rose'

const ACCENT_COLORS: Record<AccentName, string> = {
  violet: '#8b5cf6',
  blue: '#3b82f6',
  green: '#22c55e',
  amber: '#f59e0b',
  rose: '#f43f5e'
}

export function getAccent(): AccentName {
  try {
    const v = localStorage.getItem(KEY)
    if (v && v in ACCENT_COLORS) return v as AccentName
  } catch (_) {}
  return 'violet'
}

export function setAccent(accent: AccentName): void {
  try {
    localStorage.setItem(KEY, accent)
    applyAccent(accent)
  } catch (_) {}
}

export function getAccentColor(name: AccentName): string {
  return ACCENT_COLORS[name] ?? ACCENT_COLORS.violet
}

export function applyAccent(accent: AccentName): void {
  const color = getAccentColor(accent)
  document.body.style.setProperty('--accent', color)
}

export function initAccent(): void {
  applyAccent(getAccent())
}

export const ACCENT_OPTIONS: { value: AccentName; label: string }[] = [
  { value: 'violet', label: 'Violet' },
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'amber', label: 'Amber' },
  { value: 'rose', label: 'Rose' }
]
