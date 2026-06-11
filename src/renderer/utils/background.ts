/**
 * Per-client chat background. Saved in localStorage so it only affects this
 * machine — it is never sent to the peer. Applied as an inline gradient on
 * <body>, which overrides the CSS default while keeping the animated
 * background-position drift (gradientShift) intact.
 *
 * Each option also declares the foreground ("ink") tone that reads best on it
 * (light text on dark backgrounds, dark text on pale ones). The chosen ink is
 * exposed as the `--ink` / `--ink-soft` CSS variables and a body class so all
 * text stays legible when the background changes. The user can override the
 * auto choice from Settings.
 */
const KEY = 'rlrchat-background'
const INK_KEY = 'rlrchat-ink' // 'auto' | 'light' | 'dark'

export type InkPreference = 'auto' | 'light' | 'dark'

export interface BackgroundOption {
  value: string
  label: string
  gradient: string
  /** Best-reading text tone on this background. */
  ink: 'light' | 'dark'
  /** Optional animated overlay style class added to <body>. */
  motion?: 'waves' | 'clouds' | 'ripple'
}

// 'default' maps to the original CSS gradient (inline cleared) so the animated
// look is preserved exactly when no custom background is chosen.
export const DEFAULT_BACKGROUND = 'default'

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  // Animated gradient drift (existing gradientShift animation)
  { value: 'default', label: 'Default Purple', gradient: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 35%, #a855f7 60%, #ec4899 100%)', ink: 'light' },
  { value: 'ocean', label: 'Ocean', gradient: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 40%, #1e3a8a 100%)', ink: 'light' },
  { value: 'sunset', label: 'Sunset', gradient: 'linear-gradient(135deg, #f97316 0%, #db2777 50%, #7c3aed 100%)', ink: 'light' },
  { value: 'forest', label: 'Forest', gradient: 'linear-gradient(135deg, #10b981 0%, #059669 45%, #064e3b 100%)', ink: 'light' },
  { value: 'midnight', label: 'Midnight', gradient: 'linear-gradient(135deg, #1e293b 0%, #4c1d95 55%, #831843 100%)', ink: 'light' },
  { value: 'rose', label: 'Rose', gradient: 'linear-gradient(135deg, #fb7185 0%, #e11d48 50%, #9f1239 100%)', ink: 'light' },
  { value: 'aurora', label: 'Aurora', gradient: 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 45%, #22c55e 100%)', ink: 'light' },
  { value: 'graphite', label: 'Graphite', gradient: 'linear-gradient(135deg, #374151 0%, #1f2937 50%, #111827 100%)', ink: 'light' },
  { value: 'candy', label: 'Candy', gradient: 'linear-gradient(135deg, #f472b6 0%, #c084fc 50%, #60a5fa 100%)', ink: 'dark' },
  { value: 'gold', label: 'Gold', gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #92400e 100%)', ink: 'dark' },
  // Pale backgrounds (need dark ink)
  { value: 'cottoncandy', label: 'Cotton Candy', gradient: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 50%, #fbc2eb 100%)', ink: 'dark' },
  { value: 'mint', label: 'Mint', gradient: 'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)', ink: 'dark' },
  { value: 'peach', label: 'Peach', gradient: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', ink: 'dark' },
  { value: 'lavender', label: 'Lavender', gradient: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)', ink: 'dark' },
  { value: 'slate', label: 'Slate', gradient: 'linear-gradient(135deg, #334155 0%, #475569 50%, #64748b 100%)', ink: 'light' },
  { value: 'crimson', label: 'Crimson', gradient: 'linear-gradient(135deg, #870000 0%, #190a05 100%)', ink: 'light' },
  { value: 'emerald', label: 'Emerald Night', gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)', ink: 'light' },
  { value: 'cosmic', label: 'Cosmic', gradient: 'linear-gradient(135deg, #240b36 0%, #c31432 100%)', ink: 'light' },
  // Animated motion backgrounds (CSS keyframe overlays)
  { value: 'waves', label: 'Ocean Waves', gradient: 'linear-gradient(135deg, #1a2980 0%, #26d0ce 100%)', ink: 'light', motion: 'waves' },
  { value: 'ripple', label: 'Water Ripple', gradient: 'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)', ink: 'light', motion: 'ripple' },
  { value: 'clouds', label: 'Drifting Clouds', gradient: 'linear-gradient(135deg, #4a90d9 0%, #87ceeb 55%, #b0e0e6 100%)', ink: 'dark', motion: 'clouds' }
]

const MOTION_CLASSES = ['bg-motion-waves', 'bg-motion-ripple', 'bg-motion-clouds']

export function getBackground(): string {
  try {
    const v = localStorage.getItem(KEY)
    if (v && BACKGROUND_OPTIONS.some((o) => o.value === v)) return v
  } catch (_) {}
  return DEFAULT_BACKGROUND
}

export function getBackgroundOption(value: string): BackgroundOption {
  return BACKGROUND_OPTIONS.find((o) => o.value === value) ?? BACKGROUND_OPTIONS[0]
}

export function getBackgroundGradient(value: string): string {
  return getBackgroundOption(value).gradient
}

export function getInkPreference(): InkPreference {
  try {
    const v = localStorage.getItem(INK_KEY)
    if (v === 'auto' || v === 'light' || v === 'dark') return v
  } catch (_) {}
  return 'auto'
}

export function setInkPreference(pref: InkPreference): void {
  try {
    localStorage.setItem(INK_KEY, pref)
  } catch (_) {}
  applyInk(getBackground(), pref)
}

/** Resolve the effective ink tone given a background and the user preference. */
export function resolveInk(backgroundValue: string, pref: InkPreference = getInkPreference()): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref
  return getBackgroundOption(backgroundValue).ink
}

/**
 * Apply the foreground tone. 'light' ink = near-white text for dark
 * backgrounds; 'dark' ink = near-black for pale backgrounds. Drives the
 * --ink / --ink-soft CSS variables and an ink-light/ink-dark body class.
 */
export function applyInk(backgroundValue: string, pref: InkPreference = getInkPreference()): void {
  const ink = resolveInk(backgroundValue, pref)
  document.body.classList.remove('ink-light', 'ink-dark')
  document.body.classList.add(`ink-${ink}`)
  if (ink === 'light') {
    document.body.style.setProperty('--ink', '#ffffff')
    document.body.style.setProperty('--ink-soft', 'rgba(255,255,255,0.72)')
  } else {
    document.body.style.setProperty('--ink', '#1f2937')
    document.body.style.setProperty('--ink-soft', 'rgba(31,41,55,0.72)')
  }
}

export function setBackground(value: string): void {
  try {
    localStorage.setItem(KEY, value)
  } catch (_) {}
  applyBackground(value)
}

export function applyBackground(value: string): void {
  const opt = getBackgroundOption(value)

  // Motion overlay class on body
  document.body.classList.remove(...MOTION_CLASSES)
  if (opt.motion) {
    document.body.classList.add(`bg-motion-${opt.motion}`)
  }

  if (value === DEFAULT_BACKGROUND) {
    document.body.style.removeProperty('background-image')
    document.body.style.removeProperty('background')
  } else {
    // Set only background-image so background-size:400% from CSS keeps animating
    document.body.style.setProperty('background-image', opt.gradient)
    document.body.style.setProperty('background-size', '400% 400%')
  }

  // Keep foreground legible against the new background
  applyInk(value)
}

export function initBackground(): void {
  applyBackground(getBackground())
}
