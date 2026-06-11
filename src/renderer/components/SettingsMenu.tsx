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
import { getAutoReconnect, setAutoReconnect } from '../utils/connection-settings'
import { getSpeechEngineSetting, setSpeechEngineSetting, SpeechEngineKind } from '../services/speech-engine'

interface Props {
  onClose: () => void
  onReconnect: () => void
}

interface TTSConfig {
  voice: string | null
  speed: number
  volume: number
  enabled: boolean
}

function SettingsMenu({ onClose, onReconnect }: Props) {
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
  const [autoReconnect, setAutoReconnectState] = useState(getAutoReconnect)
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
  }, [])

  const handleReconnect = () => {
    onClose()
    onReconnect()
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

          <div className="setting-divider" />

          <button className="setting-item" onClick={handleReconnect} aria-label="Change connection settings">
            <span className="setting-icon" aria-hidden="true">🔄</span>
            <span>Change Connection</span>
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
