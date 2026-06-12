/**
 * Two-instance messaging-features smoke test.
 *
 * Verifies the four messaging features end-to-end over the real encrypted
 * TCP channel:
 *   1. Reply/quote — a reply round-trips and the quote renders on the peer
 *   2. Read receipts — peer focus flips the sender's message to "Seen"
 *   3. Nudge — shakes the peer window (class asserted) + system messages
 *   4. Offline queue — message queued (⏳) while disconnected is delivered
 *      automatically on reconnect
 *
 * Prereq: `npm run build`
 * Run:    node scripts/messaging-smoke-test.cjs
 */
const { _electron: electron } = require('playwright')
const path = require('path')
const fs = require('fs')
const os = require('os')

const ROOT = path.resolve(__dirname, '..')
const MAIN = path.join(ROOT, 'dist-electron', 'main', 'index.js')
const PORT = 18093
const PASSWORD = 'smoke-test-password'

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exitCode = 1
  throw new Error(msg)
}

async function launchInstance(name) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `rlrchat-msg-smoke-${name}-`))
  const app = await electron.launch({
    args: [MAIN, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    env: { ...process.env, RLR_USER_DATA: userData },
    cwd: ROOT
  })
  const page = await app.firstWindow()
  return { name, app, page, userData }
}

async function sendChat(inst, text) {
  const input = inst.page.locator('.input-field')
  await input.fill(text)
  await input.press('Enter')
}

async function main() {
  if (!fs.existsSync(MAIN)) fail(`Build output missing (${MAIN}) — run \`npm run build\` first`)

  console.log('Launching Ripster (listener)...')
  const ripster = await launchInstance('ripster')
  console.log('Launching RLRJupiter (connector)...')
  const jupiter = await launchInstance('jupiter')

  try {
    // --- Connect the two instances ---
    await ripster.page.click('.user-card:has-text("Ripster")')
    await ripster.page.fill('#port-input', String(PORT))
    await ripster.page.fill('#password-input', PASSWORD)
    await ripster.page.click('button:has-text("Start Listening")')

    await jupiter.page.click('.user-card:has-text("RLRJupiter")')
    await jupiter.page.fill('#host-input', '127.0.0.1')
    await jupiter.page.fill('#port-input', String(PORT))
    await jupiter.page.fill('#password-input', PASSWORD)
    await jupiter.page.click('button:has-text("Connect")')

    await jupiter.page.waitForSelector('.chat-window', { timeout: 30000 })
    await ripster.page.waitForSelector('.chat-window', { timeout: 30000 })
    await jupiter.page.waitForSelector('.status-dot.connected', { timeout: 30000 })
    await ripster.page.waitForSelector('.status-dot.connected', { timeout: 30000 })
    console.log('PASS: both instances connected')

    // Mute both sides so default "Talk to me" status doesn't kick off
    // TTS/auto-mic voice flows during the test
    await jupiter.page.click('button[aria-label="Mute speech and sounds"]')
    await ripster.page.click('button[aria-label="Mute speech and sounds"]')

    // ============ 1) Reply / quote round-trip ============
    await sendChat(jupiter, 'hello from jupiter')
    await ripster.page.waitForSelector('.message-wrapper.received:has-text("hello from jupiter")', { timeout: 10000 })

    // Hover the received bubble → reply button in the hover toolbar.
    // (dispatchEvent avoids races with the bubble's hover lift animation
    // and the auto-scroll that follows new messages)
    const openReplyOnRipster = async () => {
      await ripster.page.waitForTimeout(400) // let auto-scroll settle
      const b = ripster.page.locator('.message-wrapper.received .message-bubble').first()
      await b.hover()
      await ripster.page.locator('button[aria-label="Reply to this message"]').dispatchEvent('click')
    }
    await openReplyOnRipster()
    const replyBar = ripster.page.locator('.reply-bar')
    if (!(await replyBar.isVisible())) fail('reply bar did not appear above the input')
    const barText = await replyBar.textContent()
    if (!barText.includes('Replying to RLRJupiter') || !barText.includes('hello from jupiter')) {
      fail(`reply bar missing label/snippet (got: ${barText})`)
    }
    console.log('PASS: "Replying to …" bar shows quoted snippet + cancel')

    await sendChat(ripster, 'reply from ripster')
    // Reply bar clears after sending
    await ripster.page.waitForSelector('.reply-bar', { state: 'detached', timeout: 5000 })

    // Quote renders on BOTH sides; assert on the original sender (jupiter)
    await jupiter.page.waitForSelector('.message-wrapper.received .reply-quote', { timeout: 10000 })
    const quote = await jupiter.page.locator('.message-wrapper.received .reply-quote').last().textContent()
    if (!quote.includes('RLRJupiter') || !quote.includes('hello from jupiter')) {
      fail(`quote on peer missing original sender/snippet (got: ${quote})`)
    }
    console.log('PASS: reply round-tripped — quote renders above the reply on the peer')

    // Cancel button works
    await openReplyOnRipster()
    await ripster.page.click('button[aria-label="Cancel reply"]')
    if (await ripster.page.locator('.reply-bar').count()) fail('cancel ✕ did not dismiss the reply bar')
    console.log('PASS: reply cancel ✕ dismisses the bar')

    // ============ 2) Read receipts ("Seen") ============
    await sendChat(jupiter, 'seen test message')
    await ripster.page.waitForSelector('.message-wrapper.received:has-text("seen test message")', { timeout: 10000 })
    // Simulate the receiver's window gaining focus (only one OS window can be
    // truly focused when two instances run side-by-side)
    await ripster.page.evaluate(() => window.dispatchEvent(new Event('focus')))

    await jupiter.page.waitForSelector('.seen-label:has-text("Seen")', { timeout: 10000 })
    const seenCount = await jupiter.page.locator('.seen-label').count()
    if (seenCount !== 1) fail(`expected exactly one "Seen" label, got ${seenCount}`)
    console.log('PASS: read receipt flipped the sender\'s latest message to "Seen" (single label)')

    // ============ 3) Nudge ============
    const shakePromise = ripster.page.waitForSelector('.chat-window.nudge-shake', { timeout: 5000 })
    await jupiter.page.click('button[aria-label="Nudge Ripster"]')
    await shakePromise
    console.log('PASS: nudge applied the shake class on the receiver')

    await jupiter.page.waitForSelector('.system-message:has-text("You nudged Ripster")', { timeout: 5000 })
    await ripster.page.waitForSelector('.system-message:has-text("RLRJupiter nudged you! 👋")', { timeout: 5000 })
    console.log('PASS: nudge system messages on both sides')

    // Throttle: a second immediate nudge is swallowed
    await jupiter.page.click('button[aria-label="Nudge Ripster"]')
    await jupiter.page.waitForTimeout(600)
    const nudgeCount = await jupiter.page.locator('.system-message:has-text("You nudged Ripster")').count()
    if (nudgeCount !== 1) fail(`nudge throttle failed (${nudgeCount} "You nudged" messages)`)
    console.log('PASS: nudge throttled (~3s)')

    // ============ 4) Offline queue ============
    await jupiter.page.evaluate(() => window.electronAPI.stopClient())
    await jupiter.page.waitForSelector('.status-dot.disconnected', { timeout: 10000 })
    console.log('  jupiter disconnected')

    await sendChat(jupiter, 'queued while offline')
    // Text shows immediately with the ⏳ queued indicator
    const queuedBubble = jupiter.page.locator('.message-wrapper.sent:has-text("queued while offline")')
    await queuedBubble.waitFor({ timeout: 5000 })
    const queuedStatus = await queuedBubble.locator('.delivery-status').textContent()
    if (!queuedStatus.includes('⏳')) fail(`queued message did not show ⏳ (got: "${queuedStatus}")`)
    console.log('PASS: offline message shows immediately with queued ⏳ state')

    // Reconnect → queue auto-flushes
    await jupiter.page.evaluate(
      ([host, port, password]) => window.electronAPI.startClient(host, port, password),
      ['127.0.0.1', PORT, PASSWORD]
    )
    await jupiter.page.waitForSelector('.status-dot.connected', { timeout: 15000 })

    await ripster.page.waitForSelector('.message-wrapper.received:has-text("queued while offline")', { timeout: 10000 })
    console.log('PASS: queued message auto-delivered to peer on reconnect')

    // Sender's copy left the queued state (delivered ✓✓ via chat-ack)
    await jupiter.page.waitForFunction(() => {
      const wrappers = Array.from(document.querySelectorAll('.message-wrapper.sent'))
      const w = wrappers.find((el) => el.textContent.includes('queued while offline'))
      const s = w && w.querySelector('.delivery-status')
      return s && !s.textContent.includes('⏳') && s.textContent.includes('✓✓')
    }, { timeout: 10000 })
    console.log('PASS: queued message flipped to delivered ✓✓ after flush')

    console.log('\nMESSAGING SMOKE TEST PASSED')
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
