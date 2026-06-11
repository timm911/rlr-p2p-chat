/**
 * Global UI text size, per machine. Scales the whole interface via the CSS
 * `zoom` property on <html> (simple, affects every element including the
 * frosted glass and bubbles). Helps older eyes without restyling each piece.
 */
const KEY = 'rlrchat-text-size'

export const MIN_SCALE = 0.85
export const MAX_SCALE = 1.5
export const DEFAULT_SCALE = 1.0

export function getTextScale(): number {
  try {
    const v = parseFloat(localStorage.getItem(KEY) || '')
    if (!isNaN(v) && v >= MIN_SCALE && v <= MAX_SCALE) return v
  } catch (_) {}
  return DEFAULT_SCALE
}

export function setTextScale(scale: number): void {
  const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
  try {
    localStorage.setItem(KEY, String(clamped))
  } catch (_) {}
  applyTextScale(clamped)
}

export function applyTextScale(scale: number = getTextScale()): void {
  // `zoom` scales layout + fonts uniformly and is supported in the bundled
  // Chromium. Applied to documentElement so the whole app scales.
  ;(document.documentElement.style as any).zoom = String(scale)
}

export function initTextSize(): void {
  applyTextScale(getTextScale())
}
