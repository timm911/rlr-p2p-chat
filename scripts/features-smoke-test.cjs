/**
 * Two-instance smoke test for the v2.15 trio of features:
 *   1. Full emoji picker — 😊 button inserts an emoji into the input; the
 *      ➕ button on a message bubble reacts with a NON-preset emoji that
 *      round-trips to the peer.
 *   2. Scheduled messages — schedule via the 🕐 panel (preset button), the
 *      "🕐 1 scheduled" indicator + cancel work, and a due message is
 *      actually delivered to the peer. (The stored sendAt is rewound to
 *      ~now+2s via localStorage so the test doesn't wait 15 minutes; the
 *      ChatWindow timer reads storage as the source of truth.)
 *   3. "What's new" popup — appears when the stored last-seen version is
 *      older than the current version, OK dismisses it and updates
 *      last-seen, and "Don't show again" suppresses it on reload. A fresh
 *      install (no stored version) shows nothing.
 *
 * Prereq: `npm run build`
 * Run:    node scripts/features-smoke-test.cjs
 */
const { _electron: electron } = require('playwright')
const path = require('path')
const fs = require('fs')
const os = require('os')

const ROOT = path.resolve(__dirname, '..')
const MAIN = path.join(ROOT, 'dist-electron', 'main', 'index.js')
const PORT = 18094
const PASSWORD = 'smoke-test-password'
const APP_VERSION = require(path.join(ROOT, 'package.json')).version

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exitCode = 1
  throw new Error(msg)
}

async function launchInstance(name) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `rlrchat-feat-smoke-${name}-`))
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

    // Fresh install: no "What's new" modal (no stored last-seen version)
    if (await jupiter.page.locator('.whats-new-overlay').count()) {
      fail('what\'s-new modal appeared on a fresh install')
    }
    console.log('PASS: no what\'s-new modal on fresh install')

    // Mute both sides so the default "Talk to me" status doesn't start
    // TTS/auto-mic voice flows during the test
    await jupiter.page.click('button[aria-label="Mute speech and sounds"]')
    await ripster.page.click('button[aria-label="Mute speech and sounds"]')

    // ============ 1a) Emoji button inserts into the input ============
    await jupiter.page.click('button[aria-label="Insert emoji"]')
    await jupiter.page.waitForSelector('.emoji-picker-panel', { timeout: 5000 })
    await jupiter.page.click('button[aria-label="Emoji 😀"]')
    let inputValue = await jupiter.page.locator('.input-field').inputValue()
    if (!inputValue.includes('😀')) fail(`emoji not inserted into input (got: "${inputValue}")`)
    // Picker stays open for multiple inserts; insert a second one
    await jupiter.page.click('button[aria-label="Emoji 🔥"]')
    inputValue = await jupiter.page.locator('.input-field').inputValue()
    if (!inputValue.includes('😀🔥')) fail(`second emoji not inserted at cursor (got: "${inputValue}")`)
    // Escape closes the picker without nuking the input
    await jupiter.page.keyboard.press('Escape')
    await jupiter.page.waitForSelector('.emoji-picker-panel', { state: 'detached', timeout: 5000 })
    inputValue = await jupiter.page.locator('.input-field').inputValue()
    if (!inputValue.includes('😀🔥')) fail('Escape cleared the input text')
    console.log('PASS: 😊 emoji picker inserts emoji at the cursor; Escape closes it')

    // Send it so the emoji actually round-trips
    await jupiter.page.locator('.input-field').press('Enter')
    await ripster.page.waitForSelector('.message-wrapper.received:has-text("😀🔥")', { timeout: 10000 })
    console.log('PASS: emoji message delivered to peer')

    // ============ 1b) ➕ full picker reaction with a NON-preset emoji ============
    await ripster.page.waitForTimeout(400) // let auto-scroll settle
    const bubble = ripster.page.locator('.message-wrapper.received .message-bubble').last()
    await bubble.hover()
    await ripster.page.locator('button[aria-label="More reactions"]').last().dispatchEvent('click')
    await ripster.page.waitForSelector('.emoji-picker-panel', { timeout: 5000 })
    await ripster.page.click('button[aria-label="Emoji 🦄"]') // 🦄 is NOT one of the 5 presets
    await ripster.page.waitForSelector('.emoji-picker-panel', { state: 'detached', timeout: 5000 })

    // Reaction badge renders locally and on the original sender
    await ripster.page.waitForSelector('.reaction-badge:has-text("🦄")', { timeout: 5000 })
    await jupiter.page.waitForSelector('.reaction-badge:has-text("🦄")', { timeout: 10000 })
    console.log('PASS: ➕ full picker added a non-preset 🦄 reaction, round-tripped to the peer')

    // ============ 2) Scheduled messages ============
    // Schedule via the real UI (panel + preset), then rewind the stored
    // sendAt so it comes due in ~2s instead of 15 minutes.
    await jupiter.page.locator('.input-field').fill('scheduled ping')
    await jupiter.page.click('button[aria-label="Schedule message"]')
    await jupiter.page.waitForSelector('.scheduler-panel', { timeout: 5000 })
    await jupiter.page.click('.scheduler-preset-btn:has-text("In 15 min")')
    await jupiter.page.waitForSelector('.scheduler-panel', { state: 'detached', timeout: 5000 })

    inputValue = await jupiter.page.locator('.input-field').inputValue()
    if (inputValue !== '') fail('input was not cleared after scheduling')
    await jupiter.page.waitForSelector('.system-message:has-text("Message scheduled for")', { timeout: 5000 })
    await jupiter.page.waitForSelector('.scheduled-bar-toggle:has-text("1 scheduled")', { timeout: 5000 })
    console.log('PASS: scheduling via 🕐 panel cleared the input and shows "🕐 1 scheduled"')

    // The list shows the pending message; cancel works
    await jupiter.page.click('.scheduled-bar-toggle')
    await jupiter.page.waitForSelector('.scheduled-item:has-text("scheduled ping")', { timeout: 5000 })
    console.log('PASS: scheduled list shows the pending message')

    // Schedule a second one and cancel it to prove per-item cancel works
    await jupiter.page.locator('.input-field').fill('cancel me')
    await jupiter.page.click('button[aria-label="Schedule message"]')
    await jupiter.page.click('.scheduler-preset-btn:has-text("In 1 hour")')
    await jupiter.page.waitForSelector('.scheduled-bar-toggle:has-text("2 scheduled")', { timeout: 5000 })
    // (list is still expanded from the earlier toggle click)
    const cancelItem = jupiter.page.locator('.scheduled-item:has-text("cancel me")')
    await cancelItem.locator('button[aria-label="Cancel scheduled message"]').click()
    await jupiter.page.waitForSelector('.scheduled-bar-toggle:has-text("1 scheduled")', { timeout: 5000 })
    console.log('PASS: cancelling a scheduled message removes it (back to 1 scheduled)')

    // Rewind the stored sendAt to ~now+2s (the ChatWindow timer re-reads
    // localStorage every 15s, so delivery should happen within ~20s)
    await jupiter.page.evaluate(() => {
      const key = 'rlrchat-scheduled-messages'
      const list = JSON.parse(localStorage.getItem(key) || '[]')
      for (const m of list) m.sendAt = Date.now() + 2000
      localStorage.setItem(key, JSON.stringify(list))
    })
    console.log('  rewound sendAt to now+2s; waiting for the due-check timer...')
    await ripster.page.waitForSelector('.message-wrapper.received:has-text("scheduled ping")', { timeout: 30000 })
    console.log('PASS: due scheduled message was sent and arrived on the peer')

    // Indicator clears once nothing is pending
    await jupiter.page.waitForSelector('.scheduled-bar', { state: 'detached', timeout: 10000 })
    console.log('PASS: scheduled indicator cleared after sending')

    // ============ 3) "What's new" modal ============
    // Simulate an update: pretend the user last saw 2.14.0, then reload
    await jupiter.page.evaluate(() => {
      localStorage.setItem('rlrchat-whats-new-last-seen', '2.14.0')
    })
    await jupiter.page.reload()
    await jupiter.page.waitForSelector('.whats-new-overlay', { timeout: 15000 })
    const title = await jupiter.page.locator('#whats-new-title').textContent()
    if (!title.includes(`v${APP_VERSION}`)) fail(`modal title missing current version (got: "${title}")`)
    const body = await jupiter.page.locator('.whats-new-panel').textContent()
    for (const expected of ['Voice calls', 'emoji picker', 'Schedule messages', 'Read receipts']) {
      if (!body.includes(expected)) fail(`what's-new body missing "${expected}"`)
    }
    console.log(`PASS: what's-new modal appeared for v${APP_VERSION} with the 2.15.0 items`)

    // OK dismisses and updates last-seen
    await jupiter.page.click('button[aria-label="Close what\'s new"]')
    await jupiter.page.waitForSelector('.whats-new-overlay', { state: 'detached', timeout: 5000 })
    const lastSeen = await jupiter.page.evaluate(() => localStorage.getItem('rlrchat-whats-new-last-seen'))
    if (lastSeen !== APP_VERSION) fail(`OK did not update last-seen (got: "${lastSeen}")`)
    console.log('PASS: OK dismissed the modal and stored the current version as last-seen')

    // Reload with last-seen current → no modal
    await jupiter.page.reload()
    await jupiter.page.waitForSelector('.app-container', { timeout: 15000 })
    await jupiter.page.waitForTimeout(2500)
    if (await jupiter.page.locator('.whats-new-overlay').count()) {
      fail('modal reappeared even though last-seen is current')
    }
    console.log('PASS: modal does not reappear once the version has been seen')

    // "Don't show again": rewind last-seen, check the box, OK → suppressed forever
    await jupiter.page.evaluate(() => {
      localStorage.setItem('rlrchat-whats-new-last-seen', '2.14.0')
    })
    await jupiter.page.reload()
    await jupiter.page.waitForSelector('.whats-new-overlay', { timeout: 15000 })
    await jupiter.page.check('.whats-new-dont-show input')
    await jupiter.page.click('button[aria-label="Close what\'s new"]')
    await jupiter.page.waitForSelector('.whats-new-overlay', { state: 'detached', timeout: 5000 })

    await jupiter.page.evaluate(() => {
      localStorage.setItem('rlrchat-whats-new-last-seen', '2.14.0') // rewind again
    })
    await jupiter.page.reload()
    await jupiter.page.waitForSelector('.app-container', { timeout: 15000 })
    await jupiter.page.waitForTimeout(2500)
    if (await jupiter.page.locator('.whats-new-overlay').count()) {
      fail('"Don\'t show again" did not suppress the modal on reload')
    }
    console.log('PASS: "Don\'t show again" suppresses the modal even after an update')

    console.log('\nFEATURES SMOKE TEST PASSED')
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
