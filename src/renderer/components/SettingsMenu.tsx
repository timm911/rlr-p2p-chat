import { useState, useEffect } from 'react'
import './SettingsMenu.css'
import { getSoundService } from '../services/sound-service'
import { getVoiceTimeouts, setVoiceTimeouts } from '../utils/voice-timeouts'
import { getTheme, setTheme } from '../utils/theme'
import { getDensity, setDensity } from '../utils/density'
import { getAccent, setAccent, ACCENT_OPTIONS } from '../utils/accent'
import { getBackground, setBackground, BACKGROUND_OPTIONS, getInkPreference, setInkPreference, InkPreference } from '../utils/background'
import { setSavedVoice } from '../utils/tts-prefs'
import { getTextScale, setTextScale, MIN_SCALE, MAX_SCALE } from '../utils/text-size'
import { getAutoAwayEnabled, setAutoAwayEnabled, getAutoAwayMinutes, setAutoAwayMinutes } from '../utils/auto-away'
import { getAutoTrimEnabled, setAutoTrimEnabled } from '../utils/auto-trim'
import { SOUND_OPTIONS, getSelectedSound, setSelectedSound, previewSound, preloadSelected, listCustomSounds, addCustomSound, removeCustomSound, CustomSound } from '../services/notification-sound'
import { getAutoReconnect, setAutoReconnect } from '../utils/connection-settings'
import { getSpeakAnnouncements, setSpeakAnnouncements } from '../utils/announce-prefs'
import { getQuietHours, setQuietHours } from '../utils/quiet-hours'
import { getSpeechEngineSetting, setSpeechEngineSetting, SpeechEngineKind } from '../services/speech-engine'
import { listCustomStatuses, addCustomStatus, removeCustomStatus, DEFAULT_STATUS_EMOJI, CustomStatus } from '../utils/custom-statuses'
import EmojiPicker from './EmojiPicker'

interface Props {
  onClose: () => void
  onReconnect: () => void
  onLogoff: () => void
}

interface TTSConfig {
  voice: string | null
  speed: number
  volume: number
  enabled: boolean
}

function SettingsMenu({ onClose, onReconnect, onLogoff }: Props) {
  const [ttsConfig, setTtsConfig] = useState<TTSConfig>({
    voice: null,
    speed: 1.0,
    volume: 1.0,
    enabled: true
  })
  const [availableVoices, setAvailableVoices] = useState<{ id: string; label: string }[]>([])
  const [showTTSSettings, setShowTTSSettings] = useState(false)
  const [showSpeechInfo, setShowSpeechInfo] = useState(false)
  const [soundsEnabled, setSoundsEnabled] = useState(true)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [micTestResult, setMicTestResult] = useState<{ success?: boolean; error?: string; details?: any } | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [voiceTimeouts, setVoiceTimeoutsState] = useState(getVoiceTimeouts)
  const [theme, setThemeState] = useState<'dark' | 'light'>(getTheme)
  const [density, setDensityState] = useState<'comfortable' | 'compact'>(getDensity)
  const [accent, setAccentState] = useState(getAccent)
  const [background, setBackgroundState] = useState(getBackground)
  const [inkPref, setInkPrefState] = useState<InkPreference>(getInkPreference)
  const [textScale, setTextScaleState] = useState<number>(getTextScale)
  const [appVersion, setAppVersion] = useState<string>('')
  const [updateMsg, setUpdateMsg] = useState<string>('')
  const [checking, setChecking] = useState(false)
  const [autoAway, setAutoAwayState] = useState(getAutoAwayEnabled)
  const [autoAwayMin, setAutoAwayMinState] = useState(getAutoAwayMinutes)
  const [autoTrim, setAutoTrimState] = useState(getAutoTrimEnabled)
  const [speakAnnouncements, setSpeakAnnouncementsState] = useState(getSpeakAnnouncements)
  const [quietHours, setQuietHoursState] = useState(getQuietHours)
  const [exportMsg, setExportMsg] = useState<string>('')
  const handleExportHistory = async () => {
    setExportMsg('')
    try {
      const r = await window.electronAPI.historyExport()
      if (r.canceled) return
      if (r.success) setExportMsg(`Exported ${r.count ?? 0} messages.`)
      else setExportMsg(`Export failed: ${r.error || 'unknown error'}`)
    } catch (e: any) {
      setExportMsg(`Export failed: ${e?.message || 'unknown error'}`)
    }
  }
  const applyQuiet = (next: ReturnType<typeof getQuietHours>) => {
    setQuietHoursState(next)
    setQuietHours(next)
    // Let the chat header's 🌙 indicator re-evaluate immediately.
    window.dispatchEvent(new Event('rlr:quiet-hours-changed'))
  }
  const [showNotifSound, setShowNotifSound] = useState(false)
  const [notifSound, setNotifSound] = useState(getSelectedSound)
  // Saved custom sound files (the legacy single custom is migrated into the
  // list on first read)
  const [customSounds, setCustomSounds] = useState<CustomSound[]>(listCustomSounds)
  const [notifSoundMsg, setNotifSoundMsg] = useState('')

  // Browse for a new custom sound file, save it to the list and select it
  const handleAddCustomSound = async () => {
    const r = await window.electronAPI.pickFile()
    if (r.cancelled || !r.success || !r.filePath) return
    if (!/\.(wav|mp3|ogg|m4a)$/i.test(r.filePath)) {
      setNotifSoundMsg('Please choose a .wav, .mp3, .ogg or .m4a file.')
      return
    }
    const id = addCustomSound(r.filePath)
    setCustomSounds(listCustomSounds())
    setSelectedSound(id)
    setNotifSound(id)
    setNotifSoundMsg('')
    void previewSound(id)
  }

  // Delete a saved custom sound. removeCustomSound() falls the stored
  // selection back to 'classic' when the deleted one was selected.
  const handleDeleteCustomSound = (id: string) => {
    removeCustomSound(id)
    setCustomSounds(listCustomSounds())
    setNotifSound(getSelectedSound())
  }

  // --- Custom statuses (Settings → Statuses) ---
  const [showStatuses, setShowStatuses] = useState(false)
  const [customStatuses, setCustomStatuses] = useState<CustomStatus[]>(listCustomStatuses)
  const [newStatusLabel, setNewStatusLabel] = useState('')
  const [newStatusEmoji, setNewStatusEmoji] = useState(DEFAULT_STATUS_EMOJI)
  const [statusEmojiPickerOpen, setStatusEmojiPickerOpen] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  const handleAddStatus = () => {
    if (!newStatusLabel.trim()) {
      setStatusMsg('Type a status first.')
      return
    }
    const created = addCustomStatus(newStatusLabel, newStatusEmoji)
    if (!created) {
      setStatusMsg('That status already exists.')
      return
    }
    setCustomStatuses(listCustomStatuses())
    setNewStatusLabel('')
    setNewStatusEmoji(DEFAULT_STATUS_EMOJI)
    setStatusMsg('')
  }

  const handleDeleteStatus = (id: string) => {
    removeCustomStatus(id)
    setCustomStatuses(listCustomStatuses())
  }
  const [autoReconnect, setAutoReconnectState] = useState(getAutoReconnect)
  const [openAtLogin, setOpenAtLoginState] = useState(false)
  const [closeToTray, setCloseToTrayState] = useState(false)
  const [speechEngine, setSpeechEngineState] = useState<SpeechEngineKind>(getSpeechEngineSetting)
  const [diagnostics, setDiagnostics] = useState<{
    connection: { role: string; connected: boolean; authenticated: boolean; lastActivityTime: number; reconnectDelay?: number; isConnecting?: boolean; lastRttMs?: number | null; lastPongTime?: number } | null
    speechListening: boolean
    lastActivityAgo: number | null
  } | null>(null)

  useEffect(() => {
    // Load TTS configuration
    window.electronAPI.ttsGetConfig().then(config => {
      // ttsGetConfig() returns a partial type, but the service always populates
      // every field. Normalize to the component's fully-defined TTSConfig.
      setTtsConfig({
        voice: config.voice ?? null,
        speed: config.speed ?? 1.0,
        volume: config.volume ?? 1.0,
        enabled: config.enabled ?? true
      })
    })

    // Load available voices
    window.electronAPI.ttsGetVoices().then(voices => {
      setAvailableVoices(voices)
    })

    // Load sound configuration
    const soundService = getSoundService()
    setSoundsEnabled(soundService.isEnabled())

    // Load notification configuration
    window.electronAPI.notificationIsEnabled().then(enabled => {
      setNotificationsEnabled(enabled)
    })

    setVoiceTimeoutsState(getVoiceTimeouts())
    setAutoReconnectState(getAutoReconnect())

    // Reflect the real OS login-item state (set outside the app too)
    window.electronAPI.getOpenAtLogin().then(setOpenAtLoginState).catch(() => {})
    window.electronAPI.getCloseToTray().then(setCloseToTrayState).catch(() => {})
  }, [])

  const handleCloseToTrayChange = async (enabled: boolean) => {
    setCloseToTrayState(enabled) // optimistic
    try {
      const actual = await window.electronAPI.setCloseToTray(enabled)
      setCloseToTrayState(actual)
    } catch {
      setCloseToTrayState(!enabled)
    }
  }

  const handleOpenAtLoginChange = async (enabled: boolean) => {
    setOpenAtLoginState(enabled) // optimistic
    try {
      const actual = await window.electronAPI.setOpenAtLogin(enabled)
      setOpenAtLoginState(actual)
    } catch {
      // revert on failure
      setOpenAtLoginState(!enabled)
    }
  }

  const handleReconnect = () => {
    onClose()
    onReconnect()
  }

  const handleLogoff = () => {
    if (!window.confirm('Log off and return to the identity screen? This disconnects the chat.')) return
    onClose()
    onLogoff()
  }

  const handleOpenDevTools = () => {
    // F12 already opens dev tools, but provide button too
    onClose()
  }

  const handleTTSEnabledChange = async (enabled: boolean) => {
    const newConfig = { ...ttsConfig, enabled }
    setTtsConfig(newConfig)
    await window.electronAPI.ttsConfigure({ enabled })
  }

  useEffect(() => {
    window.electronAPI.updateGetVersion().then(setAppVersion).catch(() => {})
    const off = window.electronAPI.onUpdateStatus(({ status, info }) => {
      if (status === 'checking') setUpdateMsg('Checking for updates…')
      else if (status === 'available') setUpdateMsg(`Update found (v${info?.version}) — downloading…`)
      else if (status === 'downloading') setUpdateMsg(`Downloading… ${info?.percent ?? 0}%`)
      else if (status === 'downloaded') { setUpdateMsg(`Update ready (v${info?.version}) — restarting…`); setChecking(false) }
      else if (status === 'none') { setUpdateMsg("You're up to date."); setChecking(false) }
      else if (status === 'dev') { setUpdateMsg('Updates only work in the installed app.'); setChecking(false) }
      else if (status === 'error') { setUpdateMsg(`Update error: ${info?.message || 'unknown'}`); setChecking(false) }
    })
    return off
  }, [])

  const handleCheckForUpdates = async () => {
    setChecking(true)
    setUpdateMsg('Checking for updates…')
    try {
      await window.electronAPI.updateCheck()
    } catch (e: any) {
      setUpdateMsg(`Update error: ${e?.message || 'unknown'}`)
      setChecking(false)
    }
  }

  const handleVoiceChange = async (voice: string) => {
    const voiceValue = voice === 'default' ? null : voice
    const newConfig = { ...ttsConfig, voice: voiceValue }
    setTtsConfig(newConfig)
    await window.electronAPI.ttsConfigure({ voice: voiceValue })
    setSavedVoice(voiceValue) // remember the manual pick across restarts
  }

  const handleSpeedChange = async (speed: number) => {
    const newConfig = { ...ttsConfig, speed }
    setTtsConfig(newConfig)
    await window.electronAPI.ttsConfigure({ speed })
  }

  const handleTestTTS = async () => {
    await window.electronAPI.ttsTest()
  }

  const handleTestMicrophone = async () => {
    setIsTesting(true)
    setMicTestResult(null)
    try {
      const result = await window.electronAPI.speechTest()
      setMicTestResult(result)
    } catch (error) {
      setMicTestResult({ success: false, error: (error as Error).message })
    } finally {
      setIsTesting(false)
    }
  }

  const handleSoundsEnabledChange = (enabled: boolean) => {
    setSoundsEnabled(enabled)
    const soundService = getSoundService()
    soundService.setEnabled(enabled)
  }

  const handleNotificationsEnabledChange = async (enabled: boolean) => {
    setNotificationsEnabled(enabled)
    await window.electronAPI.notificationSetEnabled(enabled)
  }

  const refreshDiagnostics = async () => {
    const d = await window.electronAPI.getDiagnostics()
    setDiagnostics(d)
  }

  useEffect(() => {
    if (showDiagnostics) refreshDiagnostics()
    const interval = showDiagnostics ? setInterval(refreshDiagnostics, 2000) : undefined
    return () => { if (interval) clearInterval(interval) }
  }, [showDiagnostics])

  // Keyboard support for Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <>
      <div className="settings-overlay" onClick={onClose} aria-hidden="true" />
      <div className="settings-menu" role="dialog" aria-labelledby="settings-title" aria-modal="true">
        <div className="settings-header">
          <h3 id="settings-title">Settings</h3>
          <button className="close-btn" onClick={onClose} aria-label="Close settings">×</button>
        </div>

        <div className="settings-content">
          <div className="setting-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="setting-icon" aria-hidden="true">⬆️</span>
              <span>Software update</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.7 }}>v{appVersion}</span>
            </div>
            <button
              className="test-btn"
              style={{ marginTop: 8 }}
              onClick={handleCheckForUpdates}
              disabled={checking}
              aria-label="Check for updates"
            >
              {checking ? 'Checking…' : 'Check for updates'}
            </button>
            {updateMsg && (
              <div className="tts-info" style={{ marginTop: 8 }}>{updateMsg}</div>
            )}
          </div>

          {/* Opens the full version-history viewer (rendered at the App level
              so the Help menu can open the same panel) */}
          <button
            className="setting-item"
            onClick={() => window.dispatchEvent(new Event('rlr:show-release-notes'))}
            aria-label="View release notes"
          >
            <span className="setting-icon" aria-hidden="true">📋</span>
            <span>Release notes</span>
          </button>

          <button className="setting-item" onClick={handleExportHistory} aria-label="Export chat history">
            <span className="setting-icon" aria-hidden="true">💾</span>
            <span>Export chat history…</span>
          </button>
          {exportMsg && (
            <div className="tts-info" style={{ paddingLeft: 44, paddingTop: 0, marginTop: -4 }}>{exportMsg}</div>
          )}

          <div className="setting-divider" />

          <button className="setting-item" onClick={handleReconnect} aria-label="Change connection settings">
            <span className="setting-icon" aria-hidden="true">🔄</span>
            <span>Change Connection</span>
          </button>

          <button className="setting-item" onClick={handleLogoff} aria-label="Log off and return to identity selection">
            <span className="setting-icon" aria-hidden="true">🚪</span>
            <span>Log off</span>
          </button>

          <div className="setting-item">
            <span className="setting-icon" aria-hidden="true">🔌</span>
            <span>Auto-reconnect</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={autoReconnect}
                onChange={(e) => {
                  const v = e.target.checked
                  setAutoReconnectState(v)
                  setAutoReconnect(v)
                }}
                aria-label="Auto-reconnect when disconnected"
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="tts-info" style={{ paddingLeft: 44, paddingTop: 0, marginTop: -4 }}>
            When off, the app will not reconnect after disconnect or auth failure (connector only).
          </div>

          <div className="setting-item">
            <span className="setting-icon" aria-hidden="true">🚀</span>
            <span>Start with Windows</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={openAtLogin}
                onChange={(e) => handleOpenAtLoginChange(e.target.checked)}
                aria-label="Start automatically when Windows starts"
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="tts-info" style={{ paddingLeft: 44, paddingTop: 0, marginTop: -4 }}>
            When on, the app launches automatically each time you sign in to Windows.
          </div>

          <div className="setting-item">
            <span className="setting-icon" aria-hidden="true">📥</span>
            <span>Close button hides to tray</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={closeToTray}
                onChange={(e) => handleCloseToTrayChange(e.target.checked)}
                aria-label="Close button hides to the system tray"
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="tts-info" style={{ paddingLeft: 44, paddingTop: 0, marginTop: -4 }}>
            When on, the window's close button hides the app to the system tray instead
            of quitting. Right-click the tray icon to quit or set your status.
          </div>

          <div className="setting-item">
            <span className="setting-icon" aria-hidden="true">💤</span>
            <span>Auto-away when idle</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={autoAway}
                onChange={(e) => {
                  const v = e.target.checked
                  setAutoAwayState(v)
                  setAutoAwayEnabled(v)
                }}
                aria-label="Auto-away when idle"
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          {autoAway && (
            <div className="tts-settings-panel" style={{ paddingTop: 8 }}>
              <div className="tts-setting-row">
                <label htmlFor="auto-away-min">Go Away after</label>
                <select
                  id="auto-away-min"
                  value={autoAwayMin}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    setAutoAwayMinState(v)
                    setAutoAwayMinutes(v)
                  }}
                  aria-label="Minutes idle before auto-away"
                >
                  <option value={1}>1 minute</option>
                  <option value={3}>3 minutes</option>
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                </select>
              </div>
            </div>
          )}

          <div className="setting-item">
            <span className="setting-icon" aria-hidden="true">📢</span>
            <span>Speak announcements</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={speakAnnouncements}
                onChange={(e) => {
                  const v = e.target.checked
                  setSpeakAnnouncementsState(v)
                  setSpeakAnnouncements(v)
                }}
                aria-label="Speak announcements aloud"
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="tts-info" style={{ paddingLeft: 44, paddingTop: 0, marginTop: -4 }}>
            When on and your status is "Talk to me" or "Listen only", the app reads
            out peer events aloud (status changes, incoming calls, reconnects).
          </div>

          <div className="setting-item">
            <span className="setting-icon" aria-hidden="true">🌙</span>
            <span>Quiet hours</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={quietHours.enabled}
                onChange={(e) => applyQuiet({ ...quietHours, enabled: e.target.checked })}
                aria-label="Enable quiet hours"
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          {quietHours.enabled && (
            <div className="tts-settings-panel" style={{ paddingTop: 8 }}>
              <div className="tts-setting-row">
                <label htmlFor="quiet-start">From</label>
                <input
                  id="quiet-start"
                  type="time"
                  value={quietHours.start}
                  onChange={(e) => applyQuiet({ ...quietHours, start: e.target.value })}
                  aria-label="Quiet hours start time"
                />
              </div>
              <div className="tts-setting-row">
                <label htmlFor="quiet-end">To</label>
                <input
                  id="quiet-end"
                  type="time"
                  value={quietHours.end}
                  onChange={(e) => applyQuiet({ ...quietHours, end: e.target.value })}
                  aria-label="Quiet hours end time"
                />
              </div>
            </div>
          )}
          <div className="tts-info" style={{ paddingLeft: 44, paddingTop: 0, marginTop: -4 }}>
            During quiet hours, notification sounds, the nudge buzz, reminder chimes,
            and spoken messages are silenced. Messages still arrive and the unread
            count still updates. Overnight ranges (e.g. 10 PM–8 AM) are supported.
          </div>

          <div className="setting-divider" />

          {/* Custom statuses — saved per device, shown in the status dropdown
              alongside the presets. Plain statuses only: never TTS/auto-mic. */}
          <button
            className="setting-item"
            onClick={() => setShowStatuses(!showStatuses)}
            aria-expanded={showStatuses}
            aria-label="Custom status settings"
          >
            <span className="setting-icon" aria-hidden="true">🏷️</span>
            <span>Statuses</span>
            <span className="expand-icon" aria-hidden="true">{showStatuses ? '▼' : '▶'}</span>
          </button>
          {showStatuses && (
            <div className="tts-settings-panel">
              <div className="tts-info" style={{ marginBottom: 10 }}>
                Save your own statuses — they appear in the status dropdown
                next to the built-in ones. Built-in statuses can't be deleted.
              </div>
              <div className="custom-status-add">
                <button
                  type="button"
                  className="custom-status-emoji-btn"
                  onClick={() => setStatusEmojiPickerOpen(true)}
                  aria-label="Choose status emoji"
                  title="Choose an emoji"
                >
                  {newStatusEmoji}
                </button>
                <input
                  type="text"
                  className="custom-status-label-input"
                  placeholder="New status…"
                  maxLength={40}
                  value={newStatusLabel}
                  onChange={(e) => { setNewStatusLabel(e.target.value); if (statusMsg) setStatusMsg('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddStatus() }}
                  aria-label="New custom status label"
                />
                <button
                  type="button"
                  className="test-btn custom-status-add-btn"
                  onClick={handleAddStatus}
                  aria-label="Add custom status"
                >
                  Add
                </button>
              </div>
              {statusMsg && <div className="tts-info" style={{ marginTop: 6 }}>{statusMsg}</div>}
              {customStatuses.length > 0 && (
                <div className="custom-status-list">
                  {customStatuses.map((s) => (
                    <div key={s.id} className="custom-status-row">
                      <span className="status-emoji" aria-hidden="true">{s.emoji}</span>
                      <span className="custom-status-name">{s.label}</span>
                      <button
                        type="button"
                        className="notif-sound-delete"
                        onClick={() => handleDeleteStatus(s.id)}
                        aria-label={`Delete status ${s.label}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {statusEmojiPickerOpen && (
            <EmojiPicker
              title="Pick a status emoji"
              onPick={(emoji) => { setNewStatusEmoji(emoji); setStatusEmojiPickerOpen(false) }}
              onClose={() => setStatusEmojiPickerOpen(false)}
            />
          )}

          <div className="setting-divider" />

          {/* Notification sound — plays for incoming messages when unmuted and
              not in a speech status (Talk to me / Listen only) */}
          <button
            className="setting-item"
            onClick={() => setShowNotifSound(!showNotifSound)}
            aria-expanded={showNotifSound}
            aria-label="Notification sound settings"
          >
            <span className="setting-icon" aria-hidden="true">🔔</span>
            <span>Notification sound</span>
            <span className="expand-icon" aria-hidden="true">{showNotifSound ? '▼' : '▶'}</span>
          </button>
          {showNotifSound && (
            <div className="tts-settings-panel">
              <div className="tts-info" style={{ marginBottom: 10 }}>
                Plays for incoming messages when you're not muted and not in a
                "Talk to me"/"Listen only" status (those read messages aloud).
              </div>
              <div className="notif-sound-list">
                {/* Classic + the 10 bundled sounds */}
                {SOUND_OPTIONS.filter((opt) => opt.kind !== 'none').map((opt) => (
                  <div key={opt.id} className={`notif-sound-row ${notifSound === opt.id ? 'selected' : ''}`}>
                    <button
                      type="button"
                      className="notif-sound-pick"
                      onClick={() => { setNotifSound(opt.id); setSelectedSound(opt.id); preloadSelected() }}
                    >
                      <span className="notif-sound-check">{notifSound === opt.id ? '✓' : ''}</span>
                      {opt.label}
                    </button>
                    <button type="button" className="notif-sound-play" onClick={() => previewSound(opt.id)} aria-label={`Preview ${opt.label}`}>▶</button>
                  </div>
                ))}

                {/* Saved custom sound files */}
                {customSounds.map((cs) => (
                  <div key={cs.id} className={`notif-sound-row custom ${notifSound === cs.id ? 'selected' : ''}`}>
                    <button
                      type="button"
                      className="notif-sound-pick"
                      onClick={() => { setNotifSound(cs.id); setSelectedSound(cs.id); preloadSelected() }}
                      title={cs.path}
                    >
                      <span className="notif-sound-check">{notifSound === cs.id ? '✓' : ''}</span>
                      <span className="notif-sound-name">{cs.name}</span>
                    </button>
                    <button type="button" className="notif-sound-play" onClick={() => previewSound(cs.id)} aria-label={`Preview ${cs.name}`}>▶</button>
                    <button type="button" className="notif-sound-delete" onClick={() => handleDeleteCustomSound(cs.id)} aria-label={`Delete ${cs.name}`}>✕</button>
                  </div>
                ))}

                {/* None (silent) */}
                {SOUND_OPTIONS.filter((opt) => opt.kind === 'none').map((opt) => (
                  <div key={opt.id} className={`notif-sound-row ${notifSound === opt.id ? 'selected' : ''}`}>
                    <button
                      type="button"
                      className="notif-sound-pick"
                      onClick={() => { setNotifSound(opt.id); setSelectedSound(opt.id); preloadSelected() }}
                    >
                      <span className="notif-sound-check">{notifSound === opt.id ? '✓' : ''}</span>
                      {opt.label}
                    </button>
                  </div>
                ))}

                {/* Browse for a new custom file — saved to the list above */}
                <div className="notif-sound-row">
                  <button
                    type="button"
                    className="notif-sound-pick"
                    onClick={handleAddCustomSound}
                    aria-label="Add custom sound file"
                  >
                    <span className="notif-sound-check"></span>
                    ➕ Add custom… (browse)
                  </button>
                </div>
              </div>
              {notifSoundMsg && <div className="tts-info" style={{ marginTop: 8 }}>{notifSoundMsg}</div>}
            </div>
          )}

          <button className="setting-item" onClick={handleOpenDevTools} aria-label="Open debug console">
            <span className="setting-icon" aria-hidden="true">🔧</span>
            <span>Debug Console (F12)</span>
          </button>

          <button
            className="setting-item"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            aria-expanded={showDiagnostics}
            aria-label="Toggle connection and speech diagnostics"
          >
            <span className="setting-icon" aria-hidden="true">📊</span>
            <span>Connection &amp; Voice Diagnostics</span>
            <span className="expand-icon" aria-hidden="true">{showDiagnostics ? '▼' : '▶'}</span>
          </button>
          {showDiagnostics && (
            <div className="tts-settings-panel diagnostics-panel">
              <div className="diagnostics-grid">
                {diagnostics?.connection ? (
                  <>
                    <div className="diagnostic-row">
                      <span className="diagnostic-label">Role</span>
                      <span className="diagnostic-value">{diagnostics.connection.role}</span>
                    </div>
                    <div className="diagnostic-row">
                      <span className="diagnostic-label">Connected</span>
                      <span className={`diagnostic-value ${diagnostics.connection.connected ? 'ok' : 'warn'}`}>
                        {diagnostics.connection.connected ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="diagnostic-row">
                      <span className="diagnostic-label">Authenticated</span>
                      <span className={`diagnostic-value ${diagnostics.connection.authenticated ? 'ok' : 'warn'}`}>
                        {diagnostics.connection.authenticated ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="diagnostic-row">
                      <span className="diagnostic-label">Last activity</span>
                      <span className="diagnostic-value">
                        {diagnostics.lastActivityAgo != null ? `${diagnostics.lastActivityAgo}s ago` : '—'}
                      </span>
                    </div>
                    {'reconnectDelay' in diagnostics.connection && (
                      <div className="diagnostic-row">
                        <span className="diagnostic-label">Reconnect delay</span>
                        <span className="diagnostic-value">{(diagnostics.connection.reconnectDelay ?? 0) / 1000}s</span>
                      </div>
                    )}
                    {'isConnecting' in diagnostics.connection && diagnostics.connection.isConnecting && (
                      <div className="diagnostic-row">
                        <span className="diagnostic-value warn">Connecting…</span>
                      </div>
                    )}
                    {'lastRttMs' in diagnostics.connection && diagnostics.connection.lastRttMs != null && (
                      <div className="diagnostic-row">
                        <span className="diagnostic-label">Latency (RTT)</span>
                        <span className="diagnostic-value">{diagnostics.connection.lastRttMs} ms</span>
                      </div>
                    )}
                    {diagnostics.connection.lastPongTime != null && diagnostics.connection.lastPongTime > 0 && (
                      <div className="diagnostic-row">
                        <span className="diagnostic-label">Last pong</span>
                        <span className="diagnostic-value">
                          {Math.round((Date.now() - diagnostics.connection.lastPongTime) / 1000)}s ago
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="diagnostic-row"><span className="diagnostic-value">No active connection</span></div>
                )}
                <div className="diagnostic-row">
                  <span className="diagnostic-label">Speech (mic)</span>
                  <span className={`diagnostic-value ${diagnostics?.speechListening ? 'ok' : ''}`}>
                    {diagnostics?.speechListening ? 'Listening' : 'Idle'}
                  </span>
                </div>
              </div>
              <button type="button" className="test-btn" onClick={refreshDiagnostics} aria-label="Refresh diagnostics">
                Refresh
              </button>
            </div>
          )}

          <div className="setting-divider" />

          {/* TTS Settings */}
          <button
            className="setting-item"
            onClick={() => setShowTTSSettings(!showTTSSettings)}
            aria-expanded={showTTSSettings}
            aria-label="Toggle text-to-speech settings"
          >
            <span className="setting-icon" aria-hidden="true">🔊</span>
            <span>Text-to-Speech Settings</span>
            <span className="expand-icon" aria-hidden="true">{showTTSSettings ? '▼' : '▶'}</span>
          </button>

          {showTTSSettings && (
            <div className="tts-settings-panel">
              <div className="tts-setting-row">
                <label>
                  <input
                    type="checkbox"
                    checked={ttsConfig.enabled}
                    onChange={(e) => handleTTSEnabledChange(e.target.checked)}
                  />
                  Enable Text-to-Speech
                </label>
              </div>

              {ttsConfig.enabled && (
                <>
                  <div className="tts-setting-row">
                    <label htmlFor="tts-voice-select">Voice:</label>
                    <select
                      id="tts-voice-select"
                      value={ttsConfig.voice || 'default'}
                      onChange={(e) => handleVoiceChange(e.target.value)}
                      aria-label="Select voice for text-to-speech"
                    >
                      <option value="default">System Default</option>
                      {availableVoices.map(voice => (
                        <option key={voice.id} value={voice.id}>{voice.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="tts-setting-row">
                    <label htmlFor="tts-speed-slider">Speed: {ttsConfig.speed.toFixed(1)}x</label>
                    <input
                      id="tts-speed-slider"
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={ttsConfig.speed}
                      onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                      aria-label="Adjust speech speed"
                    />
                  </div>

                  <div className="tts-setting-row">
                    <button className="test-btn" onClick={handleTestTTS} aria-label="Test text-to-speech">
                      Test Speech
                    </button>
                  </div>

                  <div className="tts-info">
                    TTS will speak incoming messages when your status is "Talk to me"
                  </div>
                </>
              )}
            </div>
          )}

          <div className="setting-divider" />

          {/* Speech Recognition Info */}
          <button
            className="setting-item"
            onClick={() => setShowSpeechInfo(!showSpeechInfo)}
            aria-expanded={showSpeechInfo}
            aria-label="View speech recognition info"
          >
            <span className="setting-icon" aria-hidden="true">🎤</span>
            <span>Speech Recognition</span>
            <span className="expand-icon" aria-hidden="true">{showSpeechInfo ? '▼' : '▶'}</span>
          </button>

          {showSpeechInfo && (
            <div className="tts-settings-panel">
              <div className="tts-setting-row">
                <label htmlFor="speech-engine-select">Recognition engine:</label>
                <select
                  id="speech-engine-select"
                  value={speechEngine}
                  onChange={(e) => {
                    const engine = e.target.value as SpeechEngineKind
                    setSpeechEngineState(engine)
                    setSpeechEngineSetting(engine)
                  }}
                  aria-label="Speech recognition engine"
                >
                  <option value="vosk">Vosk (offline, recommended)</option>
                  <option value="sapi">Windows Speech (SAPI)</option>
                </select>
              </div>

              <div className="tts-info">
                {speechEngine === 'vosk' ? (
                  <>🎤 Vosk: high-quality offline recognition. Works great on
                  Windows 8.1 — no internet, no training needed. Falls back to
                  Windows Speech automatically if unavailable.</>
                ) : (
                  <>🎤 Windows Speech Recognition (SAPI, offline). Lower
                  accuracy — try the Vosk engine if recognition is poor.</>
                )}
                <br /><br />
                <strong>How to use:</strong>
                <br />
                1. Click microphone button to start
                <br />
                2. Speak naturally - text appears live
                <br />
                3. Click mic again to stop
                <br />
                4. Message auto-sends after silence (configurable below)
              </div>

              <div className="tts-setting-row" style={{ marginTop: '12px' }}>
                <label htmlFor="voice-silence-ms">Silence before auto-send</label>
                <select
                  id="voice-silence-ms"
                  value={voiceTimeouts.silenceMs}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    setVoiceTimeoutsState(prev => ({ ...prev, silenceMs: v }))
                    setVoiceTimeouts({ silenceMs: v }) // takes effect on the next dictation immediately
                  }}
                  aria-label="Silence timeout before auto-send"
                >
                  <option value={3000}>3 seconds</option>
                  <option value={2500}>2.5 seconds</option>
                  <option value={2000}>2 seconds</option>
                  <option value={1500}>1.5 seconds</option>
                  <option value={1000}>1 second</option>
                </select>
              </div>
              <div className="tts-setting-row">
                <label htmlFor="voice-nospeech-ms">No-speech cancel (s): {voiceTimeouts.noSpeechMs / 1000}</label>
                <input
                  id="voice-nospeech-ms"
                  type="range"
                  min="3"
                  max="10"
                  step="1"
                  value={voiceTimeouts.noSpeechMs / 1000}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10) * 1000
                    setVoiceTimeoutsState(prev => ({ ...prev, noSpeechMs: v }))
                    setVoiceTimeouts({ noSpeechMs: v })
                  }}
                  aria-label="No-speech timeout before cancelling"
                />
              </div>

              <div className="tts-setting-row" style={{ marginTop: '15px' }}>
                <button
                  className="test-btn"
                  onClick={handleTestMicrophone}
                  disabled={isTesting}
                  aria-label="Test microphone and speech recognition"
                >
                  {isTesting ? 'Testing...' : 'Test Microphone'}
                </button>
              </div>

              {micTestResult && (
                <div className={`mic-test-result ${micTestResult.success ? 'success' : 'error'}`} style={{ marginTop: '10px', padding: '10px', borderRadius: '8px', background: micTestResult.success ? 'rgba(0,255,0,0.1)' : 'rgba(255,0,0,0.1)' }}>
                  {micTestResult.success ? (
                    <>
                      ✅ <strong>Microphone test passed!</strong>
                      {micTestResult.details && (
                        <ul style={{ marginLeft: '20px', marginTop: '5px', fontSize: '12px' }}>
                          <li>System.Speech: {micTestResult.details.systemSpeechAvailable ? '✓' : '✗'}</li>
                          <li>Microphone: {micTestResult.details.microphoneAvailable ? '✓' : '✗'}</li>
                          <li>Recognition: {micTestResult.details.recognitionWorking ? '✓' : '✗'}</li>
                        </ul>
                      )}
                    </>
                  ) : (
                    <>
                      ❌ <strong>Test failed</strong>
                      <br />
                      <span style={{ fontSize: '12px' }}>{micTestResult.error}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="setting-divider" />

          {/* Sound Settings */}
          <div className="setting-item">
            <span className="setting-icon" aria-hidden="true">🔔</span>
            <span>Sound Effects</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={soundsEnabled}
                onChange={(e) => handleSoundsEnabledChange(e.target.checked)}
                aria-label="Toggle sound effects"
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          {/* Notification Settings */}
          <div className="setting-item">
            <span className="setting-icon" aria-hidden="true">💬</span>
            <span>Windows Notifications</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(e) => handleNotificationsEnabledChange(e.target.checked)}
                aria-label="Toggle Windows notifications"
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="setting-divider" />

          <div className="setting-item">
            <span className="setting-icon" aria-hidden="true">🌓</span>
            <span>Theme</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={theme === 'light'}
                onChange={(e) => {
                  const next = e.target.checked ? 'light' : 'dark'
                  setThemeState(next)
                  setTheme(next)
                }}
                aria-label="Use light theme"
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="tts-info" style={{ paddingLeft: 44, paddingTop: 0, marginTop: -4 }}>
            {theme === 'light' ? 'Light' : 'Dark'} theme
          </div>

          <div className="setting-item">
            <span className="setting-icon" aria-hidden="true">📐</span>
            <span>Layout density</span>
            <select
              value={density}
              onChange={(e) => {
                const next = e.target.value as 'comfortable' | 'compact'
                setDensityState(next)
                setDensity(next)
              }}
              aria-label="Layout density"
              className="density-select"
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </div>

          <div className="setting-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="setting-icon" aria-hidden="true">🔠</span>
              <span>Text size</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.7 }}>{Math.round(textScale * 100)}%</span>
            </div>
            <input
              type="range"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.05}
              value={textScale}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                setTextScaleState(v)
                setTextScale(v) // applies live
              }}
              aria-label="Text size"
              style={{ width: '100%', marginTop: 8, cursor: 'pointer' }}
            />
          </div>

          <div className="setting-item">
            <span className="setting-icon" aria-hidden="true">🎨</span>
            <span>Accent color</span>
            <select
              value={accent}
              onChange={(e) => {
                const next = e.target.value as import('../utils/accent').AccentName
                setAccentState(next)
                setAccent(next)
              }}
              aria-label="Accent color"
              className="density-select"
            >
              {ACCENT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="setting-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span className="setting-icon" aria-hidden="true">🖼️</span>
              <span>Background</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.6 }}>this device only</span>
            </div>
            <div className="bg-swatch-grid">
              {BACKGROUND_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`bg-swatch ${background === opt.value ? 'selected' : ''}`}
                  style={{ backgroundImage: opt.gradient }}
                  title={opt.label}
                  aria-label={`Background: ${opt.label}`}
                  aria-pressed={background === opt.value}
                  onClick={() => {
                    setBackgroundState(opt.value)
                    setBackground(opt.value)
                  }}
                >
                  {background === opt.value && <span className="bg-swatch-check" aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-item">
            <span className="setting-icon" aria-hidden="true">🔤</span>
            <span>Text color</span>
            <select
              value={inkPref}
              onChange={(e) => {
                const next = e.target.value as InkPreference
                setInkPrefState(next)
                setInkPreference(next)
              }}
              aria-label="Text color"
              className="density-select"
            >
              <option value="auto">Auto (match background)</option>
              <option value="light">Light text</option>
              <option value="dark">Dark text</option>
            </select>
          </div>

          <div className="setting-divider" />

          <div className="setting-item">
            <span className="setting-icon" aria-hidden="true">📜</span>
            <span>Message history</span>
          </div>
          <div className="tts-settings-panel" style={{ paddingTop: 0 }}>
            <div className="tts-info" style={{ marginBottom: 10 }}>
              Chat is saved locally on this device. Clear to remove all messages from this session and disk.
            </div>
            <button
              type="button"
              className="test-btn"
              onClick={async () => {
                if (window.confirm('Clear all message history? This cannot be undone.')) {
                  await window.electronAPI.historyClear()
                }
              }}
              aria-label="Clear message history"
            >
              Clear history
            </button>
          </div>

          <div className="setting-item">
            <span className="setting-icon" aria-hidden="true">🧹</span>
            <span>Auto-trim old messages</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={autoTrim}
                onChange={(e) => {
                  const v = e.target.checked
                  setAutoTrimState(v)
                  setAutoTrimEnabled(v)
                }}
                aria-label="Auto-trim messages older than 3 months"
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="tts-info" style={{ paddingLeft: 44, paddingTop: 0, marginTop: -4 }}>
            When on, messages older than 3 months are removed automatically (this device).
          </div>

          <div className="setting-divider" />

          <div className="setting-item disabled">
            <span className="setting-icon">🔒</span>
            <span>Encryption (V2)</span>
          </div>
        </div>
      </div>
    </>
  )
}

export default SettingsMenu
