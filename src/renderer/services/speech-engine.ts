/**
 * Speech engine facade: routes ChatWindow's voice input to either
 *  - 'vosk' — offline WASM recognition in the renderer (default; far better
 *    quality than SAPI, especially on Windows 8.1), or
 *  - 'sapi' — the original Windows SAPI recognition in the main process.
 *
 * Exposes the same event surface ChatWindow already used with the IPC API
 * (state change / result / error), so the voice auto-response flow
 * (TTS -> beep -> listen -> silence -> auto-send) is engine-agnostic.
 *
 * If Vosk fails to start (model missing/corrupt, mic blocked), we fall back
 * to SAPI for that session and surface a console warning.
 */
import { getVoskSpeechService } from './vosk-speech-service'

export type SpeechEngineKind = 'vosk' | 'sapi'

const ENGINE_KEY = 'rlrchat-stt-engine'

export function getSpeechEngineSetting(): SpeechEngineKind {
  try {
    const v = localStorage.getItem(ENGINE_KEY)
    if (v === 'sapi' || v === 'vosk') return v
  } catch (_) {}
  return 'vosk'
}

export function setSpeechEngineSetting(engine: SpeechEngineKind): void {
  try {
    localStorage.setItem(ENGINE_KEY, engine)
  } catch (_) {}
}

export interface SpeechEngineResult {
  text: string
  isFinal: boolean
  confidence: number
}

class SpeechEngine {
  /** Engine actually used by the in-flight session (after any fallback). */
  private activeEngine: SpeechEngineKind | null = null

  private stateCallbacks = new Set<(state: string) => void>()
  private resultCallbacks = new Set<(result: SpeechEngineResult) => void>()
  private errorCallbacks = new Set<(error: string) => void>()
  private noticeCallbacks = new Set<(notice: string) => void>()
  private unsubscribers: Array<() => void> = []
  // Only announce a Vosk->SAPI fallback once per app run so a broken model
  // doesn't spam a system message on every mic press.
  private fallbackNoticeShown = false

  constructor() {
    // Subscribe once to both engines; events are forwarded only from the
    // engine that is actually active so the two can never interleave.
    const vosk = getVoskSpeechService()
    this.unsubscribers.push(
      vosk.onStateChange((state) => {
        if (this.activeEngine === 'vosk' || state === 'idle') this.emitState(state)
      }),
      vosk.onResult((r) => {
        if (this.activeEngine === 'vosk') this.emitResult(r)
      }),
      vosk.onError((e) => {
        if (this.activeEngine === 'vosk') this.emitError(e)
      }),
      window.electronAPI.onSpeechStateChange((state) => {
        if (this.activeEngine === 'sapi' || state === 'idle') this.emitState(state)
      }),
      window.electronAPI.onSpeechResult((r) => {
        if (this.activeEngine === 'sapi') {
          this.emitResult({ text: r.text, isFinal: r.isFinal !== false, confidence: r.confidence ?? 1 })
        }
      }),
      window.electronAPI.onSpeechError((e) => {
        if (this.activeEngine === 'sapi') this.emitError(e)
      })
    )
  }

  onStateChange(cb: (state: string) => void): () => void {
    this.stateCallbacks.add(cb)
    return () => this.stateCallbacks.delete(cb)
  }

  onResult(cb: (result: SpeechEngineResult) => void): () => void {
    this.resultCallbacks.add(cb)
    return () => this.resultCallbacks.delete(cb)
  }

  onError(cb: (error: string) => void): () => void {
    this.errorCallbacks.add(cb)
    return () => this.errorCallbacks.delete(cb)
  }

  /** Non-fatal notices, e.g. "Vosk unavailable, using Windows Speech". */
  onNotice(cb: (notice: string) => void): () => void {
    this.noticeCallbacks.add(cb)
    return () => this.noticeCallbacks.delete(cb)
  }

  /** Warm up the Vosk model so the first mic press has no load delay. */
  preload(): void {
    if (getSpeechEngineSetting() === 'vosk') {
      getVoskSpeechService().preload()
    }
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    const preferred = getSpeechEngineSetting()

    if (preferred === 'vosk') {
      try {
        this.activeEngine = 'vosk'
        await getVoskSpeechService().start()
        return { success: true }
      } catch (err: any) {
        console.warn('[SpeechEngine] Vosk failed, falling back to Windows SAPI:', err?.message)
        this.activeEngine = null
        // Vosk is the high-quality engine; SAPI is a low-accuracy fallback and
        // the usual cause of "gibberish" dictation. Surface it once so the user
        // knows why quality dropped and can investigate (Settings → Speech).
        if (!this.fallbackNoticeShown) {
          this.fallbackNoticeShown = true
          this.emitNotice(
            `Voice input: the Vosk engine could not start (${err?.message || 'unknown error'}), so Windows Speech (SAPI) is being used — its accuracy is much lower. See Settings → Speech Recognition. (Shown once.)`
          )
        }
      }
    }

    this.activeEngine = 'sapi'
    const result = await window.electronAPI.speechStart()
    if (!result.success) this.activeEngine = null
    return result
  }

  async stop(): Promise<void> {
    const engine = this.activeEngine
    this.activeEngine = null
    if (engine === 'vosk') {
      getVoskSpeechService().stop()
    } else {
      await window.electronAPI.speechStop()
    }
  }

  private emitState(state: string): void {
    this.stateCallbacks.forEach((cb) => cb(state))
  }

  private emitResult(result: SpeechEngineResult): void {
    this.resultCallbacks.forEach((cb) => cb(result))
  }

  private emitError(error: string): void {
    this.errorCallbacks.forEach((cb) => cb(error))
  }

  private emitNotice(notice: string): void {
    this.noticeCallbacks.forEach((cb) => cb(notice))
  }
}

let instance: SpeechEngine | null = null

export function getSpeechEngine(): SpeechEngine {
  if (!instance) instance = new SpeechEngine()
  return instance
}
