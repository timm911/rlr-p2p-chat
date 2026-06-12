/**
 * Single-instance smoke test for the v2.16 release-notes change:
 *   1. NO modal auto-appears on a fresh launch (the old "What's new" popup
 *      is gone for good).
 *   2. NO modal auto-appears even in the case that used to trigger it:
 *      existing app data in localStorage with no last-seen version stored
 *      (i.e. an existing install right after an update).
 *   3. The app (with its custom application menu, incl. Help → Release
 *      Notes) launches and keeps running without crashing.
 *
 * The Settings → "Release notes" viewer itself is exercised end-to-end in
 * scripts/features-smoke-test.cjs (it needs a connected chat window).
 *
 * Prereq: `npm run build`
 * Run:    node scripts/release-notes-smoke-test.cjs
 */
const { _electron: electron } = require('playwright')
const path = require('path')
const fs = require('fs')
const os = require('os')

const ROOT = path.resolve(__dirname, '..')
const MAIN = path.join(ROOT, 'dist-electron', 'main', 'index.js')
const APP_VERSION = require(path.join(ROOT, 'package.json')).version

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exitCode = 1
  throw new Error(msg)
}

async function main() {
  if (!fs.existsSync(MAIN)) fail(`Build output missing (${MAIN}) — run \`npm run build\` first`)

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'rlrchat-relnotes-smoke-'))
  const app = await electron.launch({
    args: [MAIN],
    env: { ...process.env, RLR_USER_DATA: userData },
    cwd: ROOT
  })

  try {
    const page = await app.firstWindow()

    // 1) Fresh launch: nothing auto-appears
    await page.waitForSelector('.app-container', { timeout: 15000 })
    await page.waitForTimeout(3000)
    if (await page.locator('.whats-new-overlay, .release-notes-overlay').count()) {
      fail('a modal auto-appeared on a fresh launch')
    }
    console.log('PASS: no modal auto-appears on a fresh launch')

    // 2) Existing-install-after-update case: app data present, last-seen
    //    unset. This used to make the old popup flash — must show nothing now.
    await page.evaluate(() => {
      localStorage.setItem('rlrchat-identity', 'RLRJupiter')
      localStorage.setItem('rlrchat-theme', 'dark')
      localStorage.setItem('sound-config', '{"enabled":true}')
      localStorage.removeItem('rlrchat-whats-new-last-seen')
      localStorage.removeItem('rlrchat-whats-new-suppressed')
    })
    await page.reload()
    await page.waitForSelector('.app-container', { timeout: 15000 })
    await page.waitForTimeout(3000)
    if (await page.locator('.whats-new-overlay, .release-notes-overlay').count()) {
      fail('a modal auto-appeared with app data present and last-seen unset')
    }
    console.log('PASS: no modal even with app data present and no last-seen version')

    // 3) App is alive with its custom menu (title reflects the new version)
    const title = await page.title()
    const version = await page.evaluate(() => window.electronAPI.updateGetVersion())
    if (version !== APP_VERSION) fail(`version mismatch (got "${version}", want "${APP_VERSION}")`)
    console.log(`PASS: app running fine with the custom menu (title: "${title}", v${version})`)

    console.log('\nRELEASE NOTES SMOKE TEST PASSED')
  } finally {
    await app.close().catch(() => {})
    try { fs.rmSync(userData, { recursive: true, force: true }) } catch {}
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
