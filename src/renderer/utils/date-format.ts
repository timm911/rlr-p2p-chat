/**
 * Human date helpers for chat day dividers.
 */

/** Midnight (local) of the given time, as ms — used to group by calendar day. */
function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** "Today" / "Yesterday" / "June 11, 2026" for a divider label. */
export function dayLabel(ts: number, now: number = Date.now()): string {
  const day = startOfDay(ts)
  const today = startOfDay(now)
  const oneDay = 24 * 60 * 60 * 1000
  if (day === today) return 'Today'
  if (day === today - oneDay) return 'Yesterday'
  const d = new Date(ts)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString(undefined, sameYear
    ? { month: 'long', day: 'numeric' }
    : { month: 'long', day: 'numeric', year: 'numeric' })
}

/** True when two timestamps fall on different calendar days. */
export function isNewDay(prevTs: number | null, ts: number): boolean {
  if (prevTs == null) return true
  return startOfDay(prevTs) !== startOfDay(ts)
}
