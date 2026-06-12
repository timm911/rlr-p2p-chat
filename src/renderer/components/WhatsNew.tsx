import { useEffect, useState } from 'react'
import {
  CHANGELOG,
  ChangelogEntry,
  entriesToShow,
  compareVersions,
  getLastSeenVersion,
  setLastSeenVersion,
  isWhatsNewSuppressed,
  setWhatsNewSuppressed
} from '../utils/changelog'
import './WhatsNew.css'

// Distinguish a truly fresh install (no popup) from an existing install being
// updated to the first version that HAS this popup (show it). Existing users
// have prior settings/history in localStorage.
function hasExistingAppData(): boolean {
  try {
    const keys = ['rlrchat-identity', 'rlrchat-last-connection', 'sound-config', 'voice-timeouts', 'rlrchat-theme', 'rlrchat-background']
    return keys.some((k) => localStorage.getItem(k) != null)
  } catch (_) {
    return false
  }
}

/**
 * "What's new" popup after an update. On launch, compares the running app
 * version to the last-seen version in localStorage and shows the changelog
 * entries in between. A truly fresh install (no stored version) is treated as
 * "seen" so the popup only ever appears after a real update. "Don't show
 * again" suppresses it permanently.
 */
function WhatsNew() {
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null)
  const [currentVersion, setCurrentVersion] = useState('')
  const [dontShowAgain, setDontShowAgain] = useState(false)

  useEffect(() => {
    let mounted = true
    window.electronAPI
      .updateGetVersion()
      .then((version: string) => {
        if (!mounted || !version) return
        if (isWhatsNewSuppressed()) {
          setLastSeenVersion(version)
          return
        }
        const lastSeen = getLastSeenVersion()
        if (!lastSeen) {
          // No stored version. If this is an existing install being updated to
          // the first version with this popup, show the latest changelog entry.
          // A truly fresh install (no app data) is treated as seen.
          const newest = CHANGELOG.find((e) => compareVersions(e.version, version) <= 0)
          if (hasExistingAppData() && newest) {
            setCurrentVersion(version)
            setEntries([newest])
          } else {
            setLastSeenVersion(version)
          }
          return
        }
        const toShow = entriesToShow(CHANGELOG, version, lastSeen)
        if (toShow.length > 0) {
          setCurrentVersion(version)
          setEntries(toShow)
        } else {
          setLastSeenVersion(version)
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  if (!entries) return null

  const dismiss = () => {
    setLastSeenVersion(currentVersion)
    if (dontShowAgain) setWhatsNewSuppressed(true)
    setEntries(null)
  }

  return (
    <div className="whats-new-overlay no-drag" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
      <div className="whats-new-panel">
        <h3 id="whats-new-title">✨ What's new in v{entries[0].version}</h3>
        <div className="whats-new-scroll">
          {entries.map((entry) => (
            <div key={entry.version} className="whats-new-version">
              {entries.length > 1 && <div className="whats-new-version-label">v{entry.version}</div>}
              <ul className="whats-new-items">
                {entry.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <label className="whats-new-dont-show">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
          Don't show again
        </label>
        <button type="button" className="whats-new-ok" onClick={dismiss} aria-label="Close what's new">
          OK
        </button>
      </div>
    </div>
  )
}

export default WhatsNew
