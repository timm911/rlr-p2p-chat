import { dayLabel, isNewDay } from '../../src/renderer/utils/date-format';

describe('date-format (chat day dividers)', () => {
  const NOON = new Date(2026, 5, 11, 12, 0, 0).getTime(); // 2026-06-11 noon local
  const oneDay = 24 * 60 * 60 * 1000;

  it('labels today as "Today"', () => {
    expect(dayLabel(new Date(2026, 5, 11, 9, 30).getTime(), NOON)).toBe('Today');
  });

  it('labels yesterday as "Yesterday"', () => {
    expect(dayLabel(new Date(2026, 5, 10, 23, 0).getTime(), NOON)).toBe('Yesterday');
  });

  it('labels an older day this year without the year', () => {
    const label = dayLabel(new Date(2026, 4, 2, 10, 0).getTime(), NOON);
    expect(label).toMatch(/May/);
    expect(label).not.toMatch(/2026/);
  });

  it('labels a day in a previous year with the year', () => {
    const label = dayLabel(new Date(2025, 11, 25, 10, 0).getTime(), NOON);
    expect(label).toMatch(/2025/);
  });

  it('isNewDay: true for the first message, and across a midnight boundary', () => {
    expect(isNewDay(null, NOON)).toBe(true);
    const earlier = new Date(2026, 5, 11, 1, 0).getTime();
    const later = new Date(2026, 5, 11, 23, 0).getTime();
    expect(isNewDay(earlier, later)).toBe(false); // same calendar day
    expect(isNewDay(new Date(2026, 5, 10, 23, 0).getTime(), later)).toBe(true); // crosses midnight
  });
});
