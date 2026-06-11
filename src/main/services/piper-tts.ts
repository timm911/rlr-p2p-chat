/**
 * Piper neural TTS (offline). Spawns the bundled piper.exe to synthesize a
 * WAV from text, then plays it with the Windows SoundPlayer. Fully local — no
 * network, matching the app's privacy model.
 *
 * Voices are .onnx + .onnx.json pairs in the `voices/` folder (bundled, and a
 * user-writable copy in userData so people can drop in their own). The folder
 * is scanned on demand so newly added voices appear after a restart.
 */
import { app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'

export interface PiperVoice {
  id: string // e.g. "piper:en_GB-alan-medium"
  label: string // e.g. "Alan — British (neural)"
  modelPath: string
}

const PIPER_PREFIX = 'piper:'

/** Friendly label from a canonical Piper file name like en_GB-alan-medium. */
function friendlyLabel(baseName: string): string {
  const m = baseName.match(/^([a-z]{2})_([A-Z]{2})-(.+?)-(x_low|low|medium|high)$/)
  if (!m) return baseName
  const [, , region, rawName] = m
  const regionMap: Record<string, string> = {
    GB: 'British', US: 'American', AU: 'Australian', CA: 'Canadian', IN: 'Indian'
  }
  const name = rawName
    .split('_')
    .map((w) => (w.toLowerCase() === 'hfc' ? 'HFC' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
  const region2 = regionMap[region] || region
  return `${name} — ${region2} (neural)`
}

class PiperTTS {
  private currentSynth: ChildProcess | null = null
  private currentPlayback: ChildProcess | null = null
  private voicesCache: PiperVoice[] | null = null

  /**
   * Base dir holding the bundled `piper-engine/` and `voices/` folders.
   * Packaged: process.resourcesPath. Dev: project root — getAppPath() returns
   * dist-electron/main in dev, so go up two levels.
   */
  private bundleBase(): string {
    return app.isPackaged
      ? process.resourcesPath
      : path.join(app.getAppPath(), '..', '..')
  }

  /** Directory of the bundled piper.exe + DLLs. */
  private engineDir(): string {
    return path.join(this.bundleBase(), 'piper-engine')
  }

  private piperExe(): string {
    return path.join(this.engineDir(), 'piper.exe')
  }

  /** Folders scanned for voices: bundled (read-only) + user drop-in. */
  private voiceDirs(): string[] {
    const bundled = path.join(this.bundleBase(), 'voices')
    const userDir = path.join(app.getPath('userData'), 'voices')
    return [bundled, userDir]
  }

  /** True if the engine is present and at least one voice exists. */
  isAvailable(): boolean {
    try {
      return fs.existsSync(this.piperExe()) && this.listVoices().length > 0
    } catch (_) {
      return false
    }
  }

  /** Scan voice folders for .onnx files that have a matching .onnx.json. */
  listVoices(): PiperVoice[] {
    if (this.voicesCache) return this.voicesCache
    const found: PiperVoice[] = []
    const seen = new Set<string>()
    for (const dir of this.voiceDirs()) {
      let entries: string[] = []
      try {
        if (!fs.existsSync(dir)) continue
        entries = fs.readdirSync(dir)
      } catch (_) {
        continue
      }
      for (const file of entries) {
        if (!file.endsWith('.onnx')) continue
        const base = file.slice(0, -'.onnx'.length)
        if (seen.has(base)) continue
        const modelPath = path.join(dir, file)
        const configPath = modelPath + '.json'
        if (!fs.existsSync(configPath)) continue // need both files
        seen.add(base)
        found.push({ id: `${PIPER_PREFIX}${base}`, label: friendlyLabel(base), modelPath })
      }
    }
    this.voicesCache = found
    return found
  }

  /** Clear the scan cache (e.g. after a user adds a voice file). */
  refreshVoices(): void {
    this.voicesCache = null
  }

  static isPiperVoiceId(id: string | null | undefined): boolean {
    return typeof id === 'string' && id.startsWith(PIPER_PREFIX)
  }

  private voiceById(id: string): PiperVoice | undefined {
    return this.listVoices().find((v) => v.id === id)
  }

  /**
   * Synthesize `text` with the given Piper voice id and play it. Resolves when
   * playback finishes (so the caller's TTS queue timing stays correct).
   */
  speak(text: string, voiceId: string, speed: number = 1.0): Promise<void> {
    return new Promise((resolve, reject) => {
      const voice = this.voiceById(voiceId)
      if (!voice) {
        return reject(new Error(`Piper voice not found: ${voiceId}`))
      }

      this.stop() // cancel anything in flight

      const wavPath = path.join(os.tmpdir(), `rlrchat-piper-${Date.now()}.wav`)
      // length_scale > 1 = slower; map our speed (1 = normal) to inverse
      const lengthScale = speed > 0 ? (1 / speed).toFixed(3) : '1'

      const synth = spawn(this.piperExe(), [
        '--model', voice.modelPath,
        '--output_file', wavPath,
        '--length_scale', String(lengthScale)
      ], { cwd: this.engineDir(), windowsHide: true })
      this.currentSynth = synth

      let stderr = ''
      synth.stderr.on('data', (d) => { stderr += d.toString() })
      synth.on('error', (err) => {
        this.currentSynth = null
        reject(err)
      })
      synth.on('close', (code) => {
        this.currentSynth = null
        if (code !== 0 || !fs.existsSync(wavPath)) {
          return reject(new Error(`Piper synthesis failed (code ${code}): ${stderr.slice(-200)}`))
        }
        this.playWav(wavPath).then(resolve).catch(reject).finally(() => {
          fs.promises.unlink(wavPath).catch(() => {})
        })
      })

      // Feed the text on stdin and close it so piper starts synthesizing
      synth.stdin.write(text)
      synth.stdin.end()
    })
  }

  /** Play a WAV synchronously via PowerShell SoundPlayer; resolves when done. */
  private playWav(wavPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ps = spawn('powershell.exe', [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
        `$p = New-Object System.Media.SoundPlayer '${wavPath.replace(/'/g, "''")}'; $p.PlaySync();`
      ], { windowsHide: true })
      this.currentPlayback = ps
      ps.on('error', (err) => {
        this.currentPlayback = null
        reject(err)
      })
      ps.on('close', () => {
        this.currentPlayback = null
        resolve()
      })
    })
  }

  /** Stop any in-flight synthesis and playback. */
  stop(): void {
    if (this.currentSynth) {
      try { this.currentSynth.kill() } catch (_) {}
      this.currentSynth = null
    }
    if (this.currentPlayback) {
      try { this.currentPlayback.kill() } catch (_) {}
      this.currentPlayback = null
    }
  }
}

let instance: PiperTTS | null = null

export function getPiperTTS(): PiperTTS {
  if (!instance) instance = new PiperTTS()
  return instance
}

export { PiperTTS }
