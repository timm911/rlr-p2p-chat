import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App / window
  setBadgeCount: (count: number) => ipcRenderer.invoke('app:set-badge-count', count),
  onMicShortcut: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('shortcut:mic-toggle', handler)
    return () => ipcRenderer.removeListener('shortcut:mic-toggle', handler)
  },
  historyLoad: () => ipcRenderer.invoke('history:load'),
  historySave: (messages: any[]) => ipcRenderer.invoke('history:save', messages),
  historyClear: () => ipcRenderer.invoke('history:clear'),
  onHistoryCleared: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('history:cleared', handler)
    return () => ipcRenderer.removeListener('history:cleared', handler)
  },
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  openExternal: (url: string) => ipcRenderer.invoke('window:open-external', url),

  // Auto-update status
  onUpdateStatus: (callback: (s: { status: string; info?: any }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, s: { status: string; info?: any }) => callback(s)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  },
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateGetVersion: () => ipcRenderer.invoke('update:get-version'),

  // Network
  getLocalIPs: () => ipcRenderer.invoke('network:get-local-ips'),
  startServer: (port: number, password: string) => ipcRenderer.invoke('network:start-server', port, password),
  stopServer: () => ipcRenderer.invoke('network:stop-server'),
  startClient: (host: string, port: number, password: string, options?: { autoReconnect?: boolean }) => ipcRenderer.invoke('network:start-client', host, port, password, options),
  stopClient: () => ipcRenderer.invoke('network:stop-client'),
  reconnectNow: () => ipcRenderer.invoke('network:reconnect-now'),
  sendMessage: (message: any) => ipcRenderer.invoke('network:send-message', message),
  getConnectionStatus: () => ipcRenderer.invoke('network:get-status'),
  getDiagnostics: () => ipcRenderer.invoke('network:get-diagnostics'),

  // TTS
  ttsSpeak: (text: string) => ipcRenderer.invoke('tts:speak', text),
  ttsStop: () => ipcRenderer.invoke('tts:stop'),
  ttsConfigure: (config: any) => ipcRenderer.invoke('tts:configure', config),
  ttsGetConfig: () => ipcRenderer.invoke('tts:get-config'),
  ttsGetVoices: () => ipcRenderer.invoke('tts:get-voices'),
  ttsTest: () => ipcRenderer.invoke('tts:test'),
  ttsIsSpeaking: () => ipcRenderer.invoke('tts:is-speaking'),

  // Event listeners
  onMessage: (callback: (message: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: any) => callback(message)
    ipcRenderer.on('chat:message', listener)
    return () => ipcRenderer.removeListener('chat:message', listener)
  },

  onStatusChange: (callback: (status: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: any) => callback(status)
    ipcRenderer.on('peer:status-change', listener)
    return () => ipcRenderer.removeListener('peer:status-change', listener)
  },

  onConnectionStateChange: (callback: (state: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: string) => callback(state)
    ipcRenderer.on('connection:state-change', listener)
    return () => ipcRenderer.removeListener('connection:state-change', listener)
  },

  onConnectionLog: (callback: (entry: { message: string; detail?: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: { message: string; detail?: string }) => callback(entry)
    ipcRenderer.on('connection:log', listener)
    return () => ipcRenderer.removeListener('connection:log', listener)
  },

  onConnectionError: (callback: (error: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: string) => callback(error)
    ipcRenderer.on('connection:error', listener)
    return () => ipcRenderer.removeListener('connection:error', listener)
  },

  onPeerConnected: (callback: (info: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, info: any) => callback(info)
    ipcRenderer.on('peer:connected', listener)
    return () => ipcRenderer.removeListener('peer:connected', listener)
  },

  // Speech recognition (Windows native via main process)
  speechStart: () => ipcRenderer.invoke('speech:start'),
  speechStop: () => ipcRenderer.invoke('speech:stop'),
  speechIsListening: () => ipcRenderer.invoke('speech:is-listening'),
  speechTest: () => ipcRenderer.invoke('speech:test'),
  getVoskModel: () => ipcRenderer.invoke('speech:get-vosk-model'),
  onSpeechStateChange: (callback: (state: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: string) => callback(state)
    ipcRenderer.on('speech:state-change', listener)
    return () => ipcRenderer.removeListener('speech:state-change', listener)
  },
  onSpeechResult: (callback: (result: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, result: any) => callback(result)
    ipcRenderer.on('speech:result', listener)
    return () => ipcRenderer.removeListener('speech:result', listener)
  },
  onSpeechError: (callback: (error: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: string) => callback(error)
    ipcRenderer.on('speech:error', listener)
    return () => ipcRenderer.removeListener('speech:error', listener)
  },

  // File transfer
  saveClipboardImage: () => ipcRenderer.invoke('file:save-clipboard-image'),
  saveTempAudio: (bytes: Uint8Array, ext?: string) => ipcRenderer.invoke('file:save-temp-audio', bytes, ext),
  getBundledSound: (name: string) => ipcRenderer.invoke('sound:get-bundled', name),
  readClipboardText: () => ipcRenderer.invoke('clipboard:read-text'),
  secureEncrypt: (text: string) => ipcRenderer.invoke('secure:encrypt', text),
  secureDecrypt: (b64: string) => ipcRenderer.invoke('secure:decrypt', b64),
  onContextPasteImage: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('context-menu:paste-image', handler)
    return () => ipcRenderer.removeListener('context-menu:paste-image', handler)
  },
  getFileDataUrl: (filePath: string) => ipcRenderer.invoke('file:get-file-data-url', filePath),
  pickFile: () => ipcRenderer.invoke('file:pick-file'),
  sendFile: (filePath: string) => ipcRenderer.invoke('file:send-file', filePath),
  acceptFileTransfer: (offer: any) => ipcRenderer.invoke('file:accept-transfer', offer),
  acceptFileTransferAuto: (offer: any) => ipcRenderer.invoke('file:accept-transfer-auto', offer),
  rejectFileTransfer: (transferId: string) => ipcRenderer.invoke('file:reject-transfer', transferId),
  cancelFileTransfer: (transferId: string, reason: string) => ipcRenderer.invoke('file:cancel-transfer', transferId, reason),
  pauseFileTransfer: (transferId: string) => ipcRenderer.invoke('file:pause-transfer', transferId),
  resumeFileTransfer: (transferId: string) => ipcRenderer.invoke('file:resume-transfer', transferId),
  getFileTransferState: (transferId: string) => ipcRenderer.invoke('file:get-transfer-state', transferId),

  // File transfer event listeners
  onFileTransferCreated: (callback: (state: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: any) => callback(state)
    ipcRenderer.on('file-transfer:created', listener)
    return () => ipcRenderer.removeListener('file-transfer:created', listener)
  },
  onFileTransferAccepted: (callback: (state: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: any) => callback(state)
    ipcRenderer.on('file-transfer:accepted', listener)
    return () => ipcRenderer.removeListener('file-transfer:accepted', listener)
  },
  onFileTransferProgress: (callback: (state: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: any) => callback(state)
    ipcRenderer.on('file-transfer:progress', listener)
    return () => ipcRenderer.removeListener('file-transfer:progress', listener)
  },
  onFileTransferCompleted: (callback: (state: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: any) => callback(state)
    ipcRenderer.on('file-transfer:completed', listener)
    return () => ipcRenderer.removeListener('file-transfer:completed', listener)
  },
  onFileTransferFailed: (callback: (state: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: any) => callback(state)
    ipcRenderer.on('file-transfer:failed', listener)
    return () => ipcRenderer.removeListener('file-transfer:failed', listener)
  },
  onFileTransferCancelled: (callback: (state: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: any) => callback(state)
    ipcRenderer.on('file-transfer:cancelled', listener)
    return () => ipcRenderer.removeListener('file-transfer:cancelled', listener)
  },

  // Notifications
  notificationSetEnabled: (enabled: boolean) => ipcRenderer.invoke('notification:set-enabled', enabled),
  notificationIsEnabled: () => ipcRenderer.invoke('notification:is-enabled'),
  notificationShowMessage: (from: string, message: string) => ipcRenderer.invoke('notification:show-message', from, message),
  notificationShowFileTransfer: (from: string, fileName: string) => ipcRenderer.invoke('notification:show-file-transfer', from, fileName),
  notificationShowStatusChange: (from: string, status: string) => ipcRenderer.invoke('notification:show-status-change', from, status)
})

// TypeScript definitions for the exposed API
export interface TTSConfig {
  voice?: string | null
  speed?: number
  volume?: number
  enabled?: boolean
}

export interface ElectronAPI {
  setBadgeCount: (count: number) => Promise<void>
  onMicShortcut: (callback: () => void) => () => void
  historyLoad: () => Promise<any[]>
  historySave: (messages: any[]) => Promise<{ success: boolean; error?: string }>
  historyClear: () => Promise<{ success: boolean; error?: string }>
  onHistoryCleared: (callback: () => void) => () => void
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  openExternal: (url: string) => Promise<void>
  onUpdateStatus: (callback: (s: { status: string; info?: any }) => void) => () => void
  updateCheck: () => Promise<{ ok: boolean; version?: string; reason?: string }>
  updateGetVersion: () => Promise<string>
  getLocalIPs: () => Promise<{ name: string; address: string }[]>
  startServer: (port: number, password: string) => Promise<{ success: boolean; error?: string }>
  stopServer: () => Promise<{ success: boolean }>
  startClient: (host: string, port: number, password: string, options?: { autoReconnect?: boolean }) => Promise<{ success: boolean; error?: string }>
  stopClient: () => Promise<{ success: boolean }>
  reconnectNow: () => Promise<{ success: boolean }>
  sendMessage: (message: any) => Promise<{ success: boolean }>
  getConnectionStatus: () => Promise<{ isConnected: boolean; isServer: boolean; isClient: boolean }>
  getDiagnostics: () => Promise<{
    connection: {
      role: string
      connected: boolean
      authenticated: boolean
      lastActivityTime: number
      reconnectDelay?: number
      isConnecting?: boolean
      lastRttMs?: number | null
      lastPongTime?: number
    } | null
    speechListening: boolean
    lastActivityAgo: number | null
  }>
  ttsSpeak: (text: string) => Promise<{ success: boolean; error?: string }>
  ttsStop: () => Promise<{ success: boolean }>
  ttsConfigure: (config: Partial<TTSConfig>) => Promise<{ success: boolean; config: TTSConfig }>
  ttsGetConfig: () => Promise<TTSConfig>
  ttsGetVoices: () => Promise<{ id: string; label: string }[]>
  ttsTest: () => Promise<{ success: boolean; error?: string }>
  ttsIsSpeaking: () => Promise<boolean>
  onMessage: (callback: (message: any) => void) => () => void
  onStatusChange: (callback: (status: any) => void) => () => void
  onConnectionStateChange: (callback: (state: string) => void) => () => void
  onConnectionLog: (callback: (entry: { message: string; detail?: string }) => void) => () => void
  onConnectionError: (callback: (error: string) => void) => () => void
  onPeerConnected: (callback: (info: any) => void) => () => void
  // Speech recognition (Windows native)
  speechStart: () => Promise<{ success: boolean; error?: string }>
  speechStop: () => Promise<{ success: boolean; error?: string }>
  speechIsListening: () => Promise<boolean>
  speechTest: () => Promise<{ success: boolean; error?: string; details?: { systemSpeechAvailable: boolean; microphoneAvailable: boolean; recognitionWorking: boolean } }>
  getVoskModel: () => Promise<{ success: boolean; data?: Uint8Array; error?: string }>
  onSpeechStateChange: (callback: (state: string) => void) => () => void
  onSpeechResult: (callback: (result: { text: string; confidence: number; isFinal: boolean }) => void) => () => void
  onSpeechError: (callback: (error: string) => void) => () => void
  saveClipboardImage: () => Promise<{ success: boolean; filePath?: string; error?: string }>
  saveTempAudio: (bytes: Uint8Array, ext?: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
  getBundledSound: (name: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>
  readClipboardText: () => Promise<string>
  secureEncrypt: (text: string) => Promise<string | null>
  secureDecrypt: (b64: string) => Promise<string | null>
  onContextPasteImage: (callback: () => void) => () => void
  getFileDataUrl: (filePath: string) => Promise<{ success: boolean; dataUrl?: string; kind?: 'audio' | 'image'; error?: string }>
  pickFile: () => Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }>
  sendFile: (filePath: string) => Promise<{ success: boolean; transferId?: string; error?: string }>
  acceptFileTransfer: (offer: any) => Promise<{ success: boolean; transferId?: string; cancelled?: boolean; error?: string }>
  acceptFileTransferAuto: (offer: any) => Promise<{ success: boolean; transferId?: string; savePath?: string; error?: string }>
  rejectFileTransfer: (transferId: string) => Promise<{ success: boolean; error?: string }>
  cancelFileTransfer: (transferId: string, reason: string) => Promise<{ success: boolean; error?: string }>
  pauseFileTransfer: (transferId: string) => Promise<{ success: boolean; error?: string }>
  resumeFileTransfer: (transferId: string) => Promise<{ success: boolean; error?: string }>
  getFileTransferState: (transferId: string) => Promise<any>
  onFileTransferCreated: (callback: (state: any) => void) => () => void
  onFileTransferAccepted: (callback: (state: any) => void) => () => void
  onFileTransferProgress: (callback: (state: any) => void) => () => void
  onFileTransferCompleted: (callback: (state: any) => void) => () => void
  onFileTransferFailed: (callback: (state: any) => void) => () => void
  onFileTransferCancelled: (callback: (state: any) => void) => () => void
  notificationSetEnabled: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean }>
  notificationIsEnabled: () => Promise<boolean>
  notificationShowMessage: (from: string, message: string) => Promise<{ success: boolean }>
  notificationShowFileTransfer: (from: string, fileName: string) => Promise<{ success: boolean }>
  notificationShowStatusChange: (from: string, status: string) => Promise<{ success: boolean }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
