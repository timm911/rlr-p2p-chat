/**
 * Offline speech-to-text using Vosk (WebAssembly, vosk-browser).
 *
 * Why this exists: Windows SAPI recognition quality is poor, especially on
 * Windows 8.1 (RLRJupiter's machine). Vosk small-en-us runs fully offline,
 * needs no AVX/modern-CPU features, and streams partial results in real time
 * even on 2013-era hardware — unlike Whisper, which cannot do live dictation
 * there (see WHISPER_FEASIBILITY.md).
 *
 * The model (~40MB tar.gz) is bundled with the app and delivered by the main
 * process over IPC, because the renderer cannot fetch() file:// URLs in a
 * packaged build. We wrap the bytes in a Blob URL for vosk-browser's worker.
 *
 * Mirrors the event surface of the SAPI path (state change / result / error)
 * so ChatWindow's voice auto-response flow works identically on both engines.
 */
import { createModel, Model, KaldiRecognizer } from 'vosk-browser'

export interface VoskResult {
  text: string
  isFinal: boolean
  confidence: number
}

type StateCallback = (state: 'listening' | 'idle') => void
type ResultCallback = (result: VoskResult) => void
type ErrorCallback = (error: string) => void

class VoskSpeechService {
  private model: Model | null = null
  private modelLoading: Promise<Model> | null = null
  private recognizer: KaldiRecognizer | null = null
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private processorNode: ScriptProcessorNode | null = null
  private listening = false

  private stateCallbacks = new Set<StateCallback>()
  private resultCallbacks = new Set<ResultCallback>()
  private errorCallbacks = new Set<ErrorCallback>()

  onStateChange(cb: StateCallback): () => void {
    this.stateCallbacks.add(cb)
    return () => this.stateCallbacks.delete(cb)
  }

  onResult(cb: ResultCallback): () => void {
    this.resultCallbacks.add(cb)
    return () => this.resultCallbacks.delete(cb)
  }

  onError(cb: ErrorCallback): () => void {
    this.errorCallbacks.add(cb)
    return () => this.errorCallbacks.delete(cb)
  }

  getIsListening(): boolean {
    return this.listening
  }

  /** Load (once) the bundled model via the main process. */
  private async loadModel(): Promise<Model> {
    if (this.model) return this.model
    if (this.modelLoading) return this.modelLoading

    this.modelLoading = (async () => {
      console.log('[Vosk] Requesting model from main process...')
      const res = await window.electronAPI.getVoskModel()
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Vosk model unavailable')
      }
      // Copy into a fresh ArrayBuffer-backed view (IPC buffers may be
      // SharedArrayBuffer-backed, which Blob does not accept)
      const raw = res.data instanceof Uint8Array ? res.data : new Uint8Array(res.data as ArrayBufferLike)
      const bytes = new Uint8Array(raw.length)
      bytes.set(raw)
      const blob = new Blob([bytes.buffer])
      const url = URL.createObjectURL(blob)
      try {
        console.log(`[Vosk] Loading model (${Math.round(blob.size / 1024 / 1024)}MB)...`)
        const model = await createModel(url)
        this.model = model
        console.log('[Vosk] Model ready')
        return model
      } finally {
        URL.revokeObjectURL(url)
      }
    })()

    try {
      return await this.modelLoading
    } catch (err) {
      this.modelLoading = null // allow retry on next start()
      throw err
    }
  }

  /** Preload the model in the background so the first mic press is instant. */
  preload(): void {
    this.loadModel().catch((err) => {
      console.warn('[Vosk] Preload failed (will fall back to SAPI):', err?.message)
    })
  }

  async start(): Promise<void> {
    if (this.listening) return

    const model = await this.loadModel()

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1
      }
    })

    this.audioContext = new AudioContext()
    // IMPORTANT: the recognizer must run at the AudioContext's real sample
    // rate (typically 44100/48000). Hardcoding 16000 here produces garbage —
    // vosk-browser resamples internally based on this value.
    this.recognizer = new model.KaldiRecognizer(this.audioContext.sampleRate)
    this.recognizer.setWords(true)

    this.recognizer.on('result', (message: any) => {
      const text: string = message?.result?.text ?? ''
      if (!text.trim()) return
      const words: Array<{ conf?: number }> = message?.result?.result ?? []
      const confidence = words.length
        ? words.reduce((sum, w) => sum + (w.conf ?? 1), 0) / words.length
        : 1
      this.resultCallbacks.forEach((cb) => cb({ text, isFinal: true, confidence }))
    })

    this.recognizer.on('partialresult', (message: any) => {
      const partial: string = message?.result?.partial ?? ''
      if (!partial.trim()) return
      this.resultCallbacks.forEach((cb) => cb({ text: partial, isFinal: false, confidence: 0 }))
    })

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream)
    // ScriptProcessorNode is deprecated but fully supported in Chromium 106
    // and what vosk-browser's own examples use.
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1)
    this.processorNode.onaudioprocess = (event) => {
      if (this.recognizer && this.listening) {
        try {
          this.recognizer.acceptWaveform(event.inputBuffer)
        } catch (err: any) {
          console.error('[Vosk] acceptWaveform failed:', err)
          this.errorCallbacks.forEach((cb) => cb(err?.message || 'Recognition error'))
        }
      }
    }
    this.sourceNode.connect(this.processorNode)
    // ScriptProcessor must be connected to keep firing; route to a muted gain
    // so the mic is never echoed to the speakers.
    const mute = this.audioContext.createGain()
    mute.gain.value = 0
    this.processorNode.connect(mute)
    mute.connect(this.audioContext.destination)

    this.listening = true
    this.stateCallbacks.forEach((cb) => cb('listening'))
    console.log(`[Vosk] Listening at ${this.audioContext.sampleRate}Hz`)
  }

  stop(): void {
    if (!this.listening && !this.mediaStream) return
    this.listening = false

    try {
      this.processorNode?.disconnect()
      this.sourceNode?.disconnect()
      this.mediaStream?.getTracks().forEach((t) => t.stop())
      this.audioContext?.close()
      this.recognizer?.remove()
    } catch (err) {
      console.warn('[Vosk] Cleanup error:', err)
    }

    this.processorNode = null
    this.sourceNode = null
    this.mediaStream = null
    this.audioContext = null
    this.recognizer = null

    this.stateCallbacks.forEach((cb) => cb('idle'))
    console.log('[Vosk] Stopped')
  }
}

let instance: VoskSpeechService | null = null

export function getVoskSpeechService(): VoskSpeechService {
  if (!instance) instance = new VoskSpeechService()
  return instance
}
