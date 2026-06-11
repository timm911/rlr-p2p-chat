# Security Overview - RLR P2P Chat

## ✅ CURRENT ENCRYPTION STATUS: **AES-256-GCM (all traffic encrypted)**

### Summary

As of V2, **all protocol traffic is encrypted end-to-end between the two peers**:

- ✅ Messages: **ENCRYPTED** (AES-256-GCM)
- ✅ Files (every chunk): **ENCRYPTED**
- ✅ Status updates, typing indicators, reactions: **ENCRYPTED**
- ✅ Heartbeat pings/pongs: **ENCRYPTED**

There is no relay server — traffic flows directly between the two peers — so this
is true end-to-end encryption: only the two machines that know the session
password can read anything.

### How It Works

Implementation: `src/main/network/secure-channel.ts`

1. When RLRJupiter's client connects, Ripster's listener generates a random
   16-byte session salt and sends it in a single plaintext `hello` line.
   (The salt is not a secret.)
2. Both sides derive the session key with **scrypt(password, salt) → 32-byte
   AES-256 key**. The password itself never crosses the wire.
3. Every subsequent protocol line is encrypted with **AES-256-GCM** using a
   fresh random 96-bit IV per message. GCM provides both confidentiality and
   integrity — tampered or forged frames fail authentication and are dropped.
4. The client authenticates over the encrypted channel. A peer with the wrong
   password derives a different key, so nothing it sends decrypts; the server
   rejects it with a plaintext `auth-failed` line (the only other plaintext
   ever sent, carrying no secrets) and disconnects it.
5. Session keys are held only in memory and discarded on disconnect. Each new
   connection gets a fresh salt and therefore a fresh key.

### What an Eavesdropper Sees

Your ISP, router, or anyone sniffing the network sees only:
- The TCP connection metadata (IPs, port, timing, traffic volume)
- One `hello` line containing a random salt
- Opaque `E1.<base64>` ciphertext frames

They cannot read messages, files, or statuses, and cannot inject or modify
frames (GCM authentication rejects forgeries).

### What IS Implemented ✅

1. **Transport encryption** — AES-256-GCM on every protocol line
2. **Key derivation** — scrypt with per-session random salt (rainbow-table resistant)
3. **Authentication** — only peers knowing the shared session password can connect;
   plaintext/legacy/scanner connections are rejected before any data is accepted
4. **Message integrity** — GCM auth tags; tampered frames are dropped and the
   connection is closed
5. **Connection keepalive** — TCP keepalive (60s) + encrypted application
   heartbeat (30s ping/pong), dead-connection detection, auto-reconnect with
   exponential backoff (2s → 30s)
6. **Auth timeout** — unauthenticated sockets are dropped after 15 seconds

### Remaining Limitations ⚠️

1. **Password strength matters** — the encryption is only as strong as the
   shared session password. Use a long passphrase you exchange privately.
2. **No forward secrecy** — if someone records traffic AND later learns the
   password and the session salt, past sessions could be decrypted. (A
   Diffie-Hellman exchange would fix this; reasonable future work.)
3. **No rate limiting** — a flood of connection attempts isn't throttled
   (each failed attempt is dropped within 15 seconds).
4. **Metadata is visible** — an observer can tell *that* you're chatting and
   roughly how much, just not what is said.

### Recommendations

1. ✅ Use a long, unique session password and share it in person or by phone
2. ✅ Keep the app updated on **both** machines (both peers must run the
   encrypted version — old plaintext clients are rejected)
3. ✅ Forward only the single TCP port the listener uses

## Questions?

**Q: Can my ISP read my messages?**
A: No. They see only opaque AES-256-GCM ciphertext.

**Q: Is this secure enough for family chat?**
A: Yes — including reasonably sensitive content, provided the session password
is strong and privately shared.

**Q: What happens if someone connects with the wrong password?**
A: Their traffic fails GCM decryption, they receive an `auth-failed` notice,
and they are disconnected. They never see any chat data.

**Q: What if an old (unencrypted) version of the app connects?**
A: It is rejected before authentication — plaintext protocol traffic is no
longer accepted.

---

**Last Updated:** June 10, 2026
**Version:** 2.0.0 (AES-256-GCM encrypted transport)
