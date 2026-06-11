import { isEchoOfRecentTTS, recordSpokenText, SpokenText } from '../../src/renderer/utils/echo-guard';

describe('TTS echo guard', () => {
  const NOW = 1_000_000;
  const spoken = (text: string, time: number = NOW - 2000): SpokenText[] => [{ text, time }];

  // Real echo captured in production (2026-06-10): sender's message was read
  // aloud on the receiver's speakers and transcribed back by the mic.
  it('catches a verbatim partial echo of the spoken message', () => {
    const tts = "explain to me how its functioning and if you need me to tweak anything? i have some errors on my side im fixing. expect a new build";
    expect(isEchoOfRecentTTS("explained to me how it's functioning and if you need me to tweak anything", spoken(tts), NOW)).toBe(true);
  });

  it('catches the tail half of the spoken message', () => {
    const tts = "explain to me how its functioning and if you need me to tweak anything? i have some errors on my side im fixing. expect a new build";
    expect(isEchoOfRecentTTS("i have some errors on my side i'm fixing expect a new build", spoken(tts), NOW)).toBe(true);
  });

  it('catches real speech contaminated by a full echo (spoken text contained in recognition)', () => {
    const tts = 'hey uncle rodgers is working finally';
    expect(isEchoOfRecentTTS("have you think it'll go there if i say sound great uncle rodgers is working finally", spoken(tts), NOW)).toBe(true);
  });

  it('lets a genuine reply through', () => {
    const tts = "explain to me how its functioning and if you need me to tweak anything? i have some errors on my side im fixing. expect a new build";
    expect(isEchoOfRecentTTS("sounds good let me know when you want to test again", spoken(tts), NOW)).toBe(false);
  });

  it('lets very short utterances through (cannot judge)', () => {
    expect(isEchoOfRecentTTS('ok', spoken('ok sounds good see you tomorrow then'), NOW)).toBe(false);
  });

  it('ignores texts spoken more than 30 seconds ago', () => {
    const tts = 'this was spoken a long while ago in the conversation';
    expect(isEchoOfRecentTTS('this was spoken a long while ago in the conversation', spoken(tts, NOW - 31000), NOW)).toBe(false);
  });

  it('does not flag against trivially short TTS texts', () => {
    expect(isEchoOfRecentTTS('yes yes okay', spoken('yes ok'), NOW)).toBe(false);
  });

  describe('recordSpokenText', () => {
    it('appends and prunes entries older than the window', () => {
      let list: SpokenText[] = [{ text: 'old', time: NOW - 31000 }, { text: 'recent', time: NOW - 1000 }];
      list = recordSpokenText(list, 'new', NOW);
      expect(list.map((e) => e.text)).toEqual(['recent', 'new']);
    });
  });
});
