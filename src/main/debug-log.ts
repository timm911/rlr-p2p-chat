import fs from 'fs'
import path from 'path'

const LOG_PATH = path.join(process.cwd(), 'debug-3352dc.log')

/** Append one NDJSON line to the debug session log (main process only). */
export function appendLog(payload: { sessionId?: string; hypothesisId?: string; location: string; message: string; data?: Record<string, unknown> }): void {
  try {
    const line = JSON.stringify({ ...payload, timestamp: Date.now() }) + '\n'
    fs.appendFileSync(LOG_PATH, line)
  } catch (_) {
    // ignore
  }
}
