import { windowMessages, DEFAULT_RENDER_LIMIT, LOAD_MORE_STEP } from '../../src/renderer/utils/message-window';

describe('message-window (render windowing)', () => {
  const make = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));

  it('returns everything when under the limit', () => {
    const msgs = make(10);
    const { visible, hiddenCount } = windowMessages(msgs, 200);
    expect(visible).toBe(msgs); // same reference, no copy
    expect(hiddenCount).toBe(0);
  });

  it('returns everything when exactly at the limit', () => {
    const msgs = make(200);
    const { visible, hiddenCount } = windowMessages(msgs, 200);
    expect(visible).toBe(msgs);
    expect(hiddenCount).toBe(0);
  });

  it('keeps the most recent `limit` messages and reports the hidden count', () => {
    const msgs = make(250);
    const { visible, hiddenCount } = windowMessages(msgs, 200);
    expect(visible).toHaveLength(200);
    expect(hiddenCount).toBe(50);
    // tail is preserved in original order
    expect(visible[0].id).toBe('50');
    expect(visible[visible.length - 1].id).toBe('249');
  });

  it('treats a non-positive limit as "no windowing"', () => {
    const msgs = make(500);
    expect(windowMessages(msgs, 0).visible).toBe(msgs);
    expect(windowMessages(msgs, -5).hiddenCount).toBe(0);
  });

  it('exposes sane defaults', () => {
    expect(DEFAULT_RENDER_LIMIT).toBeGreaterThan(0);
    expect(LOAD_MORE_STEP).toBeGreaterThan(0);
  });
});
