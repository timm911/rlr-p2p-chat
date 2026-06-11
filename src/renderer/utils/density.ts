const KEY = 'rlrchat-density'
export type Density = 'comfortable' | 'compact'

export function getDensity(): Density {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'compact' || v === 'comfortable') return v
  } catch (_) {}
  return 'comfortable'
}

export function setDensity(density: Density): void {
  try {
    localStorage.setItem(KEY, density)
    applyDensity(density)
  } catch (_) {}
}

export function applyDensity(density: Density): void {
  document.body.classList.remove('density-comfortable', 'density-compact')
  document.body.classList.add(`density-${density}`)
}

export function initDensity(): void {
  applyDensity(getDensity())
}
