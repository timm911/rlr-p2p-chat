const say = require('say')
import { spawn } from 'child_process'
import { getPiperTTS, PiperTTS } from './piper-tts'

export interface TTSConfig {
  voice?: string | null
  speed?: number // 0.1 to 10, default is 1
  volume?: number // 0 to 1, not directly supported by 'say' but we'll store it
  enabled?: boolean
}

export class TTSService {
  private config: TTSConfig = {
    voice: null, // null = system default
    speed: 1.0,
    volume: 1.0,
    enabled: true
  }

  private isSpeaking = false
  private currentProcess: any = null

  constructor() {
    // Default to the Alan neural voice when Piper + the voice are present;
    // otherwise leave null (system SAPI voice). Roger's machine falls back
    // automatically if the neural engine can't run.
    try {
      const piper = getPiperTTS()
      const alan = piper.listVoices().find((v) => v.id === 'piper:en_GB-alan-medium')
      if (alan) this.config.voice = alan.id
    } catch (_) {
      // keep system default
    }
  }

  /**
   * Configure TTS settings
   */
  public configure(config: Partial<TTSConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get current configuration
   */
  public getConfig(): TTSConfig {
    return { ...this.config }
  }

  /**
   * Speak the provided text. Routes to the Piper neural engine when a
   * `piper:` voice is selected, otherwise to Windows SAPI via `say`.
   */
  public async speak(text: string): Promise<void> {
    if (!this.config.enabled) return

    // Stop any current speech (safely)
    try {
      this.stop()
    } catch (e) {
      console.warn('TTS stop not supported on this platform')
    }

    this.isSpeaking = true

    // Neural (Piper) path
    if (PiperTTS.isPiperVoiceId(this.config.voice)) {
      try {
        await getPiperTTS().speak(text, this.config.voice as string, this.config.speed ?? 1.0)
      } catch (err) {
        console.error('[TTS] Piper failed, falling back to SAPI:', err)
        // Fall back to the system voice so a missing/broken Piper voice still
        // speaks (important for Roger's older machine)
        await this.speakSapi(text, undefined)
      } finally {
        this.isSpeaking = false
      }
      return
    }

    // Windows SAPI path
    try {
      await this.speakSapi(text, this.config.voice || undefined)
    } finally {
      this.isSpeaking = false
    }
  }

  private speakSapi(text: string, voice: string | undefined): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        say.speak(text, voice, this.config.speed, (error: Error | null) => {
          this.currentProcess = null
          if (error) {
            console.error('TTS Error:', error)
            reject(error)
          } else {
            resolve()
          }
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Stop current speech
   */
  public stop(): void {
    // Always stop Piper (it runs independently of the `say` speaking flag)
    try {
      getPiperTTS().stop()
    } catch (_) {}

    if (this.isSpeaking) {
      try {
        // Check if stop method exists before calling
        if (typeof say.stop === 'function') {
          say.stop()
        } else if (typeof (say as any).default?.stop === 'function') {
          (say as any).default.stop()
        }
      } catch (e) {
        console.warn('Could not stop TTS:', e)
      }
      this.isSpeaking = false
      this.currentProcess = null
    }
  }

  /**
   * Check if currently speaking
   */
  public getIsSpeaking(): boolean {
    return this.isSpeaking
  }

  /**
   * Get all available voices: neural Piper voices (listed first) plus the
   * installed Windows SAPI voices. Each entry has an `id` (stored in config)
   * and a friendly `label` (shown in the dropdown).
   */
  public async getVoices(): Promise<{ id: string; label: string }[]> {
    const piper = getPiperTTS().listVoices().map((v) => ({ id: v.id, label: v.label }))
    const sapiNames = await this.getSapiVoiceNames()
    const sapi = sapiNames.map((name) => ({ id: name, label: name }))
    return [...piper, ...sapi]
  }

  /**
   * Query Windows SAPI for installed TTS voice names using PowerShell.
   */
  private getSapiVoiceNames(): Promise<string[]> {
    return new Promise((resolve) => {
      // PowerShell script to query Windows SAPI for installed TTS voices
      const powershellScript = `
        Add-Type -AssemblyName System.Speech
        $synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
        $voices = $synthesizer.GetInstalledVoices()
        $voiceNames = $voices | ForEach-Object { $_.VoiceInfo.Name }
        $synthesizer.Dispose()
        $voiceNames | ConvertTo-Json -Compress
      `

      const args = [
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        powershellScript
      ]

      const child = spawn('powershell.exe', args, {
        windowsHide: true
      })

      let stdout = ''
      let stderr = ''

      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk
      })

      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (data: string) => {
        stderr += data
      })

      child.on('close', (code) => {
        if (code !== 0) {
          console.error('[TTS] Failed to get voices:', stderr)
          // Fallback to default voices if PowerShell fails
          const defaultVoices = [
            'Microsoft David Desktop',
            'Microsoft Zira Desktop',
            'Microsoft Mark'
          ]
          resolve(defaultVoices)
          return
        }

        try {
          // Parse JSON array of voice names
          const voices = JSON.parse(stdout.trim())
          if (Array.isArray(voices) && voices.length > 0) {
            console.log('[TTS] Found', voices.length, 'voices:', voices)
            resolve(voices)
          } else {
            // Fallback if no voices found
            console.warn('[TTS] No voices found, using defaults')
            const defaultVoices = [
              'Microsoft David Desktop',
              'Microsoft Zira Desktop',
              'Microsoft Mark'
            ]
            resolve(defaultVoices)
          }
        } catch (error) {
          console.error('[TTS] Failed to parse voice list:', error)
          // Fallback to default voices
          const defaultVoices = [
            'Microsoft David Desktop',
            'Microsoft Zira Desktop',
            'Microsoft Mark'
          ]
          resolve(defaultVoices)
        }
      })

      child.on('error', (error) => {
        console.error('[TTS] Error spawning PowerShell:', error)
        // Fallback to default voices
        const defaultVoices = [
          'Microsoft David Desktop',
          'Microsoft Zira Desktop',
          'Microsoft Mark'
        ]
        resolve(defaultVoices)
      })
    })
  }

  /**
   * Test speak with a sample text
   */
  public test(): Promise<void> {
    return this.speak('Text to speech is now enabled.')
  }
}

// Singleton instance
let ttsServiceInstance: TTSService | null = null

export function getTTSService(): TTSService {
  if (!ttsServiceInstance) {
    ttsServiceInstance = new TTSService()
  }
  return ttsServiceInstance
}
