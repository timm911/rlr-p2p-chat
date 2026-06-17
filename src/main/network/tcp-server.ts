import { Server, Socket } from 'net'
import { EventEmitter } from 'events'
import { ProtocolMessage, encodeMessage, hashPassword } from './protocol'
import { generateSalt, deriveKey, isEncryptedLine, encryptMessage, decryptMessage } from './secure-channel'
// #region agent log
import { appendLog } from '../debug-log'
// #endregion

/**
 * Application message types the hub forwards to every OTHER connected peer so a
 * 3-way group chat works (the two connectors have no direct link to each other
 * — Ripster relays between them). Calls stay 1:1 (not relayed peer-to-peer),
 * and transport/handshake/history-sync messages are never relayed.
 */
const RELAY_TYPES = new Set<ProtocolMessage['type']>([
  'chat', 'chat-ack', 'status', 'typing', 'reaction', 'reaction-remove',
  'file-offer', 'file-accept', 'file-reject', 'file-chunk', 'file-complete',
  'file-cancel', 'file-pause', 'file-resume', 'nudge', 'read-receipt', 'app-version',
  'presence', 'edit', 'unsend', 'reminder',
  'screen-share-start', 'screen-share-stop', 'screen-frame'
])

interface PeerConn {
  id: string
  socket: Socket
  buffer: string
  isAuthenticated: boolean
  sessionKey: Buffer | null // AES-256-GCM key derived per connection
  lastActivityTime: number
  authTimer: NodeJS.Timeout | null
  rejected: boolean
}

export class TCPServer extends EventEmitter {
  private server: Server | null = null
  private clients: Map<string, PeerConn> = new Map()
  private nextId = 1
  private port: number
  private heartbeatTimer: NodeJS.Timeout | null = null
  private connectionCheckTimer: NodeJS.Timeout | null = null
  private heartbeatInterval: number = 30000 // Send heartbeat every 30 seconds
  private staleConnectionTimeout: number = 75000 // Dead after 2.5 missed heartbeat intervals
  private authTimeout: number = 15000 // 15 seconds to authenticate
  private password: string

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
        const id = `c${this.nextId++}`
        console.log(`[TCP Server] Client connected: ${clientAddr} (${id})`)
        // #region agent log
        this.emit('log', { message: 'Client connected', detail: clientAddr })
        appendLog({ sessionId: '3352dc', hypothesisId: 'H4', location: 'tcp-server.ts:connection', message: 'Client connected', data: { clientAddr } })
        // #endregion

        const peer: PeerConn = {
          id,
          socket,
          buffer: '',
          isAuthenticated: false,
          sessionKey: null,
          lastActivityTime: Date.now(),
          authTimer: null,
          rejected: false
        }
        this.clients.set(id, peer)

        socket.setEncoding('utf8')
        socket.setKeepAlive(true, 20000) // Probe after 20s idle: detects dead peers sooner, keeps NAT entries fresh
        socket.setNoDelay(true) // Disable Nagle's algorithm for real-time chat
        socket.setTimeout(90000) // Detect stale sockets faster than OS keepalive

        // Begin encrypted-session handshake: derive a fresh key for THIS
        // connection and tell the peer the salt. The hello line is the only
        // plaintext the server ever sends besides auth-failed.
        const salt = generateSalt()
        peer.sessionKey = deriveKey(this.password, salt)
        socket.write(encodeMessage({ type: 'hello', payload: { salt, v: 1 }, timestamp: Date.now() }))

        // Disconnect if not authenticated in time
        peer.authTimer = setTimeout(() => {
          if (!peer.isAuthenticated) {
            console.warn(`[TCP Server] Auth timeout (${id}) - disconnecting`)
            this.emit('log', { message: 'Auth timeout', detail: 'disconnecting' })
            socket.destroy()
          }
        }, this.authTimeout)

        const rejectOnce = (reason: string) => {
          if (peer.rejected) return
          peer.rejected = true
          this.rejectUnauthenticated(peer, reason)
        }

        socket.on('data', (data: string) => {
          peer.lastActivityTime = Date.now()
          peer.buffer += data
          const lines = peer.buffer.split('\n')
          peer.buffer = lines.pop() || '' // keep the last incomplete line

          for (const line of lines) {
            if (!line.trim()) continue
            if (peer.rejected) return // draining a rejected peer

            if (!isEncryptedLine(line)) {
              // Plaintext from a peer is never valid (wrong app version or a
              // port scanner). Reject before auth; ignore after.
              if (!peer.isAuthenticated) rejectOnce('Encryption required')
              continue
            }

            const msg = peer.sessionKey ? decryptMessage(peer.sessionKey, line) : null
            if (!msg) {
              // GCM auth failure: wrong password (different key) or tampering
              console.warn(`[TCP Server] Failed to decrypt incoming line (${id})`)
              if (!peer.isAuthenticated) rejectOnce('Invalid password')
              else socket.destroy()
              continue
            }

            console.log(`[TCP Server] Received (${id}):`, msg.type)
            this.handleMessage(peer, msg)
          }
        })

        socket.on('error', (err) => {
          console.error(`[TCP Server] Socket error (${id}):`, err.message)
          this.emit('error', err)
        })

        socket.on('timeout', () => {
          console.warn(`[TCP Server] Client socket timeout (${id}), closing stale connection`)
          socket.destroy()
        })

        socket.on('close', () => {
          const wasAuthed = peer.isAuthenticated
          if (peer.authTimer) { clearTimeout(peer.authTimer); peer.authTimer = null }
          this.clients.delete(id)
          console.log(`[TCP Server] Client disconnected (${id}); ${this.clients.size} remaining`)
          // #region agent log
          this.emit('log', { message: 'Client closed', detail: wasAuthed ? 'was authenticated' : 'before auth' })
          appendLog({ sessionId: '3352dc', hypothesisId: 'H4', location: 'tcp-server.ts:close', message: 'Client closed', data: { wasAuthenticated: wasAuthed } })
          // #endregion
          // Only surface "disconnected" to the UI when the LAST peer leaves —
          // otherwise one connector dropping would falsely mark Ripster offline.
          if (wasAuthed && this.authedCount() === 0) {
            this.stopHeartbeat()
            this.emit('disconnected')
          }
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
    for (const peer of this.clients.values()) {
      if (peer.authTimer) clearTimeout(peer.authTimer)
      peer.socket.destroy()
    }
    this.clients.clear()
    if (this.server) {
      this.server.close(() => console.log('[TCP Server] Stopped'))
      this.server = null
    }
    this.emit('stopped')
  }

  private authedCount(): number {
    let n = 0
    for (const p of this.clients.values()) if (p.isAuthenticated && !p.socket.destroyed) n++
    return n
  }

  /** Send a message to a single peer (used for directed replies, e.g. history). */
  private sendTo(peer: PeerConn, message: ProtocolMessage): boolean {
    if (!peer.isAuthenticated && message.type !== 'auth-success' && message.type !== 'auth-failed') return false
    if (!peer.sessionKey || peer.socket.destroyed) return false
    try {
      peer.socket.write(encryptMessage(peer.sessionKey, message))
      return true
    } catch (err) {
      console.error(`[TCP Server] Failed to send to ${peer.id}:`, err)
      return false
    }
  }

  /** Broadcast to every authenticated peer (optionally excluding one). */
  send(message: ProtocolMessage, exceptId?: string): boolean {
    let any = false
    for (const peer of this.clients.values()) {
      if (peer.id === exceptId) continue
      if (this.sendTo(peer, message)) any = true
    }
    if (!any) console.warn('[TCP Server] No authenticated peers, cannot send:', message.type)
    return any
  }

  /**
   * Reject an unauthenticated peer with a plaintext auth-failed line.
   * Plaintext is required: a wrong-password peer has a different session key
   * and could not decrypt the rejection otherwise. Carries no secrets.
   */
  private rejectUnauthenticated(peer: PeerConn, reason: string): void {
    console.warn(`[TCP Server] Rejecting unauthenticated peer (${peer.id}):`, reason)
    this.emit('log', { message: 'Sending auth-failed', detail: reason })
    try {
      peer.socket.write(encodeMessage({ type: 'auth-failed', payload: { reason }, timestamp: Date.now() }))
    } catch (_err) {
      // Socket may already be gone; we are destroying it anyway
    }
    setTimeout(() => peer.socket.destroy(), 100)
  }

  isConnected(): boolean {
    return this.authedCount() > 0
  }

  /** Read-only diagnostics for UI (does not modify connection state) */
  getDiagnostics(): { role: 'server'; connected: boolean; authenticated: boolean; lastActivityTime: number; isConnecting: false; peers: number } {
    let lastActivity = 0
    for (const p of this.clients.values()) if (p.lastActivityTime > lastActivity) lastActivity = p.lastActivityTime
    return {
      role: 'server',
      connected: this.authedCount() > 0,
      authenticated: this.authedCount() > 0,
      lastActivityTime: lastActivity || Date.now(),
      isConnecting: false,
      peers: this.authedCount()
    }
  }

  private handleMessage(peer: PeerConn, msg: ProtocolMessage): void {
    // Handle authentication first
    if (msg.type === 'auth') {
      const expectedHash = hashPassword(this.password)
      const match = msg.payload?.passwordHash === expectedHash
      this.emit('log', { message: 'Auth received', detail: match ? 'match' : 'invalid password' })

      if (match) {
        console.log(`[TCP Server] Authentication successful (${peer.id})`)
        peer.isAuthenticated = true
        if (peer.authTimer) { clearTimeout(peer.authTimer); peer.authTimer = null }
        this.sendTo(peer, { type: 'auth-success', payload: {}, timestamp: Date.now() })
        this.emit('connected', {
          address: peer.socket.remoteAddress,
          port: peer.socket.remotePort
        })
        this.startHeartbeat() // idempotent
      } else {
        // Unreachable with encryption on (wrong password → never decrypts), but
        // kept as defense in depth.
        console.warn(`[TCP Server] Authentication failed (${peer.id}) - invalid password`)
        peer.rejected = true
        this.rejectUnauthenticated(peer, 'Invalid password')
      }
      return
    }

    // Block all other messages until authenticated
    if (!peer.isAuthenticated) {
      console.warn(`[TCP Server] Rejecting message (${peer.id}) - not authenticated:`, msg.type)
      peer.socket.destroy()
      return
    }

    switch (msg.type) {
      case 'ping':
        this.sendTo(peer, { type: 'pong', payload: {}, timestamp: Date.now() })
        return // never relayed/forwarded

      case 'pong':
        this.emit('message', msg)
        return

      case 'history-request': {
        // A (re)connecting peer wants everything it missed. The hub is the
        // source of truth (it relays the whole conversation), so answer
        // directly on this socket. handlers.ts loads history.json and replies.
        const since = msg.payload?.since
        this.emit('history-request', {
          since,
          reply: (messages: any[]) => {
            this.sendTo(peer, { type: 'history-response', payload: { messages }, timestamp: Date.now() })
          }
        })
        return
      }

      case 'auth-success':
      case 'auth-failed':
        return // not meaningful inbound on the server
    }

    // Relay group-chat traffic to the OTHER connected peers (the two connectors
    // can't see each other directly). Calls and history-sync are not relayed.
    if (RELAY_TYPES.has(msg.type)) {
      this.send(msg, peer.id)
    }

    // Forward to this machine's renderer (and main-process file handling).
    this.emit('message', msg)
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer || this.connectionCheckTimer) return // already running

    this.heartbeatTimer = setInterval(() => {
      for (const peer of this.clients.values()) {
        if (peer.isAuthenticated && !peer.socket.destroyed) {
          this.sendTo(peer, { type: 'ping', payload: {}, timestamp: Date.now() })
        }
      }
    }, this.heartbeatInterval)

    this.connectionCheckTimer = setInterval(() => {
      const now = Date.now()
      for (const peer of this.clients.values()) {
        if (now - peer.lastActivityTime > this.staleConnectionTimeout) {
          console.warn(`[TCP Server] No activity (${peer.id}), closing stale connection`)
          peer.socket.destroy()
        }
      }
    }, 15000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null }
    if (this.connectionCheckTimer) { clearInterval(this.connectionCheckTimer); this.connectionCheckTimer = null }
  }
}
