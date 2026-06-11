/**
 * Pure helpers for the Slack bridge (no Electron deps → unit-testable).
 */

export interface SlackRelayMessage {
  text: string
  ts: string
}

/**
 * Whether an incoming chat message should be forwarded to Slack right now.
 * When `onlyWhenAway` is on, we forward only if the user is NOT actively at
 * the keyboard ("Talk to me" / "Listen only" mean they're present).
 */
export function shouldForwardToSlack(status: string, onlyWhenAway: boolean): boolean {
  if (!onlyWhenAway) return true
  return status !== 'Talk to me' && status !== 'Listen only'
}

/** Numeric compare of Slack ts strings like "1623456789.000200". */
export function tsGreater(a: string, b: string): boolean {
  return parseFloat(a) > parseFloat(b)
}

/**
 * From a Slack conversations.history response, pick the human messages newer
 * than `sinceTs` (oldest-first), skipping bot posts (our own forwards) and
 * channel-noise subtypes. Returns the messages to relay plus the newest ts
 * seen so the caller can advance its cursor.
 */
export function parseSlackHistory(
  json: any,
  sinceTs: string
): { messages: SlackRelayMessage[]; latestTs: string } {
  let latestTs = sinceTs
  const out: SlackRelayMessage[] = []
  const raw: any[] = Array.isArray(json?.messages) ? json.messages : []
  // Slack returns newest-first; process oldest-first for correct order
  const ordered = [...raw].reverse()
  for (const m of ordered) {
    const ts: string = typeof m?.ts === 'string' ? m.ts : ''
    if (!ts || !tsGreater(ts, sinceTs)) continue
    if (tsGreater(ts, latestTs)) latestTs = ts
    if (m.bot_id) continue // our own forwarded messages (or other bots)
    if (m.subtype) continue // joins/leaves/edits etc.
    const text: string = typeof m.text === 'string' ? m.text.trim() : ''
    if (!text) continue
    out.push({ text, ts })
  }
  return { messages: out, latestTs }
}
