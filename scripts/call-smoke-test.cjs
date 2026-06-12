/**
 * Two-instance voice-call smoke test.
 *
 * Launches two packaged-build instances (Ripster listens on 127.0.0.1,
 * RLRJupiter connects), starts a call from RLRJupiter, accepts it on
 * Ripster, verifies call-audio frames flow in BOTH directions, then hangs
 * up and verifies both sides return to idle.
 *
 * Prereq: `npm run build` (drives dist-electron/main/index.js + out/renderer).
 * Run:    node scripts/call-smoke-test.cjs
 *
 * Uses Chromium's fake media device flags so getUserMedia returns synthetic
 * audio without a real microphone, and RLR_USER_DATA (see src/main/index.ts)
 * so the two instances don't fight over one userData dir.
 */
const { _electron: electron } = require('playwright')
const path = require('path')
const fs = require('fs')
const os = require('os')

const ROOT = path.resolve(__dirname, '..')
const MAIN = path.join(ROOT, 'dist-electron', 'main', 'index.js')
const PORT = 18092
const PASSWORD = 'smoke-test-password'

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exitCode = 1
  throw new Error(msg)
}

async function launchInstance(name) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `rlrchat-smoke-${name}-`))
  const app = await electron.launch({
    args: [MAIN, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    env: { ...process.env, RLR_USER_DATA: userData },
    cwd: ROOT
  })
  const page = await app.firstWindow()
  page.on('console', (m) => {
    const text = m.text()
    if (/\[Call\]/.test(text)) console.log(`  [${name} console] ${text}`)
  })
  return { name, app, page, userData }
}

async function callStats(page) {
  return page.evaluate(() => {
    const hook = window.__rlrVoiceCall
    return hook ? { state: hook.getState(), ...hook.getStats() } : null
  })
}

async function waitForCallState(inst, expected, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = await callStats(inst.page)
    if (last && last.state === expected) return last
    await inst.page.waitForTimeout(200)
  }
  fail(`${inst.name}: expected call state '${expected}', got ${JSON.stringify(last)}`)
}

async function main() {
  if (!fs.existsSync(MAIN)) fail(`Build output missing (${MAIN}) — run \`npm run build\` first`)

  console.log('Launching Ripster (listener)...')
  const ripster = await launchInstance('ripster')
  console.log('Launching RLRJupiter (connector)...')
  const jupiter = await launchInstance('jupiter')

  try {
    // --- Ripster: identity → listen ---
    await ripster.page.click('.user-card:has-text("Ripster")')
    await ripster.page.fill('#port-input', String(PORT))
    await ripster.page.fill('#password-input', PASSWORD)
    await ripster.page.click('button:has-text("Start Listening")')

    // --- RLRJupiter: identity → connect ---
    await jupiter.page.click('.user-card:has-text("RLRJupiter")')
    await jupiter.page.fill('#host-input', '127.0.0.1')
    await jupiter.page.fill('#port-input', String(PORT))
    await jupiter.page.fill('#password-input', PASSWORD)
    await jupiter.page.click('button:has-text("Connect")')

    // Both reach the chat screen with a live connection
    await jupiter.page.waitForSelector('.chat-window', { timeout: 30000 })
    await ripster.page.waitForSelector('.chat-window', { timeout: 30000 })
    await jupiter.page.waitForSelector('.status-dot.connected', { timeout: 30000 })
    await ripster.page.waitForSelector('.status-dot.connected', { timeout: 30000 })
    console.log('PASS: both instances connected (encrypted P2P channel up)')

    // --- Caller starts a call ---
    await jupiter.page.click('button[aria-label="Start voice call"]')
    await jupiter.page.waitForSelector('.call-bar:has-text("Calling")', { timeout: 10000 })
    console.log('PASS: caller shows "Calling…" bar')

    // --- Callee sees the incoming modal and accepts ---
    await ripster.page.waitForSelector('.incoming-call-dialog', { timeout: 10000 })
    console.log('PASS: callee shows incoming-call modal')
    await ripster.page.click('.incoming-call-dialog .btn-accept')

    // --- Both sides reach in-call ---
    await jupiter.page.waitForSelector('.call-bar.in-call', { timeout: 15000 })
    await ripster.page.waitForSelector('.call-bar.in-call', { timeout: 15000 })
    await waitForCallState(jupiter, 'in-call')
    await waitForCallState(ripster, 'in-call')
    console.log('PASS: both sides in-call')

    // --- Let audio flow for a few seconds, then assert both directions ---
    await jupiter.page.waitForTimeout(4000)
    const jStats = await callStats(jupiter.page)
    const rStats = await callStats(ripster.page)
    console.log(`  RLRJupiter frames: sent=${jStats.framesSent} received=${jStats.framesReceived}`)
    console.log(`  Ripster    frames: sent=${rStats.framesSent} received=${rStats.framesReceived}`)
    if (!(jStats.framesSent > 0 && jStats.framesReceived > 0)) {
      fail('RLRJupiter did not exchange call-audio frames in both directions')
    }
    if (!(rStats.framesSent > 0 && rStats.framesReceived > 0)) {
      fail('Ripster did not exchange call-audio frames in both directions')
    }
    console.log('PASS: call-audio frames exchanged in BOTH directions')

    // --- Mic mute actually stops sending ---
    await jupiter.page.click('button[aria-label="Mute microphone"]')
    await jupiter.page.waitForTimeout(500) // drain frames already in flight
    const mutedStart = await callStats(jupiter.page)
    await jupiter.page.waitForTimeout(1500)
    const mutedEnd = await callStats(jupiter.page)
    if (mutedEnd.framesSent !== mutedStart.framesSent) {
      fail(`mic mute did not stop outgoing frames (${mutedStart.framesSent} → ${mutedEnd.framesSent})`)
    }
    console.log('PASS: mic mute stops outgoing frames')
    await jupiter.page.click('button[aria-label="Unmute microphone"]')

    // --- Hang up returns both sides to idle ---
    await jupiter.page.click('button[aria-label="Hang up call"]')
    await waitForCallState(jupiter, 'idle')
    await waitForCallState(ripster, 'idle')
    await jupiter.page.waitForSelector('.call-bar', { state: 'detached', timeout: 5000 })
    await ripster.page.waitForSelector('.call-bar', { state: 'detached', timeout: 5000 })
    console.log('PASS: hang up returned both sides to idle')

    // --- Chat history got the system messages ---
    const jHasStart = await jupiter.page.locator('text=📞 Call started').count()
    const jHasEnd = await jupiter.page.locator('text=Call ended').count()
    if (jHasStart < 1 || jHasEnd < 1) fail('caller chat missing call system messages')
    console.log('PASS: call start/end system messages in chat history')

    console.log('\nSMOKE TEST PASSED')
  } finally {
    await jupiter.app.close().catch(() => {})
    await ripster.app.close().catch(() => {})
    for (const dir of [jupiter.userData, ripster.userData]) {
      try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
