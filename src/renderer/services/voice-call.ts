/**
 * Real-time full-duplex voice calls over the existing encrypted P2P channel.
 *
 * No WebRTC, no extra sockets: mic audio is captured with a
 * ScriptProcessorNode (same pattern as vosk-speech-service.ts), downsampled
 * to 16 kHz mono Int16 PCM, base64-encoded and sent as `call-audio` protocol
 * messages (~43 ms per frame). Incoming frames are decoded and scheduled on
 * a running Web Audio timeline with a small jitter lead so playback stays
 * smooth. Echo is handled by getUserMedia's echoCancellation.
 *
 * Signaling rides the same channel: call-request / call-accept /
 * call-decline / call-end. ChatWindow routes incoming protocol messages to
 * the handlePeerXxx / ingestAudio methods and renders UI from onStateChange.
 */

export type CallState = 'idle' | 'calling' | 'ringing' | 'in-call'

export type CallEndReason =
  | 'ended'          // we hung up an active call
  | 'peer-ended'     // peer hung up / cancelled
  | 'declined'       // we declined an incoming call
  | 'peer-declined'  // peer declined our call
  | 'cancelled'      // we cancelled while still calling
  | 'missed'         // incoming call rang out (~30s)
  | 'no-answer'      // our outgoing call rang out (~30s)
  | 'mic-error'      // getUserMedia / audio pipeline failure
  | 'disconnected'   // the chat connection dropped mid-call
  | 'answered-elsewhere' // a ring we were sharing was answered on another device

export interface CallStateInfo {
  reason?: CallEndReason
  previous?: CallState
}

type StateCallback = (state: CallState, info?: CallStateInfo) => void
type ErrorCallback = (error: string) => void

const TARGET_SAMPLE_RATE = 16000
const CAPTURE_BUFFER_SIZE = 2048 // ~43ms @ 48kHz — within the 20-45ms frame target
const JITTER_LEAD_SECONDS = 0.08 // scheduling headroom absorbing network jitter
const RING_TIMEOUT_MS = 30000 // auto-decline / give-up-calling after 30s
const RING_REPEAT_MS = 2500

class VoiceCallService {
  private state: CallState = 'idle'

  // Capture
  private mediaStream: MediaStream | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private processorNode: ScriptProcessorNode | null = null
  private micMuted = false

  // Playback (shares the capture AudioContext)
  private audioContext: AudioContext | null = null
  private playbackGain: GainNode | null = null
  private playheadTime = 0

  // Ringing
  private ringInterval: NodeJS.Timeout | null = null
  private timeoutTimer: NodeJS.Timeout | null = null

  // Counters (also exposed to the smoke test via the window debug hook)
  private framesSent = 0
  private framesReceived = 0

  private stateCallbacks = new Set<StateCallback>()
  private errorCallbacks = new Set<ErrorCallback>()

  constructor() {
    // Debug/test hook: lets DevTools and the Playwright smoke test observe
    // call state and audio frame counters without touching React internals.
    if (typeof window !== 'undefined') {
      ;(window as any).__rlrVoiceCall = {
        getState: () => this.state,
        getStats: () => this.getStats()
      }
    }
  }

  onStateChange(cb: StateCallback): () => void {
    this.stateCallbacks.add(cb)
    return () => this.stateCallbacks.delete(cb)
  }

  onError(cb: ErrorCallback): () => void {
    this.errorCallbacks.add(cb)
    return () => this.errorCallbacks.delete(cb)
  }

  getState(): CallState {
    return this.state
  }

  isMicMuted(): boolean {
    return this.micMuted
  }

  getStats(): { framesSent: number; framesReceived: number } {
    return { framesSent: this.framesSent, framesReceived: this.framesReceived }
  }

  /** Place an outgoing call. */
  start(): void {
    if (this.state !== 'idle') return
    this.setState('calling')
    this.sendSignal('call-request')
    // Give up if the peer never answers
    this.armTimeout(() => {
      this.sendSignal('call-end')
      this.teardown('no-answer')
    })
  }

  /** Accept the currently ringing incoming call. */
  async accept(): Promise<void> {
    if (this.state !== 'ringing') return
    this.stopRing()
    this.clearTimeout()
    this.sendSignal('call-accept')
    await this.beginInCall()
  }

  /** Decline the currently ringing incoming call. */
  decline(): void {
    if (this.state !== 'ringing') return
    this.sendSignal('call-decline')
    this.teardown('declined')
  }

  /** Hang up / cancel, notifying the peer. */
  end(): void {
    if (this.state === 'idle') return
    const reason: CallEndReason = this.state === 'calling' ? 'cancelled' : 'ended'
    this.sendSignal('call-end')
    this.teardown(reason)
  }

  /** Tear down WITHOUT signaling the peer (connection lost, unmount). */
  endLocal(reason: CallEndReason = 'disconnected'): void {
    if (this.state === 'idle') return
    this.teardown(reason)
  }

  /**
   * Stop ringing because the caller's call was answered on another device
   * (group chat: a call rings all of someone's machines; the first to answer
   * wins, the rest stop). No-op unless we're currently ringing.
   */
  answeredElsewhere(): void {
    if (this.state !== 'ringing') return
    this.teardown('answered-elsewhere')
  }

  /** Mute the mic: capture keeps running but no frames are sent. */
  setMicMuted(muted: boolean): void {
    this.micMuted = muted
  }

  // --- Incoming signaling (routed from ChatWindow's onMessage handler) ---

  handlePeerRequest(): void {
    if (this.state === 'idle') {
      this.setState('ringing')
      this.startRing()
      // Auto-decline if nobody answers
      this.armTimeout(() => {
        this.sendSignal('call-decline')
        this.teardown('missed')
      })
    } else if (this.state === 'calling') {
      // Glare: both sides called at once — treat it as an instant answer
      this.clearTimeout()
      this.sendSignal('call-accept')
      void this.beginInCall()
    } else {
      // Already ringing or in a call — busy
      this.sendSignal('call-decline')
    }
  }

  handlePeerAccept(): void {
    if (this.state !== 'calling') return
    this.clearTimeout()
    void this.beginInCall()
  }

  handlePeerDecline(): void {
    if (this.state !== 'calling') return
    this.teardown('peer-declined')
  }

  handlePeerEnd(): void {
    if (this.state === 'idle') return
    this.teardown('peer-ended')
  }

  /** Decode and play one incoming `call-audio` frame. */
  ingestAudio(base64Data: string): void {
    if (this.state !== 'in-call' || !base64Data) return
    const ctx = this.audioContext
    const gain = this.playbackGain
    if (!ctx || !gain) return

    try {
      const samples = base64ToFloat32(base64Data)
      if (samples.length === 0) return
      // The context resamples 16kHz buffers to the hardware rate on playback
      const buffer = ctx.createBuffer(1, samples.length, TARGET_SAMPLE_RATE)
      buffer.copyToChannel(samples, 0)

      // Jitter buffer: schedule frames back-to-back on a running timeline.
      // If we fell behind (gap/underrun), restart the timeline slightly ahead
      // of "now" instead of stacking sources on top of each other.
      const now = ctx.currentTime
      if (this.playheadTime < now + 0.01) {
        this.playheadTime = now + JITTER_LEAD_SECONDS
      }
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(gain)
      source.start(this.playheadTime)
      this.playheadTime += buffer.duration
      this.framesReceived++
    } catch (err) {
      console.warn('[Call] Failed to play audio frame:', err)
    }
  }

  // --- Internals ---

  /** Open the mic and start full-duplex audio, then enter in-call. */
  private async beginInCall(): Promise<void> {
    try {
      await this.startMedia()
      this.setState('in-call')
    } catch (err: any) {
      console.error('[Call] Failed to start call audio:', err)
      this.errorCallbacks.forEach((cb) => cb(err?.message || 'Microphone unavailable'))
      this.sendSignal('call-end')
      this.teardown('mic-error')
    }
  }

  private async startMedia(): Promise<void> {
    this.framesSent = 0
    this.framesReceived = 0
    this.micMuted = false

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true, // critical: speakers play the peer (and TTS)
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    })

    const ctx = new AudioContext()
    this.audioContext = ctx
    void ctx.resume()

    // Playback path: incoming frames route through one gain node. This is
    // deliberately independent of the header master-mute (that mute is for
    // notifications/TTS — an accepted call should always be audible).
    this.playbackGain = ctx.createGain()
    this.playbackGain.gain.value = 1
    this.playbackGain.connect(ctx.destination)
    this.playheadTime = 0

    // Capture path (same ScriptProcessorNode pattern as vosk-speech-service)
    this.sourceNode = ctx.createMediaStreamSource(this.mediaStream)
    this.processorNode = ctx.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1)
    this.processorNode.onaudioprocess = (event) => {
      if (this.state !== 'in-call' || this.micMuted) return // mute = stop sending
      const input = event.inputBuffer.getChannelData(0)
      const pcm = downsampleToInt16(input, ctx.sampleRate)
      const data = int16ToBase64(pcm)
      this.framesSent++
      window.electronAPI.sendMessage({
        type: 'call-audio',
        payload: { data },
        timestamp: Date.now()
      }).catch(() => {})
    }
    this.sourceNode.connect(this.processorNode)
    // ScriptProcessor must reach the destination to keep firing; route via a
    // muted gain so the local mic is never echoed to the local speakers.
    const captureMute = ctx.createGain()
    captureMute.gain.value = 0
    this.processorNode.connect(captureMute)
    captureMute.connect(ctx.destination)

    console.log(`[Call] Audio started (capturing at ${ctx.sampleRate}Hz → ${TARGET_SAMPLE_RATE}Hz)`)
  }

  /** Synthesized incoming-call ring (classic 440+480Hz dual tone, repeating). */
  private startRing(): void {
    this.stopRing()
    const ringOnce = () => {
      try {
        const ctx = this.ensureRingContext()
        const now = ctx.currentTime
        for (const freq of [440, 480]) {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.frequency.value = freq
          osc.connect(gain)
          gain.connect(ctx.destination)
          gain.gain.setValueAtTime(0, now)
          gain.gain.linearRampToValueAtTime(0.12, now + 0.03)
          gain.gain.setValueAtTime(0.12, now + 1.0)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2)
          osc.start(now)
          osc.stop(now + 1.2)
        }
      } catch (err) {
        console.warn('[Call] Ring tone error:', err)
      }
    }
    ringOnce()
    this.ringInterval = setInterval(ringOnce, RING_REPEAT_MS)
  }

  private stopRing(): void {
    if (this.ringInterval) {
      clearInterval(this.ringInterval)
      this.ringInterval = null
    }
  }

  /** Context used while ringing (before any call media exists). */
  private ensureRingContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext()
    }
    void this.audioContext.resume()
    return this.audioContext
  }

  private armTimeout(onTimeout: () => void): void {
    this.clearTimeout()
    this.timeoutTimer = setTimeout(onTimeout, RING_TIMEOUT_MS)
  }

  private clearTimeout(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer)
      this.timeoutTimer = null
    }
  }

  private sendSignal(type: 'call-request' | 'call-accept' | 'call-decline' | 'call-end'): void {
    window.electronAPI.sendMessage({
      type,
      payload: {},
      timestamp: Date.now()
    }).catch((err: any) => {
      console.warn(`[Call] Failed to send ${type}:`, err)
    })
  }

  /** Full cleanup back to idle: tracks, nodes, context, timers, buffers. */
  private teardown(reason: CallEndReason): void {
    const previous = this.state

    this.stopRing()
    this.clearTimeout()

    try {
      if (this.processorNode) this.processorNode.onaudioprocess = null
      this.processorNode?.disconnect()
      this.sourceNode?.disconnect()
      this.playbackGain?.disconnect()
      this.mediaStream?.getTracks().forEach((t) => t.stop())
      void this.audioContext?.close()
    } catch (err) {
      console.warn('[Call] Cleanup error:', err)
    }

    this.processorNode = null
    this.sourceNode = null
    this.playbackGain = null
    this.mediaStream = null
    this.audioContext = null
    this.playheadTime = 0
    this.micMuted = false

    this.state = 'idle'
    if (previous !== 'idle') {
      console.log(`[Call] Ended (${reason}), was ${previous}`)
      this.stateCallbacks.forEach((cb) => cb('idle', { reason, previous }))
    }
  }

  private setState(state: CallState): void {
    if (this.state === state) return
    const previous = this.state
    this.state = state
    console.log(`[Call] State: ${previous} → ${state}`)
    this.stateCallbacks.forEach((cb) => cb(state, { previous }))
  }
}

// --- PCM helpers ---

/** Downsample Float32 PCM at `inputRate` to 16kHz mono Int16 (linear interp). */
function downsampleToInt16(input: Float32Array, inputRate: number): Int16Array {
  const ratio = inputRate / TARGET_SAMPLE_RATE
  const outLength = ratio === 1 ? input.length : Math.floor(input.length / ratio)
  const out = new Int16Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const frac = pos - i0
    const sample = input[i0] + (input[i1] - input[i0]) * frac
    const clamped = Math.max(-1, Math.min(1, sample))
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }
  return out
}

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)))
  }
  return btoa(binary)
}

/** base64 → little-endian Int16 → Float32 in [-1, 1]. */
function base64ToFloat32(base64: string) {
  const binary = atob(base64)
  const sampleCount = binary.length >> 1
  const out = new Float32Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) {
    let v = binary.charCodeAt(2 * i) | (binary.charCodeAt(2 * i + 1) << 8)
    if (v >= 0x8000) v -= 0x10000
    out[i] = v / 0x8000
  }
  return out
}

let instance: VoiceCallService | null = null

export function getVoiceCall(): VoiceCallService {
  if (!instance) instance = new VoiceCallService()
  return instance
}
