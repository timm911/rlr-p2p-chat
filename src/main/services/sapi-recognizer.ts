import { app } from 'electron'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { EventEmitter } from 'events'
import { mkdtempSync, writeFileSync, existsSync, unlinkSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

export type SpeechRecognizerState = 'idle' | 'starting' | 'listening' | 'stopping' | 'error'

export interface SpeechRecognizerConfig {
  enabled: boolean
  language?: string
  minConfidence: number
}

interface SpeechRecognizerEventBase {
  type: string
}

interface SpeechRecognizerReadyEvent extends SpeechRecognizerEventBase {
  type: 'ready'
}

interface SpeechRecognizerStateEvent extends SpeechRecognizerEventBase {
  type: 'state'
  state: SpeechRecognizerState | 'ready'
}

interface SpeechRecognizerResultEvent extends SpeechRecognizerEventBase {
  type: 'result'
  text: string
  confidence: number
  audioStart?: number
  audioEnd?: number
}

interface SpeechRecognizerPartialEvent extends SpeechRecognizerEventBase {
  type: 'partial'
  text: string
  confidence?: number
}

interface SpeechRecognizerErrorEvent extends SpeechRecognizerEventBase {
  type: 'error'
  message: string
}

interface SpeechRecognizerStoppedEvent extends SpeechRecognizerEventBase {
  type: 'stopped'
}

type SpeechRecognizerEvent =
  | SpeechRecognizerReadyEvent
  | SpeechRecognizerStateEvent
  | SpeechRecognizerResultEvent
  | SpeechRecognizerPartialEvent
  | SpeechRecognizerErrorEvent
  | SpeechRecognizerStoppedEvent

const POWERSHELL_SCRIPT = `
param(
    [string]$Culture = ""
)

function Write-Json($obj) {
    $json = $obj | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
}

function Write-State($state) {
    Write-Json @{ type = "state"; state = $state }
}

try {
    Add-Type -AssemblyName System.Speech
} catch {
    Write-Json @{ type = "error"; message = "System.Speech assembly not available: $($_.Exception.Message)" }
    exit 1
}

try {
    if ([string]::IsNullOrWhiteSpace($Culture)) {
        $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    } else {
        $cultureInfo = New-Object System.Globalization.CultureInfo($Culture)
        $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($cultureInfo)
    }
} catch {
    Write-Json @{ type = "error"; message = "Failed to create recognition engine: $($_.Exception.Message)" }
    exit 1
}

try {
    $recognizer.SetInputToDefaultAudioDevice()
} catch {
    Write-Json @{ type = "error"; message = "Unable to access default audio device: $($_.Exception.Message)" }
    exit 1
}

try {
    $dictationGrammar = New-Object System.Speech.Recognition.DictationGrammar
    $recognizer.LoadGrammar($dictationGrammar)
} catch {
    Write-Json @{ type = "error"; message = "Failed to load dictation grammar: $($_.Exception.Message)" }
    exit 1
}

$script:Recognizing = $false

Register-ObjectEvent -InputObject $recognizer -EventName SpeechRecognized -Action {
    param($sender, $eventArgs)
    try {
        $result = @{
            type = "result"
            text = $eventArgs.Result.Text
            confidence = [Math]::Round($eventArgs.Result.Confidence, 4)
        }

        if ($eventArgs.Result.Audio -ne $null) {
            $result.audioStart = [Math]::Round($eventArgs.Result.Audio.StartTime.TotalSeconds, 3)
            $result.audioEnd = [Math]::Round($eventArgs.Result.Audio.EndTime.TotalSeconds, 3)
        }

        Write-Json $result
    } catch {
        Write-Json @{ type = "error"; message = "SpeechRecognized handler failed: $($_.Exception.Message)" }
    }
} | Out-Null

Register-ObjectEvent -InputObject $recognizer -EventName SpeechHypothesized -Action {
    param($sender, $eventArgs)
    try {
        $partial = @{
            type = "partial"
            text = $eventArgs.Result.Text
            confidence = [Math]::Round($eventArgs.Result.Confidence, 4)
        }
        Write-Json $partial
    } catch {
        Write-Json @{ type = "error"; message = "SpeechHypothesized handler failed: $($_.Exception.Message)" }
    }
} | Out-Null

Register-ObjectEvent -InputObject $recognizer -EventName SpeechRecognitionRejected -Action {
    param($sender, $eventArgs)
    try {
        $alternates = @()
        if ($eventArgs.Result -and $eventArgs.Result.Alternates) {
            $alternates = $eventArgs.Result.Alternates | ForEach-Object { $_.Text }
        }
        Write-Json @{ type = "rejected"; alternates = $alternates }
    } catch {
        Write-Json @{ type = "error"; message = "SpeechRecognitionRejected handler failed: $($_.Exception.Message)" }
    }
} | Out-Null

Register-ObjectEvent -InputObject $recognizer -EventName RecognizeCompleted -Action {
    $script:Recognizing = $false
    Write-State "idle"
} | Out-Null

Write-Json @{ type = "ready" }
Write-State "idle"

while (($line = [Console]::In.ReadLine()) -ne $null) {
    $command = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($command)) {
        continue
    }

    $lower = $command.ToLowerInvariant()

    switch ($lower) {
        'start' {
            if (-not $script:Recognizing) {
                try {
                    $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
                    $script:Recognizing = $true
                    Write-State "listening"
                } catch {
                    Write-Json @{ type = "error"; message = "Failed to start recognition: $($_.Exception.Message)" }
                }
            }
        }
        'stop' {
            if ($script:Recognizing) {
                try {
                    $recognizer.RecognizeAsyncCancel()
                } catch {
                    Write-Json @{ type = "error"; message = "Failed to stop recognition: $($_.Exception.Message)" }
                }
            } else {
                Write-State "idle"
            }
        }
        'exit' {
            break
        }
        default {
            Write-Json @{ type = "error"; message = "Unknown command: $command" }
        }
    }
}

try {
    if ($script:Recognizing) {
        $recognizer.RecognizeAsyncCancel()
    }
} catch {
    # Ignore cleanup errors
}

$recognizer.Dispose()
Write-Json @{ type = "stopped" }
`

interface TempScriptInfo {
  scriptPath: string
  directory: string
}

function createTempScript(): TempScriptInfo {
  const baseDir = app ? app.getPath('userData') : tmpdir()
  const tempDirectory = mkdtempSync(join(baseDir, 'sapi-recognizer-'))
  const scriptPath = join(tempDirectory, 'sapi-recognizer.ps1')
  writeFileSync(scriptPath, `\uFEFF${POWERSHELL_SCRIPT}`, 'utf8')
  return { scriptPath, directory: tempDirectory }
}

export class SapiRecognizerService extends EventEmitter {
  private config: SpeechRecognizerConfig = {
    enabled: true,
    minConfidence: 0.4
  }

  private state: SpeechRecognizerState = 'idle'
  private process: ChildProcessWithoutNullStreams | null = null
  private stdoutBuffer = ''
  private tempScriptPath: string | null = null
  private tempDir: string | null = null
  private stopTimeout: NodeJS.Timeout | null = null

  constructor() {
    super()

    app.on('before-quit', () => {
      this.dispose()
    })
  }

  public configure(config: Partial<SpeechRecognizerConfig>): void {
    this.config = { ...this.config, ...config }
    this.emit('config-changed', this.getConfig())
  }

  public getConfig(): SpeechRecognizerConfig {
    return { ...this.config }
  }

  public getState(): SpeechRecognizerState {
    return this.state
  }

  public isEnabled(): boolean {
    return this.config.enabled
  }

  public async startListening(): Promise<void> {
    if (!this.config.enabled) {
      throw new Error('Speech recognition is disabled')
    }

    if (!this.process) {
      await this.spawnProcess()
    }

    if (!this.process) {
      throw new Error('Speech recognizer process not available')
    }

    if (this.stopTimeout) {
      clearTimeout(this.stopTimeout)
      this.stopTimeout = null
    }

    this.setState('starting')
    this.process.stdin.write('start\r\n')
  }

  public async stopListening(): Promise<void> {
    if (!this.process) {
      return
    }

    this.setState('stopping')
    this.process.stdin.write('stop\r\n')

    // Guard against the process hanging after stop
    this.stopTimeout = setTimeout(() => {
      if (this.process) {
        this.process.kill()
      }
    }, 4000)
  }

  public async shutdown(): Promise<void> {
    if (!this.process) {
      return
    }

    try {
      this.process.stdin.write('exit\r\n')
    } catch (error) {
      // ignore
    }

    this.process.kill()
    this.process = null
    this.setState('idle')
  }

  private async spawnProcess(): Promise<void> {
    if (this.process) {
      return
    }

    if (!this.tempScriptPath || !existsSync(this.tempScriptPath)) {
      const tempScript = createTempScript()
      this.tempScriptPath = tempScript.scriptPath
      this.tempDir = tempScript.directory
    }

    const args = [
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      this.tempScriptPath as string
    ]

    if (this.config.language && this.config.language.trim().length > 0) {
      args.push('-Culture', this.config.language.trim())
    }

    const child = spawn('powershell.exe', args, {
      windowsHide: true
    })

    this.process = child

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      this.handleStdout(chunk)
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (data: string) => {
      const message = data.toString().trim()
      if (message.length > 0) {
        this.emit('error', message)
        this.setState('error')
      }
    })

    child.on('error', (error) => {
      this.emit('error', error.message)
      this.setState('error')
    })

    child.on('close', () => {
      this.process = null
      this.setState('idle')
    })
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk

    const lines = this.stdoutBuffer.split(/\r?\n/)
    this.stdoutBuffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }

      try {
        const payload = JSON.parse(trimmed) as SpeechRecognizerEvent
        this.handleEvent(payload)
      } catch (error) {
        this.emit('error', `Failed to parse recognizer output: ${trimmed}`)
      }
    }
  }

  private handleEvent(event: SpeechRecognizerEvent): void {
    switch (event.type) {
      case 'ready':
        this.emit('ready')
        break
      case 'state':
        if (event.state === 'listening') {
          this.setState('listening')
        } else if (event.state === 'idle') {
          this.setState('idle')
        }
        this.emit('state', event.state)
        break
      case 'result': {
        const confidence = event.confidence ?? 0
        if (confidence >= this.config.minConfidence) {
          this.emit('result', event)
        } else {
          this.emit('low-confidence', event)
        }
        break
      }
      case 'partial':
        this.emit('partial', event)
        break
      case 'error':
        this.emit('error', event.message)
        this.setState('error')
        break
      case 'stopped':
        this.setState('idle')
        this.emit('stopped')
        break
      default:
        this.emit('info', event)
        break
    }
  }

  private setState(newState: SpeechRecognizerState): void {
    if (this.state === newState) {
      return
    }
    const oldState = this.state
    this.state = newState
    this.emit('state-changed', { oldState, newState })
  }

  public dispose(): void {
    if (this.process) {
      try {
        this.process.stdin.write('exit\r\n')
      } catch (error) {
        // ignore
      }
      this.process.kill()
      this.process = null
    }

    if (this.tempScriptPath && existsSync(this.tempScriptPath)) {
      try {
        unlinkSync(this.tempScriptPath)
      } catch (error) {
        // ignore cleanup errors
      }
    }

    if (this.tempDir) {
      try {
        rmSync(this.tempDir, { recursive: true, force: true })
      } catch (error) {
        // ignore cleanup errors
      }
    }
  }
}

let recognizerInstance: SapiRecognizerService | null = null

export function getSapiRecognizerService(): SapiRecognizerService {
  if (!recognizerInstance) {
    recognizerInstance = new SapiRecognizerService()
  }
  return recognizerInstance
}

