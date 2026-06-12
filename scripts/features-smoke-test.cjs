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
 *   3. Release notes viewer — nothing EVER auto-appears on launch (the old
 *      "What's new" popup is gone, even with app data present and no
 *      last-seen version stored). Settings → "Release notes" opens a panel
 *      listing the FULL version history (current 2.16.0 down to 2.0.0).
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

    // No modal ever auto-appears on launch (the old "What's new" popup is gone)
    if (await jupiter.page.locator('.whats-new-overlay, .release-notes-overlay').count()) {
      fail('a modal auto-appeared on a fresh launch')
    }
    console.log('PASS: no auto modal on a fresh launch')

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

    // ============ 3) Release notes viewer (no auto popup) ============
    // The old "What's new" auto-popup is gone. Even the case that used to
    // trigger it (app data present, no last-seen version stored — i.e. an
    // existing install right after an update) must show NOTHING on launch.
    await jupiter.page.evaluate(() => {
      localStorage.removeItem('rlrchat-whats-new-last-seen')
      localStorage.removeItem('rlrchat-whats-new-suppressed')
    })
    await jupiter.page.reload()
    await jupiter.page.waitForSelector('.app-container', { timeout: 15000 })
    await jupiter.page.waitForTimeout(2500)
    if (await jupiter.page.locator('.whats-new-overlay, .release-notes-overlay').count()) {
      fail('a modal auto-appeared after reload (app data present, last-seen unset)')
    }
    console.log('PASS: no auto popup after reload, even with app data and no last-seen version')

    // Auto-resume reconnects jupiter back into the chat window
    await jupiter.page.waitForSelector('.chat-window', { timeout: 30000 })
    await jupiter.page.waitForSelector('.status-dot.connected', { timeout: 30000 })

    // Settings → "Release notes" opens the on-demand viewer with the FULL history
    await jupiter.page.click('button[aria-label="Open settings menu"]')
    await jupiter.page.waitForSelector('.settings-menu', { timeout: 5000 })
    await jupiter.page.click('button[aria-label="View release notes"]')
    await jupiter.page.waitForSelector('.release-notes-overlay', { timeout: 5000 })
    const notes = await jupiter.page.locator('.release-notes-panel').textContent()
    if (!notes.includes(`Current version: v${APP_VERSION}`)) {
      fail(`release notes missing current version line (got: "${notes.slice(0, 200)}…")`)
    }
    for (const v of [`v${APP_VERSION}`, 'v2.15.0', 'v2.9.0', 'v2.0.0']) {
      if (!notes.includes(v)) fail(`release notes missing version "${v}"`)
    }
    for (const item of ['Release notes viewer', 'Voice calls', 'AES-256']) {
      if (!notes.includes(item)) fail(`release notes missing item "${item}"`)
    }
    console.log(`PASS: Settings → Release notes lists the full history (v${APP_VERSION} … v2.0.0)`)

    // Close button dismisses the viewer (Settings stays open underneath)
    await jupiter.page.click('button[aria-label="Close release notes"]')
    await jupiter.page.waitForSelector('.release-notes-overlay', { state: 'detached', timeout: 5000 })
    if (!(await jupiter.page.locator('.settings-menu').count())) {
      fail('settings menu closed when the release notes viewer was dismissed')
    }
    console.log('PASS: closing release notes returns to the Settings menu')

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
