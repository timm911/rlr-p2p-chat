/**
 * Sound Service
 * Provides audio notifications for chat events using Web Audio API
 */

export type SoundType = 
  | 'message-received'
  | 'message-sent'
  | 'file-transfer-started'
  | 'file-transfer-completed'
  | 'connection-established'
  | 'connection-lost'
  | 'reconnect'
  | 'ptt-start'
  | 'ptt-stop'

interface SoundConfig {
  enabled: boolean
  volume: number
  // Master mute — silences ALL output (beeps + speech), independent of the
  // "Sound Effects" enabled preference. Toggled by the header speaker button.
  muted: boolean
}

class SoundService {
  private audioContext: AudioContext | null = null
  private config: SoundConfig = {
    enabled: true,
    volume: 0.3,
    muted: false
  }

  constructor() {
    this.initAudioContext()
    this.loadConfig()
  }

  private initAudioContext(): void {
    if (typeof window !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
  }

  private loadConfig(): void {
    const saved = localStorage.getItem('sound-config')
    if (saved) {
      try {
        this.config = { ...this.config, ...JSON.parse(saved) }
      } catch (error) {
        console.error('Failed to load sound config:', error)
      }
    }
  }

  private saveConfig(): void {
    localStorage.setItem('sound-config', JSON.stringify(this.config))
  }

  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
    this.saveConfig()
  }

  public isEnabled(): boolean {
    return this.config.enabled
  }

  /** Master mute: silences beeps AND (via callers) speech. */
  public setMuted(muted: boolean): void {
    this.config.muted = muted
    this.saveConfig()
  }

  public isMuted(): boolean {
    return this.config.muted
  }

  public setVolume(volume: number): void {
    this.config.volume = Math.max(0, Math.min(1, volume))
    this.saveConfig()
  }

  public getVolume(): number {
    return this.config.volume
  }

  /**
   * Play a sound effect using Web Audio API.
   * `force` bypasses the mute/enabled gates (used by Settings preview buttons,
   * where the user explicitly asked to hear the sound).
   */
  public play(soundType: SoundType, force = false): void {
    if (!this.audioContext || (!force && (this.config.muted || !this.config.enabled))) {
      return
    }

    // Resume audio context if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }

    try {
      switch (soundType) {
        case 'message-received':
          this.playMessageReceived()
          break
        case 'message-sent':
          this.playMessageSent()
          break
        case 'file-transfer-started':
          this.playFileTransferStarted()
          break
        case 'file-transfer-completed':
          this.playFileTransferCompleted()
          break
        case 'connection-established':
          this.playConnectionEstablished()
          break
        case 'connection-lost':
          this.playConnectionLost()
          break
        case 'reconnect':
          this.playReconnect()
          break
        case 'ptt-start':
          this.playPTTStart()
          break
        case 'ptt-stop':
          this.playPTTStop()
          break
      }
    } catch (error) {
      console.error('Sound playback error:', error)
    }
  }

  /**
   * Generate a beep tone
   */
  private beep(frequency: number, duration: number, type: OscillatorType = 'sine'): void {
    if (!this.audioContext) return

    const oscillator = this.audioContext.createOscillator()
    const gainNode = this.audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(this.audioContext.destination)

    oscillator.frequency.value = frequency
    oscillator.type = type

    // Envelope for smooth sound
    const now = this.audioContext.currentTime
    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(this.config.volume, now + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration)

    oscillator.start(now)
    oscillator.stop(now + duration)
  }

  /**
   * Play multiple tones in sequence
   */
  private playSequence(notes: Array<{ frequency: number; duration: number; type?: OscillatorType }>): void {
    if (!this.audioContext) return

    let startTime = this.audioContext.currentTime
    notes.forEach(note => {
      const oscillator = this.audioContext!.createOscillator()
      const gainNode = this.audioContext!.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(this.audioContext!.destination)

      oscillator.frequency.value = note.frequency
      oscillator.type = note.type || 'sine'

      gainNode.gain.setValueAtTime(0, startTime)
      gainNode.gain.linearRampToValueAtTime(this.config.volume, startTime + 0.01)
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + note.duration)

      oscillator.start(startTime)
      oscillator.stop(startTime + note.duration)

      startTime += note.duration
    })
  }

  // Sound implementations
  private playMessageReceived(): void {
    // Pleasant notification sound (C-E chord)
    this.playSequence([
      { frequency: 523.25, duration: 0.1 }, // C5
      { frequency: 659.25, duration: 0.15 }  // E5
    ])
  }

  private playMessageSent(): void {
    // Subtle confirmation beep
    this.beep(600, 0.08)
  }

  private playFileTransferStarted(): void {
    // Ascending tones
    this.playSequence([
      { frequency: 440, duration: 0.1 },
      { frequency: 554.37, duration: 0.1 },
      { frequency: 659.25, duration: 0.12 }
    ])
  }

  private playFileTransferCompleted(): void {
    // Success chime (major chord)
    this.playSequence([
      { frequency: 523.25, duration: 0.12 }, // C5
      { frequency: 659.25, duration: 0.12 }, // E5
      { frequency: 783.99, duration: 0.18 }  // G5
    ])
  }

  private playConnectionEstablished(): void {
    // Warm welcome tone
    this.playSequence([
      { frequency: 392, duration: 0.1 },
      { frequency: 523.25, duration: 0.15 }
    ])
  }

  private playConnectionLost(): void {
    // Descending warning tone
    this.playSequence([
      { frequency: 440, duration: 0.15 },
      { frequency: 349.23, duration: 0.2 }
    ])
  }

  private playReconnect(): void {
    // Short "back online" chime
    this.playSequence([
      { frequency: 523.25, duration: 0.08 },
      { frequency: 659.25, duration: 0.12 }
    ])
  }

  private playPTTStart(): void {
    // Quick high beep
    this.beep(800, 0.05)
  }

  private playPTTStop(): void {
    // Quick low beep
    this.beep(400, 0.05)
  }
}

// Singleton instance
let soundServiceInstance: SoundService | null = null

export function getSoundService(): SoundService {
  if (!soundServiceInstance) {
    soundServiceInstance = new SoundService()
  }
  return soundServiceInstance
}

export default SoundService

