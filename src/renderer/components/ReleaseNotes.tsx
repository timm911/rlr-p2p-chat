import { useEffect, useState } from 'react'
import { CHANGELOG } from '../utils/changelog'
import './ReleaseNotes.css'

interface Props {
  onClose: () => void
}

/**
 * On-demand Release Notes viewer. Lists the FULL version history from
 * CHANGELOG (newest first) in a scrollable glass panel. Opened from
 * Settings → "Release notes" or the native Help → "Release Notes" menu —
 * never auto-shown.
 */
function ReleaseNotes({ onClose }: Props) {
  const [currentVersion, setCurrentVersion] = useState('')

  useEffect(() => {
    let mounted = true
    window.electronAPI
      .updateGetVersion()
      .then((v: string) => {
        if (mounted && v) setCurrentVersion(v)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  // Escape closes only this panel (capture + stopPropagation so an underlying
  // Settings menu, which also listens for Escape on window, stays open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      className="release-notes-overlay no-drag"
      role="dialog"
      aria-modal="true"
      aria-labelledby="release-notes-title"
      onClick={onClose}
    >
      <div className="release-notes-panel" onClick={(e) => e.stopPropagation()}>
        <div className="release-notes-header">
          <h3 id="release-notes-title">📋 Release notes</h3>
          <button
            type="button"
            className="release-notes-close"
            onClick={onClose}
            aria-label="Close release notes"
          >
            ×
          </button>
        </div>
        {currentVersion && (
          <div className="release-notes-current">Current version: v{currentVersion}</div>
        )}
        <div className="release-notes-scroll">
          {CHANGELOG.map((entry) => (
            <div key={entry.version} className="release-notes-version">
              <div className="release-notes-version-label">
                v{entry.version}
                {entry.version === currentVersion && (
                  <span className="release-notes-current-badge">current</span>
                )}
              </div>
              <ul className="release-notes-items">
                {entry.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ReleaseNotes
