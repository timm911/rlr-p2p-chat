/**
 * Unit tests for scheduled-message ("Send later") pure helpers: due
 * calculation and the quick-pick preset times.
 */
import {
  ScheduledMessage,
  dueMessages,
  presetTimes,
  formatSendAt,
  newScheduledMessage
} from '../../src/renderer/utils/scheduled-messages'

describe('dueMessages', () => {
  const now = 1_000_000
  const list: ScheduledMessage[] = [
    { id: 'b', text: 'second due', sendAt: now - 1 },
    { id: 'c', text: 'not due', sendAt: now + 1 },
    { id: 'a', text: 'first due', sendAt: now - 500 },
    { id: 'd', text: 'exactly due', sendAt: now }
  ]

  it('returns only messages at-or-before now, oldest first', () => {
    expect(dueMessages(list, now).map((m) => m.id)).toEqual(['a', 'b', 'd'])
  })

  it('returns empty when nothing is due', () => {
    expect(dueMessages(list, now - 10_000)).toEqual([])
  })

  it('treats already-overdue messages (e.g. after a restart) as due', () => {
    const overdue: ScheduledMessage[] = [{ id: 'x', text: 'late', sendAt: now - 86_400_000 }]
    expect(dueMessages(overdue, now)).toHaveLength(1)
  })
})

describe('presetTimes', () => {
  it('computes relative presets from now', () => {
    const now = new Date(2026, 5, 12, 10, 0, 0) // 10:00 AM
    const presets = presetTimes(now)
    const byLabel = Object.fromEntries(presets.map((p) => [p.label, p.sendAt]))
    expect(byLabel['In 15 min']).toBe(now.getTime() + 15 * 60_000)
    expect(byLabel['In 1 hour']).toBe(now.getTime() + 60 * 60_000)
    expect(byLabel['In 3 hours']).toBe(now.getTime() + 180 * 60_000)
  })

  it('uses 7 PM today when it is still in the future', () => {
    const now = new Date(2026, 5, 12, 10, 0, 0)
    const presets = presetTimes(now)
    const tonight = presets.find((p) => p.label === 'Tonight 7 PM')!
    const d = new Date(tonight.sendAt)
    expect(d.getDate()).toBe(12)
    expect(d.getHours()).toBe(19)
  })

  it('rolls "Tonight 7 PM" to tomorrow once 7 PM has passed', () => {
    const now = new Date(2026, 5, 12, 21, 30, 0) // 9:30 PM
    const presets = presetTimes(now)
    const tonight = presets.find((p) => p.label === 'Tomorrow 7 PM')!
    const d = new Date(tonight.sendAt)
    expect(d.getDate()).toBe(13)
    expect(d.getHours()).toBe(19)
    expect(tonight.sendAt).toBeGreaterThan(now.getTime())
  })

  it('puts Tomorrow 8 AM on the next calendar day', () => {
    const now = new Date(2026, 5, 12, 23, 59, 0)
    const presets = presetTimes(now)
    const morning = presets.find((p) => p.label === 'Tomorrow 8 AM')!
    const d = new Date(morning.sendAt)
    expect(d.getDate()).toBe(13)
    expect(d.getHours()).toBe(8)
  })

  it('all presets are in the future', () => {
    for (const hour of [0, 8, 12, 18, 19, 23]) {
      const now = new Date(2026, 5, 12, hour, 30, 0)
      for (const p of presetTimes(now)) {
        expect(p.sendAt).toBeGreaterThan(now.getTime())
      }
    }
  })
})

describe('formatSendAt', () => {
  it('shows just the time for today', () => {
    const now = new Date(2026, 5, 12, 10, 0, 0)
    const at = new Date(2026, 5, 12, 14, 30, 0).getTime()
    expect(formatSendAt(at, now)).toBe('2:30 PM')
  })

  it('prefixes Tomorrow for the next day', () => {
    const now = new Date(2026, 5, 12, 10, 0, 0)
    const at = new Date(2026, 5, 13, 8, 0, 0).getTime()
    expect(formatSendAt(at, now)).toBe('Tomorrow 8:00 AM')
  })

  it('shows a date for later days', () => {
    const now = new Date(2026, 5, 12, 10, 0, 0)
    const at = new Date(2026, 5, 20, 9, 0, 0).getTime()
    expect(formatSendAt(at, now)).toBe('6/20 9:00 AM')
  })
})

describe('newScheduledMessage', () => {
  it('creates unique ids', () => {
    const a = newScheduledMessage('one', 1)
    const b = newScheduledMessage('two', 2)
    expect(a.id).not.toBe(b.id)
    expect(a.text).toBe('one')
    expect(a.sendAt).toBe(1)
  })
})
