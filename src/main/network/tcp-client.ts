import { Socket } from 'net'
import { EventEmitter } from 'events'
import { ProtocolMessage, decodeMessage, hashPassword } from './protocol'
import { deriveKey, isEncryptedLine, encryptMessage, decryptMessage } from './secure-channel'
// #region agent log
import { appendLog } from '../debug-log'
// #endregion

export class TCPClient extends EventEmitter {
  private socket: Socket | null = null
  private host: string
  private port: number
  private buffer: string = ''
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectDelay: number = 500 // First retry is fast; brief blips recover almost instantly
  private maxReconnectDelay: number = 15000 // Cap backoff at 15s so a returning peer is found quickly
  private shouldReconnect: boolean = false
  private isConnecting: boolean = false
  private heartbeatTimer: NodeJS.Timeout | null = null
  private heartbeatInterval: number = 30000 // Send heartbeat every 30 seconds
  private lastActivityTime: number = Date.now()
  private connectionCheckTimer: NodeJS.Timeout | null = null
  private staleConnectionTimeout: number = 75000 // Dead after 2.5 missed heartbeat intervals
  private password: string
  private isAuthenticated: boolean = false
  private sessionKey: Buffer | null = null // AES-256-GCM key derived per connection
  private lastPingSentAt: number = 0
  private lastRttMs: number | null = null
  private lastPongTime: number = 0
  private autoReconnect: boolean = true

  constructor(host: string, port: number, password: string, options?: { autoReconnect?: boolean }) {
    super()
    this.host = host
    this.port = port
    this.password = password
    this.autoReconnect = options?.autoReconnect !== false
  }

  connect(): void {
    if (this.socket && !this.socket.destroyed) {
      console.log('[TCP Client] Already connected')
      return
    }

    if (this.isConnecting) {
      console.log('[TCP Client] Connection already in progress')
      return
    }

    this.isConnecting = true
    this.shouldReconnect = this.autoReconnect
    this.buffer = ''
    this.isAuthenticated = false
    this.sessionKey = null
    this.lastActivityTime = Date.now()

    console.log(`[TCP Client] Connecting to ${this.host}:${this.port}`)
    this.emit('connecting', { host: this.host, port: this.port })

    this.socket = new Socket()
    this.socket.setEncoding('utf8')

    // Enable TCP keepalive to detect dead connections
    this.socket.setKeepAlive(true, 20000) // Probe after 20s idle: detects dead peers sooner, keeps NAT entries fresh
    this.socket.setNoDelay(true) // Disable Nagle's algorithm for real-time chat
    this.socket.setTimeout(90000) // Detect stale sockets faster than OS keepalive

    this.socket.on('connect', () => {
      console.log('[TCP Client] Connected, waiting for encryption handshake...')
      // #region agent log
      this.emit('log', { message: 'TCP connected', detail: `${this.host}:${this.port}` })
      appendLog({ sessionId: '3352dc', hypothesisId: 'H2', location: 'tcp-client.ts:connect', message: 'TCP connected', data: { host: this.host, port: this.port } })
      // #endregion
      this.isConnecting = false
      this.reconnectDelay = 500 // Reset reconnect delay on successful connection
      this.lastActivityTime = Date.now()

      // Note: Don't send auth yet. The server opens with a plaintext `hello`
      // carrying the session salt; we derive the encryption key from it and
      // only then send the (encrypted) auth message. See handleMessage.
    })

    this.socket.on('data', (data: string) => {
      this.lastActivityTime = Date.now()
      this.buffer += data
      const lines = this.buffer.split('\n')

      // Keep the last incomplete line in buffer
      this.buffer = lines.pop() || ''

      // Process complete lines
      for (const line of lines) {
        if (!line.trim()) continue

        if (isEncryptedLine(line)) {
          const msg = this.sessionKey ? decryptMessage(this.sessionKey, line) : null
          if (!msg) {
            console.warn('[TCP Client] Failed to decrypt incoming line')
            continue
          }
          console.log(`[TCP Client] Received:`, msg.type)
          this.handleMessage(msg)
          continue
        }

        // Plaintext is only valid for the handshake hello and the
        // wrong-password rejection (which we could not decrypt anyway).
        const msg = decodeMessage(line)
        if (msg && (msg.type === 'hello' || msg.type === 'auth-failed')) {
          console.log(`[TCP Client] Received:`, msg.type)
          this.handleMessage(msg)
        } else if (msg) {
          console.warn('[TCP Client] Ignoring unexpected plaintext message:', msg.type)
        }
      }
    })

    this.socket.on('error', (err: any) => {
      console.error('[TCP Client] Error:', err.message)
      this.isConnecting = false
      this.emit('error', err)
    })

    this.socket.on('timeout', () => {
      console.warn('[TCP Client] Socket timeout, forcing reconnect')
      this.socket?.destroy()
    })

    this.socket.on('close', () => {
      console.log('[TCP Client] Disconnected')
      // #region agent log
      this.emit('log', { message: 'Socket closed', detail: this.isAuthenticated ? 'was authenticated' : 'before auth' })
      appendLog({ sessionId: '3352dc', hypothesisId: 'H1', location: 'tcp-client.ts:close', message: 'Socket closed', data: { wasAuthenticated: this.isAuthenticated } })
      // #endregion
      this.isConnecting = false
      this.isAuthenticated = false
      this.sessionKey = null
      this.socket = null
      this.buffer = ''
      this.stopHeartbeat()
      this.emit('disconnected')

      // Auto-reconnect
      if (this.shouldReconnect) {
        this.scheduleReconnect()
      }
    })

    this.socket.connect(this.port, this.host)
  }

  disconnect(): void {
    console.log('[TCP Client] Disconnecting')
    this.shouldReconnect = false
    this.isConnecting = false
    this.isAuthenticated = false
    this.sessionKey = null

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.stopHeartbeat()

    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }

    this.buffer = ''
    this.emit('stopped')
  }

  send(message: ProtocolMessage): boolean {
    if (!this.socket || this.socket.destroyed) {
      console.warn('[TCP Client] Not connected, cannot send message')
      return false
    }

    if (!this.isAuthenticated && message.type !== 'auth') {
      console.warn('[TCP Client] Not authenticated yet, cannot send:', message.type)
      return false
    }

    if (!this.sessionKey) {
      console.warn('[TCP Client] No session key yet, cannot send:', message.type)
      return false
    }

    try {
      const encoded = encryptMessage(this.sessionKey, message)
      this.socket.write(encoded)
      console.log(`[TCP Client] Sent:`, message.type)
      return true
    } catch (err) {
      console.error('[TCP Client] Failed to send message:', err)
      return false
    }
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed && this.isAuthenticated
  }

  /** Read-only diagnostics for UI (does not modify connection state) */
  getDiagnostics(): { role: 'client'; connected: boolean; authenticated: boolean; lastActivityTime: number; reconnectDelay: number; isConnecting: boolean; lastRttMs: number | null; lastPongTime: number } {
    return {
      role: 'client',
      connected: this.socket !== null && !this.socket.destroyed,
      authenticated: this.isAuthenticated,
      lastActivityTime: this.lastActivityTime,
      reconnectDelay: this.reconnectDelay,
      isConnecting: this.isConnecting,
      lastRttMs: this.lastRttMs,
      lastPongTime: this.lastPongTime
    }
  }

  /**
   * Skip any pending backoff and retry immediately. Called when the OS
   * reports the network came back online — no reason to sit out a 15s
   * backoff window when we know connectivity was just restored.
   */
  reconnectNow(): void {
    if (this.isConnected()) {
      // Socket may have silently died across the network change; probe it.
      // A dead socket errors out on write and triggers the fast reconnect.
      this.lastPingSentAt = Date.now()
      this.send({ type: 'ping', payload: {}, timestamp: Date.now() })
      return
    }
    if (!this.shouldReconnect || this.isConnecting) return
    console.log('[TCP Client] Network restored, reconnecting immediately')
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.reconnectDelay = 500
    if (this.socket && !this.socket.destroyed) {
      // Connection may be half-dead after a network change; force a clean slate
      this.socket.destroy()
      return // close handler schedules the (now fast) reconnect
    }
    this.connect()
  }

  updateConfig(host: string, port: number): void {
    const changed = this.host !== host || this.port !== port
    this.host = host
    this.port = port

    if (changed && this.shouldReconnect) {
      console.log(`[TCP Client] Config updated, reconnecting to ${host}:${port}`)
      this.disconnect()
      setTimeout(() => this.connect(), 100)
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    console.log(`[TCP Client] Reconnecting in ${this.reconnectDelay}ms...`)
    this.emit('reconnecting', { delay: this.reconnectDelay })

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.reconnectDelay)

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay)
  }

  private handleMessage(msg: ProtocolMessage): void {
    // Encryption handshake: server announced the session salt. Derive the key
    // and authenticate over the now-encrypted channel.
    if (msg.type === 'hello') {
      const salt = msg.payload?.salt
      if (typeof salt !== 'string' || !salt) {
        console.error('[TCP Client] Invalid hello (missing salt), disconnecting')
        this.socket?.destroy()
        return
      }
      this.sessionKey = deriveKey(this.password, salt)
      // #region agent log
      this.emit('log', { message: 'Encrypted session established, sending auth' })
      appendLog({ sessionId: '3352dc', hypothesisId: 'H1', location: 'tcp-client.ts:hello', message: 'Session key derived, sending auth' })
      // #endregion
      this.send({
        type: 'auth',
        payload: { passwordHash: hashPassword(this.password) },
        timestamp: Date.now()
      })
      return
    }

    // Handle authentication responses
    if (msg.type === 'auth-success') {
      console.log('[TCP Client] Authentication successful')
      // #region agent log
      this.emit('log', { message: 'Auth success' })
      appendLog({ sessionId: '3352dc', hypothesisId: 'H1', location: 'tcp-client.ts:auth-success', message: 'Auth success' })
      // #endregion
      this.isAuthenticated = true

      // Now emit connected event (delayed until auth succeeds)
      this.emit('connected', { host: this.host, port: this.port })

      // Start heartbeat after successful auth
      this.startHeartbeat()

      // Send initial ping (RTT will be set when pong received)
      this.lastPingSentAt = Date.now()
      this.send({ type: 'ping', payload: {}, timestamp: Date.now() })
      return
    }

    if (msg.type === 'auth-failed') {
      console.error('[TCP Client] Authentication failed:', msg.payload.reason)
      // #region agent log
      this.emit('log', { message: 'Auth failed', detail: String(msg.payload?.reason || 'Invalid password') })
      appendLog({ sessionId: '3352dc', hypothesisId: 'H1', location: 'tcp-client.ts:auth-failed', message: 'Auth failed', data: { reason: msg.payload?.reason } })
      // #endregion
      this.emit('error', new Error('Authentication failed: ' + (msg.payload.reason || 'Invalid password')))

      // Disconnect
      this.shouldReconnect = false
      this.disconnect()
      return
    }

    // Block all other messages until authenticated
    if (!this.isAuthenticated && msg.type !== 'auth') {
      console.warn('[TCP Client] Ignoring message - not authenticated yet:', msg.type)
      return
    }

    // Handle authenticated messages
    switch (msg.type) {
      case 'ping':
        // Auto-respond to ping with pong
        this.send({ type: 'pong', payload: {}, timestamp: Date.now() })
        break

      case 'pong': {
        this.lastPongTime = Date.now()
        if (this.lastPingSentAt > 0) {
          this.lastRttMs = this.lastPongTime - this.lastPingSentAt
        }
        this.emit('message', msg)
        break
      }

      case 'chat':
      case 'chat-ack':
      case 'status':
      case 'reaction':
      case 'reaction-remove':
      case 'typing':
      case 'file-offer':
      case 'file-accept':
      case 'file-reject':
      case 'file-chunk':
      case 'file-complete':
      case 'file-cancel':
      case 'file-pause':
      case 'file-resume':
        // Forward to renderer
        this.emit('message', msg)
        break

      case 'auth':
        // Ignore auth messages on client side (only server cares)
        break

      default:
        console.warn('[TCP Client] Unknown message type:', msg.type)
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    
    // Send periodic pings
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.lastPingSentAt = Date.now()
        console.log('[TCP Client] Sending heartbeat ping')
        this.send({ type: 'ping', payload: {}, timestamp: Date.now() })
      }
    }, this.heartbeatInterval)

    // Check connection health based on last network activity.
    this.connectionCheckTimer = setInterval(() => {
      const timeSinceLastActivity = Date.now() - this.lastActivityTime
      if (timeSinceLastActivity > this.staleConnectionTimeout) {
        console.warn('[TCP Client] No activity detected, reconnecting stale socket')
        if (this.socket) {
          this.socket.destroy()
        }
      }
    }, 15000) // Check every 15 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.connectionCheckTimer) {
      clearInterval(this.connectionCheckTimer)
      this.connectionCheckTimer = null
    }
  }
}
