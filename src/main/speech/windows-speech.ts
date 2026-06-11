/**
 * Windows Native Speech Recognition using System.Speech
 * Real-time streaming recognition via PowerShell
 * 100% Offline - No internet required
 */

import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

export interface SpeechResult {
  text: string
  confidence: number
  isFinal: boolean
}

export interface MicTestResult {
  success: boolean
  error?: string
  details?: {
    systemSpeechAvailable: boolean
    microphoneAvailable: boolean
    recognitionWorking: boolean
  }
}

export class WindowsSpeechRecognition extends EventEmitter {
  private process: ChildProcess | null = null
  private isListening = false
  private stdoutBuffer = ''
  private stopRequested = false

  constructor() {
    super()
  }

  public start(): void {
    if (this.isListening) {
      console.log('[WinSpeech] Already listening')
      return
    }

    if (this.process) {
      console.log('[WinSpeech] Start requested while process is still initializing')
      return
    }

    console.log('[WinSpeech] Starting recognition...')
    this.stopRequested = false
    this.stdoutBuffer = ''

    // PowerShell script for real-time speech recognition with error handling
    // Uses synchronous recognition in a loop for better Windows 8.1 compatibility
    const psScript = `
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    Write-Host "INFO:Loading System.Speech assembly..."
    Add-Type -AssemblyName System.Speech
    Write-Host "INFO:System.Speech loaded successfully"
} catch {
    Write-Host "ERROR:Failed to load System.Speech assembly: $($_.Exception.Message)"
    exit 1
}

$recognizer = $null
try {
    Write-Host "INFO:Creating speech recognition engine..."
    $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    Write-Host "INFO:Speech recognition engine created"
} catch {
    Write-Host "ERROR:Failed to create speech recognition engine: $($_.Exception.Message)"
    exit 1
}

try {
    Write-Host "INFO:Setting input to default audio device..."
    $recognizer.SetInputToDefaultAudioDevice()
    Write-Host "INFO:Audio device set successfully"
} catch {
    Write-Host "ERROR:Failed to set audio input device: $($_.Exception.Message)"
    if ($recognizer) { $recognizer.Dispose() }
    exit 1
}

try {
    Write-Host "INFO:Loading dictation grammar..."
    $dictationGrammar = New-Object System.Speech.Recognition.DictationGrammar
    $recognizer.LoadGrammar($dictationGrammar)
    Write-Host "INFO:Dictation grammar loaded"
} catch {
    Write-Host "ERROR:Failed to load dictation grammar: $($_.Exception.Message)"
    if ($recognizer) { $recognizer.Dispose() }
    exit 1
}

# Set timeouts - important for continuous recognition
$recognizer.InitialSilenceTimeout = [System.TimeSpan]::FromSeconds(30)
$recognizer.BabbleTimeout = [System.TimeSpan]::FromSeconds(0)
$recognizer.EndSilenceTimeout = [System.TimeSpan]::FromSeconds(1)
$recognizer.EndSilenceTimeoutAmbiguous = [System.TimeSpan]::FromSeconds(1)

Write-Host "READY"

# Use synchronous recognition in a loop (more compatible with older Windows)
while ($true) {
    try {
        $result = $recognizer.Recognize([System.TimeSpan]::FromSeconds(5))

        if ($result -ne $null) {
            $output = @{
                text = $result.Text
                confidence = $result.Confidence
                isFinal = $true
            } | ConvertTo-Json -Compress
            Write-Host "RESULT:$output"
        }
    } catch {
        Write-Host "ERROR:Recognition error: $($_.Exception.Message)"
        # Continue trying
        Start-Sleep -Milliseconds 100
    }
}
`

    this.process = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command', psScript
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      // stdout chunks can split lines mid-JSON, so keep a rolling buffer.
      this.stdoutBuffer += data.toString()
      const lines = this.stdoutBuffer.split(/\r?\n/)
      this.stdoutBuffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        if (trimmed === 'READY') {
          console.log('[WinSpeech] Recognition ready')
          this.isListening = true
          this.emit('start')
        } else if (trimmed === 'STOPPED') {
          console.log('[WinSpeech] Recognition stopped')
          this.isListening = false
          this.emit('end')
        } else if (trimmed.startsWith('RESULT:')) {
          try {
            const json = trimmed.substring(7)
            const result: SpeechResult = JSON.parse(json)
            console.log('[WinSpeech] Result:', result.text, 'final:', result.isFinal)
            this.emit('result', result)
          } catch (err) {
            console.error('[WinSpeech] Failed to parse result:', trimmed)
          }
        } else if (trimmed.startsWith('INFO:')) {
          console.log('[WinSpeech]', trimmed.substring(5))
        } else if (trimmed.startsWith('ERROR:')) {
          const errorMsg = trimmed.substring(6)
          console.error('[WinSpeech] ERROR:', errorMsg)
          this.emit('error', errorMsg)
        }
      }
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      const error = data.toString().trim()
      if (error && !error.includes('ProgressPreference')) {
        console.error('[WinSpeech] STDERR:', error)
        // Send more detailed error to renderer
        this.emit('error', `PowerShell error: ${error}`)
      }
    })

    this.process.on('close', (code, signal) => {
      console.log('[WinSpeech] Process exited - code:', code, 'signal:', signal)
      const wasListening = this.isListening
      this.isListening = false
      this.process = null
      this.stdoutBuffer = ''

      if (code !== 0 && code !== null && !this.stopRequested) {
        console.error('[WinSpeech] Process crashed with code:', code)
        this.emit('error', `Speech process crashed (code ${code}). This may be a Windows compatibility issue.`)
      }
      this.stopRequested = false

      if (wasListening) {
        this.emit('end')
      }
    })

    this.process.on('error', (err) => {
      console.error('[WinSpeech] Process spawn error:', err)
      this.emit('error', `Failed to start speech: ${err.message}`)
    })
  }

  public stop(): void {
    if (!this.process) {
      console.log('[WinSpeech] Not running')
      // Still emit end event to ensure UI state is correct
      if (this.isListening) {
        this.isListening = false
        this.emit('end')
      }
      return
    }

    console.log('[WinSpeech] Stopping recognition...')
    this.stopRequested = true
    const processToStop = this.process
    const wasListening = this.isListening
    this.process = null
    this.isListening = false
    this.stdoutBuffer = ''

    // Kill the process immediately
    try {
      processToStop.kill()
    } catch (err) {
      console.warn('[WinSpeech] Error killing process:', err)
    }

    if (wasListening) {
      // Emit end immediately so renderer UI updates promptly.
      this.emit('end')
    }
  }

  public getIsListening(): boolean {
    return this.isListening
  }

  public dispose(): void {
    this.stop()
    this.removeAllListeners()
  }

  /**
   * Test microphone and speech recognition setup
   * Returns detailed diagnostic info
   */
  public async test(): Promise<MicTestResult> {
    console.log('[WinSpeech] Running microphone test...')

    return new Promise((resolve) => {
      let finished = false
      const resolveOnce = (result: MicTestResult) => {
        if (finished) return
        finished = true
        resolve(result)
      }

      const psScript = `
$ErrorActionPreference = "Stop"
$results = @{
    systemSpeechAvailable = $false
    microphoneAvailable = $false
    recognitionWorking = $false
}

try {
    Add-Type -AssemblyName System.Speech
    $results.systemSpeechAvailable = $true
    Write-Host "INFO:System.Speech assembly loaded"
} catch {
    Write-Host "ERROR:System.Speech not available: $_"
    $results | ConvertTo-Json -Compress
    exit 1
}

try {
    $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    Write-Host "INFO:Speech recognition engine created"
} catch {
    Write-Host "ERROR:Cannot create recognition engine: $_"
    $results | ConvertTo-Json -Compress
    exit 1
}

try {
    $recognizer.SetInputToDefaultAudioDevice()
    $results.microphoneAvailable = $true
    Write-Host "INFO:Microphone detected and accessible"
} catch {
    Write-Host "ERROR:No microphone found: $_"
    $recognizer.Dispose()
    $results | ConvertTo-Json -Compress
    exit 1
}

try {
    $dictationGrammar = New-Object System.Speech.Recognition.DictationGrammar
    $recognizer.LoadGrammar($dictationGrammar)
    $results.recognitionWorking = $true
    Write-Host "INFO:Speech recognition is ready"
} catch {
    Write-Host "ERROR:Cannot initialize recognition: $_"
    $recognizer.Dispose()
    $results | ConvertTo-Json -Compress
    exit 1
}

$recognizer.Dispose()
Write-Host "SUCCESS"
$results | ConvertTo-Json -Compress
`

      const testProcess = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-Command', psScript
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })

      let stdout = ''
      let stderr = ''
      let succeeded = false

      testProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString()
        stdout += output

        // Log info messages
        const lines = output.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('INFO:')) {
            console.log('[WinSpeech Test]', trimmed.substring(5))
          } else if (trimmed.startsWith('ERROR:')) {
            console.error('[WinSpeech Test]', trimmed.substring(6))
          } else if (trimmed === 'SUCCESS') {
            succeeded = true
          }
        }
      })

      testProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      testProcess.on('close', (code) => {
        clearTimeout(timeoutId)
        console.log('[WinSpeech] Test process exited with code:', code)

        if (succeeded) {
          // Try to parse the JSON result
          try {
            const jsonMatch = stdout.match(/\{[^}]+\}/)
            if (jsonMatch) {
              const details = JSON.parse(jsonMatch[0])
              resolveOnce({
                success: true,
                details
              })
              return
            }
          } catch (e) {
            // Ignore parse error
          }

          resolveOnce({
            success: true,
            details: {
              systemSpeechAvailable: true,
              microphoneAvailable: true,
              recognitionWorking: true
            }
          })
        } else {
          // Extract error message
          const errorMatch = stdout.match(/ERROR:(.+)/)
          const errorMsg = errorMatch ? errorMatch[1].trim() : (stderr || 'Unknown error')

          resolveOnce({
            success: false,
            error: errorMsg
          })
        }
      })

      testProcess.on('error', (err) => {
        clearTimeout(timeoutId)
        console.error('[WinSpeech] Test process error:', err)
        resolveOnce({
          success: false,
          error: `Failed to run test: ${err.message}`
        })
      })

      // Timeout after 10 seconds
      const timeoutId = setTimeout(() => {
        if (finished) return
        testProcess.kill()
        resolveOnce({
          success: false,
          error: 'Test timed out after 10 seconds'
        })
      }, 10000)
    })
  }
}

// Singleton instance
let instance: WindowsSpeechRecognition | null = null

export function getWindowsSpeech(): WindowsSpeechRecognition {
  if (!instance) {
    instance = new WindowsSpeechRecognition()
  }
  return instance
}
