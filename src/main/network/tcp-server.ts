import { Server, Socket } from 'net'
import { EventEmitter } from 'events'
import { ProtocolMessage, encodeMessage, hashPassword } from './protocol'
import { generateSalt, deriveKey, isEncryptedLine, encryptMessage, decryptMessage } from './secure-channel'
// #region agent log
import { appendLog } from '../debug-log'
// #endregion

export class TCPServer extends EventEmitter {
  private server: Server | null = null
  private client: Socket | null = null
  private port: number
  private buffer: string = ''
  private heartbeatTimer: NodeJS.Timeout | null = null
  private heartbeatInterval: number = 30000 // Send heartbeat every 30 seconds
  private lastActivityTime: number = Date.now()
  private connectionCheckTimer: NodeJS.Timeout | null = null
  private staleConnectionTimeout: number = 75000 // Dead after 2.5 missed heartbeat intervals
  private password: string
  private isAuthenticated: boolean = false
  private authTimer: NodeJS.Timeout | null = null
  private authTimeout: number = 15000 // 15 seconds to authenticate
  private sessionKey: Buffer | null = null // AES-256-GCM key derived per connection

  constructor(port: number, password: string) {
    super()
    this.port = port
    this.password = password
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        console.log('[TCP Server] Already running')
        return resolve()
      }

      this.server = new Server()

      this.server.on('connection', (socket: Socket) => {
        const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`
        console.log(`[TCP Server] Client connected: ${clientAddr}`)
        // #region agent log
        this.emit('log', { message: 'Client connected', detail: clientAddr })
        appendLog({ sessionId: '3352dc', hypothesisId: 'H4', location: 'tcp-server.ts:connection', message: 'Client connected', data: { clientAddr } })
        // #endregion

        // Disconnect existing client if any. Its close/error events fire
        // asynchronously AFTER we set up the new connection below, so every
        // handler must check `this.client === socket` before touching shared
        // state — otherwise the old socket's close wipes the new session's
        // key and the reconnecting peer gets a bogus "Invalid password".
        if (this.client) {
          console.log('[TCP Server] Disconnecting previous client')
          this.stopHeartbeat() // old session's heartbeat; new one starts after auth
          this.client.destroy()
        }

        this.client = socket
        this.buffer = ''
        this.lastActivityTime = Date.now()
        this.isAuthenticated = false // Reset auth state

        console.log('[TCP Server] Waiting for authentication...')

        socket.setEncoding('utf8')

        // Enable TCP keepalive to detect dead connections
        socket.setKeepAlive(true, 20000) // Probe after 20s idle: detects dead peers sooner, keeps NAT entries fresh
        socket.setNoDelay(true) // Disable Nagle's algorithm for real-time chat
        socket.setTimeout(90000) // Detect stale sockets faster than OS keepalive

        // Start auth timeout - disconnect if not authenticated in time
        this.startAuthTimeout()

        // Begin encrypted-session handshake: derive a fresh key for this
        // connection and tell the peer the salt. The hello line is the only
        // plaintext the server ever sends besides auth-failed.
        const salt = generateSalt()
        this.sessionKey = deriveKey(this.password, salt)
        socket.write(encodeMessage({ type: 'hello', payload: { salt, v: 1 }, timestamp: Date.now() }))

        // One rejection per connection: a scanner sending an HTTP request (or
        // a wrong-password client) produces many bad lines; rejecting each one
        // spams the log and writes into a socket already being destroyed.
        let rejectedThisConnection = false
        const rejectOnce = (reason: string) => {
          if (rejectedThisConnection) return
          rejectedThisConnection = true
          this.rejectUnauthenticated(reason)
        }

        socket.on('data', (data: string) => {
          if (this.client !== socket) return // stale socket; already replaced
          this.lastActivityTime = Date.now()
          this.buffer += data
          const lines = this.buffer.split('\n')

          // Keep the last incomplete line in buffer
          this.buffer = lines.pop() || ''

          // Process complete lines
          for (const line of lines) {
            if (!line.trim()) continue
            if (rejectedThisConnection) return // draining a rejected peer

            if (!isEncryptedLine(line)) {
              // Plaintext from a peer is never valid (wrong app version or a
              // port scanner). Reject before auth; ignore after.
              if (!this.isAuthenticated) rejectOnce('Encryption required')
              continue
            }

            const msg = this.sessionKey ? decryptMessage(this.sessionKey, line) : null
            if (!msg) {
              // GCM auth failure: wrong password (different key) or tampering
              console.warn('[TCP Server] Failed to decrypt incoming line')
              if (!this.isAuthenticated) {
                rejectOnce('Invalid password')
              } else {
                socket.destroy()
              }
              continue
            }

            console.log(`[TCP Server] Received:`, msg.type)
            this.handleMessage(msg)
          }
        })

        socket.on('error', (err) => {
          if (this.client !== socket) return // stale socket; already replaced
          console.error('[TCP Server] Socket error:', err.message)
          this.emit('error', err)
        })

        socket.on('timeout', () => {
          console.warn('[TCP Server] Client socket timeout, closing stale connection')
          socket.destroy()
        })

        socket.on('close', () => {
          if (this.client !== socket) {
            // This close belongs to a connection that was already replaced by
            // a newer one — do NOT clear the new session's state (doing so
            // wiped the fresh session key and made valid reconnects fail with
            // "Invalid password").
            console.log('[TCP Server] Stale socket closed (already replaced)')
            return
          }
          console.log('[TCP Server] Client disconnected')
          // #region agent log
          this.emit('log', { message: 'Client closed', detail: this.isAuthenticated ? 'was authenticated' : 'before auth' })
          appendLog({ sessionId: '3352dc', hypothesisId: 'H4', location: 'tcp-server.ts:close', message: 'Client closed', data: { wasAuthenticated: this.isAuthenticated } })
          // #endregion
          this.client = null
          this.buffer = ''
          this.isAuthenticated = false
          this.sessionKey = null
          this.stopHeartbeat()
          this.stopAuthTimeout()
          this.emit('disconnected')
        })
      })

      this.server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`[TCP Server] Port ${this.port} already in use`)
          reject(new Error(`Port ${this.port} is already in use`))
        } else {
          console.error('[TCP Server] Server error:', err)
          this.emit('error', err)
          reject(err)
        }
      })

      this.server.listen(this.port, () => {
        console.log(`[TCP Server] Listening on port ${this.port}`)
        this.emit('listening', this.port)
        resolve()
      })
    })
  }

  stop(): void {
    console.log('[TCP Server] Stopping')

    this.stopHeartbeat()
    this.stopAuthTimeout()

    if (this.client) {
      this.client.destroy()
      this.client = null
    }

    if (this.server) {
      this.server.close(() => {
        console.log('[TCP Server] Stopped')
      })
      this.server = null
    }

    this.buffer = ''
    this.isAuthenticated = false
    this.sessionKey = null
    this.emit('stopped')
  }

  send(message: ProtocolMessage): boolean {
    if (!this.client) {
      console.warn('[TCP Server] No client connected, cannot send message')
      return false
    }

    if (!this.isAuthenticated && message.type !== 'auth-success' && message.type !== 'auth-failed') {
      console.warn('[TCP Server] Client not authenticated yet, cannot send:', message.type)
      return false
    }

    if (!this.sessionKey) {
      console.warn('[TCP Server] No session key, cannot send:', message.type)
      return false
    }

    try {
      const encoded = encryptMessage(this.sessionKey, message)
      this.client.write(encoded)
      console.log(`[TCP Server] Sent:`, message.type)
      return true
    } catch (err) {
      console.error('[TCP Server] Failed to send message:', err)
      return false
    }
  }

  /**
   * Reject an unauthenticated peer with a plaintext auth-failed line.
   * Plaintext is required here: a wrong-password peer has a different session
   * key and could not decrypt the rejection otherwise. Carries no secrets.
   */
  private rejectUnauthenticated(reason: string): void {
    console.warn('[TCP Server] Rejecting unauthenticated peer:', reason)
    this.emit('log', { message: 'Sending auth-failed', detail: reason })
    appendLog({ sessionId: '3352dc', hypothesisId: 'H1', location: 'tcp-server.ts:auth-failed-send', message: 'Sending auth-failed' })
    try {
      this.client?.write(encodeMessage({ type: 'auth-failed', payload: { reason }, timestamp: Date.now() }))
    } catch (_err) {
      // Socket may already be gone; we are destroying it anyway
    }
    setTimeout(() => {
      this.client?.destroy()
    }, 100)
  }

  isConnected(): boolean {
    return this.client !== null && !this.client.destroyed && this.isAuthenticated
  }

  /** Read-only diagnostics for UI (does not modify connection state) */
  getDiagnostics(): { role: 'server'; connected: boolean; authenticated: boolean; lastActivityTime: number; isConnecting: false } {
    return {
      role: 'server',
      connected: this.client !== null && !this.client.destroyed,
      authenticated: this.isAuthenticated,
      lastActivityTime: this.lastActivityTime,
      isConnecting: false
    }
  }

  private handleMessage(msg: ProtocolMessage): void {
    // Handle authentication first
    if (msg.type === 'auth') {
      const expectedHash = hashPassword(this.password)
      const receivedHash = msg.payload.passwordHash
      const match = receivedHash === expectedHash
      // #region agent log
      this.emit('log', { message: 'Auth received', detail: match ? 'match' : 'invalid password' })
      appendLog({ sessionId: '3352dc', hypothesisId: 'H1', location: 'tcp-server.ts:auth', message: 'Auth received', data: { match } })
      // #endregion

      if (match) {
        console.log('[TCP Server] Authentication successful')
        this.emit('log', { message: 'Sending auth-success' })
        appendLog({ sessionId: '3352dc', hypothesisId: 'H1', location: 'tcp-server.ts:auth-success-send', message: 'Sending auth-success' })
        this.isAuthenticated = true
        this.stopAuthTimeout()

        // Send success response
        this.send({ type: 'auth-success', payload: {}, timestamp: Date.now() })

        // Now emit connected event (delayed until auth succeeds)
        this.emit('connected', {
          address: this.client?.remoteAddress,
          port: this.client?.remotePort
        })

        // Start heartbeat after successful auth
        this.startHeartbeat()
      } else {
        // In practice unreachable with encryption on (a wrong password means
        // the auth message never decrypts), but kept as defense in depth.
        console.warn('[TCP Server] Authentication failed - invalid password')
        this.rejectUnauthenticated('Invalid password')
      }
      return
    }

    // Block all other messages until authenticated
    if (!this.isAuthenticated) {
      console.warn('[TCP Server] Rejecting message - not authenticated yet:', msg.type)
      if (this.client) {
        this.client.destroy()
      }
      return
    }

    // Handle authenticated messages
    switch (msg.type) {
      case 'ping':
        // Auto-respond to ping with pong
        this.send({ type: 'pong', payload: {}, timestamp: Date.now() })
        break

      case 'pong':
        this.emit('message', msg)
        break

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

      case 'auth-success':
      case 'auth-failed':
        // Ignore these on server side (only client cares)
        break

      default:
        // Forward any other application message type to the renderer. New
        // feature message types (nudge, reply, read-receipt, call signaling,
        // call audio, …) only need to be added to the protocol + handled in
        // the renderer — the transport relays them generically.
        this.emit('message', msg)
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    
    // Send periodic pings
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        console.log('[TCP Server] Sending heartbeat ping')
        this.send({ type: 'ping', payload: {}, timestamp: Date.now() })
      }
    }, this.heartbeatInterval)

    // Check connection health based on last network activity.
    this.connectionCheckTimer = setInterval(() => {
      const timeSinceLastActivity = Date.now() - this.lastActivityTime
      if (timeSinceLastActivity > this.staleConnectionTimeout) {
        console.warn('[TCP Server] No activity detected, closing stale connection')
        if (this.client) {
          this.client.destroy()
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

  private startAuthTimeout(): void {
    this.stopAuthTimeout()

    this.authTimer = setTimeout(() => {
      if (!this.isAuthenticated && this.client) {
        console.warn('[TCP Server] Authentication timeout - disconnecting')
        // #region agent log
        this.emit('log', { message: 'Auth timeout', detail: 'disconnecting' })
        appendLog({ sessionId: '3352dc', hypothesisId: 'H4', location: 'tcp-server.ts:auth-timeout', message: 'Auth timeout', data: {} })
        // #endregion
        this.client.destroy()
      }
    }, this.authTimeout)
  }

  private stopAuthTimeout(): void {
    if (this.authTimer) {
      clearTimeout(this.authTimer)
      this.authTimer = null
    }
  }
}
