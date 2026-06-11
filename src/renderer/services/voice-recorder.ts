/**
 * Records a short voice message from the microphone using MediaRecorder
 * (webm/opus — supported in the bundled Chromium). The recorded blob is handed
 * back so ChatWindow can write it to a temp file and send it over the normal
 * file-transfer path.
 */
export interface VoiceRecording {
  bytes: Uint8Array
  ext: string
  durationMs: number
}

class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  private startedAt = 0
  private mimeType = 'audio/webm'

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording'
  }

  async start(): Promise<void> {
    if (this.isRecording()) return
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    })
    // Pick a supported container; webm/opus is the Chromium default
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
    this.mimeType = candidates.find((t) => (window as any).MediaRecorder?.isTypeSupported?.(t)) || 'audio/webm'
    this.chunks = []
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: this.mimeType })
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data)
    }
    this.startedAt = performance.now()
    this.mediaRecorder.start()
  }

  /** Stop and resolve with the recorded bytes, or null if nothing/cancelled. */
  stop(): Promise<VoiceRecording | null> {
    return new Promise((resolve) => {
      const mr = this.mediaRecorder
      if (!mr || mr.state === 'inactive') {
        this.cleanup()
        return resolve(null)
      }
      mr.onstop = async () => {
        const durationMs = Math.round(performance.now() - this.startedAt)
        const blob = new Blob(this.chunks, { type: this.mimeType })
        this.cleanup()
        if (blob.size === 0) return resolve(null)
        const buf = new Uint8Array(await blob.arrayBuffer())
        const ext = this.mimeType.includes('ogg') ? 'ogg' : 'webm'
        resolve({ bytes: buf, ext, durationMs })
      }
      mr.stop()
    })
  }

  /** Abort the recording and discard audio. */
  cancel(): void {
    const mr = this.mediaRecorder
    if (mr && mr.state !== 'inactive') {
      mr.onstop = null as any
      try { mr.stop() } catch (_) {}
    }
    this.cleanup()
  }

  private cleanup(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.mediaRecorder = null
    this.chunks = []
  }
}

let instance: VoiceRecorder | null = null
export function getVoiceRecorder(): VoiceRecorder {
  if (!instance) instance = new VoiceRecorder()
  return instance
}
