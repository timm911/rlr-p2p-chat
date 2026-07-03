import { ipcMain, BrowserWindow, dialog, shell, clipboard, app, safeStorage, desktopCapturer } from 'electron'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { TCPServer } from '../network/tcp-server'
import { TCPClient } from '../network/tcp-client'
import { ProtocolMessage, FileOffer, FileChunk } from '../network/protocol'
import { FileTransferManager, FileTransferState } from '../network/file-transfer-manager'
import { getTTSService, TTSConfig } from '../services/tts'
import { getWindowsSpeech, SpeechResult } from '../speech/windows-speech'
import { getNotificationService } from '../services/notification-service'
import { renderHistoryHtml, renderHistoryTxt } from '../history-export'

let tcpServer: TCPServer | null = null
let tcpClient: TCPClient | null = null
let mainWindow: BrowserWindow | null = null
let fileTransferManager: FileTransferManager | null = null

// Transfers currently streaming chunks. In a group chat the hub broadcasts a
// file-offer to BOTH connectors, so two file-accepts come back for one
// transfer — without this guard sendFileChunks would fire twice and send every
// chunk twice. The first accept starts the (broadcast) send; later ones no-op.
const activeChunkSends = new Set<string>()

/** Read + decrypt history.json off disk (mirrors the history:load handler). */
function loadHistoryArrayFrom(p: string): any[] {
  try {
    if (!fs.existsSync(p)) return []
    const MAGIC = 'RLRENC1:'
    const buf = fs.readFileSync(p)
    let json: string
    if (buf.length >= MAGIC.length && buf.subarray(0, MAGIC.length).toString('utf8') === MAGIC) {
      json = safeStorage.decryptString(buf.subarray(MAGIC.length))
    } else {
      json = buf.toString('utf8')
    }
    const data = JSON.parse(json)
    return Array.isArray(data) ? data : []
  } catch (_) {
    return []
  }
}

export function setupIPCHandlers(window: BrowserWindow): void {
  mainWindow = window
  fileTransferManager = new FileTransferManager()
  
  // Initialize notification service with window reference
  const notificationService = getNotificationService()
  notificationService.setWindow(window)

  // Setup file transfer event listeners
  fileTransferManager.on('transfer-created', (state: FileTransferState) => {
    mainWindow?.webContents.send('file-transfer:created', state)
  })

  fileTransferManager.on('transfer-accepted', (state: FileTransferState) => {
    mainWindow?.webContents.send('file-transfer:accepted', state)
  })

  fileTransferManager.on('transfer-progress', (state: FileTransferState) => {
    const speed = fileTransferManager!.getTransferSpeed(state.transferId)
    const eta = fileTransferManager!.getETA(state.transferId)
    mainWindow?.webContents.send('file-transfer:progress', { ...state, speed, eta })
  })

  fileTransferManager.on('transfer-completed', (state: FileTransferState) => {
    mainWindow?.webContents.send('file-transfer:completed', state)
  })

  fileTransferManager.on('transfer-failed', (state: FileTransferState) => {
    mainWindow?.webContents.send('file-transfer:failed', state)
  })

  fileTransferManager.on('transfer-cancelled', (state: FileTransferState) => {
    mainWindow?.webContents.send('file-transfer:cancelled', state)
  })

  fileTransferManager.on('transfer-paused', (state: FileTransferState) => {
    mainWindow?.webContents.send('file-transfer:progress', { ...state, speed: 0, eta: 0 })
  })

  fileTransferManager.on('transfer-resumed', (state: FileTransferState) => {
    const speed = fileTransferManager!.getTransferSpeed(state.transferId)
    const eta = fileTransferManager!.getETA(state.transferId)
    mainWindow?.webContents.send('file-transfer:progress', { ...state, speed, eta })
  })

  // Get local IP addresses for connection troubleshooting
  ipcMain.handle('network:get-local-ips', async () => {
    const interfaces = os.networkInterfaces()
    const ips: { name: string; address: string }[] = []

    for (const [name, addresses] of Object.entries(interfaces)) {
      if (addresses) {
        for (const addr of addresses) {
          if (addr.family === 'IPv4' && !addr.internal) {
            ips.push({ name, address: addr.address })
          }
        }
      }
    }

    return ips
  })

  // Start TCP server (Ripster - listener mode)
  ipcMain.handle('network:start-server', async (_event, port: number, password: string) => {
    try {
      if (tcpServer) {
        tcpServer.stop()
      }

      tcpServer = new TCPServer(port, password)

      // Forward server events to renderer
      tcpServer.on('log', (e: { message: string; detail?: string }) => {
        mainWindow?.webContents.send('connection:log', e)
      })

      tcpServer.on('listening', () => {
        mainWindow?.webContents.send('connection:state-change', 'listening')
      })

      tcpServer.on('connected', (info) => {
        console.log(`[TCP Server] Peer connected from: ${info.address}:${info.port}`)
        mainWindow?.webContents.send('connection:state-change', 'connected')
        mainWindow?.webContents.send('peer:connected', info)
      })

      tcpServer.on('disconnected', () => {
        mainWindow?.webContents.send('connection:state-change', 'disconnected')
      })

      tcpServer.on('message', async (msg: ProtocolMessage) => {
        mainWindow?.webContents.send('chat:message', msg)

        // Handle file transfer messages
        if (msg.type === 'file-accept') {
          // Start sending file chunks when peer accepts
          await sendFileChunks(msg.payload.transferId)
        } else if (msg.type === 'file-chunk') {
          await handleReceivedChunk(msg.payload)
        } else if (msg.type === 'file-pause') {
          fileTransferManager!.pauseTransfer(msg.payload.transferId)
        } else if (msg.type === 'file-resume') {
          fileTransferManager!.resumeTransfer(msg.payload.transferId)
          const state = fileTransferManager!.getTransferState(msg.payload.transferId)
          if (state?.direction === 'send' && (state.status === 'active' || state.status === 'pending')) {
            await sendFileChunks(msg.payload.transferId)
          }
        }
      })

      // History sync: a (re)connecting connector asks the hub for everything it
      // missed. The hub is the source of truth (it relays the whole group
      // conversation), so answer from its own history.json.
      tcpServer.on('history-request', ({ since, reply }: { since?: number; reply: (messages: any[]) => void }) => {
        try {
          const all = loadHistoryArrayFrom(path.join(app.getPath('userData'), 'history.json'))
          const filtered = typeof since === 'number'
            ? all.filter((m: any) => (m?.timestamp || 0) > since)
            : all
          // Don't ship system/queued noise back; only real content keeps in sync
          const clean = filtered.filter((m: any) => m?.type === 'chat' || m?.type === 'file')
          reply(clean)
        } catch (_) {
          reply([])
        }
      })

      tcpServer.on('error', (err) => {
        mainWindow?.webContents.send('connection:error', err.message)
      })

      await tcpServer.start()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Stop TCP server
  ipcMain.handle('network:stop-server', async () => {
    if (tcpServer) {
      tcpServer.stop()
      tcpServer = null
    }
    return { success: true }
  })

  // Start TCP client (RLRJupiter - connector mode)
  ipcMain.handle('network:start-client', async (_event, host: string, port: number, password: string, options?: { autoReconnect?: boolean }) => {
    try {
      if (tcpClient) {
        tcpClient.disconnect()
      }

      tcpClient = new TCPClient(host, port, password, options)

      // Forward client events to renderer
      tcpClient.on('log', (e: { message: string; detail?: string }) => {
        mainWindow?.webContents.send('connection:log', e)
      })

      tcpClient.on('connecting', () => {
        mainWindow?.webContents.send('connection:state-change', 'connecting')
      })

      tcpClient.on('connected', (info) => {
        mainWindow?.webContents.send('connection:state-change', 'connected')
        mainWindow?.webContents.send('peer:connected', info)
      })

      tcpClient.on('disconnected', () => {
        mainWindow?.webContents.send('connection:state-change', 'disconnected')
      })

      tcpClient.on('reconnecting', (info) => {
        mainWindow?.webContents.send('connection:state-change', 'reconnecting')
      })

      tcpClient.on('message', async (msg: ProtocolMessage) => {
        mainWindow?.webContents.send('chat:message', msg)

        // Handle file transfer messages
        if (msg.type === 'file-accept') {
          await sendFileChunks(msg.payload.transferId)
        } else if (msg.type === 'file-chunk') {
          await handleReceivedChunk(msg.payload)
        } else if (msg.type === 'file-pause') {
          fileTransferManager!.pauseTransfer(msg.payload.transferId)
        } else if (msg.type === 'file-resume') {
          fileTransferManager!.resumeTransfer(msg.payload.transferId)
          const state = fileTransferManager!.getTransferState(msg.payload.transferId)
          if (state?.direction === 'send' && (state.status === 'active' || state.status === 'pending')) {
            await sendFileChunks(msg.payload.transferId)
          }
        }
      })

      tcpClient.on('error', (err) => {
        mainWindow?.webContents.send('connection:error', err.message)
      })

      tcpClient.connect()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Stop TCP client
  ipcMain.handle('network:stop-client', async () => {
    if (tcpClient) {
      tcpClient.disconnect()
      tcpClient = null
    }
    return { success: true }
  })

  // Reconnect immediately (renderer calls this when the OS network comes back
  // online, skipping the reconnect backoff)
  ipcMain.handle('network:reconnect-now', async () => {
    tcpClient?.reconnectNow()
    return { success: true }
  })

  // Send message (works for both client and server)
  ipcMain.handle('network:send-message', async (_event, message: ProtocolMessage) => {
    let success = false

    if (tcpServer && tcpServer.isConnected()) {
      success = tcpServer.send(message)
    } else if (tcpClient && tcpClient.isConnected()) {
      success = tcpClient.send(message)
    }

    return { success }
  })

  // Get connection status
  ipcMain.handle('network:get-status', async () => {
    const serverConnected = tcpServer?.isConnected() || false
    const clientConnected = tcpClient?.isConnected() || false

    return {
      isConnected: serverConnected || clientConnected,
      isServer: serverConnected,
      isClient: clientConnected
    }
  })

  // Set taskbar/title badge count (unread messages). Windows: taskbar badge.
  ipcMain.handle('app:set-badge-count', async (_event, count: number) => {
    if (typeof count === 'number' && count >= 0) {
      app.setBadgeCount(count)
    }
    return undefined
  })

  // Message history persistence (%USERPROFILE%\AppData\Roaming\<app>\history.json)
  // Encrypted at rest with the OS keystore (Windows DPAPI) via safeStorage,
  // so the chat content on disk isn't readable as plain text. Files written by
  // older versions (plain JSON) are still read and get re-encrypted on save.
  const getHistoryPath = () => path.join(app.getPath('userData'), 'history.json')
  const ENC_MAGIC = 'RLRENC1:' // prefix marking a safeStorage-encrypted file
  // Last serialized payload we wrote. Lets us skip the (relatively expensive)
  // encrypt + fsync when a save carries byte-identical content — common when a
  // single message cycles through delivery-status updates.
  let lastSavedHistoryJson: string | null = null

  ipcMain.handle('history:load', async () => {
    try {
      const p = getHistoryPath()
      if (!fs.existsSync(p)) return []
      const buf = fs.readFileSync(p)
      let json: string
      if (buf.length >= ENC_MAGIC.length && buf.subarray(0, ENC_MAGIC.length).toString('utf8') === ENC_MAGIC) {
        // Encrypted payload
        json = safeStorage.decryptString(buf.subarray(ENC_MAGIC.length))
      } else {
        // Legacy plaintext JSON (migrated to encrypted on next save)
        json = buf.toString('utf8')
      }
      const data = JSON.parse(json)
      return Array.isArray(data) ? data : []
    } catch (err) {
      console.error('Failed to load history:', err)
      return []
    }
  })

  ipcMain.handle('history:save', async (_event, messages: any[]) => {
    try {
      const p = getHistoryPath()
      const dir = path.dirname(p)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const toSave = (messages || []).map((m: any) => {
        const { fileTransfer, ...rest } = m
        if (fileTransfer) {
          const { filePath, ...ft } = fileTransfer
          return { ...rest, fileTransfer: ft }
        }
        return rest
      })
      const json = JSON.stringify(toSave)
      // Nothing changed since the last write — skip the encrypt + disk write.
      if (json === lastSavedHistoryJson && fs.existsSync(p)) {
        return { success: true, skipped: true }
      }
      if (safeStorage.isEncryptionAvailable()) {
        const enc = safeStorage.encryptString(json)
        fs.writeFileSync(p, Buffer.concat([Buffer.from(ENC_MAGIC, 'utf8'), enc]))
      } else {
        // No OS keystore (rare) — fall back to plaintext so chat still saves
        fs.writeFileSync(p, json, 'utf8')
      }
      lastSavedHistoryJson = json
      return { success: true }
    } catch (err: any) {
      console.error('Failed to save history:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('history:clear', async () => {
    try {
      const p = getHistoryPath()
      if (fs.existsSync(p)) fs.unlinkSync(p)
      lastSavedHistoryJson = null
      mainWindow?.webContents.send('history:cleared')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: (err as Error).message }
    }
  })

  // Export the (decrypted) conversation to a readable file the user picks.
  // Writes a NEW plaintext file at the chosen path — history.json itself is
  // never touched (still encrypted at rest). Format follows the chosen
  // extension: .html (sender-colored, day headers) or .txt (plain).
  ipcMain.handle('history:export', async () => {
    try {
      const messages = loadHistoryArrayFrom(getHistoryPath())

      const stamp = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const defaultName = `rlr-chat-export-${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}`

      const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Export chat history',
        defaultPath: `${defaultName}.html`,
        filters: [
          { name: 'Web page', extensions: ['html'] },
          { name: 'Text file', extensions: ['txt'] }
        ]
      })
      if (result.canceled || !result.filePath) return { success: false, canceled: true }

      const asTxt = result.filePath.toLowerCase().endsWith('.txt')
      const out = asTxt ? renderHistoryTxt(messages, stamp) : renderHistoryHtml(messages, stamp)
      fs.writeFileSync(result.filePath, out, 'utf8')
      return { success: true, path: result.filePath, count: messages.length }
    } catch (err: any) {
      console.error('Failed to export history:', err)
      return { success: false, error: (err as Error).message }
    }
  })

  // Get connection + speech diagnostics (read-only, for Settings panel)
  ipcMain.handle('network:get-diagnostics', async () => {
    const net = tcpServer ?? tcpClient
    const connection = net
      ? (tcpClient ? tcpClient.getDiagnostics() : tcpServer!.getDiagnostics())
      : null
    const speechListening = getWindowsSpeech().getIsListening()
    return {
      connection,
      speechListening,
      lastActivityAgo: connection ? Math.round((Date.now() - connection.lastActivityTime) / 1000) : null
    }
  })

  // TTS Handlers
  const ttsService = getTTSService()

  // Speak text
  ipcMain.handle('tts:speak', async (_event, text: string) => {
    try {
      console.log('[Main TTS] Received speak request:', text)
      const config = ttsService.getConfig()
      console.log('[Main TTS] Current config:', config)
      await ttsService.speak(text)
      console.log('[Main TTS] Speech completed successfully')
      return { success: true }
    } catch (err: any) {
      console.error('[Main TTS] Error:', err)
      return { success: false, error: err.message }
    }
  })

  // Stop speaking
  ipcMain.handle('tts:stop', async () => {
    ttsService.stop()
    return { success: true }
  })

  // Configure TTS
  ipcMain.handle('tts:configure', async (_event, config: Partial<TTSConfig>) => {
    ttsService.configure(config)
    return { success: true, config: ttsService.getConfig() }
  })

  // Get TTS configuration
  ipcMain.handle('tts:get-config', async () => {
    return ttsService.getConfig()
  })

  // Get available voices
  ipcMain.handle('tts:get-voices', async () => {
    return await ttsService.getVoices()
  })

  // Test TTS
  ipcMain.handle('tts:test', async () => {
    try {
      await ttsService.test()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Get speaking status
  ipcMain.handle('tts:is-speaking', async () => {
    return ttsService.getIsSpeaking()
  })

  // Windows native speech recognition handlers
  const windowsSpeech = getWindowsSpeech()

  // Forward speech events to renderer
  windowsSpeech.on('start', () => {
    mainWindow?.webContents.send('speech:state-change', 'listening')
  })

  windowsSpeech.on('end', () => {
    mainWindow?.webContents.send('speech:state-change', 'idle')
  })

  windowsSpeech.on('result', (result: SpeechResult) => {
    mainWindow?.webContents.send('speech:result', result)
  })

  windowsSpeech.on('error', (error: string) => {
    mainWindow?.webContents.send('speech:error', error)
  })

  // Start speech recognition
  ipcMain.handle('speech:start', async () => {
    try {
      windowsSpeech.start()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Stop speech recognition
  ipcMain.handle('speech:stop', async () => {
    try {
      windowsSpeech.stop()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Get speech recognition status
  ipcMain.handle('speech:is-listening', async () => {
    return windowsSpeech.getIsListening()
  })

  // Test microphone and speech recognition
  ipcMain.handle('speech:test', async () => {
    return windowsSpeech.test()
  })

  // Load the bundled Vosk model archive for the renderer's offline STT engine.
  // Returned as a Buffer (structured-clone over IPC); the renderer wraps it in
  // a Blob URL for vosk-browser, which cannot fetch file:// paths directly.
  ipcMain.handle('speech:get-vosk-model', async () => {
    const fileName = 'vosk-model-small-en-us-0.15.tar.gz'
    const candidates = app.isPackaged
      ? [path.join(process.resourcesPath, 'models', fileName)]
      : [path.join(app.getAppPath(), 'models', fileName), path.join(process.cwd(), 'models', fileName)]
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          return { success: true, data: fs.readFileSync(p) }
        }
      } catch (_err) {
        // try next candidate
      }
    }
    return { success: false, error: `Vosk model not found (${fileName})` }
  })

  // File transfer handlers

  // Read a file and return as data URL (inline image OR audio preview). Main-only paths.
  ipcMain.handle('file:get-file-data-url', async (_event, filePath: string) => {
    try {
      const ext = path.extname(filePath).toLowerCase()
      const imageMimes: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp'
      }
      const audioMimes: Record<string, string> = {
        '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
        '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav'
      }
      const mime = imageMimes[ext] || audioMimes[ext]
      if (!mime) {
        return { success: false, error: 'Not an inline-previewable file' }
      }
      const buf = fs.readFileSync(filePath)
      return { success: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}`, kind: audioMimes[ext] ? 'audio' : 'image' }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to read file' }
    }
  })

  // Screenshot: list capturable screens + windows (with thumbnails) so the
  // user can pick exactly what to send.
  ipcMain.handle('screenshot:list-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 200 },
        fetchWindowIcons: true
      })
      return sources.map((s) => ({
        id: s.id,
        name: s.name,
        isScreen: s.id.startsWith('screen'),
        thumb: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : '',
        appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null
      }))
    } catch (_) {
      return []
    }
  })

  // Capture the chosen source at full resolution, returned as a PNG data URL.
  ipcMain.handle('screenshot:capture', async (_event, sourceId: string) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 3840, height: 2160 } // capped to the source's real size
      })
      const src = sources.find((s) => s.id === sourceId)
      if (!src || !src.thumbnail) return { success: false, error: 'Source not found' }
      return { success: true, dataUrl: src.thumbnail.toDataURL() }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Capture failed' }
    }
  })

  // Write an image data URL (screenshot, optionally cropped) to a temp file so
  // it can be sent through the normal file-transfer path.
  ipcMain.handle('file:save-temp-image', async (_event, dataUrl: string) => {
    try {
      const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(dataUrl || '')
      if (!m) return { success: false, error: 'Not a PNG/JPEG data URL' }
      const ext = m[1] === 'png' ? 'png' : 'jpg'
      const filePath = path.join(os.tmpdir(), `rlrchat-shot-${Date.now()}.${ext}`)
      fs.writeFileSync(filePath, Buffer.from(m[2], 'base64'))
      return { success: true, filePath }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to save image' }
    }
  })

  // Return a bundled notification sound as a data URL (renderer plays it).
  ipcMain.handle('sound:get-bundled', async (_event, name: string) => {
    try {
      if (!/^[a-z0-9-]{1,30}$/i.test(name)) return { success: false, error: 'bad name' }
      const candidates = app.isPackaged
        ? [path.join(process.resourcesPath, 'sounds', `${name}.wav`)]
        : [path.join(app.getAppPath(), 'sounds', `${name}.wav`), path.join(process.cwd(), 'sounds', `${name}.wav`)]
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          return { success: true, dataUrl: `data:audio/wav;base64,${fs.readFileSync(p).toString('base64')}` }
        }
      }
      return { success: false, error: 'not found' }
    } catch (err: any) {
      return { success: false, error: err?.message || 'failed' }
    }
  })

  // Write a recorded voice-message blob to a temp file, then it's sent via the
  // normal file-transfer path (file:send-file).
  ipcMain.handle('file:save-temp-audio', async (_event, bytes: Uint8Array, ext: string = 'webm') => {
    try {
      const safeExt = /^[a-z0-9]{1,5}$/i.test(ext) ? ext : 'webm'
      const filePath = path.join(os.tmpdir(), `rlrchat-voice-${Date.now()}.${safeExt}`)
      fs.writeFileSync(filePath, Buffer.from(bytes))
      return { success: true, filePath }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to save audio' }
    }
  })

  // OS-keystore encryption (Windows DPAPI) for the renderer to protect small
  // secrets at rest, e.g. the saved session password.
  ipcMain.handle('secure:encrypt', async (_event, text: string) => {
    try {
      if (!safeStorage.isEncryptionAvailable() || typeof text !== 'string') return null
      return safeStorage.encryptString(text).toString('base64')
    } catch (_) {
      return null
    }
  })

  ipcMain.handle('secure:decrypt', async (_event, b64: string) => {
    try {
      if (!safeStorage.isEncryptionAvailable() || typeof b64 !== 'string') return null
      return safeStorage.decryptString(Buffer.from(b64, 'base64'))
    } catch (_) {
      return null
    }
  })

  // Read plain text from the clipboard (used by the right-click Paste so it
  // works reliably regardless of the synthetic paste event).
  ipcMain.handle('clipboard:read-text', async () => {
    try {
      return clipboard.readText() || ''
    } catch (_) {
      return ''
    }
  })

  // Save clipboard image to temp file (for paste-to-send). Returns path if image was in clipboard.
  ipcMain.handle('file:save-clipboard-image', async () => {
    try {
      const image = clipboard.readImage()
      if (image.isEmpty()) {
        return { success: false, error: 'No image in clipboard' }
      }
      const tmpDir = os.tmpdir()
      const fileName = `rlrchat-paste-${Date.now()}.png`
      const filePath = path.join(tmpDir, fileName)
      const png = image.toPNG()
      fs.writeFileSync(filePath, png)
      return { success: true, filePath }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to save clipboard image' }
    }
  })

  // Open file picker dialog
  ipcMain.handle('file:pick-file', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openFile'],
        filters: [
          { name: 'All Files', extensions: ['*'] },
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] },
          { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf'] },
          { name: 'Videos', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] },
          { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, cancelled: true }
      }

      return { success: true, filePath: result.filePaths[0] }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Initiate file send
  ipcMain.handle('file:send-file', async (_event, filePath: string) => {
    try {
      if (!fileTransferManager) {
        throw new Error('File transfer manager not initialized')
      }

      // Validate file size (max 500MB)
      const fs = await import('fs')
      const stats = await fs.promises.stat(filePath)
      const maxSize = 500 * 1024 * 1024 // 500MB

      if (stats.size > maxSize) {
        throw new Error('File size exceeds 500MB limit')
      }

      // Create file offer
      const offer = await fileTransferManager.createSendTransfer(filePath)

      // Send file offer to peer
      const offerMsg: ProtocolMessage = {
        type: 'file-offer',
        payload: offer,
        timestamp: Date.now()
      }

      let sent = false
      if (tcpServer && tcpServer.isConnected()) {
        sent = tcpServer.send(offerMsg)
      } else if (tcpClient && tcpClient.isConnected()) {
        sent = tcpClient.send(offerMsg)
      }

      if (!sent) {
        throw new Error('Failed to send file offer - not connected')
      }

      return { success: true, transferId: offer.transferId }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Accept file transfer
  ipcMain.handle('file:accept-transfer', async (_event, offer: FileOffer) => {
    try {
      if (!fileTransferManager) {
        throw new Error('File transfer manager not initialized')
      }

      // Ask user where to save file
      const result = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: offer.fileName,
        filters: [{ name: 'All Files', extensions: ['*'] }]
      })

      if (result.canceled || !result.filePath) {
        // Send rejection
        const rejectMsg: ProtocolMessage = {
          type: 'file-reject',
          payload: { transferId: offer.transferId, accepted: false, timestamp: Date.now() },
          timestamp: Date.now()
        }

        if (tcpServer && tcpServer.isConnected()) {
          tcpServer.send(rejectMsg)
        } else if (tcpClient && tcpClient.isConnected()) {
          tcpClient.send(rejectMsg)
        }

        return { success: false, cancelled: true }
      }

      // Accept transfer
      await fileTransferManager.acceptFileTransfer(offer, result.filePath)

      // Send acceptance
      const acceptMsg: ProtocolMessage = {
        type: 'file-accept',
        payload: { transferId: offer.transferId, accepted: true, timestamp: Date.now() },
        timestamp: Date.now()
      }

      if (tcpServer && tcpServer.isConnected()) {
        tcpServer.send(acceptMsg)
      } else if (tcpClient && tcpClient.isConnected()) {
        tcpClient.send(acceptMsg)
      }

      return { success: true, transferId: offer.transferId }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Accept a transfer WITHOUT prompting for a location — save into an app
  // cache folder so images can be received and shown inline in the chat
  // viewer (no "where do you want to save this" dialog). Used automatically
  // for image files; the user can still save-as later from the bubble.
  ipcMain.handle('file:accept-transfer-auto', async (_event, offer: FileOffer) => {
    try {
      if (!fileTransferManager) {
        throw new Error('File transfer manager not initialized')
      }

      const dir = path.join(app.getPath('userData'), 'received-files')
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      // Prefix with transferId to avoid collisions between same-named files
      const safeName = path.basename(offer.fileName).replace(/[^\w.\-]/g, '_')
      const savePath = path.join(dir, `${offer.transferId}-${safeName}`)

      await fileTransferManager.acceptFileTransfer(offer, savePath)

      const acceptMsg: ProtocolMessage = {
        type: 'file-accept',
        payload: { transferId: offer.transferId, accepted: true, timestamp: Date.now() },
        timestamp: Date.now()
      }
      if (tcpServer && tcpServer.isConnected()) {
        tcpServer.send(acceptMsg)
      } else if (tcpClient && tcpClient.isConnected()) {
        tcpClient.send(acceptMsg)
      }

      return { success: true, transferId: offer.transferId, savePath }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Reject file transfer
  ipcMain.handle('file:reject-transfer', async (_event, transferId: string) => {
    try {
      const rejectMsg: ProtocolMessage = {
        type: 'file-reject',
        payload: { transferId, accepted: false, timestamp: Date.now() },
        timestamp: Date.now()
      }

      if (tcpServer && tcpServer.isConnected()) {
        tcpServer.send(rejectMsg)
      } else if (tcpClient && tcpClient.isConnected()) {
        tcpClient.send(rejectMsg)
      }

      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Cancel file transfer
  ipcMain.handle('file:cancel-transfer', async (_event, transferId: string, reason: string) => {
    try {
      if (!fileTransferManager) {
        throw new Error('File transfer manager not initialized')
      }

      await fileTransferManager.cancelTransfer(transferId)

      const cancelMsg: ProtocolMessage = {
        type: 'file-cancel',
        payload: { transferId, reason, timestamp: Date.now() },
        timestamp: Date.now()
      }

      if (tcpServer && tcpServer.isConnected()) {
        tcpServer.send(cancelMsg)
      } else if (tcpClient && tcpClient.isConnected()) {
        tcpClient.send(cancelMsg)
      }

      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Pause file transfer (sends file-pause to peer and stops sending chunks)
  ipcMain.handle('file:pause-transfer', async (_event, transferId: string) => {
    try {
      if (!fileTransferManager) return { success: false, error: 'Not initialized' }
      fileTransferManager.pauseTransfer(transferId)
      const msg: ProtocolMessage = {
        type: 'file-pause',
        payload: { transferId, timestamp: Date.now() },
        timestamp: Date.now()
      }
      if (tcpServer && tcpServer.isConnected()) tcpServer.send(msg)
      else if (tcpClient && tcpClient.isConnected()) tcpClient.send(msg)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Resume file transfer (sends file-resume and continues sending if sender)
  ipcMain.handle('file:resume-transfer', async (_event, transferId: string) => {
    try {
      if (!fileTransferManager) return { success: false, error: 'Not initialized' }
      fileTransferManager.resumeTransfer(transferId)
      const msg: ProtocolMessage = {
        type: 'file-resume',
        payload: { transferId, timestamp: Date.now() },
        timestamp: Date.now()
      }
      if (tcpServer && tcpServer.isConnected()) tcpServer.send(msg)
      else if (tcpClient && tcpClient.isConnected()) tcpClient.send(msg)
      const state = fileTransferManager.getTransferState(transferId)
      if (state?.direction === 'send' && (state.status === 'active' || state.status === 'pending')) {
        await sendFileChunks(transferId)
      }
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Get transfer state
  ipcMain.handle('file:get-transfer-state', async (_event, transferId: string) => {
    if (!fileTransferManager) {
      return null
    }

    const state = fileTransferManager.getTransferState(transferId)
    if (!state) return null

    const speed = fileTransferManager.getTransferSpeed(transferId)
    const eta = fileTransferManager.getETA(transferId)

    return { ...state, speed, eta }
  })

  // Notification handlers
  ipcMain.handle('notification:set-enabled', async (_event, enabled: boolean) => {
    notificationService.setEnabled(enabled)
    return { success: true, enabled }
  })

  ipcMain.handle('notification:is-enabled', async () => {
    return notificationService.isEnabled()
  })

  ipcMain.handle('notification:show-message', async (_event, from: string, message: string) => {
    notificationService.showMessage(from, message)
    return { success: true }
  })

  ipcMain.handle('notification:show-file-transfer', async (_event, from: string, fileName: string) => {
    notificationService.showFileTransfer(from, fileName)
    return { success: true }
  })

  ipcMain.handle('notification:show-status-change', async (_event, from: string, status: string) => {
    notificationService.showStatusChange(from, status)
    return { success: true }
  })

  console.log('IPC handlers loaded')
}

// Helper function to send file chunks
export async function sendFileChunks(transferId: string): Promise<void> {
  if (!fileTransferManager) return

  const state = fileTransferManager.getTransferState(transferId)
  if (!state || state.direction !== 'send') return

  // Re-entry guard: a group file-offer is accepted by every connected peer, so
  // this can be invoked once per accept. Only the first invocation streams.
  if (activeChunkSends.has(transferId)) {
    console.log('[FileSend] Already streaming', transferId, '- ignoring duplicate accept')
    return
  }
  activeChunkSends.add(transferId)

  try {
    // Send chunks one at a time with small delay to avoid overwhelming the
    // connection. A fresh transfer is 'pending' until the first chunk read
    // flips it to 'active' — the loop must accept both or it never starts.
    while ((state.status === 'active' || state.status === 'pending') && state.chunksTransferred < state.totalChunks) {
      const chunk = await fileTransferManager.getNextChunk(transferId)
      if (!chunk) break

      const chunkMsg: ProtocolMessage = {
        type: 'file-chunk',
        payload: chunk,
        timestamp: Date.now()
      }

      let sent = false
      if (tcpServer && tcpServer.isConnected()) {
        sent = tcpServer.send(chunkMsg)
      } else if (tcpClient && tcpClient.isConnected()) {
        sent = tcpClient.send(chunkMsg)
      }

      if (!sent) {
        throw new Error('Failed to send chunk - connection lost')
      }

      // Small delay between chunks to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    // Send completion message
    if (state.chunksTransferred >= state.totalChunks) {
      await fileTransferManager.completeSendTransfer(transferId)

      const completeMsg: ProtocolMessage = {
        type: 'file-complete',
        payload: { transferId, success: true, timestamp: Date.now() },
        timestamp: Date.now()
      }

      if (tcpServer && tcpServer.isConnected()) {
        tcpServer.send(completeMsg)
      } else if (tcpClient && tcpClient.isConnected()) {
        tcpClient.send(completeMsg)
      }
    }
  } catch (error: any) {
    console.error('Error sending file chunks:', error)
    await fileTransferManager.failTransfer(transferId, error.message)
  } finally {
    activeChunkSends.delete(transferId)
  }
}

// Helper function to handle received chunks
export async function handleReceivedChunk(chunk: FileChunk): Promise<void> {
  if (!fileTransferManager) return

  try {
    await fileTransferManager.processChunk(chunk)
  } catch (error: any) {
    console.error('Error processing chunk:', error)
    await fileTransferManager.failTransfer(chunk.transferId, error.message)
  }
}
