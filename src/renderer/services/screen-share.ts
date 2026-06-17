/**
 * Live desktop screen sharing over the existing encrypted P2P channel.
 *
 * No WebRTC: the shared screen is captured via getUserMedia (Electron's
 * `desktop` source) and encoded with MediaRecorder (VP8/WebM). Each chunk is
 * base64-encoded and sent as a `screen-frame` protocol message; the viewer
 * appends the chunks to a MediaSource SourceBuffer and plays them in a <video>.
 *
 * Signaling: `screen-share-start` / `screen-share-stop`. ChatWindow routes
 * incoming messages to handleRemoteXxx and renders the viewer from the
 * onViewerEvent subscription; ScreenShareViewer feeds frames via onFrame.
 *
 * One active share at a time (last start wins on the viewer side).
 */

type ViewerEvent = { type: 'start' | 'stop'; from?: string }
type ViewerCallback = (ev: ViewerEvent) => void
type FrameCallback = (bytes: Uint8Array) => void

const TIMESLICE_MS = 250
const VIDEO_BITRATE = 3_000_000
const MAX_WIDTH = 1920
const MAX_HEIGHT = 1080
const MAX_FPS = 30

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp8',
    'video/webm;codecs=vp9',
    'video/webm'
  ]
  for (const c of candidates) {
    try { if ((window as any).MediaRecorder?.isTypeSupported?.(c)) return c } catch (_) {}
  }
  return 'video/webm'
}

class ScreenShareService {
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private sharing = false
  private mimeType = 'video/webm;codecs=vp8'

  private viewerCallbacks = new Set<ViewerCallback>()
  private frameCallbacks = new Set<FrameCallback>()
  private receiving = false
  private identity = ''

  setIdentity(id: string): void { this.identity = id }
  isSharing(): boolean { return this.sharing }
  isReceiving(): boolean { return this.receiving }
  getMimeType(): string { return this.mimeType }

  onViewerEvent(cb: ViewerCallback): () => void {
    this.viewerCallbacks.add(cb)
    return () => this.viewerCallbacks.delete(cb)
  }
  onFrame(cb: FrameCallback): () => void {
    this.frameCallbacks.add(cb)
    return () => this.frameCallbacks.delete(cb)
  }

  /** Start sharing a captured desktop source (id from desktopCapturer). */
  async startShare(sourceId: string): Promise<void> {
    if (this.sharing) this.stopShare()
    this.mimeType = pickMimeType()

    // Electron desktop capture constraints (chromeMediaSource).
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth: MAX_WIDTH,
          maxHeight: MAX_HEIGHT,
          maxFrameRate: MAX_FPS
        }
      } as any
    })

    const rec = new MediaRecorder(this.stream, {
      mimeType: this.mimeType,
      videoBitsPerSecond: VIDEO_BITRATE
    })
    this.recorder = rec

    // Tell viewers a fresh stream is starting (so they reset their decoder),
    // including the exact mime type they must use for the SourceBuffer.
    void window.electronAPI.sendMessage({
      type: 'screen-share-start',
      payload: { mimeType: this.mimeType, from: this.identity },
      timestamp: Date.now()
    })

    rec.ondataavailable = async (e: BlobEvent) => {
      if (!e.data || e.data.size === 0) return
      try {
        const buf = new Uint8Array(await e.data.arrayBuffer())
        const data = bytesToBase64(buf)
        window.electronAPI.sendMessage({
          type: 'screen-frame',
          payload: { data },
          timestamp: Date.now()
        }).catch(() => {})
      } catch (_) {}
    }

    // If the user stops sharing via the OS ("Stop sharing" / closes window)
    const track = this.stream.getVideoTracks()[0]
    if (track) track.onended = () => this.stopShare()

    rec.start(TIMESLICE_MS)
    this.sharing = true
  }

  /** Stop sharing and tell viewers. */
  stopShare(): void {
    const was = this.sharing
    this.sharing = false
    try { this.recorder?.stop() } catch (_) {}
    try { this.stream?.getTracks().forEach((t) => t.stop()) } catch (_) {}
    this.recorder = null
    this.stream = null
    if (was) {
      void window.electronAPI.sendMessage({
        type: 'screen-share-stop',
        payload: { from: this.identity },
        timestamp: Date.now()
      })
    }
  }

  // --- Incoming (routed from ChatWindow's message handler) ---

  handleRemoteStart(from?: string, mimeType?: string): void {
    this.receiving = true
    if (mimeType) this.mimeType = mimeType
    this.viewerCallbacks.forEach((cb) => cb({ type: 'start', from }))
  }

  handleRemoteFrame(base64: string): void {
    if (!this.receiving || !base64) return
    try {
      const bytes = base64ToBytes(base64)
      this.frameCallbacks.forEach((cb) => cb(bytes))
    } catch (_) {}
  }

  handleRemoteStop(from?: string): void {
    if (!this.receiving) return
    this.receiving = false
    this.viewerCallbacks.forEach((cb) => cb({ type: 'stop', from }))
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

let instance: ScreenShareService | null = null
export function getScreenShare(): ScreenShareService {
  if (!instance) instance = new ScreenShareService()
  return instance
}
