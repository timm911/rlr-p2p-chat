/**
 * Persist and restore the main window's position and size between launches.
 *
 * Bounds are saved (debounced) on move/resize/close to
 * %APPDATA%\<app>\window-state.json and restored on next launch. Restored
 * bounds are validated against the currently-connected displays so the window
 * never reopens off-screen (e.g. if a second monitor was unplugged).
 */
import { app, screen, BrowserWindow, Rectangle } from 'electron'
import { join } from 'path'
import fs from 'fs'

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized?: boolean
}

const DEFAULTS = { width: 390, height: 670 }

function statePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function readState(): WindowState | null {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8')
    const s = JSON.parse(raw)
    if (typeof s.width === 'number' && typeof s.height === 'number') return s
  } catch (_) {
    // no saved state yet
  }
  return null
}

/** True if the saved rectangle is meaningfully visible on some display. */
function isVisibleOnSomeDisplay(bounds: Rectangle): boolean {
  const displays = screen.getAllDisplays()
  // Require a reasonable overlap so a sliver on a removed monitor doesn't count
  const MIN_VISIBLE = 80
  return displays.some((d) => {
    const wa = d.workArea
    const overlapX = Math.max(0, Math.min(bounds.x + bounds.width, wa.x + wa.width) - Math.max(bounds.x, wa.x))
    const overlapY = Math.max(0, Math.min(bounds.y + bounds.height, wa.y + wa.height) - Math.max(bounds.y, wa.y))
    return overlapX >= MIN_VISIBLE && overlapY >= MIN_VISIBLE
  })
}

/** Options for new BrowserWindow(): restored size + position when valid. */
export function getRestoredWindowOptions(): { width: number; height: number; x?: number; y?: number } {
  const s = readState()
  if (!s) return { ...DEFAULTS }

  const width = Math.max(350, s.width || DEFAULTS.width)
  const height = Math.max(600, s.height || DEFAULTS.height)

  if (typeof s.x === 'number' && typeof s.y === 'number' &&
      isVisibleOnSomeDisplay({ x: s.x, y: s.y, width, height })) {
    return { width, height, x: s.x, y: s.y }
  }
  // Position invalid/off-screen → let the OS center it
  return { width, height }
}

/**
 * Attach save-on-change listeners. Debounced so dragging doesn't write
 * constantly, and a final synchronous save on close.
 */
export function trackWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null

  const save = () => {
    if (!win || win.isDestroyed() || win.isMinimized()) return
    const isMaximized = win.isMaximized()
    // When maximized, keep the previous (restorable) normal bounds
    const bounds = isMaximized ? win.getNormalBounds() : win.getBounds()
    const state: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized
    }
    try {
      fs.writeFileSync(statePath(), JSON.stringify(state), 'utf8')
    } catch (_) {
      // best-effort; ignore write errors
    }
  }

  const debouncedSave = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, 400)
  }

  win.on('move', debouncedSave)
  win.on('resize', debouncedSave)
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    save() // final synchronous save before the window goes away
  })

  // Restore maximized state if that's how it was left
  const s = readState()
  if (s?.isMaximized) {
    win.maximize()
  }
}
