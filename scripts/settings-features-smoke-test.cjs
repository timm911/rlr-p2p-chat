/**
 * Single-instance smoke test for the v2.17 settings features:
 *
 *   1. Custom statuses — Settings → Statuses: add a status (emoji picked via
 *      the full emoji picker + typed label) → it appears in the
 *      StatusDropdown and can be selected (header button shows label+emoji);
 *      duplicate labels are rejected; delete removes it from both the
 *      Settings list and the dropdown.
 *
 *   2. Multiple saved custom notification sounds — the OS file picker can't
 *      be driven by Playwright, so the notification-sound list functions are
 *      exercised via window.evaluate (window.__rlrNotifSoundTest hook):
 *      addCustomSound / listCustomSounds / selection / removeCustomSound with
 *      fallback to 'classic', plus the legacy single-custom migration
 *      (rlrchat-notif-custom-path → list entry with id 'custom') across a
 *      reload. The Settings panel must render the saved custom rows (with
 *      ▶ preview and ✕ delete) and fall the ✓ back to "Classic beep" when
 *      the selected custom is deleted via the UI.
 *
 * Prereq: `npm run build`
 * Run:    node scripts/settings-features-smoke-test.cjs
 */
const { _electron: electron } = require('playwright')
const path = require('path')
const fs = require('fs')
const os = require('os')

const ROOT = path.resolve(__dirname, '..')
const MAIN = path.join(ROOT, 'dist-electron', 'main', 'index.js')
const PORT = 18097
const PASSWORD = 'smoke-test-password'
const CHIME = path.join(ROOT, 'sounds', 'chime.wav')
const DING = path.join(ROOT, 'sounds', 'ding.wav')

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exitCode = 1
  throw new Error(msg)
}

async function launchInstance(name) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `rlrchat-settings-smoke-${name}-`))
  const app = await electron.launch({
    args: [MAIN, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    env: { ...process.env, RLR_USER_DATA: userData },
    cwd: ROOT
  })
  const page = await app.firstWindow()
  return { name, app, page, userData }
}

async function openSettings(page) {
  await page.click('button[aria-label="Open settings menu"]')
  await page.waitForSelector('.settings-menu', { timeout: 5000 })
}

async function closeSettings(page) {
  await page.click('button[aria-label="Close settings"]')
  await page.waitForSelector('.settings-menu', { state: 'detached', timeout: 5000 })
}

async function main() {
  if (!fs.existsSync(MAIN)) fail(`Build output missing (${MAIN}) — run \`npm run build\` first`)
  if (!fs.existsSync(CHIME)) fail(`Bundled sound missing (${CHIME})`)

  console.log('Launching Ripster (listener)...')
  const ripster = await launchInstance('ripster')
  console.log('Launching RLRJupiter (connector)...')
  const jupiter = await launchInstance('jupiter')

  try {
    // The listener only enters the chat window once a client connects, so
    // connect the pair and drive all the new-feature UI on jupiter.
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
    console.log('PASS: both instances connected')

    const page = jupiter.page

    // Mute both so the default "Talk to me" status can't kick off TTS/auto-mic
    await page.click('button[aria-label="Mute speech and sounds"]')
    await ripster.page.click('button[aria-label="Mute speech and sounds"]')

    // ================= 1) Custom statuses =================
    await openSettings(page)
    await page.click('button[aria-label="Custom status settings"]')

    // Pick an emoji through the full emoji picker
    await page.click('button[aria-label="Choose status emoji"]')
    await page.waitForSelector('.emoji-picker-panel', { timeout: 5000 })
    await page.click('button[aria-label="Emoji 🚗"]')
    await page.waitForSelector('.emoji-picker-panel', { state: 'detached', timeout: 5000 })
    const emojiBtn = await page.locator('button[aria-label="Choose status emoji"]').textContent()
    if (emojiBtn.trim() !== '🚗') fail(`emoji button did not take the picked emoji (got "${emojiBtn}")`)

    await page.fill('input[aria-label="New custom status label"]', 'Mowing')
    await page.click('button[aria-label="Add custom status"]')
    await page.waitForSelector('.custom-status-row:has-text("Mowing")', { timeout: 5000 })
    const rowText = await page.locator('.custom-status-row:has-text("Mowing")').textContent()
    if (!rowText.includes('🚗')) fail(`status row missing its emoji (got "${rowText}")`)
    console.log('PASS: added custom status "🚗 Mowing" via Settings (emoji via picker)')

    // Duplicate labels are rejected (preset and existing custom)
    for (const dup of ['Mowing', 'talk to me', 'Bed']) {
      await page.fill('input[aria-label="New custom status label"]', dup)
      await page.click('button[aria-label="Add custom status"]')
      await page.waitForSelector('.tts-info:has-text("That status already exists.")', { timeout: 5000 })
    }
    if ((await page.locator('.custom-status-row').count()) !== 1) {
      fail('duplicate/preset-colliding labels were added to the list')
    }
    console.log('PASS: duplicate and preset-colliding labels are rejected')

    await closeSettings(page)

    // The saved status shows in the dropdown and is selectable
    await page.click('.status-btn')
    await page.waitForSelector('.status-menu', { timeout: 5000 })
    const option = page.locator('button[aria-label="Set status to Mowing"]')
    if (!(await option.count())) fail('custom status missing from the StatusDropdown')
    const optText = await option.textContent()
    if (!optText.includes('🚗')) fail(`dropdown option missing its emoji (got "${optText}")`)
    await option.click()
    await page.waitForSelector('.status-menu', { state: 'detached', timeout: 5000 })
    const headerBtn = await page.locator('.status-btn').textContent()
    if (!headerBtn.includes('Mowing') || !headerBtn.includes('🚗')) {
      fail(`header does not show the selected custom status with emoji (got "${headerBtn}")`)
    }
    await page.waitForSelector('.system-message:has-text("You changed status to Mowing")', { timeout: 5000 })
    // The plain label string round-trips to the peer like any status
    await ripster.page.waitForSelector('.system-message:has-text("changed status to Mowing")', { timeout: 10000 })
    console.log('PASS: custom status selectable from the dropdown; header shows "🚗 Mowing"; peer got it')

    // Delete it in Settings → gone from the dropdown (live, no remount needed)
    await openSettings(page)
    await page.click('button[aria-label="Custom status settings"]')
    await page.click('button[aria-label="Delete status Mowing"]')
    if (await page.locator('.custom-status-row').count()) fail('status row still present after delete')
    await closeSettings(page)
    await page.click('.status-btn')
    await page.waitForSelector('.status-menu', { timeout: 5000 })
    if (await page.locator('button[aria-label="Set status to Mowing"]').count()) {
      fail('deleted custom status still in the dropdown')
    }
    // Presets are intact
    for (const preset of ['Talk to me', 'Listen only', 'BRB', 'Bed', 'Dinner', 'TV', 'Away', 'Company']) {
      if (!(await page.locator(`button[aria-label="Set status to ${preset}"]`).count())) {
        fail(`preset status "${preset}" missing from the dropdown`)
      }
    }
    await page.keyboard.press('Escape')
    console.log('PASS: deleted custom status is gone from the dropdown; all 8 presets intact')

    // ================= 2) Custom notification sounds =================
    // 2a) List functions via the test hook (file picker can't be automated)
    const r1 = await page.evaluate(async ({ chime, ding }) => {
      const t = window.__rlrNotifSoundTest
      const id1 = t.addCustomSound(chime)
      const id2 = t.addCustomSound(ding)
      const again = t.addCustomSound(chime) // same path → same id, no dupe
      const list = t.listCustomSounds()
      t.setSelectedSound(id2)
      const selected = t.getSelectedSound()
      await t.playSelectedNotification() // must not throw
      t.removeCustomSound(id2) // deleting the SELECTED one → fallback
      return {
        id1, id2, again,
        names: list.map(s => s.name),
        count: list.length,
        selected,
        afterRemoveSelected: t.getSelectedSound(),
        afterRemoveList: t.listCustomSounds().map(s => s.name)
      }
    }, { chime: CHIME, ding: DING })

    if (r1.count !== 2) fail(`expected 2 saved customs, got ${r1.count}`)
    if (r1.again !== r1.id1) fail('re-adding the same path created a duplicate entry')
    if (!r1.names.includes('chime.wav') || !r1.names.includes('ding.wav')) {
      fail(`custom names wrong (got ${JSON.stringify(r1.names)})`)
    }
    if (r1.selected !== r1.id2) fail('selecting a custom by id did not stick')
    if (r1.afterRemoveSelected !== 'classic') {
      fail(`deleting the selected custom did not fall back to classic (got "${r1.afterRemoveSelected}")`)
    }
    if (r1.afterRemoveList.length !== 1 || r1.afterRemoveList[0] !== 'chime.wav') {
      fail(`list wrong after remove (got ${JSON.stringify(r1.afterRemoveList)})`)
    }
    console.log('PASS: addCustomSound/listCustomSounds/removeCustomSound + classic fallback work')

    // A missing custom file: selection resolves nothing, playback must not throw
    // (falls back to the classic beep internally)
    await page.evaluate(async () => {
      const t = window.__rlrNotifSoundTest
      const id = t.addCustomSound('C:\\definitely\\missing\\nope.wav')
      t.setSelectedSound(id)
      await t.playSelectedNotification() // graceful fallback, no throw
      await t.previewSound(id) // silent no-op, no throw
      t.removeCustomSound(id)
      t.setSelectedSound('classic')
    })
    console.log('PASS: missing custom file plays back gracefully (no throw)')

    // 2b) Settings list renders multiple custom rows with ▶ and ✕
    await page.evaluate(({ ding }) => { window.__rlrNotifSoundTest.addCustomSound(ding) }, { ding: DING })
    await openSettings(page)
    await page.click('button[aria-label="Notification sound settings"]')
    await page.waitForSelector('.notif-sound-list', { timeout: 5000 })
    const customRows = page.locator('.notif-sound-row.custom')
    if ((await customRows.count()) !== 2) {
      fail(`expected 2 custom rows in Settings, got ${await customRows.count()}`)
    }
    if (!(await page.locator('button[aria-label="Preview chime.wav"]').count())) fail('custom row missing ▶ preview')
    if (!(await page.locator('button[aria-label="Delete chime.wav"]').count())) fail('custom row missing ✕ delete')
    if (!(await page.locator('.notif-sound-pick:has-text("Add custom… (browse)")').count())) {
      fail('"Add custom… (browse)" action missing')
    }
    console.log('PASS: Settings renders 2 saved custom rows with ▶/✕ and the Add custom action')

    // Select a custom via the UI, then delete it via ✕ → ✓ falls back to Classic
    await page.locator('.notif-sound-row.custom .notif-sound-pick', { hasText: 'chime.wav' }).click()
    let selRow = await page.locator('.notif-sound-row.selected').textContent()
    if (!selRow.includes('chime.wav')) fail(`selecting a custom row did not mark it (got "${selRow}")`)
    await page.click('button[aria-label="Delete chime.wav"]')
    if ((await customRows.count()) !== 1) fail('custom row not removed from Settings after ✕')
    selRow = await page.locator('.notif-sound-row.selected').textContent()
    if (!selRow.includes('Classic beep')) {
      fail(`deleting the selected custom did not move ✓ to Classic beep (got "${selRow}")`)
    }
    console.log('PASS: deleting the selected custom in Settings falls the ✓ back to Classic beep')
    await closeSettings(page)

    // 2c) Legacy single-custom migration across a reload
    await page.evaluate(({ chime }) => {
      localStorage.removeItem('rlrchat-notif-custom-sounds')
      localStorage.setItem('rlrchat-notif-custom-path', chime)
      localStorage.setItem('rlrchat-notif-sound', 'custom') // old selection id
    }, { chime: CHIME })
    await page.reload()
    await page.waitForSelector('.app-container', { timeout: 15000 })
    const r2 = await page.evaluate(() => {
      const t = window.__rlrNotifSoundTest
      const list = t.listCustomSounds() // triggers the migration
      return {
        list,
        selected: t.getSelectedSound(),
        legacyKeyGone: localStorage.getItem('rlrchat-notif-custom-path') === null
      }
    })
    if (r2.list.length !== 1 || r2.list[0].id !== 'custom' || r2.list[0].name !== 'chime.wav') {
      fail(`legacy migration wrong (got ${JSON.stringify(r2.list)})`)
    }
    if (r2.selected !== 'custom') fail('legacy selection id "custom" was not preserved')
    if (!r2.legacyKeyGone) fail('legacy rlrchat-notif-custom-path key was not removed')
    console.log('PASS: legacy single custom migrated into the list (id "custom" kept selected)')

    console.log('\nSETTINGS FEATURES SMOKE TEST PASSED')
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
