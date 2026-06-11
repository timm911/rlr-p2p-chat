import { shouldForwardToSlack, parseSlackHistory, tsGreater } from '../../src/main/services/slack-util';

describe('Slack bridge helpers', () => {
  describe('shouldForwardToSlack', () => {
    it('forwards everything when onlyWhenAway is off', () => {
      expect(shouldForwardToSlack('Talk to me', false)).toBe(true);
      expect(shouldForwardToSlack('Away', false)).toBe(true);
    });
    it('forwards only away-ish statuses when onlyWhenAway is on', () => {
      expect(shouldForwardToSlack('Talk to me', true)).toBe(false);
      expect(shouldForwardToSlack('Listen only', true)).toBe(false);
      expect(shouldForwardToSlack('Away', true)).toBe(true);
      expect(shouldForwardToSlack('Bed', true)).toBe(true);
      expect(shouldForwardToSlack('Dinner', true)).toBe(true);
    });
  });

  describe('tsGreater', () => {
    it('compares Slack ts strings numerically', () => {
      expect(tsGreater('1623456789.000200', '1623456789.000100')).toBe(true);
      expect(tsGreater('1623456789.000100', '1623456789.000200')).toBe(false);
    });
  });

  describe('parseSlackHistory', () => {
    const since = '1000.000000';

    it('relays only human messages newer than the cursor, oldest-first', () => {
      const json = {
        messages: [
          // Slack returns newest-first
          { ts: '1003.000000', text: 'second reply' },
          { ts: '1002.000000', text: 'forwarded by us', bot_id: 'B1' },
          { ts: '1001.000000', text: 'first reply' },
          { ts: '0999.000000', text: 'too old' }
        ]
      };
      const { messages, latestTs } = parseSlackHistory(json, since);
      expect(messages.map(m => m.text)).toEqual(['first reply', 'second reply']);
      expect(latestTs).toBe('1003.000000');
    });

    it('skips subtype/system messages and blanks', () => {
      const json = {
        messages: [
          { ts: '1002.000000', text: 'joined', subtype: 'channel_join' },
          { ts: '1001.000000', text: '   ' }
        ]
      };
      const { messages } = parseSlackHistory(json, since);
      expect(messages).toEqual([]);
    });

    it('advances latestTs even when nothing is relayable (so bot posts are not re-read)', () => {
      const json = { messages: [{ ts: '1005.000000', text: 'ours', bot_id: 'B1' }] };
      const { messages, latestTs } = parseSlackHistory(json, since);
      expect(messages).toEqual([]);
      expect(latestTs).toBe('1005.000000');
    });

    it('handles an empty/missing messages array', () => {
      expect(parseSlackHistory({}, since)).toEqual({ messages: [], latestTs: since });
    });
  });
});
