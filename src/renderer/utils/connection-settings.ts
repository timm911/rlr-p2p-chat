const KEY = 'rlrchat-auto-reconnect'

export function getAutoReconnect(): boolean {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'false') return false
    if (v === 'true') return true
  } catch (_) {}
  return true
}

export function setAutoReconnect(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, String(enabled))
  } catch (_) {}
}

// Last-used connection settings, so neither user has to retype them each
// launch. The session password is kept only on this machine (localStorage of
// the local app profile) — it never leaves the device except as a scrypt-
// derived key during the encrypted handshake.
const LAST_CONNECTION_KEY = 'rlrchat-last-connection'

export interface SavedConnection {
  host: string
  port: number
  password: string
}

export function getSavedConnection(): SavedConnection | null {
  try {
    const raw = localStorage.getItem(LAST_CONNECTION_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (typeof data.host === 'string' && typeof data.port === 'number' && typeof data.password === 'string') {
      return data
    }
  } catch (_) {}
  return null
}

export function saveConnection(settings: SavedConnection): void {
  try {
    localStorage.setItem(LAST_CONNECTION_KEY, JSON.stringify(settings))
  } catch (_) {}
}

// Last-used identity, so the app can auto-resume the session on launch (e.g.
// after an auto-update restart) without re-selecting who you are.
const IDENTITY_KEY = 'rlrchat-identity'

export function getSavedIdentity(): 'RLRJupiter' | 'Ripster' | null {
  try {
    const v = localStorage.getItem(IDENTITY_KEY)
    if (v === 'RLRJupiter' || v === 'Ripster') return v
  } catch (_) {}
  return null
}

export function saveIdentity(identity: 'RLRJupiter' | 'Ripster'): void {
  try {
    localStorage.setItem(IDENTITY_KEY, identity)
  } catch (_) {}
}
