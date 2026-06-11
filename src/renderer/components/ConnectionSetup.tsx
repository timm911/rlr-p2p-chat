import { useState, useEffect, useRef } from 'react'
import { getSavedConnectionMeta, getSavedPassword, saveConnection } from '../utils/connection-settings'
import './ConnectionSetup.css'

interface Props {
  userIdentity: 'RLRJupiter' | 'Ripster'
  initialConfig: { host: string; port: number }
  onConnect: (config: { host: string; port: number; password: string }) => void
  autoConnect?: boolean
}

const savedConnection = getSavedConnectionMeta()

function ConnectionSetup({ userIdentity, initialConfig, onConnect, autoConnect }: Props) {
  const [host, setHost] = useState(savedConnection?.host ?? initialConfig.host)
  const [port, setPort] = useState((savedConnection?.port ?? initialConfig.port).toString())
  const [password, setPassword] = useState('')
  const [passwordLoaded, setPasswordLoaded] = useState(!savedConnection?.hasPassword)
  const [localIPs, setLocalIPs] = useState<{ name: string; address: string }[]>([])
  const [isConnecting, setIsConnecting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [connectionLog, setConnectionLog] = useState<Array<{ message: string; detail?: string }>>([])
  const latestConfigRef = useRef({ host, port, password })
  const onConnectRef = useRef(onConnect)

  const isConnector = userIdentity === 'RLRJupiter'

  useEffect(() => {
    const off = window.electronAPI.onConnectionLog((entry) => {
      setConnectionLog((prev) => [...prev.slice(-19), entry])
    })
    return off
  }, [])

  // Load the saved (encrypted) password on mount and prefill it
  useEffect(() => {
    if (!savedConnection?.hasPassword) return
    getSavedPassword().then((pw) => {
      if (pw) setPassword(pw)
      setPasswordLoaded(true)
    })
  }, [])

  useEffect(() => {
    latestConfigRef.current = { host, port, password }
  }, [host, port, password])

  useEffect(() => {
    onConnectRef.current = onConnect
  }, [onConnect])

  useEffect(() => {
    // Get local IP addresses for troubleshooting
    window.electronAPI.getLocalIPs().then(setLocalIPs)

    if (isConnector) {
      return
    }

    const offConnectionState = window.electronAPI.onConnectionStateChange((state: string) => {
      if (state === 'connected') {
        const latest = latestConfigRef.current
        setIsConnecting(false)
        saveConnection({ host: latest.host, port: parseInt(latest.port, 10), password: latest.password })
        onConnectRef.current({
          host: latest.host,
          port: parseInt(latest.port, 10),
          password: latest.password
        })
      }
    })

    return () => {
      offConnectionState()
    }
  }, [isConnector])

  const handleConnect = async () => {
    setIsConnecting(true)
    setErrorMessage('')
    const portNum = parseInt(port)

    // Validate input
    if (!port || portNum < 1 || portNum > 65535) {
      setErrorMessage('Please enter a valid port number (1-65535)')
      setIsConnecting(false)
      return
    }

    if (isConnector && !host.trim()) {
      setErrorMessage('Please enter a host address')
      setIsConnecting(false)
      return
    }

    if (!password.trim()) {
      setErrorMessage('Please enter a session password')
      setIsConnecting(false)
      return
    }

    try {
      if (isConnector) {
        // RLRJupiter: Start TCP client (pass auto-reconnect from settings)
        const { getAutoReconnect } = await import('../utils/connection-settings')
        const result = await window.electronAPI.startClient(host, portNum, password, { autoReconnect: getAutoReconnect() })
        if (result.success) {
          saveConnection({ host, port: portNum, password })
          onConnect({ host, port: portNum, password })
        } else {
          console.error('Failed to start client:', result.error)
          let userFriendlyError = result.error || 'Unknown error'
          if (userFriendlyError.toLowerCase().includes('econnrefused')) {
            userFriendlyError = 'Connection refused. Make sure the other user is listening on this address and port.'
          } else if (userFriendlyError.toLowerCase().includes('timeout')) {
            userFriendlyError = 'Connection timed out. Please check the host address and your internet connection.'
          } else if (userFriendlyError.toLowerCase().includes('ehostunreach')) {
            userFriendlyError = 'Host unreachable. Please verify the host address is correct.'
          }
          setErrorMessage(userFriendlyError)
          setIsConnecting(false)
        }
      } else {
        // Ripster: Start TCP server
        const result = await window.electronAPI.startServer(portNum, password)
        if (result.success) {
          // Server started, will transition to chat when client connects
          // The listener is set up in ChatWindow component
        } else {
          console.error('Failed to start server:', result.error)
          let userFriendlyError = result.error || 'Unknown error'
          if (userFriendlyError.toLowerCase().includes('eaddrinuse')) {
            userFriendlyError = 'Port is already in use. Please try a different port number.'
          } else if (userFriendlyError.toLowerCase().includes('eacces')) {
            userFriendlyError = 'Permission denied. Try using a port number above 1024.'
          }
          setErrorMessage(userFriendlyError)
          setIsConnecting(false)
        }
      }
    } catch (err) {
      console.error('Connection error:', err)
      setErrorMessage('An unexpected error occurred. Please try again.')
      setIsConnecting(false)
    }
  }

  // Auto-resume: fire the connection once on mount when launched into an
  // existing session (e.g. after an auto-update restart). Guarded so it only
  // runs a single time and only when the saved password is present.
  const autoConnectFiredRef = useRef(false)
  useEffect(() => {
    if (!autoConnect || autoConnectFiredRef.current) return
    if (!passwordLoaded || !password) return // wait until the saved password is decrypted
    autoConnectFiredRef.current = true
    void handleConnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, passwordLoaded, password])

  return (
    <div className="connection-setup glass">
      <h1 className="title">
        {isConnector ? 'Connect to Ripster' : 'Waiting for RLRJupiter...'}
      </h1>

      {isConnector ? (
        <>
          <div className="form-group">
            <label htmlFor="host-input">Host:</label>
            <input
              id="host-input"
              type="text"
              className="glass-input"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="peer address (e.g. name.ddns.net)"
              disabled={isConnecting}
              aria-label="Host address"
            />
          </div>

          <div className="form-group">
            <label htmlFor="port-input">Port:</label>
            <input
              id="port-input"
              type="number"
              className="glass-input"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="8082"
              disabled={isConnecting}
              aria-label="Port number"
              min="1"
              max="65535"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password-input">Session Password:</label>
            <input
              id="password-input"
              type="password"
              className="glass-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter shared password"
              disabled={isConnecting}
              aria-label="Session password"
            />
          </div>
        </>
      ) : (
        <>
          <div className="form-group">
            <label htmlFor="port-input">Listening on port:</label>
            <input
              id="port-input"
              type="number"
              className="glass-input"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="8082"
              disabled={isConnecting}
              aria-label="Port number"
              min="1"
              max="65535"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password-input">Session Password:</label>
            <input
              id="password-input"
              type="password"
              className="glass-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter shared password"
              disabled={isConnecting}
              aria-label="Session password"
            />
          </div>

          <div className="status-text" role="status" aria-live="polite">
            {isConnecting ? '🟡 Waiting for connection...' : '🟡 Ready to accept connection'}
          </div>
        </>
      )}

      {errorMessage && (
        <div className="error-message" role="alert" aria-live="assertive">
          ⚠️ {errorMessage}
        </div>
      )}

      <details className="connection-log-wrap">
        <summary>Connection log</summary>
        <div className="connection-log" role="log">
          {connectionLog.length === 0 ? (
            <div className="connection-log-line connection-log-empty">
              No connection events yet.
            </div>
          ) : (
            connectionLog.map((e, i) => (
              <div key={i} className="connection-log-line">
                {e.message}
                {e.detail != null && e.detail !== '' && <span className="connection-log-detail"> {e.detail}</span>}
              </div>
            ))
          )}
        </div>
      </details>

      <div className="ip-info">
        <p className="ip-title">💡 Your reachable IPs:</p>
        {localIPs.length > 0 ? (
          localIPs.map((ip, i) => (
            <div key={i} className="ip-item">
              - {ip.address} ({ip.name})
            </div>
          ))
        ) : (
          <div className="ip-item">- Loading...</div>
        )}
      </div>

      <button
        className="glass-button"
        onClick={handleConnect}
        disabled={isConnecting}
        aria-label={isConnector ? 'Connect to peer' : 'Start listening for connection'}
      >
        {isConnecting ? (
          <>
            <span className="spinner" aria-hidden="true"></span>
            {isConnector ? 'Connecting...' : 'Starting...'}
          </>
        ) : (
          isConnector ? 'Connect' : 'Start Listening'
        )}
      </button>
    </div>
  )
}

export default ConnectionSetup
