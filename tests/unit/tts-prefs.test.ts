/**
 * @jest-environment jsdom
 */
import { resolveInitialVoice, getSavedVoice, setSavedVoice, IDENTITY_DEFAULT_VOICE } from '../../src/renderer/utils/tts-prefs';

describe('TTS voice preferences', () => {
  beforeEach(() => localStorage.clear());

  it('defaults RLRJupiter to Joe and Ripster to Alan when nothing saved', () => {
    expect(resolveInitialVoice('RLRJupiter')).toBe('piper:en_US-joe-medium');
    expect(resolveInitialVoice('Ripster')).toBe('piper:en_GB-alan-medium');
  });

  it('exposes the identity default map', () => {
    expect(IDENTITY_DEFAULT_VOICE.RLRJupiter).toBe('piper:en_US-joe-medium');
    expect(IDENTITY_DEFAULT_VOICE.Ripster).toBe('piper:en_GB-alan-medium');
  });

  it('returns undefined before any voice is saved', () => {
    expect(getSavedVoice()).toBeUndefined();
  });

  it('a saved voice overrides the identity default for both users', () => {
    setSavedVoice('piper:en_US-hfc_male-medium');
    expect(getSavedVoice()).toBe('piper:en_US-hfc_male-medium');
    expect(resolveInitialVoice('RLRJupiter')).toBe('piper:en_US-hfc_male-medium');
    expect(resolveInitialVoice('Ripster')).toBe('piper:en_US-hfc_male-medium');
  });

  it('persists and resolves a system-default (null) pick distinctly from unset', () => {
    setSavedVoice(null);
    expect(getSavedVoice()).toBeNull(); // explicitly chosen default, not "unset"
    expect(resolveInitialVoice('RLRJupiter')).toBeNull();
  });
});
