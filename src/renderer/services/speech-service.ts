/**
 * Web Speech API Service for Electron
 * Requires internet connection - uses Google's speech recognition
 * Simple, working implementation
 */

// Extend Window interface
declare global {
  interface Window {
    webkitSpeechRecognition: any
    SpeechRecognition: any
  }
}

export type SpeechState = 'idle' | 'listening' | 'error'

export interface SpeechResult {
  text: string
  isFinal: boolean
  confidence?: number
}

export class SpeechService {
  private recognition: any = null
  private state: SpeechState = 'idle'
  private onResultCallback: ((result: SpeechResult) => void) | null = null
  private onStateCallback: ((state: SpeechState) => void) | null = null
  private onErrorCallback: ((error: string) => void) | null = null
  private isManualStop = false

  constructor() {
    this.initialize()
  }

  private initialize(): void {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      console.error('[Speech] Web Speech API not available')
      return
    }

    this.recognition = new SpeechRecognition()
    this.recognition.continuous = true
    this.recognition.interimResults = true
    this.recognition.lang = 'en-US'
    this.recognition.maxAlternatives = 1

    // Handlers
    this.recognition.onstart = () => {
      console.log('[Speech] Started')
      this.setState('listening')
    }

    this.recognition.onend = () => {
      console.log('[Speech] Ended, isManualStop:', this.isManualStop)

      // Auto-restart unless manually stopped
      if (!this.isManualStop && this.state === 'listening') {
        try {
          console.log('[Speech] Auto-restarting...')
          this.recognition.start()
        } catch (err) {
          console.warn('[Speech] Failed to restart:', err)
          this.setState('idle')
        }
      } else {
        this.setState('idle')
      }
    }

    this.recognition.onresult = (event: any) => {
      if (!this.onResultCallback) return

      const results = event.results
      const lastIndex = results.length - 1
      const result = results[lastIndex]

      if (result && result[0]) {
        this.onResultCallback({
          text: result[0].transcript,
          isFinal: result.isFinal,
          confidence: result[0].confidence || 0
        })
      }
    }

    this.recognition.onerror = (event: any) => {
      const errorType = event.error || 'unknown'
      console.error('[Speech] Error:', errorType)

      // Ignore no-speech and aborted errors
      if (errorType === 'no-speech') return
      if (errorType === 'aborted' && this.isManualStop) return

      if (this.onErrorCallback) {
        if (errorType === 'not-allowed') {
          this.onErrorCallback('Microphone permission denied')
        } else if (errorType === 'audio-capture') {
          this.onErrorCallback('No microphone detected')
        } else if (errorType === 'network') {
          this.onErrorCallback('Network error - check internet connection')
        } else {
          this.onErrorCallback(`Speech error: ${errorType}`)
        }
      }

      if (errorType !== 'no-speech') {
        this.setState('error')
      }
    }
  }

  public start(): void {
    if (!this.recognition) {
      throw new Error('Speech recognition not available')
    }

    if (this.state === 'listening') {
      console.log('[Speech] Already listening')
      return
    }

    this.isManualStop = false
    console.log('[Speech] Starting recognition...')

    try {
      this.recognition.start()
    } catch (err: any) {
      if (err.message && err.message.includes('already started')) {
        console.warn('[Speech] Recognition already started')
        return
      }
      throw err
    }
  }

  public stop(): void {
    if (!this.recognition || this.state !== 'listening') {
      return
    }

    this.isManualStop = true
    console.log('[Speech] Stopping recognition...')

    try {
      this.recognition.stop()
    } catch (err) {
      console.warn('[Speech] Error stopping:', err)
    }
  }

  public onResult(callback: (result: SpeechResult) => void): void {
    this.onResultCallback = callback
  }

  public onStateChange(callback: (state: SpeechState) => void): void {
    this.onStateCallback = callback
  }

  public onError(callback: (error: string) => void): void {
    this.onErrorCallback = callback
  }

  public getState(): SpeechState {
    return this.state
  }

  public isAvailable(): boolean {
    return this.recognition !== null
  }

  private setState(newState: SpeechState): void {
    if (this.state === newState) return

    console.log('[Speech] State change:', this.state, '->', newState)
    this.state = newState

    if (this.onStateCallback) {
      this.onStateCallback(newState)
    }
  }

  public dispose(): void {
    if (this.recognition) {
      this.isManualStop = true
      try {
        this.recognition.stop()
      } catch (err) {
        // Ignore
      }
      this.recognition = null
    }
  }
}

// Singleton
let instance: SpeechService | null = null

export function getSpeechService(): SpeechService {
  if (!instance) {
    instance = new SpeechService()
  }
  return instance
}
