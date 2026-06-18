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
            className="release-notes-post"
            onClick={() => {
              const entry = CHANGELOG.find((e) => e.version === currentVersion) || CHANGELOG[0]
              if (!entry) return
              const text = `📋 What's new in v${entry.version}:\n` + entry.items.map((i) => `• ${i}`).join('\n')
              window.dispatchEvent(new CustomEvent('rlr:post-release-notes', { detail: text }))
              onClose()
            }}
            aria-label="Post these release notes into the chat"
            title="Post to chat"
          >
            📨 Post to chat
          </button>
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
        <div className="release-notes-footer">
          <a
            href="https://github.com/timm911/rlr-p2p-chat"
            className="release-notes-github"
            onClick={(e) => {
              e.preventDefault()
              window.electronAPI.openExternal('https://github.com/timm911/rlr-p2p-chat')
            }}
            aria-label="Open the project on GitHub"
            title="github.com/timm911/rlr-p2p-chat"
          >
            🔗 View on GitHub
          </a>
        </div>
      </div>
    </div>
  )
}

export default ReleaseNotes
