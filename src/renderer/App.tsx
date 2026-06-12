import { useState, useEffect } from 'react'
import UserSelection from './components/UserSelection'
import ConnectionSetup from './components/ConnectionSetup'
import ChatWindow from './components/ChatWindow'
import ReleaseNotes from './components/ReleaseNotes'
import { getSavedConnectionMeta, getSavedIdentity, saveIdentity } from './utils/connection-settings'
import './styles/App.css'

type Screen = 'user-selection' | 'connection-setup' | 'chat'
type UserIdentity = 'RLRJupiter' | 'Ripster' | null

export interface ConnectionConfig {
  host: string
  port: number
}

// Auto-resume: if we already know who we are and have a saved connection
// (host/port/password), skip straight to connecting on launch. This is what
// makes the app reconnect by itself after an auto-update restart.
const savedIdentity = getSavedIdentity()
const savedConn = getSavedConnectionMeta()
const canAutoResume = !!savedIdentity && !!savedConn && savedConn.hasPassword &&
  (savedIdentity === 'Ripster' || !!savedConn.host)

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>(
    canAutoResume ? 'connection-setup' : 'user-selection'
  )
  const [userIdentity, setUserIdentity] = useState<UserIdentity>(
    canAutoResume ? savedIdentity : null
  )
  const [autoConnect, setAutoConnect] = useState<boolean>(canAutoResume)
  const [connectionConfig, setConnectionConfig] = useState<ConnectionConfig>({
    // Default left blank in source; each machine remembers its own peer
    // address after the first successful connection (saved locally).
    host: savedConn?.host ?? '',
    port: savedConn?.port ?? 8082
  })
  const [updateNotice, setUpdateNotice] = useState<string | null>(null)
  const [showReleaseNotes, setShowReleaseNotes] = useState(false)

  // On-demand Release Notes viewer (never auto-shown). Opened from the
  // Settings menu (DOM event, dispatched by SettingsMenu) or from the native
  // Help → "Release Notes" menu item (IPC from the main process).
  useEffect(() => {
    const open = () => setShowReleaseNotes(true)
    window.addEventListener('rlr:show-release-notes', open)
    const offMenu = window.electronAPI.onShowReleaseNotes(open)
    return () => {
      window.removeEventListener('rlr:show-release-notes', open)
      offMenu()
    }
  }, [])

  // Surface auto-update progress so users know the app is updating/restarting
  useEffect(() => {
    const off = window.electronAPI.onUpdateStatus(({ status, info }) => {
      if (status === 'downloading') setUpdateNotice(`Downloading update… ${info?.percent ?? 0}%`)
      else if (status === 'downloaded') setUpdateNotice(`Updating to v${info?.version ?? ''} — restarting…`)
      else if (status === 'available') setUpdateNotice('Update found — downloading…')
      else if (status === 'none' || status === 'error') setUpdateNotice(null)
    })
    return off
  }, [])

  // Force body scroll to 0 and prevent scrolling
  useEffect(() => {
    // Reset scroll immediately
    document.body.scrollTop = 0
    document.documentElement.scrollTop = 0

    // Keep it at 0 - prevent any scrolling
    const preventScroll = () => {
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0
      if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0
    }

    window.addEventListener('scroll', preventScroll, { passive: true })
    document.body.addEventListener('scroll', preventScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', preventScroll)
      document.body.removeEventListener('scroll', preventScroll)
    }
  }, [])

  const handleUserSelected = (identity: 'RLRJupiter' | 'Ripster') => {
    setUserIdentity(identity)
    saveIdentity(identity) // remembered so the app can auto-resume next launch
    setCurrentScreen('connection-setup')
  }

  const handleConnectionReady = (config: ConnectionConfig & { password: string }) => {
    // Store config without password (password only needed for connection)
    setConnectionConfig({ host: config.host, port: config.port })
    setCurrentScreen('chat')
  }

  const handleBackToConnection = () => {
    setAutoConnect(false) // a manual return shouldn't auto-fire the connect
    setCurrentScreen('connection-setup')
  }

  return (
    <div className={`app-container ${currentScreen === 'chat' ? 'fullscreen' : ''}`}>
      {/* Release notes — only when the user asks for them */}
      {showReleaseNotes && <ReleaseNotes onClose={() => setShowReleaseNotes(false)} />}
      {updateNotice && (
        <div className="update-notice" role="status" aria-live="polite">
          🔄 {updateNotice}
        </div>
      )}
      {currentScreen === 'user-selection' && (
        <UserSelection onSelect={handleUserSelected} />
      )}

      {currentScreen === 'connection-setup' && (
        <ConnectionSetup
          userIdentity={userIdentity!}
          initialConfig={connectionConfig}
          onConnect={handleConnectionReady}
          autoConnect={autoConnect}
        />
      )}

      {currentScreen === 'chat' && (
        <ChatWindow
          userIdentity={userIdentity!}
          connectionConfig={connectionConfig}
          onDisconnect={handleBackToConnection}
        />
      )}
    </div>
  )
}

export default App
