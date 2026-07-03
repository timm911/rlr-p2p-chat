import { app, BrowserWindow, ipcMain, shell, globalShortcut, Menu, clipboard, Tray } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { setupIPCHandlers } from './ipc/handlers'
import { getRestoredWindowOptions, trackWindowState } from './window-state'
import { setupAutoUpdater } from './updater'
import { getTrayIcon } from './tray-icon'

// Test affordance: an alternate userData dir lets two instances run side by
// side on one machine (used by the Playwright call smoke test). Harmless in
// production where the variable is never set.
if (process.env.RLR_USER_DATA) {
  app.setPath('userData', process.env.RLR_USER_DATA)
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
// True only during a genuine quit (tray "Quit", app.quit(), auto-update
// restart). The close-to-tray handler checks it so a real quit still closes
// while the window's ✕ merely hides. Set from the 'before-quit' event, which
// every quit path fires — including the updater's quitAndInstall.
let isQuitting = false
// "Close button hides to tray" preference. Lives in the main process (the close
// handler needs it) and is persisted to app-settings.json in userData. Default
// off, so behavior is unchanged unless the user opts in.
let closeToTray = false
let trayBalloonShown = false // one-time "still running in the tray" hint

// Keep in sync with PRESET_STATUSES in src/renderer/utils/custom-statuses.ts.
const PRESET_STATUS_LABELS = ['Talk to me', 'Listen only', 'BRB', 'Bed', 'Dinner', 'TV', 'Away', 'Company', 'Home']

function getAppSettingsPath(): string {
  return join(app.getPath('userData'), 'app-settings.json')
}
function loadAppSettings(): void {
  try {
    const p = getAppSettingsPath()
    if (!existsSync(p)) return
    const s = JSON.parse(readFileSync(p, 'utf8'))
    closeToTray = !!s.closeToTray
    trayBalloonShown = !!s.trayBalloonShown
  } catch (_) {}
}
function saveAppSettings(): void {
  try {
    writeFileSync(getAppSettingsPath(), JSON.stringify({ closeToTray, trayBalloonShown }), 'utf8')
  } catch (_) {}
}

function showMainWindow(): void {
  if (!mainWindow) { createWindow(); return }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray(): void {
  if (tray) return
  try {
    tray = new Tray(getTrayIcon())
  } catch (err) {
    console.error('[Tray] Failed to create tray icon:', err)
    return
  }
  tray.setToolTip('RLR P2P Chat')
  const menu = Menu.buildFromTemplate([
    { label: 'Open RLR P2P Chat', click: showMainWindow },
    { type: 'separator' },
    {
      label: 'Set status',
      submenu: PRESET_STATUS_LABELS.map((label) => ({
        label,
        click: () => mainWindow?.webContents.send('tray:set-status', label)
      }))
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit() } }
  ])
  tray.setContextMenu(menu)
  tray.on('click', showMainWindow)
  tray.on('double-click', showMainWindow)
}

// Custom application menu: mirrors the standard Electron menu (full Edit
// roles, View, Window) and adds Help → "Release Notes", which tells the
// renderer to open the in-app version-history viewer.
function setupApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [{ role: 'quit', label: 'Exit' }]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Release Notes',
          click: () => mainWindow?.webContents.send('menu:show-release-notes')
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  // Restore last-used position/size (validated against current displays)
  const restored = getRestoredWindowOptions()
  mainWindow = new BrowserWindow({
    width: restored.width,
    height: restored.height,
    x: restored.x,
    y: restored.y,
    show: false,
    frame: true, // Use native window frame
    transparent: false,
    resizable: true,
    minWidth: 350,
    minHeight: 600,
    backgroundColor: '#667eea',
    webPreferences: {
      // Preload is in dist-electron/preload in both dev and production (packaged in asar)
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true // red-underline misspellings; suggestions in right-click menu
    }
  })

  mainWindow.on('ready-to-show', () => {
    // Start hidden only when explicitly launched with --hidden AND tray mode is
    // on (future login-item integration). Normal launches always show.
    const startHidden = process.argv.includes('--hidden') && closeToTray
    if (!startHidden) mainWindow?.show()
  })

  // Close-to-tray: when the setting is on, the window's ✕ hides to the tray
  // instead of quitting. A genuine quit sets isQuitting (via 'before-quit'), so
  // the tray "Quit", app.quit(), and the auto-update restart all still close.
  mainWindow.on('close', (e) => {
    if (closeToTray && !isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
      if (!trayBalloonShown && tray) {
        trayBalloonShown = true
        saveAppSettings()
        try {
          tray.displayBalloon({
            title: 'Still running',
            content: 'RLR P2P Chat is still running in the tray. Right-click the tray icon to quit.'
          })
        } catch (_) {}
      }
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer based on electron-vite cli
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    // Load from file system
    const htmlPath = join(__dirname, '../../out/renderer/index.html')
    mainWindow.loadFile(htmlPath)
  }

  // Ensure the window title shows the app version after the page finishes loading
  mainWindow.webContents.on('did-finish-load', () => {
    const version = app.getVersion()
    mainWindow?.setTitle(`RLR P2P Chat v${version}`)
  })

  // Open DevTools with F12
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      event.preventDefault()
      mainWindow?.webContents.toggleDevTools()
    }
  })

  // Remember and restore window position/size across launches
  trackWindowState(mainWindow)

  // Right-click context menu with cut/copy/paste/select-all so mouse-only
  // users (RLRJupiter) can paste a URL or picture into the text box.
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const { editFlags, isEditable, selectionText } = params
    const hasImage = !clipboard.readImage().isEmpty()
    const hasSelection = !!selectionText && selectionText.trim().length > 0
    const template: Electron.MenuItemConstructorOptions[] = []

    // Spelling suggestions for a misspelled word go at the top
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        template.push({
          label: suggestion,
          click: () => mainWindow?.webContents.replaceMisspelling(suggestion)
        })
      }
      if (params.dictionarySuggestions.length === 0) {
        template.push({ label: 'No suggestions', enabled: false })
      }
      template.push({
        label: 'Add to dictionary',
        click: () => mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      })
      template.push({ type: 'separator' })
    }

    if (isEditable) template.push({ role: 'cut', enabled: editFlags.canCut, label: 'Cut' })
    if (hasSelection || isEditable) template.push({ role: 'copy', enabled: editFlags.canCopy, label: 'Copy' })
    if (isEditable) template.push({ role: 'paste', enabled: editFlags.canPaste, label: 'Paste' })
    if (isEditable && hasImage) {
      template.push({
        label: 'Paste picture',
        click: () => mainWindow?.webContents.send('context-menu:paste-image')
      })
    }
    if (template.length) template.push({ type: 'separator' })
    template.push({ role: 'selectAll', label: 'Select All' })

    Menu.buildFromTemplate(template).popup({ window: mainWindow! })
  })

  // Setup IPC handlers after window is created
  setupIPCHandlers(mainWindow)

  // Start auto-update checks (packaged builds only)
  setupAutoUpdater(mainWindow)

  // Mic toggle shortcut (Ctrl+Space / Cmd+Space)
  globalShortcut.register('CommandOrControl+Space', () => {
    mainWindow?.webContents.send('shortcut:mic-toggle')
  })
}

function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
}

// Window control IPC handlers
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.on('window:close', () => {
  app.quit()
})

ipcMain.handle('window:open-external', async (_event, url: string) => {
  await shell.openExternal(url)
})

// Start-with-Windows (login item). Registers the app to launch at user logon.
// '--hidden' lets us optionally start minimized in the future; harmless if unused.
ipcMain.handle('app:get-open-at-login', () => {
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.handle('app:set-open-at-login', (_event, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: !!enabled })
  return app.getLoginItemSettings().openAtLogin
})

// Close-to-tray preference (read by the window 'close' handler in the main
// process; toggled from Settings in the renderer).
ipcMain.handle('app:get-close-to-tray', () => closeToTray)
ipcMain.handle('app:set-close-to-tray', (_event, enabled: boolean) => {
  closeToTray = !!enabled
  saveAppSettings()
  return closeToTray
})

app.whenReady().then(() => {
  app.setAppUserModelId('com.rlr.p2pchat')

  loadAppSettings()
  setupApplicationMenu()
  createWindow()
  createTray()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Any genuine quit path (tray Quit, app.quit(), auto-update quitAndInstall)
// fires this, releasing the close-to-tray hold so the window really closes.
app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  unregisterShortcuts()
  try { tray?.destroy() } catch (_) {}
  tray = null
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
