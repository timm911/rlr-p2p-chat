const KEY = 'rlrchat-theme'
export type Theme = 'dark' | 'light'

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch (_) {}
  return 'dark'
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme)
    applyTheme(theme)
  } catch (_) {}
}

export function applyTheme(theme: Theme): void {
  document.body.classList.remove('theme-dark', 'theme-light')
  document.body.classList.add(`theme-${theme}`)
}

export function initTheme(): void {
  applyTheme(getTheme())
}
