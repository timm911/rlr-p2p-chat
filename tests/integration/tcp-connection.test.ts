import { TCPServer } from '../../src/main/network/tcp-server';
import { TCPClient } from '../../src/main/network/tcp-client';
import { ProtocolMessage } from '../../src/main/network/protocol';

describe('TCP Connection Integration Tests', () => {
  const TEST_PORT = 54999; // Use a different port to avoid conflicts
  const TEST_PASSWORD = 'integration-test-password'; // Shared session password for the auth handshake
  let server: TCPServer;
  let client: TCPClient;

  beforeEach(() => {
    server = new TCPServer(TEST_PORT, TEST_PASSWORD);
    client = new TCPClient('127.0.0.1', TEST_PORT, TEST_PASSWORD);
    // Swallow expected socket errors (e.g. ECONNRESET on abrupt disconnect) so an
    // unhandled 'error' event doesn't crash the test. Tests that assert on errors
    // use their own .once('error', ...) listeners, which still fire.
    server.on('error', () => {});
    client.on('error', () => {});
  });

  afterEach(async () => {
    // Clean up connections
    if (client) {
      client.disconnect();
    }
    if (server) {
      server.stop();
    }
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Server Listening', () => {
    it('should start server and listen on the specified port', async () => {
      const listeningPromise = new Promise<number>((resolve) => {
        server.once('listening', (port) => {
          resolve(port);
        });
      });

      await server.start();
      const port = await listeningPromise;

      expect(port).toBe(TEST_PORT);
      expect(server.isConnected()).toBe(false); // No client connected yet
    });

    it('should emit error when port is already in use', async () => {
      await server.start();

      // Try to start another server on the same port
      const server2 = new TCPServer(TEST_PORT, TEST_PASSWORD);

      await expect(server2.start()).rejects.toThrow(/already in use/);

      server2.stop();
    });

    it('should allow server restart after stopping', async () => {
      await server.start();
      server.stop();

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should be able to start again
      await expect(server.start()).resolves.not.toThrow();
    });
  });

  describe('Client-Server Connection', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should establish connection between client and server', async () => {
      const serverConnectedPromise = new Promise<any>((resolve) => {
        server.once('connected', (info) => {
          resolve(info);
        });
      });

      const clientConnectedPromise = new Promise<any>((resolve) => {
        client.once('connected', (info) => {
          resolve(info);
        });
      });

      client.connect();

      const [serverInfo, clientInfo] = await Promise.all([
        serverConnectedPromise,
        clientConnectedPromise
      ]);

      expect(serverInfo).toBeDefined();
      expect(clientInfo.host).toBe('127.0.0.1');
      expect(clientInfo.port).toBe(TEST_PORT);
      expect(server.isConnected()).toBe(true);
      expect(client.isConnected()).toBe(true);
    });

    it('should handle client disconnection', async () => {
      const serverConnectedPromise = new Promise<void>((resolve) => {
        server.once('connected', () => resolve());
      });

      const serverDisconnectedPromise = new Promise<void>((resolve) => {
        server.once('disconnected', () => resolve());
      });

      client.connect();
      await serverConnectedPromise;

      expect(server.isConnected()).toBe(true);

      client.disconnect();
      await serverDisconnectedPromise;

      expect(server.isConnected()).toBe(false);
    });

    it('should emit connecting state before connection', (done) => {
      client.once('connecting', (info) => {
        expect(info.host).toBe('127.0.0.1');
        expect(info.port).toBe(TEST_PORT);
        done();
      });

      client.connect();
    });

    it('should handle connection to non-existent server', async () => {
      // Stop the server
      server.stop();
      await new Promise(resolve => setTimeout(resolve, 100));

      const errorPromise = new Promise<Error>((resolve) => {
        client.once('error', (err) => {
          resolve(err);
        });
      });

      client.connect();
      const error = await errorPromise;

      expect(error).toBeDefined();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('Message Sending and Receiving', () => {
    beforeEach(async () => {
      await server.start();

      // Wait for BOTH sides to complete the auth handshake. The server emits
      // 'connected' as soon as it accepts auth, but the client only becomes
      // authenticated (and able to send) once it receives 'auth-success'.
      const serverConnected = new Promise<void>((resolve) => {
        server.once('connected', () => resolve());
      });
      const clientConnected = new Promise<void>((resolve) => {
        client.once('connected', () => resolve());
      });

      client.connect();
      await Promise.all([serverConnected, clientConnected]);
    });

    it('should send chat message from client to server', async () => {
      const messagePromise = new Promise<ProtocolMessage>((resolve) => {
        server.once('message', (msg) => {
          resolve(msg);
        });
      });

      const testMessage: ProtocolMessage = {
        type: 'chat',
        payload: {
          id: 'test-msg-1',
          from: 'RLRJupiter',
          content: 'Hello from client',
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };

      const sent = client.send(testMessage);
      expect(sent).toBe(true);

      const receivedMessage = await messagePromise;
      expect(receivedMessage.type).toBe('chat');
      expect(receivedMessage.payload.content).toBe('Hello from client');
    });

    it('should send chat message from server to client', async () => {
      const messagePromise = new Promise<ProtocolMessage>((resolve) => {
        client.once('message', (msg) => {
          resolve(msg);
        });
      });

      const testMessage: ProtocolMessage = {
        type: 'chat',
        payload: {
          id: 'test-msg-2',
          from: 'Ripster',
          content: 'Hello from server',
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };

      const sent = server.send(testMessage);
      expect(sent).toBe(true);

      const receivedMessage = await messagePromise;
      expect(receivedMessage.type).toBe('chat');
      expect(receivedMessage.payload.content).toBe('Hello from server');
    });

    it('should handle bidirectional messaging', async () => {
      const serverMessages: ProtocolMessage[] = [];
      const clientMessages: ProtocolMessage[] = [];

      // Count only chat messages; heartbeat ping/pong are also emitted as 'message'.
      server.on('message', (msg) => { if (msg.type === 'chat') serverMessages.push(msg); });
      client.on('message', (msg) => { if (msg.type === 'chat') clientMessages.push(msg); });

      // Client sends message
      client.send({
        type: 'chat',
        payload: { id: '1', from: 'RLRJupiter', content: 'Msg 1', timestamp: Date.now() },
        timestamp: Date.now()
      });

      // Server sends message
      server.send({
        type: 'chat',
        payload: { id: '2', from: 'Ripster', content: 'Msg 2', timestamp: Date.now() },
        timestamp: Date.now()
      });

      // Client sends another message
      client.send({
        type: 'chat',
        payload: { id: '3', from: 'RLRJupiter', content: 'Msg 3', timestamp: Date.now() },
        timestamp: Date.now()
      });

      // Wait for messages to be received
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(serverMessages.length).toBe(2);
      expect(clientMessages.length).toBe(1);
      expect(serverMessages[0].payload.content).toBe('Msg 1');
      expect(serverMessages[1].payload.content).toBe('Msg 3');
      expect(clientMessages[0].payload.content).toBe('Msg 2');
    });

    it('should handle status updates', async () => {
      const messagePromise = new Promise<ProtocolMessage>((resolve) => {
        client.once('message', (msg) => {
          if (msg.type === 'status') resolve(msg);
        });
      });

      const statusMessage: ProtocolMessage = {
        type: 'status',
        payload: {
          status: 'away',
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };

      server.send(statusMessage);
      const receivedMessage = await messagePromise;

      expect(receivedMessage.type).toBe('status');
      expect(receivedMessage.payload.status).toBe('away');
    });

    it('should handle reactions', async () => {
      const messagePromise = new Promise<ProtocolMessage>((resolve) => {
        server.once('message', (msg) => {
          if (msg.type === 'reaction') resolve(msg);
        });
      });

      const reactionMessage: ProtocolMessage = {
        type: 'reaction',
        payload: {
          messageId: 'msg-123',
          emoji: '👍',
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };

      client.send(reactionMessage);
      const receivedMessage = await messagePromise;

      expect(receivedMessage.type).toBe('reaction');
      expect(receivedMessage.payload.emoji).toBe('👍');
      expect(receivedMessage.payload.messageId).toBe('msg-123');
    });

    it('should handle typing indicators', async () => {
      const messagePromise = new Promise<ProtocolMessage>((resolve) => {
        server.once('message', (msg) => {
          if (msg.type === 'typing') resolve(msg);
        });
      });

      const typingMessage: ProtocolMessage = {
        type: 'typing',
        payload: {
          isTyping: true,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };

      client.send(typingMessage);
      const receivedMessage = await messagePromise;

      expect(receivedMessage.type).toBe('typing');
      expect(receivedMessage.payload.isTyping).toBe(true);
    });

    it('should auto-respond to ping with pong', async () => {
      const pongPromise = new Promise<ProtocolMessage>((resolve) => {
        client.once('message', (msg) => {
          if (msg.type === 'pong') resolve(msg);
        });
      });

      const pingMessage: ProtocolMessage = {
        type: 'ping',
        payload: {},
        timestamp: Date.now()
      };

      client.send(pingMessage);
      const pongMessage = await pongPromise;

      expect(pongMessage.type).toBe('pong');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await server.start();

      // Wait for both sides to finish authenticating before each test.
      const serverConnected = new Promise<void>((resolve) => {
        server.once('connected', () => resolve());
      });
      const clientConnected = new Promise<void>((resolve) => {
        client.once('connected', () => resolve());
      });

      client.connect();
      await Promise.all([serverConnected, clientConnected]);
    });

    it('should not send message when client is disconnected', () => {
      client.disconnect();

      const testMessage: ProtocolMessage = {
        type: 'chat',
        payload: { id: '1', from: 'RLRJupiter', content: 'Test', timestamp: Date.now() },
        timestamp: Date.now()
      };

      const sent = client.send(testMessage);
      expect(sent).toBe(false);
    });

    it('should not send message when server has no client', () => {
      client.disconnect();

      // Wait for disconnection
      return new Promise<void>((resolve) => {
        server.once('disconnected', () => {
          const testMessage: ProtocolMessage = {
            type: 'chat',
            payload: { id: '1', from: 'Ripster', content: 'Test', timestamp: Date.now() },
            timestamp: Date.now()
          };

          const sent = server.send(testMessage);
          expect(sent).toBe(false);
          resolve();
        });
      });
    });

    it('should handle multiple messages in single data event', async () => {
      const messages: ProtocolMessage[] = [];

      server.on('message', (msg) => {
        messages.push(msg);
      });

      // Send multiple messages quickly
      for (let i = 0; i < 5; i++) {
        client.send({
          type: 'chat',
          payload: { id: `msg-${i}`, from: 'RLRJupiter', content: `Message ${i}`, timestamp: Date.now() },
          timestamp: Date.now()
        });
      }

      // Wait for messages to be received
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(messages.length).toBe(5);
      messages.forEach((msg, i) => {
        expect(msg.payload.content).toBe(`Message ${i}`);
      });
    });
  });

  describe('Reconnection', () => {
    it('should attempt to reconnect when connection is lost', async () => {
      await server.start();

      const firstConnectPromise = new Promise<void>((resolve) => {
        client.once('connected', () => resolve());
      });

      client.connect();
      await firstConnectPromise;

      const reconnectingPromise = new Promise<void>((resolve) => {
        client.once('reconnecting', () => resolve());
      });

      // Simulate connection loss
      server.stop();

      await reconnectingPromise;

      // Client should emit reconnecting event
      expect(true).toBe(true);
    });
  });
});
