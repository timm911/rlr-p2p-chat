/**
 * @jest-environment jsdom
 */
import {
  PRESET_STATUSES,
  listCustomStatuses,
  addCustomStatus,
  removeCustomStatus,
  getStatusEmoji,
  DEFAULT_STATUS_EMOJI
} from '../../src/renderer/utils/custom-statuses';

describe('custom statuses', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty', () => {
    expect(listCustomStatuses()).toEqual([]);
  });

  it('adds and lists a status with its emoji', () => {
    const s = addCustomStatus('Mowing', '🚜');
    expect(s).not.toBeNull();
    expect(s!.label).toBe('Mowing');
    expect(s!.emoji).toBe('🚜');
    const list = listCustomStatuses();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(s!.id);
  });

  it('trims the label and defaults a missing emoji', () => {
    const s = addCustomStatus('  On the phone  ');
    expect(s!.label).toBe('On the phone');
    expect(s!.emoji).toBe(DEFAULT_STATUS_EMOJI);
  });

  it('rejects empty labels', () => {
    expect(addCustomStatus('')).toBeNull();
    expect(addCustomStatus('   ')).toBeNull();
    expect(listCustomStatuses()).toEqual([]);
  });

  it('rejects labels colliding with presets (incl. the speech statuses), case-insensitively', () => {
    for (const p of PRESET_STATUSES) {
      expect(addCustomStatus(p.label, '🙂')).toBeNull();
    }
    expect(addCustomStatus('talk to me', '🙂')).toBeNull();
    expect(addCustomStatus(' LISTEN ONLY ', '🙂')).toBeNull();
    expect(listCustomStatuses()).toEqual([]);
  });

  it('rejects duplicate custom labels, case-insensitively', () => {
    expect(addCustomStatus('Mowing', '🚜')).not.toBeNull();
    expect(addCustomStatus('mowing', '🌱')).toBeNull();
    expect(addCustomStatus(' MOWING ', '🌱')).toBeNull();
    expect(listCustomStatuses()).toHaveLength(1);
  });

  it('removes a status by id (and ignores unknown ids)', () => {
    const a = addCustomStatus('Mowing', '🚜')!;
    const b = addCustomStatus('Gaming', '🎮')!;
    removeCustomStatus(a.id);
    expect(listCustomStatuses().map((s) => s.label)).toEqual(['Gaming']);
    removeCustomStatus('nope');
    expect(listCustomStatuses().map((s) => s.label)).toEqual(['Gaming']);
    removeCustomStatus(b.id);
    expect(listCustomStatuses()).toEqual([]);
  });

  it('resolves emoji for presets, customs, and unknown labels', () => {
    expect(getStatusEmoji('Talk to me')).toBe('💬');
    expect(getStatusEmoji('Bed')).toBe('😴');
    addCustomStatus('Mowing', '🚜');
    expect(getStatusEmoji('Mowing')).toBe('🚜');
    expect(getStatusEmoji('Some one-off status')).toBeNull();
  });

  it('survives corrupted storage', () => {
    localStorage.setItem('rlrchat-custom-statuses', 'not json');
    expect(listCustomStatuses()).toEqual([]);
    localStorage.setItem('rlrchat-custom-statuses', '{"a":1}');
    expect(listCustomStatuses()).toEqual([]);
    localStorage.setItem('rlrchat-custom-statuses', '[{"bad":true},null]');
    expect(listCustomStatuses()).toEqual([]);
    expect(addCustomStatus('Mowing', '🚜')).not.toBeNull();
    expect(listCustomStatuses()).toHaveLength(1);
  });

  it('dispatches the change event on add/remove', () => {
    const handler = jest.fn();
    window.addEventListener('rlr:custom-statuses-changed', handler);
    const s = addCustomStatus('Mowing', '🚜')!;
    expect(handler).toHaveBeenCalledTimes(1);
    removeCustomStatus(s.id);
    expect(handler).toHaveBeenCalledTimes(2);
    window.removeEventListener('rlr:custom-statuses-changed', handler);
  });
});
