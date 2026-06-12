/**
 * Unit tests for the changelog helpers behind the Release Notes viewer:
 * version comparison, the "which versions are newer than X" logic, and the
 * seed data (full version history, newest first).
 */
import {
  CHANGELOG,
  ChangelogEntry,
  compareVersions,
  entriesToShow
} from '../../src/renderer/utils/changelog'

describe('compareVersions', () => {
  it('orders simple versions', () => {
    expect(compareVersions('2.15.0', '2.14.0')).toBeGreaterThan(0)
    expect(compareVersions('2.14.0', '2.15.0')).toBeLessThan(0)
    expect(compareVersions('2.15.0', '2.15.0')).toBe(0)
  })

  it('compares numerically, not lexically', () => {
    expect(compareVersions('2.10.0', '2.9.0')).toBeGreaterThan(0)
    expect(compareVersions('10.0.0', '9.99.99')).toBeGreaterThan(0)
  })

  it('handles different segment counts', () => {
    expect(compareVersions('2.15', '2.15.0')).toBe(0)
    expect(compareVersions('2.15.1', '2.15')).toBeGreaterThan(0)
  })
})

describe('entriesToShow', () => {
  const log: ChangelogEntry[] = [
    { version: '2.15.0', items: ['new stuff'] },
    { version: '2.14.0', items: ['older stuff'] },
    { version: '2.13.0', items: ['oldest stuff'] }
  ]

  it('shows the new version after an update', () => {
    const result = entriesToShow(log, '2.15.0', '2.14.0')
    expect(result.map((e) => e.version)).toEqual(['2.15.0'])
  })

  it('shows every version between last-seen and current, newest first', () => {
    const result = entriesToShow(log, '2.15.0', '2.13.0')
    expect(result.map((e) => e.version)).toEqual(['2.15.0', '2.14.0'])
  })

  it('shows nothing on a fresh install (no last-seen version)', () => {
    expect(entriesToShow(log, '2.15.0', null)).toEqual([])
  })

  it('shows nothing when already up to date', () => {
    expect(entriesToShow(log, '2.15.0', '2.15.0')).toEqual([])
  })

  it('shows nothing on a downgrade', () => {
    expect(entriesToShow(log, '2.14.0', '2.15.0')).toEqual([])
  })

  it('never shows entries newer than the running version', () => {
    const result = entriesToShow(log, '2.14.0', '2.13.0')
    expect(result.map((e) => e.version)).toEqual(['2.14.0'])
  })
})

describe('CHANGELOG seed data', () => {
  it('has the 2.16.0 release-notes entry first', () => {
    expect(CHANGELOG[0].version).toBe('2.16.0')
    expect(CHANGELOG[0].items.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps the 2.15.0 feature-drop entry', () => {
    const entry = CHANGELOG.find((e) => e.version === '2.15.0')
    expect(entry).toBeDefined()
    expect(entry!.items.length).toBeGreaterThanOrEqual(8)
  })

  it('reaches back to 2.0.0 so the viewer shows the full history', () => {
    expect(CHANGELOG[CHANGELOG.length - 1].version).toBe('2.0.0')
    expect(CHANGELOG.length).toBeGreaterThanOrEqual(11)
  })

  it('is sorted newest first', () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0)
    }
  })
})
