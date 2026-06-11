import { encodeMessage, decodeMessage, ProtocolMessage } from '../../src/main/network/protocol';

describe('Protocol Message Encoding/Decoding', () => {
  describe('encodeMessage', () => {
    it('should encode a chat message correctly', () => {
      const message: ProtocolMessage = {
        type: 'chat',
        payload: {
          id: 'msg-123',
          from: 'RLRJupiter',
          content: 'Hello World',
          timestamp: 1234567890
        },
        timestamp: 1234567890
      };

      const encoded = encodeMessage(message);
      expect(encoded).toContain('"type":"chat"');
      expect(encoded).toContain('"content":"Hello World"');
      expect(encoded.endsWith('\n')).toBe(true);
    });

    it('should encode a status update correctly', () => {
      const message: ProtocolMessage = {
        type: 'status',
        payload: {
          status: 'online',
          timestamp: 1234567890
        },
        timestamp: 1234567890
      };

      const encoded = encodeMessage(message);
      expect(encoded).toContain('"type":"status"');
      expect(encoded).toContain('"status":"online"');
      expect(encoded.endsWith('\n')).toBe(true);
    });

    it('should encode a reaction correctly', () => {
      const message: ProtocolMessage = {
        type: 'reaction',
        payload: {
          messageId: 'msg-123',
          emoji: '👍',
          timestamp: 1234567890
        },
        timestamp: 1234567890
      };

      const encoded = encodeMessage(message);
      expect(encoded).toContain('"type":"reaction"');
      expect(encoded).toContain('"emoji":"👍"');
      expect(encoded.endsWith('\n')).toBe(true);
    });

    it('should encode a typing indicator correctly', () => {
      const message: ProtocolMessage = {
        type: 'typing',
        payload: {
          isTyping: true,
          timestamp: 1234567890
        },
        timestamp: 1234567890
      };

      const encoded = encodeMessage(message);
      expect(encoded).toContain('"type":"typing"');
      expect(encoded).toContain('"isTyping":true');
    });

    it('should encode a file-offer message correctly', () => {
      const message: ProtocolMessage = {
        type: 'file-offer',
        payload: {
          transferId: 'transfer_123',
          fileName: 'test.txt',
          fileSize: 1024,
          fileType: '.txt',
          chunkSize: 32768,
          totalChunks: 1,
          timestamp: 1234567890
        },
        timestamp: 1234567890
      };

      const encoded = encodeMessage(message);
      expect(encoded).toContain('"type":"file-offer"');
      expect(encoded).toContain('"fileName":"test.txt"');
      expect(encoded).toContain('"fileSize":1024');
    });

    it('should encode ping/pong messages correctly', () => {
      const pingMessage: ProtocolMessage = {
        type: 'ping',
        payload: {},
        timestamp: 1234567890
      };

      const pongMessage: ProtocolMessage = {
        type: 'pong',
        payload: {},
        timestamp: 1234567890
      };

      const encodedPing = encodeMessage(pingMessage);
      const encodedPong = encodeMessage(pongMessage);

      expect(encodedPing).toContain('"type":"ping"');
      expect(encodedPong).toContain('"type":"pong"');
    });
  });

  describe('decodeMessage', () => {
    it('should decode a valid chat message', () => {
      const encoded = '{"type":"chat","payload":{"id":"msg-123","from":"RLRJupiter","content":"Hello","timestamp":1234567890},"timestamp":1234567890}\n';
      const decoded = decodeMessage(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded?.type).toBe('chat');
      expect(decoded?.payload.content).toBe('Hello');
      expect(decoded?.payload.from).toBe('RLRJupiter');
    });

    it('should decode a valid status message', () => {
      const encoded = '{"type":"status","payload":{"status":"away","timestamp":1234567890},"timestamp":1234567890}\n';
      const decoded = decodeMessage(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded?.type).toBe('status');
      expect(decoded?.payload.status).toBe('away');
    });

    it('should decode a valid reaction message', () => {
      const encoded = '{"type":"reaction","payload":{"messageId":"msg-123","emoji":"❤️","timestamp":1234567890},"timestamp":1234567890}\n';
      const decoded = decodeMessage(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded?.type).toBe('reaction');
      expect(decoded?.payload.emoji).toBe('❤️');
      expect(decoded?.payload.messageId).toBe('msg-123');
    });

    it('should handle invalid JSON gracefully', () => {
      const invalidJson = 'not valid json';
      const decoded = decodeMessage(invalidJson);

      expect(decoded).toBeNull();
    });

    it('should handle empty strings', () => {
      const decoded = decodeMessage('');
      expect(decoded).toBeNull();
    });

    it('should handle malformed messages', () => {
      const malformed = '{"type":"chat","payload":';
      const decoded = decodeMessage(malformed);

      expect(decoded).toBeNull();
    });

    it('should trim whitespace before decoding', () => {
      const encoded = '  {"type":"ping","payload":{},"timestamp":1234567890}  \n';
      const decoded = decodeMessage(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded?.type).toBe('ping');
    });
  });

  describe('Round-trip encoding/decoding', () => {
    it('should correctly round-trip a chat message', () => {
      const original: ProtocolMessage = {
        type: 'chat',
        payload: {
          id: 'msg-456',
          from: 'Ripster',
          content: 'Test message with special chars: é, ñ, 中文',
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded?.type).toBe(original.type);
      expect(decoded?.payload.content).toBe(original.payload.content);
    });

    it('should correctly round-trip file transfer messages', () => {
      const original: ProtocolMessage = {
        type: 'file-chunk',
        payload: {
          transferId: 'transfer_456',
          chunkIndex: 5,
          totalChunks: 10,
          data: 'SGVsbG8gV29ybGQ=', // Base64 encoded data
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded?.type).toBe('file-chunk');
      expect(decoded?.payload.data).toBe('SGVsbG8gV29ybGQ=');
      expect(decoded?.payload.chunkIndex).toBe(5);
    });

    it('should handle messages with special characters', () => {
      const original: ProtocolMessage = {
        type: 'chat',
        payload: {
          id: 'msg-789',
          from: 'RLRJupiter',
          content: 'Special chars: \n\t"quotes" \'apostrophes\' \\backslash',
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded?.payload.content).toBe(original.payload.content);
    });

    it('should handle empty payload', () => {
      const original: ProtocolMessage = {
        type: 'ping',
        payload: {},
        timestamp: Date.now()
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded?.type).toBe('ping');
      expect(decoded?.payload).toEqual({});
    });
  });
});
