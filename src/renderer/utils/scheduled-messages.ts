/**
 * Scheduled messages ("Send later"): per-device persistence + pure helpers.
 *
 * ChatWindow keeps a timer that re-reads storage every ~15s and sends anything
 * due through the normal sendChatMessage path (which handles the offline
 * queue). localStorage is the source of truth so messages survive restarts;
 * already-overdue ones are sent shortly after launch.
 */

export interface ScheduledMessage {
  id: string
  text: string
  sendAt: number // epoch ms
}

const KEY = 'rlrchat-scheduled-messages'

export function loadScheduledMessages(): ScheduledMessage[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (m: any) =>
        m &&
        typeof m.id === 'string' &&
        typeof m.text === 'string' &&
        typeof m.sendAt === 'number'
    )
  } catch (_) {
    return []
  }
}

export function saveScheduledMessages(list: ScheduledMessage[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch (_) {}
}

export function newScheduledMessage(text: string, sendAt: number): ScheduledMessage {
  return {
    id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    sendAt
  }
}

/** Pure: messages due at `now`, oldest first. */
export function dueMessages(list: ScheduledMessage[], now: number): ScheduledMessage[] {
  return list.filter((m) => m.sendAt <= now).sort((a, b) => a.sendAt - b.sendAt)
}

/** Pure: the quick-pick scheduling presets relative to `now`. */
export function presetTimes(now: Date): Array<{ label: string; sendAt: number }> {
  const inMinutes = (mins: number) => now.getTime() + mins * 60 * 1000

  // "Tonight 7 PM" — if 7 PM already passed, roll to tomorrow evening
  const tonight = new Date(now)
  tonight.setHours(19, 0, 0, 0)
  const tonightIsToday = tonight.getTime() > now.getTime()
  if (!tonightIsToday) tonight.setDate(tonight.getDate() + 1)

  const tomorrowMorning = new Date(now)
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1)
  tomorrowMorning.setHours(8, 0, 0, 0)

  return [
    { label: 'In 15 min', sendAt: inMinutes(15) },
    { label: 'In 1 hour', sendAt: inMinutes(60) },
    { label: 'In 3 hours', sendAt: inMinutes(180) },
    { label: tonightIsToday ? 'Tonight 7 PM' : 'Tomorrow 7 PM', sendAt: tonight.getTime() },
    { label: 'Tomorrow 8 AM', sendAt: tomorrowMorning.getTime() }
  ]
}

/** Friendly display for a scheduled send time ("2:30 PM", "Tomorrow 8:00 AM", "6/14 7:00 PM"). */
export function formatSendAt(sendAt: number, now: Date = new Date()): string {
  const d = new Date(sendAt)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const sameDay = (x: Date, y: Date) =>
    x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
  if (sameDay(d, now)) return time
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (sameDay(d, tomorrow)) return `Tomorrow ${time}`
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

/** Value for a datetime-local input (local time, minute precision). */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
