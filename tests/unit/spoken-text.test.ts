import { toSpokenText } from '../../src/renderer/utils/linkify';

describe('toSpokenText (TTS-friendly message text)', () => {
  it('leaves plain messages unchanged', () => {
    expect(toSpokenText('hey how are you')).toBe('hey how are you');
  });

  it('replaces a bare link with "Link received"', () => {
    expect(toSpokenText('https://example.com/some/long/path?x=1')).toBe('Link received');
    expect(toSpokenText('www.example.com')).toBe('Link received');
  });

  it('keeps surrounding words and appends "link received"', () => {
    expect(toSpokenText('check this out https://example.com')).toBe('check this out, link received');
  });

  it('handles a link in the middle of text', () => {
    expect(toSpokenText('see https://a.b/c then reply')).toBe('see then reply, link received');
  });

  it('does not alter text that merely mentions http in a word', () => {
    // no scheme/www, so not a link
    expect(toSpokenText('the apache server')).toBe('the apache server');
  });
});
