/**
 * Auto-update via electron-updater (GitHub Releases feed).
 *
 * On launch (and every 6h) the app checks the public repo's latest release.
 * A newer version downloads in the background (differential — only changed
 * blocks, so updates are small even though the full installer is large), then
 * the app relaunches into it. User settings survive (they live in userData,
 * untouched by the installer) and the app auto-reconnects on relaunch.
 *
 * Status is pushed to the renderer via `update:status`, and the renderer can
 * trigger a manual check (`update:check`) and read the current version
 * (`update:get-version`) from the Settings "Software update" section.
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours

let mainWin: BrowserWindow | null = null

function send(status: string, info?: any): void {
  try {
    mainWin?.webContents.send('update:status', { status, info })
  } catch (_) {}
}

export function setupAutoUpdater(win: BrowserWindow): void {
  mainWin = win

  // Current version + manual check are available even in dev (dev just reports
  // it can't update), so the Settings UI always works.
  ipcMain.handle('update:get-version', async () => app.getVersion())
  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) {
      send('dev')
      return { ok: false, reason: 'dev' }
    }
    try {
      send('checking')
      const r = await autoUpdater.checkForUpdates()
      return { ok: true, version: r?.updateInfo?.version }
    } catch (err: any) {
      send('error', { message: err?.message || String(err) })
      return { ok: false, reason: err?.message }
    }
  })

  if (!app.isPackaged) {
    console.log('[Updater] Auto-check skipped (not packaged)')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => { console.log('[Updater] checking'); send('checking') })
  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] available:', info.version)
    send('available', { version: info.version })
  })
  autoUpdater.on('update-not-available', () => { console.log('[Updater] up to date'); send('none') })
  autoUpdater.on('download-progress', (p) => send('downloading', { percent: Math.round(p.percent) }))
  autoUpdater.on('error', (err) => {
    console.error('[Updater] error:', err?.message)
    send('error', { message: err?.message })
  })
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] downloaded:', info.version, '— restarting shortly')
    send('downloaded', { version: info.version })
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
      send('error', { message: err?.message })
    })
  }

  setTimeout(check, 8000)
  setInterval(check, CHECK_INTERVAL_MS)
}
