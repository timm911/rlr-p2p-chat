import {
  generateSalt,
  deriveKey,
  encryptMessage,
  decryptMessage,
  isEncryptedLine
} from '../../src/main/network/secure-channel';
import { ProtocolMessage } from '../../src/main/network/protocol';

describe('Secure Channel (AES-256-GCM)', () => {
  const PASSWORD = 'correct horse battery staple';
  const salt = generateSalt();
  const key = deriveKey(PASSWORD, salt);

  const sampleMessage: ProtocolMessage = {
    type: 'chat',
    payload: { id: 'm1', from: 'RLRJupiter', content: 'secret hello 👋', timestamp: 1234567890 },
    timestamp: 1234567890
  };

  describe('key derivation', () => {
    it('derives a 32-byte AES-256 key', () => {
      expect(key.length).toBe(32);
    });

    it('same password + same salt -> same key (both peers agree)', () => {
      expect(deriveKey(PASSWORD, salt).equals(key)).toBe(true);
    });

    it('different salt -> different key (per-session keys)', () => {
      expect(deriveKey(PASSWORD, generateSalt()).equals(key)).toBe(false);
    });

    it('different password -> different key', () => {
      expect(deriveKey('wrong password', salt).equals(key)).toBe(false);
    });

    it('generates unique 16-byte hex salts', () => {
      const s1 = generateSalt();
      const s2 = generateSalt();
      expect(s1).toMatch(/^[0-9a-f]{32}$/);
      expect(s1).not.toBe(s2);
    });
  });

  describe('encrypt/decrypt round-trip', () => {
    it('round-trips a chat message', () => {
      const line = encryptMessage(key, sampleMessage);
      const decrypted = decryptMessage(key, line);
      expect(decrypted).toEqual(sampleMessage);
    });

    it('produces newline-framed lines compatible with the wire protocol', () => {
      const line = encryptMessage(key, sampleMessage);
      expect(line.endsWith('\n')).toBe(true);
      expect(line.slice(0, -1)).not.toContain('\n');
      expect(isEncryptedLine(line)).toBe(true);
    });

    it('never leaks plaintext on the wire', () => {
      const line = encryptMessage(key, sampleMessage);
      expect(line).not.toContain('secret hello');
      expect(line).not.toContain('chat');
      expect(line).not.toContain('RLRJupiter');
    });

    it('uses a fresh IV per message (same plaintext -> different ciphertext)', () => {
      const a = encryptMessage(key, sampleMessage);
      const b = encryptMessage(key, sampleMessage);
      expect(a).not.toBe(b);
    });

    it('round-trips a base64 file chunk payload', () => {
      const chunkMsg: ProtocolMessage = {
        type: 'file-chunk',
        payload: { transferId: 't1', chunkIndex: 0, totalChunks: 1, data: Buffer.from('binary-ish \x00\x01').toString('base64'), timestamp: 1 },
        timestamp: 1
      };
      expect(decryptMessage(key, encryptMessage(key, chunkMsg))).toEqual(chunkMsg);
    });
  });

  describe('rejection of bad input', () => {
    it('fails to decrypt with a wrong-password key', () => {
      const wrongKey = deriveKey('wrong password', salt);
      const line = encryptMessage(key, sampleMessage);
      expect(decryptMessage(wrongKey, line)).toBeNull();
    });

    it('rejects tampered ciphertext (GCM integrity)', () => {
      const line = encryptMessage(key, sampleMessage).trim();
      const tampered = line.slice(0, -2) + (line.slice(-2, -1) === 'A' ? 'B' : 'A') + line.slice(-1);
      expect(decryptMessage(key, tampered + '\n')).toBeNull();
    });

    it('rejects plaintext JSON lines', () => {
      expect(decryptMessage(key, JSON.stringify(sampleMessage) + '\n')).toBeNull();
      expect(isEncryptedLine(JSON.stringify(sampleMessage))).toBe(false);
    });

    it('rejects malformed frames without throwing', () => {
      expect(decryptMessage(key, 'E1.not.valid.frame\n')).toBeNull();
      expect(decryptMessage(key, 'E1.\n')).toBeNull();
      expect(decryptMessage(key, 'E1.a.b\n')).toBeNull();
      expect(decryptMessage(key, '\n')).toBeNull();
    });
  });
});
