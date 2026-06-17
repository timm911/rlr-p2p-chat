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
    version: '3.3.0',
    items: [
      '🔣 Bundled an emoji font so ALL emojis & icons show on every computer (fixes blank squares on older Windows — picker, reactions, edit/delete icons)',
      '🏷️ Buttons by the text box now have labels (Emoji, Later, File, Screen, Talk, Voice, Send) so you don\'t have to guess',
      '📋 "What\'s new" now posts itself into the chat automatically after an update'
    ]
  },
  {
    version: '3.2.3',
    items: [
      '🎨 Clearer per-person bubble colors — RLRJupiter (blue), Ramjet (amber), Ripster (pink); your own messages use your color so sender vs receiver never match',
      '📨 "Post to chat" button in Release Notes — drop the version\'s what\'s-new into the chat'
    ]
  },
  {
    version: '3.2.2',
    items: [
      '✏️ Edit & unsend now work anytime on your own messages (removed the 1-minute limit)',
      '🐞 Fixed messages sometimes showing up twice (duplicates)'
    ]
  },
  {
    version: '3.2.1',
    items: [
      '🧹 "Clear history" now clears everything and stays cleared (won\'t re-sync old messages back)',
      '⏳ New setting: auto-trim messages older than 3 months'
    ]
  },
  {
    version: '3.2.0',
    items: [
      '🖥️ Live screen sharing — share a window or your whole screen in real time (button in the header)',
      '😀 React with emojis on photos & files, not just text messages',
      '✨ Your own message bubbles are now glassy & 3D to match the ones you receive',
      '🙂 The emoji picker closes after you pick one'
    ]
  },
  {
    version: '3.1.0',
    items: [
      '📸 Screenshot button — capture any window or your whole screen, crop it, and send it right into the chat',
      '✏️ Edit or unsend your own message within a minute',
      '⏰ Reminders — schedule an alert (chime + spoken) for yourself or the other person',
      '👀 Smarter "Seen" — only marks seen when you\'re actually looking (focused, message on screen, recently active)',
      '📥 Offline messages now survive a restart and still send when you reconnect'
    ]
  },
  {
    version: '3.0.3',
    items: [
      '📞 Calling rings both of a person\'s computers — whoever answers first connects, the others stop ringing',
      '🔕 No more reconnect beep — the connection log flashes briefly instead'
    ]
  },
  {
    version: '3.0.2',
    items: [
      '🟢 Live online dots — each person shows green only while actually connected (a sleeping/closed machine no longer looks online)',
      '🚪 Log off button (Settings) returns you to the identity screen'
    ]
  },
  {
    version: '3.0.0',
    items: [
      '👥 Three-way group chat — new "Ramjet" identity so you can run two computers at once',
      '🔄 History sync — pick up the conversation from your other computer, nothing missed',
      '🖼️ Tap an image to view it full-size (zoom to read screenshots)',
      '🎨 Each person\'s messages are color-coded so you can tell who sent what',
      '📊 Header shows everyone by name with their own status'
    ]
  },
  {
    version: '2.17.0',
    items: [
      '🏷️ Add & delete your own custom statuses',
      '🔔 Save multiple custom notification sounds'
    ]
  },
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
