/**
 * TLS scaffold for V2 encrypted P2P.
 * When useTLS is enabled, TCP client/server should use these instead of net.Socket/net.Server.
 * Optional cert pinning can be implemented via checkServerIdentity / secureContext.
 */

import * as tls from 'tls'
import * as net from 'net'

export interface TLSClientOptions {
  host: string
  port: number
  rejectUnauthorized?: boolean
  /** Cert pinning: expected fingerprint (e.g. SHA-256 of peer cert). If set, rejectUnauthorized is effectively true. */
  expectedFingerprint?: string
}

export interface TLSServerOptions {
  key: Buffer
  cert: Buffer
  rejectUnauthorized?: boolean
}

/**
 * Create a TLS client connection. Use in place of new net.Socket() when useTLS is true.
 * Socket API is compatible (write, setEncoding, on('data'), on('connect'), destroy, etc.).
 */
export function createSecureClient(
  options: TLSClientOptions,
  callback?: () => void
): tls.TLSSocket {
  const opts: tls.ConnectionOptions = {
    host: options.host,
    port: options.port,
    rejectUnauthorized: options.rejectUnauthorized !== false,
    ...(options.expectedFingerprint && {
      checkServerIdentity: (hostname: string, cert: tls.PeerCertificate) => {
        const fingerprint = cert.fingerprint256 ?? cert.fingerprint
        if (fingerprint && fingerprint.toUpperCase() !== options.expectedFingerprint!.toUpperCase()) {
          return new Error(`Certificate fingerprint mismatch: expected ${options.expectedFingerprint}`)
        }
        return undefined
      }
    })
  }
  return tls.connect(opts, callback)
}

/**
 * Create a TLS server. Use in place of net.createServer() when useTLS is true.
 * Server API: listen(port), on('secureConnection', (socket) => {}).
 */
export function createSecureServer(options: TLSServerOptions): tls.Server {
  return tls.createServer({
    key: options.key,
    cert: options.cert,
    rejectUnauthorized: options.rejectUnauthorized !== false
  })
}

/** Config flag for V2: when true, use createSecureClient / createSecureServer instead of plain TCP. */
export function getUseTLS(): boolean {
  try {
    return process.env.RLRCHAT_USE_TLS === '1'
  } catch (_) {
    return false
  }
}
