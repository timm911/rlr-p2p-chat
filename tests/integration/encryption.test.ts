import { Socket } from 'net';
import { TCPServer } from '../../src/main/network/tcp-server';
import { TCPClient } from '../../src/main/network/tcp-client';
import { ProtocolMessage } from '../../src/main/network/protocol';

describe('Encrypted transport integration', () => {
  const PORT = 55321;
  const PASSWORD = 'session-secret';
  let server: TCPServer;
  let client: TCPClient;

  beforeEach(() => {
    server = new TCPServer(PORT, PASSWORD);
    client = new TCPClient('127.0.0.1', PORT, PASSWORD, { autoReconnect: false });
    server.on('error', () => {});
    client.on('error', () => {});
  });

  afterEach(async () => {
    client.disconnect();
    server.stop();
    await new Promise((r) => setTimeout(r, 150));
  });

  async function connectBoth(): Promise<void> {
    const serverReady = new Promise<void>((res) => server.once('connected', () => res()));
    const clientReady = new Promise<void>((res) => client.once('connected', () => res()));
    client.connect();
    await Promise.all([serverReady, clientReady]);
  }

  it('completes the handshake and delivers chat both ways over the encrypted channel', async () => {
    await server.start();
    await connectBoth();

    const gotOnServer = new Promise<ProtocolMessage>((res) =>
      server.on('message', (m) => { if (m.type === 'chat') res(m); }));
    expect(client.send({ type: 'chat', payload: { content: 'hi server' }, timestamp: Date.now() })).toBe(true);
    expect((await gotOnServer).payload.content).toBe('hi server');

    const gotOnClient = new Promise<ProtocolMessage>((res) =>
      client.on('message', (m) => { if (m.type === 'chat') res(m); }));
    expect(server.send({ type: 'chat', payload: { content: 'hi client' }, timestamp: Date.now() })).toBe(true);
    expect((await gotOnClient).payload.content).toBe('hi client');
  });

  it('puts no plaintext on the wire: outgoing chat frames are E1 ciphertext', async () => {
    await server.start();
    await connectBoth();

    // Capture the raw bytes the client writes to its socket
    const rawFrames: string[] = [];
    const sock: Socket = (client as any).socket;
    const realWrite = sock.write.bind(sock);
    (sock as any).write = (data: any, ...rest: any[]) => {
      rawFrames.push(String(data));
      return (realWrite as any)(data, ...rest);
    };

    const delivered = new Promise<void>((res) =>
      server.on('message', (m) => { if (m.type === 'chat') res(); }));
    client.send({ type: 'chat', payload: { content: 'TOP SECRET CONTENT' }, timestamp: Date.now() });
    await delivered;

    expect(rawFrames.length).toBeGreaterThan(0);
    for (const frame of rawFrames) {
      expect(frame.startsWith('E1.')).toBe(true);
      expect(frame).not.toContain('TOP SECRET CONTENT');
      expect(frame).not.toContain('"type"');
    }
  });

  it('rejects a wrong-password client with an auth-failed error and never authorizes it', async () => {
    await server.start();
    const badClient = new TCPClient('127.0.0.1', PORT, 'not-the-password', { autoReconnect: false });

    let serverAuthorized = false;
    server.once('connected', () => { serverAuthorized = true; });

    const failed = new Promise<Error>((res) => badClient.once('error', (e) => res(e)));
    badClient.connect();
    const err = await failed;

    expect(err.message).toMatch(/Authentication failed/i);
    expect(badClient.isConnected()).toBe(false);
    expect(serverAuthorized).toBe(false);
    badClient.disconnect();
  });

  it('auto-reconnects quickly after the listener drops and comes back', async () => {
    server = new TCPServer(PORT, PASSWORD);
    client = new TCPClient('127.0.0.1', PORT, PASSWORD); // autoReconnect on (default)
    server.on('error', () => {});
    client.on('error', () => {}); // ECONNRESET/ECONNREFUSED expected during the drop
    await server.start();
    await connectBoth();

    // Kill the listener: client must notice and start retrying
    const reconnecting = new Promise<void>((res) => client.once('reconnecting', () => res()));
    server.stop();
    await reconnecting;

    // Listener comes back; client should re-establish the encrypted session fast
    const server2 = new TCPServer(PORT, PASSWORD);
    server2.on('error', () => {});
    const reconnected = new Promise<void>((res) => client.once('connected', () => res()));
    const start = Date.now();
    await server2.start();
    await reconnected;
    const elapsed = Date.now() - start;

    expect(client.isConnected()).toBe(true);
    expect(elapsed).toBeLessThan(5000); // fast retry, not a long backoff

    // And the re-keyed channel still carries messages
    const got = new Promise<ProtocolMessage>((res) =>
      server2.on('message', (m) => { if (m.type === 'chat') res(m); }));
    expect(client.send({ type: 'chat', payload: { content: 'back online' }, timestamp: Date.now() })).toBe(true);
    expect((await got).payload.content).toBe('back online');

    client.disconnect();
    server2.stop();
    await new Promise((r) => setTimeout(r, 150));
  }, 20000);

  it('authenticates a reconnecting peer while the old socket is still attached (close-race regression)', async () => {
    // Production bug: the replaced socket's close event fired AFTER the new
    // connection derived its session key and wiped it, so every fast
    // reconnect was rejected with "Invalid password" until backoff grew
    // large enough for the old socket to fully close first.
    await server.start();
    await connectBoth(); // first session authenticated, socket attached

    // Second client connects immediately — server must replace the first
    // session without the old socket's teardown corrupting the new one
    const client2 = new TCPClient('127.0.0.1', PORT, PASSWORD, { autoReconnect: false });
    client2.on('error', () => {});
    const reconnected = new Promise<void>((res) => client2.once('connected', () => res()));
    client2.connect();
    await reconnected; // before the fix this never resolved (auth-failed)

    expect(client2.isConnected()).toBe(true);

    // And the replacement session actually carries traffic
    const got = new Promise<ProtocolMessage>((res) =>
      server.on('message', (m) => { if (m.type === 'chat') res(m); }));
    expect(client2.send({ type: 'chat', payload: { content: 'replaced session works' }, timestamp: Date.now() })).toBe(true);
    expect((await got).payload.content).toBe('replaced session works');

    client2.disconnect();
    await new Promise((r) => setTimeout(r, 150));
  }, 15000);

  it('rejects a plaintext (legacy / scanner) peer before auth', async () => {
    await server.start();

    const raw = new Socket();
    const received: string[] = [];
    const closed = new Promise<void>((res) => raw.once('close', () => res()));
    raw.setEncoding('utf8');
    raw.on('data', (d: string) => received.push(d));
    raw.on('error', () => {});

    await new Promise<void>((res) => raw.connect(PORT, '127.0.0.1', () => res()));
    // V1-style plaintext auth attempt
    raw.write(JSON.stringify({ type: 'auth', payload: { passwordHash: 'x' }, timestamp: Date.now() }) + '\n');

    await closed;
    const all = received.join('');
    expect(all).toContain('hello'); // handshake salt announcement
    expect(all).toContain('auth-failed'); // plaintext rejection
    expect(server.isConnected()).toBe(false);
  });
});
