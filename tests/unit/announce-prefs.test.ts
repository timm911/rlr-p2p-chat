/**
 * @jest-environment jsdom
 */
import { getSpeakAnnouncements, setSpeakAnnouncements } from '../../src/renderer/utils/announce-prefs';

describe('announce-prefs', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to off when never set', () => {
    expect(getSpeakAnnouncements()).toBe(false);
  });

  it('persists on/off', () => {
    setSpeakAnnouncements(true);
    expect(getSpeakAnnouncements()).toBe(true);
    expect(localStorage.getItem('rlrchat-speak-announcements')).toBe('true');
    setSpeakAnnouncements(false);
    expect(getSpeakAnnouncements()).toBe(false);
  });

  it('treats any non-"true" value as off', () => {
    localStorage.setItem('rlrchat-speak-announcements', 'yes');
    expect(getSpeakAnnouncements()).toBe(false);
    localStorage.setItem('rlrchat-speak-announcements', '1');
    expect(getSpeakAnnouncements()).toBe(false);
  });
});
