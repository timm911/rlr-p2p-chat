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
// launch. Host/port are stored readably (not secret); the session PASSWORD is
// encrypted at rest with the OS keystore (Windows DPAPI via safeStorage) so it
// isn't recoverable as plain text from disk.
const LAST_CONNECTION_KEY = 'rlrchat-last-connection'

export interface SavedConnectionMeta {
  host: string
  port: number
  hasPassword: boolean
}

interface StoredConnection {
  host: string
  port: number
  pwEnc?: string | null // safeStorage-encrypted (base64)
  pw?: string | null // plaintext fallback when OS encryption unavailable / legacy
  password?: string // legacy field (pre-encryption builds)
}

function readStored(): StoredConnection | null {
  try {
    const raw = localStorage.getItem(LAST_CONNECTION_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (typeof data.host === 'string' && typeof data.port === 'number') return data
  } catch (_) {}
  return null
}

/** Sync metadata for prefill + auto-resume gating (no password value). */
export function getSavedConnectionMeta(): SavedConnectionMeta | null {
  const s = readStored()
  if (!s) return null
  const hasPassword = !!(s.pwEnc || s.pw || s.password)
  return { host: s.host, port: s.port, hasPassword }
}

/** Decrypt and return the saved password (async, needs the main process). */
export async function getSavedPassword(): Promise<string | null> {
  const s = readStored()
  if (!s) return null
  if (s.pwEnc) {
    try {
      const dec = await window.electronAPI.secureDecrypt(s.pwEnc)
      if (dec != null) return dec
    } catch (_) {}
    return null
  }
  return s.pw ?? s.password ?? null
}

export async function saveConnection(settings: { host: string; port: number; password: string }): Promise<void> {
  let pwEnc: string | null = null
  try {
    pwEnc = await window.electronAPI.secureEncrypt(settings.password)
  } catch (_) {}
  const stored: StoredConnection = pwEnc
    ? { host: settings.host, port: settings.port, pwEnc }
    : { host: settings.host, port: settings.port, pw: settings.password } // OS keystore unavailable
  try {
    localStorage.setItem(LAST_CONNECTION_KEY, JSON.stringify(stored))
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
