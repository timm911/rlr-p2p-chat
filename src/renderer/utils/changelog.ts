/**
 * "What's new" changelog shown after an auto-update.
 *
 * CHANGELOG is newest-first. WhatsNew.tsx compares the running app version
 * (update:get-version) against the last version the user saw and shows every
 * entry in between. Pure helpers (compareVersions / entriesToShow) are unit
 * tested in tests/unit/changelog.test.ts.
 */

export interface ChangelogEntry {
  version: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.15.0',
    items: [
      '🎙️ Voice calls (full-duplex, encrypted)',
      '↩️ Reply to a specific message',
      '✓✓ Read receipts ("Seen")',
      '👋 Nudge to get attention',
      '📥 Offline messages send automatically when you reconnect',
      '😀 Full emoji picker (react with any emoji)',
      '🕐 Schedule messages to send later',
      '🔔 Notification sound picker'
    ]
  },
  {
    version: '2.14.0',
    items: ['🛠️ Stability and reconnect fixes']
  }
]

/** Compare dotted version strings: negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/**
 * Which changelog entries to show after an update: everything newer than the
 * last-seen version, up to and including the current version (newest first).
 * A missing last-seen version means a fresh install — show nothing.
 */
export function entriesToShow(
  changelog: ChangelogEntry[],
  currentVersion: string,
  lastSeenVersion: string | null
): ChangelogEntry[] {
  if (!lastSeenVersion || !currentVersion) return []
  if (compareVersions(currentVersion, lastSeenVersion) <= 0) return []
  return changelog
    .filter(
      (e) =>
        compareVersions(e.version, lastSeenVersion) > 0 &&
        compareVersions(e.version, currentVersion) <= 0
    )
    .sort((a, b) => compareVersions(b.version, a.version))
}

// --- Per-device persistence (localStorage) ---

const LAST_SEEN_KEY = 'rlrchat-whats-new-last-seen'
const SUPPRESS_KEY = 'rlrchat-whats-new-suppressed'

export function getLastSeenVersion(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_KEY)
  } catch (_) {
    return null
  }
}

export function setLastSeenVersion(version: string): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, version)
  } catch (_) {}
}

export function isWhatsNewSuppressed(): boolean {
  try {
    return localStorage.getItem(SUPPRESS_KEY) === '1'
  } catch (_) {
    return false
  }
}

export function setWhatsNewSuppressed(suppressed: boolean): void {
  try {
    localStorage.setItem(SUPPRESS_KEY, suppressed ? '1' : '0')
  } catch (_) {}
}
