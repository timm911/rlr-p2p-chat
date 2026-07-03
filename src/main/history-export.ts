/**
 * Pure rendering of an exported conversation (E5). Kept separate from the IPC
 * handler so the formatting (day headers, sender colors, [Photo]/[File]/[Voice]
 * placeholders, HTML escaping) is unit-testable without Electron or a dialog.
 *
 * Input is the decrypted history array (same shape as history.json entries).
 * Output is a self-contained .html or plain .txt string.
 */

export interface ExportMessage {
  type?: string
  from?: string
  content?: string
  timestamp?: number
  removed?: boolean
  fileTransfer?: { fileName?: string; fileType?: string; fileSize?: number }
}

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
const fmtDay = (ts: number) =>
  new Date(ts).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
const dayKey = (ts: number) => new Date(ts).toDateString()

/** One-line body text for a message (shared by both formats). */
export function bodyOf(m: ExportMessage): string {
  if (m.type === 'file' && m.fileTransfer) {
    const name = String(m.fileTransfer.fileName || 'file')
    const audio = /\.(webm|ogg|oga|mp3|m4a|wav)$/i.test(name) || /audio/i.test(String(m.fileTransfer.fileType || ''))
    const image = /\.(jpe?g|png|gif|bmp|webp)$/i.test(name)
    if (audio) return '[Voice message]'
    if (image) return `[Photo: ${name}]`
    return `[File: ${name}]`
  }
  if (m.removed) return '[message removed]'
  return String(m.content || '')
}

export function senderColor(from: string): string {
  return from === 'RLRJupiter' ? '#38bdf8'
    : from === 'Ramjet' ? '#f59e0b'
    : from === 'Ripster' ? '#f472b6'
    : '#94a3b8'
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function sortByTime(messages: ExportMessage[]): ExportMessage[] {
  return [...messages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
}

/** Render the conversation as plain text. */
export function renderHistoryTxt(messages: ExportMessage[], now: Date): string {
  const sorted = sortByTime(messages)
  const lines: string[] = [`RLR P2P Chat — history export (${now.toLocaleString()})`, '']
  let lastDay = ''
  for (const m of sorted) {
    const ts = m.timestamp || 0
    const dk = dayKey(ts)
    if (dk !== lastDay) { lines.push('', `— ${fmtDay(ts)} —`, ''); lastDay = dk }
    if (m.type === 'system') lines.push(`  * ${bodyOf(m)} (${fmtTime(ts)})`)
    else lines.push(`[${fmtTime(ts)}] ${m.from}: ${bodyOf(m)}`)
  }
  return lines.join('\n')
}

/** Render the conversation as a self-contained HTML document. */
export function renderHistoryHtml(messages: ExportMessage[], now: Date): string {
  const sorted = sortByTime(messages)
  const rows: string[] = []
  let lastDay = ''
  for (const m of sorted) {
    const ts = m.timestamp || 0
    const dk = dayKey(ts)
    if (dk !== lastDay) { rows.push(`<div class="day">${esc(fmtDay(ts))}</div>`); lastDay = dk }
    const time = esc(fmtTime(ts))
    if (m.type === 'system') {
      rows.push(`<div class="sys">${esc(bodyOf(m))} &middot; ${time}</div>`)
    } else {
      const color = senderColor(String(m.from || ''))
      rows.push(
        `<div class="msg"><span class="time">${time}</span> ` +
        `<span class="who" style="color:${color}">${esc(String(m.from || ''))}</span>` +
        `<div class="body">${esc(bodyOf(m))}</div></div>`
      )
    }
  }
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>RLR P2P Chat export</title>` +
    `<style>body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px;}` +
    `h1{font-size:18px;font-weight:600;}` +
    `.day{text-align:center;color:#94a3b8;font-size:12px;margin:22px 0 10px;text-transform:uppercase;letter-spacing:.05em;}` +
    `.sys{text-align:center;color:#94a3b8;font-size:12px;font-style:italic;margin:6px 0;}` +
    `.msg{margin:8px 0;}` +
    `.time{color:#64748b;font-size:11px;margin-right:8px;}` +
    `.who{font-weight:600;font-size:13px;}` +
    `.body{margin-top:2px;white-space:pre-wrap;word-break:break-word;}</style></head><body>` +
    `<h1>RLR P2P Chat — history export</h1>` +
    `<div style="color:#64748b;font-size:12px;margin-bottom:16px;">Exported ${esc(now.toLocaleString())} · ${sorted.length} messages</div>` +
    rows.join('') +
    `</body></html>`
  )
}
