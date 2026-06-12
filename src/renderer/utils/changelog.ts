/**
 * Version history shown in the on-demand Release Notes viewer
 * (ReleaseNotes.tsx, opened from Settings or Help → Release Notes).
 *
 * CHANGELOG is newest-first and lists every user-facing release. Pure helpers
 * (compareVersions / entriesToShow) are unit tested in
 * tests/unit/changelog.test.ts.
 */

export interface ChangelogEntry {
  version: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.16.0',
    items: [
      '📋 Release notes viewer (see version history any time in Settings)',
      '🔕 Removed the auto popup after updates'
    ]
  },
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
    items: ['🔔 Notification sound picker (10 sounds + custom)']
  },
  {
    version: '2.13.0',
    items: ['⬇️ Per-user install so updates apply with no admin/UAC prompt']
  },
  {
    version: '2.11.0',
    items: [
      '📅 Date dividers & message search',
      '💤 Auto-away when idle',
      '🎙️ Voice messages'
    ]
  },
  {
    version: '2.10.0',
    items: ["🔄 Manual 'Check for updates' button"]
  },
  {
    version: '2.9.0',
    items: [
      '🔒 Encrypted chat history & saved password at rest',
      '✍️ Spell-check',
      '🔠 Adjustable text size',
      '💬 Status now persists across restarts'
    ]
  },
  {
    version: '2.8.0',
    items: ['⬆️ Automatic updates over the internet']
  },
  {
    version: '2.6.0',
    items: ['🔇 Mute button for sounds & speech']
  },
  {
    version: '2.4.0',
    items: ['🗣️ Natural neural voices (Alan, Joe, Ryan, and more)']
  },
  {
    version: '2.0.0',
    items: ['🔐 End-to-end AES-256 encryption for all messages, files & calls']
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
 * Which changelog entries are newer than a previously seen version, up to and
 * including the current version (newest first). A missing last-seen version
 * means a fresh install — show nothing.
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
