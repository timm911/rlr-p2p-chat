/**
 * @jest-environment jsdom
 */
import {
  getAutoAwayEnabled, setAutoAwayEnabled,
  getAutoAwayMinutes, setAutoAwayMinutes
} from '../../src/renderer/utils/auto-away';

describe('auto-away preferences', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to enabled, 5 minutes', () => {
    expect(getAutoAwayEnabled()).toBe(true);
    expect(getAutoAwayMinutes()).toBe(5);
  });

  it('persists enabled flag', () => {
    setAutoAwayEnabled(false);
    expect(getAutoAwayEnabled()).toBe(false);
    setAutoAwayEnabled(true);
    expect(getAutoAwayEnabled()).toBe(true);
  });

  it('persists and clamps minutes to 1..60', () => {
    setAutoAwayMinutes(10);
    expect(getAutoAwayMinutes()).toBe(10);
    setAutoAwayMinutes(0);
    expect(getAutoAwayMinutes()).toBe(1);
    setAutoAwayMinutes(999);
    expect(getAutoAwayMinutes()).toBe(60);
  });
});
