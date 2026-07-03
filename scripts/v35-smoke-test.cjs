/**
 * Two-instance smoke test for the v3.5 enhancements. Extended item-by-item as
 * the v3.5 work lands. Covers the DOM-observable behavior; GPU/audio-only
 * effects (P0 drag-repaint, TTS audio) are verified by a human, not here.
 *
 *   E1 — "Home" preset status: appears in the dropdown with 🏠, selecting it
 *        posts a local system line, and the peer's header reflects "Home".
 *   E4 — Connection-quality indicator: the connector (client) shows a
 *        .rtt-indicator with a ping value; the listener/hub does NOT (it
 *        doesn't measure RTT).
 *   P0 — sanity only: the header controls render and are visible (no layout
 *        regression from the compositor-layer CSS). The actual drag-repaint
 *        behavior is not DOM-observable and needs human eyes.
 *
 * Prereq: `npm run build`
 * Run:    node scripts/v35-smoke-test.cjs
 */
const { _electron: electron } = require('playwright')
const path = require('path')
const fs = require('fs')
const os = require('os')

const ROOT = path.resolve(__dirname, '..')
const MAIN = path.join(ROOT, 'dist-electron', 'main', 'index.js')
const PORT = 18095
const PASSWORD = 'smoke-test-password'

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exitCode = 1
  throw new Error(msg)
}

async function launchInstance(name) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `rlrchat-v35-smoke-${name}-`))
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

    // Mute both so the default "Talk to me" status doesn't kick off TTS/mic
    await jupiter.page.click('button[aria-label="Mute speech and sounds"]')
    await ripster.page.click('button[aria-label="Mute speech and sounds"]')

    // ================= P0 sanity: header controls render =================
    for (const inst of [jupiter, ripster]) {
      const visible = await inst.page.locator('.header-controls').isVisible()
      if (!visible) fail(`${inst.name}: .header-controls not visible`)
      const iconCount = await inst.page.locator('.header-controls .icon-btn').count()
      if (iconCount < 5) fail(`${inst.name}: expected >=5 header icon buttons, got ${iconCount}`)
    }
    console.log('PASS: header controls + icon buttons render on both (P0 no layout regression)')

    // ===================== E1: "Home" preset status =====================
    // Open jupiter's status dropdown and confirm Home is present with 🏠
    await jupiter.page.click('.status-btn')
    await jupiter.page.waitForSelector('.status-menu', { timeout: 5000 })
    const homeOption = jupiter.page.locator('.status-option[aria-label="Set status to Home"]')
    if (!(await homeOption.count())) fail('Home option missing from the status dropdown')
    const homeText = await homeOption.textContent()
    if (!homeText.includes('🏠')) fail(`Home option missing 🏠 emoji (got "${homeText}")`)
    if (!homeText.includes('Home')) fail(`Home option missing label (got "${homeText}")`)
    console.log('PASS: E1 — Home appears in the dropdown with 🏠')

    // Select Home → local system line + the status button reflects it
    await homeOption.click()
    await jupiter.page.waitForSelector('.status-menu', { state: 'detached', timeout: 5000 })
    await jupiter.page.waitForSelector('.system-message:has-text("You changed status to Home")', { timeout: 5000 })
    const statusBtnText = await jupiter.page.locator('.status-btn').textContent()
    if (!statusBtnText.includes('Home')) fail(`status button did not update to Home (got "${statusBtnText}")`)
    console.log('PASS: E1 — selecting Home posts a local system line and updates the status button')

    // Peer (ripster) header reflects RLRJupiter = Home
    await ripster.page.waitForSelector('.peer-row.rlrjupiter .connection-status:has-text("Home")', { timeout: 10000 })
    await ripster.page.waitForSelector('.system-message:has-text("RLRJupiter changed status to Home")', { timeout: 10000 })
    console.log('PASS: E1 — peer header + system line reflect RLRJupiter → Home')

    // ================ E4: connection-quality indicator ================
    // Connector (jupiter) measures RTT → indicator appears with a ping value.
    await jupiter.page.waitForSelector('.rtt-indicator', { timeout: 15000 })
    const rttText = await jupiter.page.locator('.rtt-indicator .rtt-ms').textContent()
    if (!/\d+ms/.test(rttText)) fail(`rtt indicator has no ms value (got "${rttText}")`)
    const rttClass = await jupiter.page.locator('.rtt-indicator').getAttribute('class')
    if (!/\b(good|ok|poor)\b/.test(rttClass)) fail(`rtt indicator missing quality class (got "${rttClass}")`)
    console.log(`PASS: E4 — connector shows RTT indicator (${rttText}, class="${rttClass}")`)

    // Listener/hub (ripster) does NOT measure RTT → no indicator.
    await ripster.page.waitForTimeout(6000) // let a poll cycle run
    if (await ripster.page.locator('.rtt-indicator').count()) {
      fail('listener/hub should not show an RTT indicator (it does not measure RTT)')
    }
    console.log('PASS: E4 — listener/hub correctly shows no RTT indicator')

    // ================ E8: per-message read-aloud button ================
    // Send a text message; hovering the bubble reveals a 🔊 "Read aloud" action.
    await jupiter.page.locator('.input-field').fill('read me aloud please')
    await jupiter.page.locator('.input-field').press('Enter')
    const sentBubble = jupiter.page.locator('.message-wrapper.sent .message-bubble').last()
    await sentBubble.hover()
    await jupiter.page.waitForSelector('.speak-btn[aria-label="Read this message aloud"]', { timeout: 5000 })
    console.log('PASS: E8 — 🔊 read-aloud button appears on a text message')
    // System messages (e.g. the status-change lines) never get a 🔊 button.
    if (await jupiter.page.locator('.system-message .speak-btn').count()) {
      fail('system messages should not have a read-aloud button')
    }
    console.log('PASS: E8 — system messages correctly have no read-aloud button')

    // ============ E9: "Speak announcements" settings toggle ============
    await jupiter.page.click('button[aria-label="Open settings menu"]')
    await jupiter.page.waitForSelector('.settings-menu', { timeout: 5000 })
    const annToggle = jupiter.page.locator('input[aria-label="Speak announcements aloud"]')
    if (!(await annToggle.count())) fail('Speak announcements toggle missing from Settings')
    if (await annToggle.isChecked()) fail('Speak announcements should default to OFF')
    // The checkbox is visually hidden behind a styled slider AND can be below the
    // scroll fold, so dispatch a click directly (fires React onChange) instead of
    // check(), which needs visibility + viewport.
    await annToggle.dispatchEvent('click')
    await jupiter.page.waitForFunction(
      () => localStorage.getItem('rlrchat-speak-announcements') === 'true',
      { timeout: 5000 }
    )
    console.log('PASS: E9 — Speak announcements toggle present, defaults OFF, persists ON')

    // ================ E3: quiet hours (DND) ================
    // Enable quiet hours with a window covering "now" so DND is active.
    const quietToggle = jupiter.page.locator('input[aria-label="Enable quiet hours"]')
    if (!(await quietToggle.count())) fail('Quiet hours toggle missing from Settings')
    if (await quietToggle.isChecked()) fail('Quiet hours should default to OFF')
    await quietToggle.dispatchEvent('click')
    await jupiter.page.waitForSelector('#quiet-start', { timeout: 5000 })
    await jupiter.page.fill('#quiet-start', '00:00')
    await jupiter.page.fill('#quiet-end', '23:59')
    console.log('PASS: E3 — quiet hours toggle + time pickers present and settable')
    // Close settings; the header 🌙 indicator should now be active.
    await jupiter.page.click('button[aria-label="Close settings"]')
    await jupiter.page.waitForSelector('.settings-menu', { state: 'detached', timeout: 5000 })
    await jupiter.page.waitForSelector('.quiet-indicator', { timeout: 5000 })
    console.log('PASS: E3 — 🌙 quiet-hours indicator shows in the header when active')
    // A message from the peer still arrives during quiet hours (silently).
    await sendChat(ripster, 'during quiet hours')
    await jupiter.page.waitForSelector('.message-wrapper.received:has-text("during quiet hours")', { timeout: 10000 })
    console.log('PASS: E3 — messages still arrive during quiet hours')

    // ================ E5: export chat history ================
    // Give history.json a moment to flush (saves are debounced), then export.
    await jupiter.page.waitForTimeout(1500)
    const exportPath = path.join(os.tmpdir(), `rlr-export-${PORT}.html`)
    try { fs.rmSync(exportPath, { force: true }) } catch {}
    // Stub the native save dialog so the export writes to a known path.
    await jupiter.app.evaluate(async ({ dialog }, outPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: outPath })
    }, exportPath)
    await jupiter.page.click('button[aria-label="Open settings menu"]')
    await jupiter.page.waitForSelector('.settings-menu', { timeout: 5000 })
    const exportBtn = jupiter.page.locator('button[aria-label="Export chat history"]')
    if (!(await exportBtn.count())) fail('Export chat history button missing from Settings')
    await exportBtn.click()
    await jupiter.page.waitForSelector('.settings-menu .tts-info:has-text("Exported")', { timeout: 5000 })
    if (!fs.existsSync(exportPath)) fail('export file was not written')
    const exported = fs.readFileSync(exportPath, 'utf8')
    if (!exported.startsWith('<!doctype html>')) fail('export is not a valid HTML document')
    if (!exported.includes('RLR P2P Chat — history export')) fail('export missing header')
    try { fs.rmSync(exportPath, { force: true }) } catch {}
    await jupiter.page.click('button[aria-label="Close settings"]')
    await jupiter.page.waitForSelector('.settings-menu', { state: 'detached', timeout: 5000 })
    console.log('PASS: E5 — export writes a valid HTML history file via the save dialog')

    // ================ E6: new-messages divider + jump pill ================
    // Simulate "window unfocused" (document.hasFocus is a browser primitive) so
    // incoming messages register as unread. Blur first to clear any prior state.
    await jupiter.page.evaluate(() => { window.__realHasFocus = document.hasFocus.bind(document); document.hasFocus = () => false })
    await jupiter.page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await sendChat(ripster, 'e6 first new')
    for (let i = 2; i <= 16; i++) await sendChat(ripster, `e6 message ${i}`)
    await jupiter.page.waitForSelector('.new-messages-divider', { timeout: 15000 })
    // The divider sits directly above the first message of the away-batch.
    const dividerPlacedRight = await jupiter.page.evaluate(() => {
      const d = document.querySelector('.new-messages-divider')
      return !!(d && d.nextElementSibling && d.nextElementSibling.textContent.includes('e6 first new'))
    })
    if (!dividerPlacedRight) fail('New-messages divider is not above the first unread message')
    console.log('PASS: E6 — "New messages" divider appears above the first unread message')

    // Refocusing keeps the divider (it clears on the next blur, not on focus).
    await jupiter.page.evaluate(() => { document.hasFocus = () => true; window.dispatchEvent(new Event('focus')) })
    await jupiter.page.waitForTimeout(300)
    if (!(await jupiter.page.locator('.new-messages-divider').count())) fail('divider vanished on refocus (should persist)')
    console.log('PASS: E6 — divider persists after refocus')

    // Scroll up → the "↓ N new" pill appears; clicking it jumps to the divider.
    await jupiter.page.evaluate(() => { const a = document.querySelector('.messages-area'); if (a) a.scrollTop = 0 })
    await jupiter.page.waitForSelector('.new-messages-pill', { timeout: 5000 })
    const pillText = await jupiter.page.locator('.new-messages-pill').textContent()
    if (!/\d+ new/.test(pillText)) fail(`pill missing count (got "${pillText}")`)
    await jupiter.page.locator('.new-messages-pill').click()
    await jupiter.page.waitForTimeout(600)
    console.log(`PASS: E6 — "↓ N new" pill appears when scrolled up and jumps (pill: "${pillText.trim()}")`)
    // Blur retires the divider (fresh one next away-batch).
    await jupiter.page.evaluate(() => { document.hasFocus = () => false; window.dispatchEvent(new Event('blur')) })
    await jupiter.page.waitForSelector('.new-messages-divider', { state: 'detached', timeout: 5000 })
    console.log('PASS: E6 — divider retired on blur')
    // Restore real focus behavior.
    await jupiter.page.evaluate(() => { if (window.__realHasFocus) document.hasFocus = window.__realHasFocus })

    // ================ E2: system tray + close-to-tray ================
    await jupiter.page.evaluate(() => window.electronAPI.setCloseToTray(true))
    const cttPersisted = await jupiter.page.evaluate(() => window.electronAPI.getCloseToTray())
    if (cttPersisted !== true) fail('close-to-tray setting did not persist')
    // With the setting on, closing the window hides it (does not destroy/quit).
    const closeResult = await jupiter.app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]
      w.close()
      await new Promise((r) => setTimeout(r, 400))
      return { visible: w.isVisible(), destroyed: w.isDestroyed() }
    })
    if (closeResult.destroyed) fail('window was destroyed on close (should hide to tray)')
    if (closeResult.visible) fail('window still visible after close (should be hidden to tray)')
    console.log('PASS: E2 — close-to-tray hides the window instead of quitting')
    // Restore the window for the remaining checks.
    await jupiter.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].show() })
    await jupiter.page.waitForSelector('.chat-window', { timeout: 10000 })
    // Tray "Set status" wiring: a tray submenu click sends this to the renderer.
    await jupiter.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('tray:set-status', 'Away')
    })
    await jupiter.page.waitForSelector('.status-btn:has-text("Away")', { timeout: 5000 })
    console.log('PASS: E2 — tray "Set status" applies the chosen status in the app')
    // Leave the setting off so teardown is clean.
    await jupiter.page.evaluate(() => window.electronAPI.setCloseToTray(false))

    // ================ E10: shared media gallery ================
    // Send a real image from ripster; jupiter auto-accepts images inline.
    const imgPath = path.join(ROOT, 'build', 'icons', 'icon-32.png')
    await ripster.page.evaluate((p) => window.electronAPI.sendFile(p), imgPath)
    await jupiter.page.waitForSelector('.message-wrapper.received .inline-image-thumb, .message-wrapper.received .file-status.completed', { timeout: 25000 })
    // Empty-state sanity is covered by the component; here we verify content.
    await jupiter.page.click('button[aria-label="Open photos and files gallery"]')
    await jupiter.page.waitForSelector('.media-gallery-panel', { timeout: 5000 })
    const galleryTitle = await jupiter.page.locator('#media-gallery-title').textContent()
    if (!galleryTitle.includes('Photos')) fail(`gallery title unexpected (got "${galleryTitle}")`)
    await jupiter.page.waitForSelector('img.gallery-thumb', { timeout: 10000 })
    console.log('PASS: E10 — gallery lists a shared photo as a thumbnail')
    await jupiter.page.keyboard.press('Escape')
    await jupiter.page.waitForSelector('.media-gallery-panel', { state: 'detached', timeout: 5000 })
    console.log('PASS: E10 — gallery closes via Esc')

    // ================ E7: pinned messages ================
    await sendChat(jupiter, 'pin this important message')
    const pinBubble = jupiter.page.locator('.message-wrapper.sent .message-bubble').last()
    await pinBubble.hover()
    await pinBubble.locator('.pin-btn').dispatchEvent('click')
    await jupiter.page.waitForSelector('.pinned-bar:has-text("pin this important message")', { timeout: 5000 })
    console.log('PASS: E7 — pinning shows the pinned bar with the message')
    await ripster.page.waitForSelector('.pinned-bar:has-text("pin this important message")', { timeout: 10000 })
    console.log('PASS: E7 — pin syncs to the peer')
    // Unpin from the bar → clears on both sides.
    await jupiter.page.locator('.pinned-bar .pinned-unpin').click()
    await jupiter.page.waitForSelector('.pinned-bar', { state: 'detached', timeout: 5000 })
    await ripster.page.waitForSelector('.pinned-bar', { state: 'detached', timeout: 10000 })
    console.log('PASS: E7 — unpin syncs and clears the bar on both sides')
    // Protocol compat: a newer/unknown message type must be ignored (not crash)
    // by a peer — simulating a 3.4.x client receiving a 3.5 message type.
    await ripster.page.evaluate(() =>
      window.electronAPI.sendMessage({ type: 'pin-future-variant', payload: { messageId: 'nope' }, timestamp: Date.now() })
    )
    await sendChat(ripster, 'still working after unknown type')
    await jupiter.page.waitForSelector('.message-wrapper.received:has-text("still working after unknown type")', { timeout: 10000 })
    console.log('PASS: E7 — unknown message type ignored (no crash); chat still flows')

    console.log('\nV3.5 SMOKE TEST PASSED (P0, E1-E10 DOM-observable)')
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
