/**
 * Download the large binary assets that are NOT committed to git:
 *  - Piper neural TTS engine (Windows) -> piper-engine/
 *  - Piper voices (.onnx + .onnx.json) -> voices/
 *
 * Run after cloning: `node scripts/fetch-assets.cjs`
 * (The Vosk STT model in models/ is fetched separately / already present.)
 */
const fs = require('fs')
const path = require('path')
const https = require('https')
const { execSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const PIPER_ENGINE_DIR = path.join(ROOT, 'piper-engine')
const VOICES_DIR = path.join(ROOT, 'voices')

const PIPER_ZIP_URL = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip'
const VOICE_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en'
const VOICES = [
  'en_US/joe/medium/en_US-joe-medium',
  'en_GB/alan/medium/en_GB-alan-medium',
  'en_GB/northern_english_male/medium/en_GB-northern_english_male-medium',
  'en_US/ryan/medium/en_US-ryan-medium',
  'en_US/hfc_male/medium/en_US-hfc_male-medium'
]

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const get = (u) => https.get(u, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location) // follow redirect (HF/GitHub CDN)
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${u}`))
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
    }).on('error', reject)
    get(url)
  })
}

;(async () => {
  fs.mkdirSync(VOICES_DIR, { recursive: true })

  // Voices
  for (const v of VOICES) {
    const base = v.split('/').pop()
    for (const ext of ['.onnx', '.onnx.json']) {
      const dest = path.join(VOICES_DIR, base + ext)
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
        console.log('have', base + ext)
        continue
      }
      console.log('downloading', base + ext)
      await download(`${VOICE_BASE}/${v}${ext}?download=true`, dest)
    }
  }

  // Engine
  if (!fs.existsSync(path.join(PIPER_ENGINE_DIR, 'piper.exe'))) {
    const zip = path.join(ROOT, 'piper-engine.zip')
    console.log('downloading piper engine')
    await download(PIPER_ZIP_URL, zip)
    console.log('extracting piper engine')
    // The zip contains a top-level `piper/` folder; extract then move contents up
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zip}' -DestinationPath '${ROOT}' -Force"`, { stdio: 'inherit' })
    const inner = path.join(ROOT, 'piper')
    if (fs.existsSync(inner)) {
      fs.mkdirSync(PIPER_ENGINE_DIR, { recursive: true })
      for (const f of fs.readdirSync(inner)) {
        fs.renameSync(path.join(inner, f), path.join(PIPER_ENGINE_DIR, f))
      }
      fs.rmdirSync(inner)
    }
    fs.unlinkSync(zip)
  } else {
    console.log('have piper engine')
  }

  console.log('Assets ready.')
})().catch((e) => { console.error('fetch-assets failed:', e.message); process.exit(1) })
