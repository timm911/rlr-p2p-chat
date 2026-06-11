/**
 * Auto-update via electron-updater (GitHub Releases feed).
 *
 * Flow: on launch (and every 6h) the app checks the public repo's latest
 * release. If a newer version exists it downloads it in the background, then
 * relaunches into the new version. User settings survive automatically — they
 * live in userData (localStorage, history, window-state), which the installer
 * never touches — and the app auto-reconnects on relaunch (see auto-resume in
 * the renderer).
 *
 * Renderer is kept informed via `update:status` events so it can show a small
 * "Updating…" notice before the restart.
 */
import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours

export function setupAutoUpdater(win: BrowserWindow): void {
  // The updater only works in a packaged build with a real release feed.
  if (!app.isPackaged) {
    console.log('[Updater] Skipped (not packaged)')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const send = (status: string, info?: any) => {
    try {
      win.webContents.send('update:status', { status, info })
    } catch (_) {}
  }

  autoUpdater.on('checking-for-update', () => send('checking'))
  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version)
    send('available', { version: info.version })
  })
  autoUpdater.on('update-not-available', () => send('none'))
  autoUpdater.on('download-progress', (p) => {
    send('downloading', { percent: Math.round(p.percent) })
  })
  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err?.message)
    send('error', { message: err?.message })
  })
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded:', info.version, '— restarting shortly')
    send('downloaded', { version: info.version })
    // Give the renderer a moment to show the "updating, restarting" notice,
    // then relaunch into the new version. isSilent=true (no installer UI),
    // isForceRunAfter=true (relaunch the app after install).
    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(true, true)
      } catch (err) {
        console.error('[Updater] quitAndInstall failed:', err)
      }
    }, 3500)
  })

  const check = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[Updater] check failed:', err?.message)
    })
  }

  // First check shortly after launch (let the window settle), then on interval
  setTimeout(check, 8000)
  setInterval(check, CHECK_INTERVAL_MS)
}
