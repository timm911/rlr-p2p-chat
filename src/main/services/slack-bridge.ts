/**
 * Two-way Slack bridge.
 *
 * Outbound: forwards incoming chat messages from the peer to a Slack channel
 * (so they reach your phone's Slack app when you're away from the PC).
 * Inbound: polls that channel and emits your Slack replies so they can be
 * relayed back to the peer over the encrypted chat.
 *
 * The bot token is stored encrypted at rest (Windows DPAPI / safeStorage).
 * NOTE: forwarding sends message content to Slack's servers — this is an
 * explicit, opt-in break from the app's otherwise server-free design.
 */
import { app, safeStorage } from 'electron'
import { EventEmitter } from 'events'
import https from 'https'
import path from 'path'
import fs from 'fs'
import { parseSlackHistory, shouldForwardToSlack } from './slack-util'

export interface SlackConfig {
  enabled: boolean
  channelId: string
  onlyWhenAway: boolean
}

interface StoredSlackConfig extends SlackConfig {
  tokenEnc?: string | null // safeStorage base64
  tokenPlain?: string | null // fallback if keystore unavailable
}

const POLL_MS = 5000

export class SlackBridge extends EventEmitter {
  private token: string | null = null
  private config: SlackConfig = { enabled: false, channelId: '', onlyWhenAway: true }
  private pollTimer: NodeJS.Timeout | null = null
  private lastTs = '0'

  private configPath(): string {
    return path.join(app.getPath('userData'), 'slack-config.json')
  }

  load(): void {
    try {
      const raw = fs.readFileSync(this.configPath(), 'utf8')
      const s: StoredSlackConfig = JSON.parse(raw)
      this.config = {
        enabled: !!s.enabled,
        channelId: s.channelId || '',
        onlyWhenAway: s.onlyWhenAway !== false
      }
      if (s.tokenEnc && safeStorage.isEncryptionAvailable()) {
        this.token = safeStorage.decryptString(Buffer.from(s.tokenEnc, 'base64'))
      } else if (s.tokenPlain) {
        this.token = s.tokenPlain
      }
    } catch (_) {
      // no config yet
    }
    if (this.config.enabled && this.token && this.config.channelId) this.startPolling()
  }

  private persist(): void {
    let tokenEnc: string | null = null
    let tokenPlain: string | null = null
    if (this.token) {
      if (safeStorage.isEncryptionAvailable()) tokenEnc = safeStorage.encryptString(this.token).toString('base64')
      else tokenPlain = this.token
    }
    const stored: StoredSlackConfig = { ...this.config, tokenEnc, tokenPlain }
    try {
      fs.writeFileSync(this.configPath(), JSON.stringify(stored), 'utf8')
    } catch (err) {
      console.error('[Slack] Failed to persist config:', err)
    }
  }

  /** Renderer-safe view (no raw token). */
  getStatus(): SlackConfig & { hasToken: boolean } {
    return { ...this.config, hasToken: !!this.token }
  }

  setConfig(next: { enabled: boolean; channelId: string; onlyWhenAway: boolean; token?: string | null }): void {
    this.config = { enabled: next.enabled, channelId: next.channelId.trim(), onlyWhenAway: next.onlyWhenAway }
    if (next.token !== undefined && next.token !== null && next.token !== '') {
      this.token = next.token.trim()
    }
    this.persist()
    this.stopPolling()
    if (this.config.enabled && this.token && this.config.channelId) this.startPolling()
  }

  private slackApi(method: string, body: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.token) return reject(new Error('No Slack token configured'))
      const payload = JSON.stringify(body)
      const req = https.request({
        hostname: 'slack.com',
        path: `/api/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': `Bearer ${this.token}`,
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 10000
      }, (res) => {
        let data = ''
        res.on('data', (c) => { data += c })
        res.on('end', () => {
          try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => req.destroy(new Error('Slack request timed out')))
      req.write(payload)
      req.end()
    })
  }

  /** Forward a peer message to Slack (if enabled and the away-rule allows). */
  async forwardIncoming(text: string, myStatus: string): Promise<void> {
    if (!this.config.enabled || !this.token || !this.config.channelId) return
    if (!shouldForwardToSlack(myStatus, this.config.onlyWhenAway)) return
    try {
      await this.slackApi('chat.postMessage', { channel: this.config.channelId, text: `RLRJupiter: ${text}` })
    } catch (err) {
      console.error('[Slack] forward failed:', err)
    }
  }

  /** Post a test message; resolves with {ok, error}. */
  async test(): Promise<{ ok: boolean; error?: string }> {
    if (!this.token) return { ok: false, error: 'No bot token set' }
    if (!this.config.channelId) return { ok: false, error: 'No channel ID set' }
    try {
      const r = await this.slackApi('chat.postMessage', {
        channel: this.config.channelId,
        text: '✅ RLR Chat is connected to this channel. Replies here will reach RLRJupiter.'
      })
      return r?.ok ? { ok: true } : { ok: false, error: r?.error || 'Slack rejected the request' }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Request failed' }
    }
  }

  private startPolling(): void {
    this.stopPolling()
    // Start from "now" so we don't relay old channel history
    this.lastTs = (Date.now() / 1000).toFixed(6)
    const poll = async () => {
      try {
        const r = await this.slackApi('conversations.history', {
          channel: this.config.channelId,
          oldest: this.lastTs,
          limit: 20
        })
        if (r?.ok) {
          const { messages, latestTs } = parseSlackHistory(r, this.lastTs)
          this.lastTs = latestTs
          for (const m of messages) {
            this.emit('reply', m.text) // relay your Slack reply back to the peer
          }
        } else if (r?.error) {
          console.error('[Slack] history error:', r.error)
        }
      } catch (err) {
        console.error('[Slack] poll failed:', err)
      }
    }
    this.pollTimer = setInterval(poll, POLL_MS)
  }

  private stopPolling(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
  }
}

let instance: SlackBridge | null = null
export function getSlackBridge(): SlackBridge {
  if (!instance) instance = new SlackBridge()
  return instance
}
