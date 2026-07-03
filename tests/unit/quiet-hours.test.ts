/**
 * @jest-environment jsdom
 */
import { getQuietHours, setQuietHours, isQuietNow, QuietHoursConfig } from '../../src/renderer/utils/quiet-hours';

const at = (h: number, m = 0) => new Date(2026, 0, 1, h, m, 0);

describe('quiet-hours isQuietNow', () => {
  it('is never quiet when disabled', () => {
    const cfg: QuietHoursConfig = { enabled: false, start: '22:00', end: '08:00' };
    expect(isQuietNow(cfg, at(23))).toBe(false);
    expect(isQuietNow(cfg, at(3))).toBe(false);
  });

  it('handles an overnight window (22:00–08:00)', () => {
    const cfg: QuietHoursConfig = { enabled: true, start: '22:00', end: '08:00' };
    expect(isQuietNow(cfg, at(22, 0))).toBe(true);   // start boundary (inclusive)
    expect(isQuietNow(cfg, at(23, 30))).toBe(true);  // late night
    expect(isQuietNow(cfg, at(0, 0))).toBe(true);    // midnight
    expect(isQuietNow(cfg, at(7, 59))).toBe(true);   // just before end
    expect(isQuietNow(cfg, at(8, 0))).toBe(false);   // end boundary (exclusive)
    expect(isQuietNow(cfg, at(12, 0))).toBe(false);  // midday
    expect(isQuietNow(cfg, at(21, 59))).toBe(false); // just before start
  });

  it('handles a same-day window (09:00–17:00)', () => {
    const cfg: QuietHoursConfig = { enabled: true, start: '09:00', end: '17:00' };
    expect(isQuietNow(cfg, at(8, 59))).toBe(false);
    expect(isQuietNow(cfg, at(9, 0))).toBe(true);
    expect(isQuietNow(cfg, at(13, 0))).toBe(true);
    expect(isQuietNow(cfg, at(16, 59))).toBe(true);
    expect(isQuietNow(cfg, at(17, 0))).toBe(false);
    expect(isQuietNow(cfg, at(23, 0))).toBe(false);
  });

  it('treats a zero-length window as never quiet', () => {
    const cfg: QuietHoursConfig = { enabled: true, start: '10:00', end: '10:00' };
    expect(isQuietNow(cfg, at(10, 0))).toBe(false);
    expect(isQuietNow(cfg, at(3, 0))).toBe(false);
  });

  it('is not quiet with a malformed time', () => {
    const cfg: QuietHoursConfig = { enabled: true, start: '25:00', end: '08:00' };
    expect(isQuietNow(cfg, at(3, 0))).toBe(false);
  });
});

describe('quiet-hours persistence', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to disabled 22:00–08:00', () => {
    const cfg = getQuietHours();
    expect(cfg).toEqual({ enabled: false, start: '22:00', end: '08:00' });
  });

  it('round-trips a saved config', () => {
    setQuietHours({ enabled: true, start: '23:15', end: '06:45' });
    expect(getQuietHours()).toEqual({ enabled: true, start: '23:15', end: '06:45' });
  });

  it('falls back to defaults for corrupt storage', () => {
    localStorage.setItem('rlrchat-quiet-hours', 'not json');
    expect(getQuietHours()).toEqual({ enabled: false, start: '22:00', end: '08:00' });
  });

  it('sanitizes malformed times on read', () => {
    localStorage.setItem('rlrchat-quiet-hours', JSON.stringify({ enabled: true, start: 'bad', end: '99:99' }));
    const cfg = getQuietHours();
    expect(cfg.enabled).toBe(true);
    expect(cfg.start).toBe('22:00');
    expect(cfg.end).toBe('08:00');
  });
});
