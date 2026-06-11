import { useState, useEffect, useRef } from 'react'
import StatusDropdown from './StatusDropdown'
import MessageBubble from './MessageBubble'
import SettingsMenu from './SettingsMenu'
import { getSoundService } from '../services/sound-service'
import { getSpeechEngine } from '../services/speech-engine'
import { isEchoOfRecentTTS, recordSpokenText } from '../utils/echo-guard'
import { toSpokenText } from '../utils/linkify'
import { resolveInitialVoice, getSavedVoice, setSavedVoice } from '../utils/tts-prefs'
import { getSilenceTimeoutMs, getNoSpeechTimeoutMs } from '../utils/voice-timeouts'
import './ChatWindow.css'

interface Props {
  userIdentity: 'RLRJupiter' | 'Ripster'
  connectionConfig: { host: string; port: number }
  onDisconnect: () => void
}

export interface Message {
  id: string
  type: 'chat' | 'system' | 'file'
  from: string
  content: string
  timestamp: number
  deliveryStatus?: 'sending' | 'delivered'
  reactions?: { [emoji: string]: number }
  hasLink?: boolean
  linkPreview?: {
    url: string
    title: string
    description?: string
  }
    fileTransfer?: {
    transferId: string
    fileName: string
    fileSize: number
    fileType: string
    status: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled'
    direction: 'send' | 'receive'
    progress?: number
    speed?: number
    eta?: number
    error?: string
    filePath?: string
    paused?: boolean
  }
}

export type Status = 'Talk to me' | 'Listen only' | 'BRB' | 'Bed' | 'Dinner' | 'TV' | 'Away' | 'Company' | string

function ChatWindow({ userIdentity, connectionConfig, onDisconnect }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [myStatus, setMyStatus] = useState<Status>('Talk to me')
  const [peerStatus, setPeerStatus] = useState<Status>('Talk to me')
  const [isConnected, setIsConnected] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isDraggingInput, setIsDraggingInput] = useState(false)
  const [speechPreview, setSpeechPreview] = useState('')
  const [fileOfferDialog, setFileOfferDialog] = useState<any | null>(null)
  const [pendingPasteImages, setPendingPasteImages] = useState<string[]>([])
  const [isSending, setIsSending] = useState(false)
  const [peerTyping, setPeerTyping] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [connectionLog, setConnectionLog] = useState<Array<{ message: string; detail?: string }>>([])
  // Voice auto-response state
  const [isTTSSpeaking, setIsTTSSpeaking] = useState(false)
  const [isVoiceResponseMode, setIsVoiceResponseMode] = useState(false)
  const voiceMessageQueueRef = useRef<string[]>([])
  const isVoiceResponseModeRef = useRef<boolean>(false)
  const isListeningRef = useRef<boolean>(false) // mic actively capturing (manual or auto)
  const isTTSSpeakingRef = useRef<boolean>(false)
  const isVoiceQueueProcessingRef = useRef<boolean>(false)
  const isListenOnlyQueueProcessingRef = useRef<boolean>(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesAreaRef = useRef<HTMLDivElement>(null)
  const myStatusRef = useRef<Status>(myStatus)
  const lastSendTimeRef = useRef<number>(0)
  const speechLastResultRef = useRef<string>('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const noSpeechTimerRef = useRef<NodeJS.Timeout | null>(null)
  const hasSpokenRef = useRef<boolean>(false)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const wasDisconnectedRef = useRef<boolean>(false)
  const handleMicClickRef = useRef<() => void>(() => {})
  // Texts recently played by TTS, kept for echo detection (mic hearing speakers)
  const recentTTSTextsRef = useRef<Array<{ text: string; time: number }>>([])
  // Show the "no microphone" guidance only once instead of per-message spam
  const micErrorNoticeShownRef = useRef<boolean>(false)

  const peerName = userIdentity === 'RLRJupiter' ? 'Ripster' : 'RLRJupiter'
  const soundService = getSoundService()
  const [isMuted, setIsMuted] = useState(() => soundService.isMuted())

  // Paste from clipboard: an image becomes a pending picture to send; plain
  // text is appended to the input. Shared by Ctrl+V and the right-click menu.
  const pasteFromClipboard = async (textFromEvent?: string) => {
    const r = await window.electronAPI.saveClipboardImage()
    if (r.success && r.filePath && isConnected) {
      setPendingPasteImages(prev => [...prev, r.filePath!])
      return
    }
    // No image — paste text. Use the event's text if present, otherwise read
    // the OS clipboard directly (right-click Paste path).
    let text = textFromEvent
    if (!text) text = await window.electronAPI.readClipboardText()
    if (text) setInputText(prev => prev + text)
  }

  // Right-click "Paste picture" (from the native context menu) → paste image
  useEffect(() => {
    const off = window.electronAPI.onContextPasteImage(() => pasteFromClipboard())
    return off
  }, [isConnected])

  // Master mute toggle (header speaker button): silences beeps AND speech.
  // Muting also stops anything currently being read and clears the queue.
  const toggleMute = () => {
    const next = !isMuted
    soundService.setMuted(next)
    setIsMuted(next)
    if (next) {
      void window.electronAPI.ttsStop()
      setTTSSpeakingState(false)
      voiceMessageQueueRef.current = []
    }
  }

  const setTTSSpeakingState = (value: boolean) => {
    isTTSSpeakingRef.current = value
    setIsTTSSpeaking(value)
  }

  // Record a text the speakers are about to play so STT results matching it
  // can be discarded as echo
  const recordTTSText = (text: string) => {
    recentTTSTextsRef.current = recordSpokenText(recentTTSTextsRef.current, text)
  }

  // Speaker echo: the mic picking up our own TTS playback and transcribing it
  // back (which would then auto-send as a fake reply). See utils/echo-guard.
  const isLikelyTTSEcho = (recognized: string): boolean => {
    if (isEchoOfRecentTTS(recognized, recentTTSTextsRef.current)) {
      console.warn('[Voice] Discarding likely TTS echo:', recognized)
      return true
    }
    return false
  }

  // Update status ref when status changes
  useEffect(() => {
    myStatusRef.current = myStatus
  }, [myStatus])

  // Keep a ref of listening state for synchronous guards in async handlers
  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  // Apply the TTS voice on launch: the saved pick, or this identity's default
  // (RLRJupiter → Joe, Ripster → Alan). Persist it the first time so it sticks.
  useEffect(() => {
    const voice = resolveInitialVoice(userIdentity)
    window.electronAPI.ttsConfigure({ voice })
    if (getSavedVoice() === undefined) setSavedVoice(voice)
  }, [userIdentity])
  
  // Auto-focus input on component mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Sync initial connection status so UI state is accurate after screen transitions
  useEffect(() => {
    let isMounted = true

    window.electronAPI.getConnectionStatus()
      .then((status) => {
        if (!isMounted) return
        setIsConnected(status.isConnected)
      })
      .catch((error) => {
        console.warn('[Connection] Failed to fetch initial status:', error)
      })

    return () => {
      isMounted = false
    }
  }, [])

  // Clear unread badge when window gains focus
  useEffect(() => {
    const onFocus = () => {
      setUnreadCount(0)
      window.electronAPI.setBadgeCount(0).catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // Typing indicator: send typing when user types, clear after 2s idle
  useEffect(() => {
    if (!isConnected) return
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }
    if (inputText.trim()) {
      window.electronAPI.sendMessage({
        type: 'typing',
        payload: { isTyping: true },
        timestamp: Date.now()
      }).catch(() => {})
      typingTimeoutRef.current = setTimeout(() => {
        typingTimeoutRef.current = null
        window.electronAPI.sendMessage({
          type: 'typing',
          payload: { isTyping: false },
          timestamp: Date.now()
        }).catch(() => {})
      }, 2000)
    } else {
      window.electronAPI.sendMessage({
        type: 'typing',
        payload: { isTyping: false },
        timestamp: Date.now()
      }).catch(() => {})
    }
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [inputText, isConnected])

  // Keyboard shortcut: Ctrl+Space toggles mic
  useEffect(() => {
    const off = window.electronAPI.onMicShortcut(() => {
      handleMicClickRef.current()
    })
    return off
  }, [])

  // Initialize speech recognition (Vosk offline engine with SAPI fallback)
  useEffect(() => {
    let isMounted = true

    console.log('[Speech] Setting up speech engine')
    const engine = getSpeechEngine()

    // Warm up the Vosk model in the background so the first mic press
    // (or first "Talk to me" auto-response) starts instantly
    engine.preload()

    const offSpeechStateChange = engine.onStateChange((state) => {
      if (!isMounted) return
      console.log('[Speech] State change:', state)

      if (state === 'listening') {
        setIsListening(true)
        micErrorNoticeShownRef.current = false // mic works again; re-arm the notice
      } else {
        setIsListening(false)
        setSpeechPreview('')
        if (isVoiceResponseModeRef.current) {
          setIsVoiceResponseMode(false)
          isVoiceResponseModeRef.current = false
        }
      }
    })

    const offSpeechResult = engine.onResult((result) => {
      if (!isMounted) return
      console.log('[Speech] Result:', result.text, 'final:', result.isFinal)

      // Drop transcriptions of our own TTS playback picked up by the mic —
      // without this, the speakers' audio gets auto-sent back as a fake reply
      if (result.text.trim() && isLikelyTTSEcho(result.text)) {
        setSpeechPreview('')
        return
      }

      if (!result.isFinal) {
        // Interim words ARE speech: keep the mic alive and push the
        // auto-send countdown back (fixes the mic cutting off mid-sentence)
        markSpeechActivity()
        // Show accumulated finals + current hypothesis so long dictation
        // builds up visibly instead of fragments replacing each other
        const display = (speechLastResultRef.current + ' ' + result.text).trim()
        setInputText(display)
        setSpeechPreview(display)
        // Keep the newest dictated words visible once the box fills up
        requestAnimationFrame(() => {
          const el = inputRef.current
          if (el) el.scrollTop = el.scrollHeight
        })
      } else {
        // Final result - trigger auto-send after silence
        if (result.text.trim()) {
          handleSpeechResult({ text: result.text, confidence: result.confidence })
        }
      }
    })

    const offSpeechError = engine.onError((error) => {
      if (!isMounted) return
      console.error('[Speech] Error:', error)
      const isMicProblem = /audio|microphone|input device|getusermedia|notfound|crashed/i.test(error)
      if (isMicProblem) {
        // Show guidance once instead of spamming two bubbles per message
        if (!micErrorNoticeShownRef.current) {
          micErrorNoticeShownRef.current = true
          addSystemMessage('No working microphone found, so voice replies are off. Plug in/enable a mic, or switch your status to "Listen only" to hear messages without the mic. (This notice shows once.)')
        }
      } else {
        addSystemMessage(`Speech error: ${error}`)
      }
      setIsListening(false)
    })

    return () => {
      isMounted = false
      offSpeechStateChange()
      offSpeechResult()
      offSpeechError()
      // Stop speech when component unmounts
      void engine.stop()
    }
  }, [])

  // Reconnect immediately when the network comes back (skips the backoff
  // timer, so brief Wi-Fi blips don't leave the chat dead for seconds)
  useEffect(() => {
    const handleOnline = () => {
      console.log('[Connection] Network online, requesting immediate reconnect')
      void window.electronAPI.reconnectNow()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  // Keyboard shortcuts - Escape to close dialogs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSettings) {
          setShowSettings(false)
        } else if (fileOfferDialog) {
          handleFileOfferReject()
        } else if (isListening) {
          cancelSpeech()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSettings, fileOfferDialog, isListening])

  // Scroll to bottom when messages change
  useEffect(() => {
    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
      }
      // Also scroll the messages area directly as backup
      if (messagesAreaRef.current) {
        messagesAreaRef.current.scrollTop = messagesAreaRef.current.scrollHeight
      }
    }, 100)
  }, [messages])

  // Load message history on mount
  useEffect(() => {
    let mounted = true
    window.electronAPI.historyLoad().then((loaded: any[]) => {
      if (mounted && Array.isArray(loaded) && loaded.length > 0) {
        setMessages(loaded)
      }
    })
    return () => { mounted = false }
  }, [])

  // Debounced save of message history when messages change
  useEffect(() => {
    const t = setTimeout(() => {
      window.electronAPI.historySave(messages).catch(() => {})
    }, 2000)
    return () => clearTimeout(t)
  }, [messages])

  // Add initial connection message and setup listeners (only once)
  useEffect(() => {
    // Use a ref or flag to prevent double mounting in React StrictMode
    let mounted = true

    const offHistoryCleared = window.electronAPI.onHistoryCleared(() => {
      if (mounted) setMessages([])
    })

    // Create handlers that won't change on re-render
    const handleMessage = async (msg: any) => {
      if (!mounted) return

      if (msg.type === 'chat') {
        const chatMsg: Message = {
          id: msg.payload.id,
          type: 'chat',
          from: peerName,
          content: msg.payload.content,
          timestamp: msg.payload.timestamp,
          reactions: {},
          hasLink: msg.payload.hasLink,
          linkPreview: msg.payload.linkPreview
        }
        setMessages(prev => [...prev, chatMsg])
        window.electronAPI.sendMessage({
          type: 'chat-ack',
          payload: { messageId: msg.payload.id },
          timestamp: Date.now()
        }).catch(() => {})
        if (!document.hasFocus()) {
          setUnreadCount(prev => {
            const n = prev + 1
            window.electronAPI.setBadgeCount(n).catch(() => {})
            return n
          })
        }
        soundService.play('message-received')
        window.electronAPI.notificationShowMessage(peerName, msg.payload.content)

        // Voice handling for "Talk to me" and "Listen only" statuses
        const currentStatus = myStatusRef.current
        if (currentStatus === 'Talk to me' || currentStatus === 'Listen only') {
          try {
            // Speak a clean version: URLs become "link received" instead of
            // reading the raw https address aloud
            await announceViaVoice(toSpokenText(msg.payload.content), currentStatus)
          } catch (error) {
            console.error('[TTS] Error:', error)
            addSystemMessage('TTS error: ' + (error as Error).message)
          }
        } else {
          console.log('[TTS] Status does not use TTS, current:', currentStatus)
        }
      } else if (msg.type === 'status') {
        setPeerStatus(msg.payload.status)
        addSystemMessage(`${peerName} changed status to ${msg.payload.status}`)
      } else if (msg.type === 'reaction') {
        // Handle incoming reaction from peer (add)
        setMessages(prev => prev.map(message => {
          if (message.id === msg.payload.messageId) {
            const reactions = { ...message.reactions }
            reactions[msg.payload.emoji] = (reactions[msg.payload.emoji] || 0) + 1
            return { ...message, reactions }
          }
          return message
        }))
      } else if (msg.type === 'reaction-remove') {
        // Handle incoming reaction remove from peer
        setMessages(prev => prev.map(message => {
          if (message.id === msg.payload.messageId) {
            const reactions = { ...message.reactions }
            const current = reactions[msg.payload.emoji] ?? 0
            if (current <= 1) {
              delete reactions[msg.payload.emoji]
            } else {
              reactions[msg.payload.emoji] = current - 1
            }
            return { ...message, reactions }
          }
          return message
        }))
      } else if (msg.type === 'chat-ack') {
        setMessages(prev => prev.map(m =>
          m.id === msg.payload.messageId && m.type === 'chat'
            ? { ...m, deliveryStatus: 'delivered' as const }
            : m
        ))
      } else if (msg.type === 'typing') {
        setPeerTyping(!!msg.payload?.isTyping)
      } else if (msg.type === 'file-offer') {
        soundService.play('file-transfer-started')
        window.electronAPI.notificationShowFileTransfer(peerName, msg.payload.fileName)
        // Images: accept automatically and show inline in the chat viewer —
        // no "where do you want to save this?" dialog. Other file types still
        // prompt so the user chooses a destination.
        const name = String(msg.payload.fileName || '')
        const type = String(msg.payload.fileType || '')
        const isImage = /\.(jpe?g|png|gif|bmp|webp)$/i.test(name) || /(jpe?g|png|gif|bmp|webp)/i.test(type)
        if (isImage) {
          void acceptOffer(msg.payload, true)
          // Announce instead of reading the file name aloud
          void announceViaVoice('Picture received', myStatusRef.current)
        } else {
          setFileOfferDialog(msg.payload)
        }
      } else if (msg.type === 'file-accept') {
        // File accepted, start sending chunks
        addSystemMessage(`${peerName} accepted the file`)
        handleFileAccepted(msg.payload.transferId)
      } else if (msg.type === 'file-reject') {
        // File rejected
        addSystemMessage(`${peerName} rejected the file`)
        updateFileTransferStatus(msg.payload.transferId, 'cancelled')
      } else if (msg.type === 'file-chunk' || msg.type === 'file-complete' || msg.type === 'file-cancel') {
        // These are handled by the file transfer manager in the main process
        // We just update the UI based on events
      }
    }

    const handleConnectionState = (state: string) => {
      if (!mounted) return

      if (state === 'connected') {
        if (wasDisconnectedRef.current) {
          soundService.play('reconnect')
          wasDisconnectedRef.current = false
        }
        setIsConnected(true)
      } else if (state === 'disconnected') {
        wasDisconnectedRef.current = true
        setIsConnected(false)
        console.log('[Connection] Disconnected from peer')
      } else if (state === 'connecting' || state === 'reconnecting' || state === 'listening') {
        setIsConnected(false)
        console.log('[Connection] Waiting for a stable connection...')
      }
    }

    const handlePeerConnected = (info: any) => {
      if (!mounted) return

      // Silently handle peer connections to avoid spam
      // Connection status is shown in the header
      console.log('[Connection] Peer connected:', info)
    }

    const handleError = (error: string) => {
      if (!mounted) return

      // Silently log connection errors - they're handled by connection state
      // Only show critical errors to user
      console.log('[Connection] Error:', error)

      // Only show user-friendly errors for specific cases
      if (error.toLowerCase().includes('econnrefused')) {
        // Connection refused means peer is not listening - show once
        if (!error.toLowerCase().includes('econnreset')) {
          addSystemMessage('Unable to connect to peer. Please check that they are online.')
        }
      } else if (error.toLowerCase().includes('timeout') && !error.toLowerCase().includes('econnreset')) {
        addSystemMessage('Connection timed out. Retrying...')
      }
      // Ignore ECONNRESET and other transient errors - they spam the chat
    }

    // Setup listeners only once
    const offMessage = window.electronAPI.onMessage(handleMessage)
    const offConnectionState = window.electronAPI.onConnectionStateChange(handleConnectionState)
    const offConnectionLog = window.electronAPI.onConnectionLog((entry) => {
      if (!mounted) return
      setConnectionLog((prev) => [...prev.slice(-19), entry])
    })
    const offPeerConnected = window.electronAPI.onPeerConnected(handlePeerConnected)
    const offConnectionError = window.electronAPI.onConnectionError(handleError)

    // File transfer listeners
    const offFileTransferCreated = window.electronAPI.onFileTransferCreated((state: any) => {
      if (!mounted) return
      const msg: Message = {
        id: state.transferId,
        type: 'file',
        from: userIdentity,
        content: `Sending ${state.fileName}`,
        timestamp: Date.now(),
        fileTransfer: {
          transferId: state.transferId,
          fileName: state.fileName,
          fileSize: state.fileSize,
          fileType: state.fileType,
          status: state.status,
          direction: 'send',
          progress: 0
        }
      }
      setMessages(prev => [...prev, msg])
    })

    const offFileTransferAccepted = window.electronAPI.onFileTransferAccepted((state: any) => {
      if (!mounted) return
      updateFileTransferProgress(state)
    })

    const offFileTransferProgress = window.electronAPI.onFileTransferProgress((state: any) => {
      if (!mounted) return
      updateFileTransferProgress(state)
    })

    const offFileTransferCompleted = window.electronAPI.onFileTransferCompleted((state: any) => {
      if (!mounted) return
      updateFileTransferProgress(state)
      soundService.play('file-transfer-completed')
      if (state.direction === 'receive') {
        addSystemMessage(`File received: ${state.fileName}`)
      } else {
        addSystemMessage(`File sent: ${state.fileName}`)
      }
    })

    const offFileTransferFailed = window.electronAPI.onFileTransferFailed((state: any) => {
      if (!mounted) return
      updateFileTransferProgress(state)
      addSystemMessage(`File transfer failed: ${state.error || 'Unknown error'}`)
    })

    const offFileTransferCancelled = window.electronAPI.onFileTransferCancelled((state: any) => {
      if (!mounted) return
      updateFileTransferProgress(state)
      addSystemMessage(`File transfer cancelled`)
    })

    return () => {
      mounted = false
      offHistoryCleared()
      offMessage()
      offConnectionState()
      offConnectionLog()
      offPeerConnected()
      offConnectionError()
      offFileTransferCreated()
      offFileTransferAccepted()
      offFileTransferProgress()
      offFileTransferCompleted()
      offFileTransferFailed()
      offFileTransferCancelled()
    }
  }, [peerName])

  const addSystemMessage = (content: string) => {
    const msg: Message = {
      id: Date.now().toString(),
      type: 'system',
      from: 'system',
      content,
      timestamp: Date.now()
    }
    setMessages(prev => [...prev, msg])
  }

  const handleSendMessage = async () => {
    if (!inputText.trim()) return
    await sendChatMessage(inputText, { source: 'text' })
  }

  const handleStatusChange = async (newStatus: Status) => {
    setMyStatus(newStatus)
    addSystemMessage(`You changed status to ${newStatus}`)

    // If changing away from "Talk to me", stop any active speech recognition
    // and clear voice mode state - mic should NEVER run on other statuses
    if (newStatus !== 'Talk to me') {
      console.log('[Status] Changed away from Talk to me - stopping all voice activity')

      // Stop TTS if speaking
      if (isTTSSpeakingRef.current) {
        try {
          await window.electronAPI.ttsStop()
        } catch (error) {
          console.error('[Status] Error stopping TTS:', error)
        }
        setTTSSpeakingState(false)
      }

      // Stop speech recognition if listening
      if (isListening || isVoiceResponseModeRef.current) {
        try {
          await getSpeechEngine().stop()
        } catch (error) {
          console.error('[Status] Error stopping speech:', error)
        }
        setIsListening(false)
        setIsVoiceResponseMode(false)
        isVoiceResponseModeRef.current = false
      }

      // Clear all timers
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
      if (noSpeechTimerRef.current) {
        clearTimeout(noSpeechTimerRef.current)
        noSpeechTimerRef.current = null
      }

      // Clear voice queue
      voiceMessageQueueRef.current = []
      isVoiceQueueProcessingRef.current = false
      isListenOnlyQueueProcessingRef.current = false
      setSpeechPreview('')
    }

    // Send status change to peer
    await window.electronAPI.sendMessage({
      type: 'status',
      payload: { status: newStatus },
      timestamp: Date.now()
    })
  }

  const handleAddReaction = async (messageId: string, emoji: string) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        const reactions = { ...msg.reactions }
        reactions[emoji] = (reactions[emoji] || 0) + 1
        return { ...msg, reactions }
      }
      return msg
    }))
    await window.electronAPI.sendMessage({
      type: 'reaction',
      payload: { messageId, emoji },
      timestamp: Date.now()
    })
  }

  const handleRemoveReaction = async (messageId: string, emoji: string) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        const reactions = { ...msg.reactions }
        const current = reactions[emoji] ?? 0
        if (current <= 1) delete reactions[emoji]
        else reactions[emoji] = current - 1
        return { ...msg, reactions }
      }
      return msg
    }))
    await window.electronAPI.sendMessage({
      type: 'reaction-remove',
      payload: { messageId, emoji },
      timestamp: Date.now()
    })
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const sendChatMessage = async (
    rawText: string,
    options: { source?: 'speech' | 'text'; bypassThrottle?: boolean } = {}
  ): Promise<boolean> => {
    const text = rawText.trim()
    if (!text) {
      return false
    }

    if (!isConnected) {
      addSystemMessage('Cannot send message while disconnected.')
      return false
    }

    if (isSending) {
      return false
    }

    const now = Date.now()
    if (options.bypassThrottle !== true) {
      const timeSinceLastSend = now - lastSendTimeRef.current
      if (timeSinceLastSend < 100) {
        return false
      }
    }
    lastSendTimeRef.current = now

    setIsSending(true)

    try {
      const messageId = Date.now().toString()
      const hasLink = /https?:\/\/[^\s]+/i.test(text)
      const msg: Message = {
        id: messageId,
        type: 'chat',
        from: userIdentity,
        content: text,
        timestamp: now,
        deliveryStatus: 'sending',
        reactions: {},
        hasLink
      }

      if (hasLink) {
        const urlMatch = text.match(/https?:\/\/[^\s]+/i)
        if (urlMatch) {
          msg.linkPreview = {
            url: urlMatch[0],
            title: 'Link Preview',
            description: 'Click to open in browser'
          }
        }
      }

      const sendResult = await window.electronAPI.sendMessage({
        type: 'chat',
        payload: {
          id: msg.id,
          content: msg.content,
          timestamp: msg.timestamp,
          hasLink: msg.hasLink,
          linkPreview: msg.linkPreview
        },
        timestamp: msg.timestamp
      })

      if (!sendResult.success) {
        throw new Error('Message could not be sent because the connection is not ready.')
      }

      setMessages(prev => [...prev, msg])

      if (options.source !== 'speech') {
        setInputText('')
      }

      // Auto-focus input field after sending
      setTimeout(() => {
        inputRef.current?.focus()
      }, 0)

      return true
    } catch (error) {
      console.error('Failed to send message:', error)
      addSystemMessage('Failed to send message. Please check your connection.')
      return false
    } finally {
      setIsSending(false)
    }
  }

  /**
   * Any recognition activity — interim words OR finalized segments — counts
   * as "the user is talking": it cancels the no-speech timeout (so the mic
   * never shuts off mid-sentence) and restarts the silence countdown (so
   * auto-send only fires after real silence, not after the recognizer
   * happens to finalize a fragment).
   */
  const markSpeechActivity = () => {
    hasSpokenRef.current = true
    if (noSpeechTimerRef.current) {
      clearTimeout(noSpeechTimerRef.current)
      noSpeechTimerRef.current = null
    }
    armSilenceTimer()
  }

  // (Re)start the silence countdown. When it fires, whatever has been
  // finalized so far is sent as one message and listening stops.
  const armSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
    }
    silenceTimerRef.current = setTimeout(async () => {
      const text = speechLastResultRef.current.trim()
      if (!text) {
        // Nothing finalized yet. If the recognizer is mid-utterance it will
        // deliver a final shortly (which re-arms this timer); true dead air
        // is handled by the no-speech timeout.
        return
      }
      const success = await sendChatMessage(text, { source: 'speech', bypassThrottle: true })
      if (success) {
        console.log('[Voice] Message sent after silence, ending voice response mode')
        speechLastResultRef.current = ''

        // If in voice response mode, end it and process any queued messages
        if (isVoiceResponseModeRef.current) {
          await endVoiceResponseMode(true) // true = process queue after
        } else {
          // Manual mic mode - clear input. If messages came in WHILE the user
          // was dictating (they were deferred, not interrupted), now that the
          // user's message is sent, stop the manual session and read them.
          setInputText('')
          setSpeechPreview('')
          if (voiceMessageQueueRef.current.length > 0 &&
              (myStatusRef.current === 'Talk to me' || myStatusRef.current === 'Listen only')) {
            await stopSpeechSession()
            if (myStatusRef.current === 'Talk to me') {
              await processVoiceQueue()
            } else {
              await processListenOnlyQueue()
            }
          }
        }
      }
    }, getSilenceTimeoutMs())
  }

  const handleSpeechResult = async (result: any) => {
    const text = (result?.text || '').trim()
    if (!text) {
      return
    }

    // Finalized segments ACCUMULATE: recognizers emit one final per
    // utterance segment, so "i have to go" + "pick up the kids" must become
    // one message instead of the last fragment overwriting the first.
    speechLastResultRef.current = (speechLastResultRef.current + ' ' + text).trim()

    setInputText(speechLastResultRef.current)
    setSpeechPreview('')

    markSpeechActivity()
  }

  /**
   * Route a spoken phrase through the active voice mode. Shared by incoming
   * chat messages and event announcements ("Picture received", "Link
   * received") so they all respect Talk-to-me vs Listen-only behavior and
   * the TTS-enabled setting.
   */
  const announceViaVoice = async (spoken: string, status: Status) => {
    if (!spoken.trim()) return
    if (soundService.isMuted()) return // master mute silences spoken output
    if (status !== 'Talk to me' && status !== 'Listen only') return
    try {
      const ttsConfig = await window.electronAPI.ttsGetConfig()
      if (!ttsConfig.enabled) {
        console.log('[TTS] TTS is disabled in settings')
        return
      }

      // NEVER interrupt the user mid-dictation. If the mic is actively
      // capturing (manual or auto-response), just queue the message — it gets
      // read AFTER the user's message is sent (the silence timer drains the
      // queue). This prevents incoming messages from erasing in-progress
      // dictation and stopping the mic.
      if (isListeningRef.current) {
        console.log('[Voice] User is dictating — deferring incoming message until they finish')
        voiceMessageQueueRef.current.push(spoken)
        return
      }

      if (status === 'Talk to me') {
        if (isTTSSpeakingRef.current || isVoiceResponseModeRef.current || isVoiceQueueProcessingRef.current) {
          voiceMessageQueueRef.current.push(spoken)
        } else {
          voiceMessageQueueRef.current.push(spoken)
          await processVoiceQueue()
        }
      } else {
        if (isTTSSpeakingRef.current || isListenOnlyQueueProcessingRef.current) {
          voiceMessageQueueRef.current.push(spoken)
        } else {
          voiceMessageQueueRef.current.push(spoken)
          await processListenOnlyQueue()
        }
      }
    } catch (error) {
      console.error('[TTS] Error:', error)
      addSystemMessage('TTS error: ' + (error as Error).message)
    }
  }

  // Process voice queue: read all messages back-to-back, then start listening
  const processVoiceQueue = async () => {
    if (isVoiceQueueProcessingRef.current) {
      return
    }

    if (voiceMessageQueueRef.current.length === 0) {
      console.log('[Voice] Queue empty, nothing to process')
      return
    }

    isVoiceQueueProcessingRef.current = true
    console.log('[Voice] Processing queue:', voiceMessageQueueRef.current.length, 'messages')
    setTTSSpeakingState(true)

    try {
      // Read all queued messages back-to-back
      while (voiceMessageQueueRef.current.length > 0) {
        if (myStatusRef.current !== 'Talk to me') {
          console.log('[Voice] Status changed, clearing queue before STT')
          voiceMessageQueueRef.current = []
          break
        }

        const message = voiceMessageQueueRef.current.shift()!
        console.log('[Voice] TTS speaking:', message)
        recordTTSText(message) // remember for echo detection
        const speakResult = await window.electronAPI.ttsSpeak(message)
        if (!speakResult.success) {
          throw new Error(speakResult.error || 'TTS playback failed')
        }
        // Small pause between messages
        if (voiceMessageQueueRef.current.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }

      setTTSSpeakingState(false)

      if (myStatusRef.current !== 'Talk to me') {
        return
      }

      // All messages read, now start listening for response. The longer pause
      // lets speaker audio fully die down before the mic opens (echo guard
      // catches whatever still bleeds through).
      console.log('[Voice] All messages read, starting STT...')
      await new Promise(resolve => setTimeout(resolve, 700))
      soundService.play('ptt-start')
      await startVoiceResponseMode()
    } catch (error) {
      console.error('[Voice] Error processing queue:', error)
      setTTSSpeakingState(false)
      setIsVoiceResponseMode(false)
      isVoiceResponseModeRef.current = false
    } finally {
      isVoiceQueueProcessingRef.current = false
    }
  }

  // Process listen-only queue: read all messages, NO auto-mic
  const processListenOnlyQueue = async () => {
    if (isListenOnlyQueueProcessingRef.current) {
      return
    }

    if (voiceMessageQueueRef.current.length === 0) {
      console.log('[Listen Only] Queue empty, nothing to process')
      return
    }

    isListenOnlyQueueProcessingRef.current = true
    console.log('[Listen Only] Processing queue:', voiceMessageQueueRef.current.length, 'messages')
    setTTSSpeakingState(true)

    try {
      // Read all queued messages back-to-back
      while (voiceMessageQueueRef.current.length > 0) {
        const message = voiceMessageQueueRef.current.shift()!
        console.log('[Listen Only] TTS speaking:', message)
        recordTTSText(message) // user may click the mic right after; still guard echoes
        const speakResult = await window.electronAPI.ttsSpeak(message)
        if (!speakResult.success) {
          throw new Error(speakResult.error || 'TTS playback failed')
        }
        // Small pause between messages
        if (voiceMessageQueueRef.current.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }

      setTTSSpeakingState(false)
      console.log('[Listen Only] All messages read, done (no auto-mic)')
      // No mic auto-start - user can click mic manually if needed
    } catch (error) {
      console.error('[Listen Only] Error processing queue:', error)
      setTTSSpeakingState(false)
    } finally {
      isListenOnlyQueueProcessingRef.current = false
    }
  }

  // Start listening for voice response with 5 second no-speech timeout
  const startVoiceResponseMode = async () => {
    try {
      speechLastResultRef.current = ''
      setSpeechPreview('')
      hasSpokenRef.current = false
      setIsVoiceResponseMode(true)
      isVoiceResponseModeRef.current = true

      const result = await getSpeechEngine().start()
      if (!result.success) {
        throw new Error(result.error || 'Failed to start speech recognition')
      }

      // Start 5 second no-speech timeout
      startNoSpeechTimer()
    } catch (error) {
      console.error('[Voice] Failed to start voice response:', error)
      const msg = (error as Error).message || ''
      const isMicProblem = /audio|microphone|input device|getusermedia|notfound|crashed/i.test(msg)
      if (!isMicProblem) {
        addSystemMessage('Failed to start speech recognition: ' + msg)
      } else if (!micErrorNoticeShownRef.current) {
        micErrorNoticeShownRef.current = true
        addSystemMessage('No working microphone found, so voice replies are off. Plug in/enable a mic, or switch your status to "Listen only" to hear messages without the mic. (This notice shows once.)')
      }
      setIsListening(false)
      setIsVoiceResponseMode(false)
      isVoiceResponseModeRef.current = false
    }
  }

  // 5 second timeout - if no speech, cancel and stay quiet
  const startNoSpeechTimer = () => {
    if (noSpeechTimerRef.current) {
      clearTimeout(noSpeechTimerRef.current)
    }
    noSpeechTimerRef.current = setTimeout(() => {
      if (!hasSpokenRef.current && isVoiceResponseModeRef.current) {
        console.log('[Voice] No speech detected for 5 seconds, cancelling')
        void endVoiceResponseMode(false) // false = don't process queue, stay quiet
      }
    }, getNoSpeechTimeoutMs())
  }

  // End voice response mode
  const endVoiceResponseMode = async (processQueue: boolean = false) => {
    console.log('[Voice] Ending voice response mode, processQueue:', processQueue)

    // Clear all timers
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (noSpeechTimerRef.current) {
      clearTimeout(noSpeechTimerRef.current)
      noSpeechTimerRef.current = null
    }

    // Stop speech recognition
    try {
      await getSpeechEngine().stop()
      soundService.play('ptt-stop')
    } catch (error) {
      console.error('[Voice] Error stopping speech:', error)
    }

    setIsListening(false)
    setIsVoiceResponseMode(false)
    isVoiceResponseModeRef.current = false
    setSpeechPreview('')
    setInputText('')
    hasSpokenRef.current = false
    speechLastResultRef.current = '' // drop accumulated dictation with the session

    // If there are queued messages and we should process them
    if (processQueue && voiceMessageQueueRef.current.length > 0) {
      console.log('[Voice] Processing remaining queue after response')
      await processVoiceQueue()
    }
  }

  // Manual speech session for when user clicks mic button (not in Talk to me auto mode)
  const startSpeechSession = async () => {
    try {
      speechLastResultRef.current = ''
      setSpeechPreview('')
      hasSpokenRef.current = false
      soundService.play('ptt-start')

      const result = await getSpeechEngine().start()
      if (!result.success) {
        throw new Error(result.error || 'Failed to start speech recognition')
      }
    } catch (error) {
      console.error('[Chat] Failed to start speech:', error)
      addSystemMessage('Failed to start speech recognition: ' + (error as Error).message)
      setIsListening(false)
    }
  }

  const stopSpeechSession = async (options: { cancelled?: boolean } = {}) => {
    // Clear all timers
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (noSpeechTimerRef.current) {
      clearTimeout(noSpeechTimerRef.current)
      noSpeechTimerRef.current = null
    }

    try {
      soundService.play('ptt-stop')
      await getSpeechEngine().stop()
    } catch (error) {
      console.error('[Chat] Failed to stop speech:', error)
    } finally {
      setIsListening(false)
      setIsVoiceResponseMode(false)
      isVoiceResponseModeRef.current = false
      if (options.cancelled) {
        setSpeechPreview('')
        setInputText('')
        speechLastResultRef.current = '' // discard accumulated dictation
      }
    }
  }

  const handleMicClick = async () => {
    // If TTS is speaking, stop it first
    if (isTTSSpeakingRef.current) {
      console.log('[Mic] Stopping TTS to enable mic')
      try {
        await window.electronAPI.ttsStop()
      } catch (error) {
        console.error('[Mic] Error stopping TTS:', error)
      }
      setTTSSpeakingState(false)
      // Clear the queue since user wants to speak now
      voiceMessageQueueRef.current = []
    }

    if (isListening) {
      stopSpeechSession()
    } else {
      startSpeechSession()
    }
  }

  useEffect(() => {
    handleMicClickRef.current = handleMicClick
  }, [handleMicClick])

  // Cancel speech - discard text, stay quiet (don't process queue)
  const cancelSpeech = () => {
    console.log('[Voice] User cancelled speech')
    if (isVoiceResponseModeRef.current) {
      void endVoiceResponseMode(false) // false = stay quiet, don't read queued messages
    } else {
      void stopSpeechSession({ cancelled: true })
    }
  }

  // File transfer functions
  const handleFileSelect = async () => {
    try {
      const result = await window.electronAPI.pickFile()
      if (result.success && result.filePath) {
        await handleFileSend(result.filePath)
      }
    } catch (error) {
      console.error('Error selecting file:', error)
      addSystemMessage('Failed to select file')
    }
  }

  const handleFileSend = async (filePath: string) => {
    try {
      const result = await window.electronAPI.sendFile(filePath)
      if (!result.success) {
        addSystemMessage(`Failed to send file: ${result.error}`)
      }
    } catch (error) {
      console.error('Error sending file:', error)
      addSystemMessage('Failed to send file')
    }
  }

  const handleFileAccepted = async (transferId: string) => {
    // File chunk sending is handled automatically by the main process
    // We just need to update the UI status to show it's in progress
    updateFileTransferStatus(transferId, 'active')
  }

  const updateFileTransferProgress = (state: any) => {
    setMessages(prev => prev.map(msg => {
      if (msg.fileTransfer?.transferId === state.transferId) {
        const progress = state.totalChunks > 0
          ? (state.chunksTransferred / state.totalChunks) * 100
          : 0
        return {
          ...msg,
          fileTransfer: {
            ...msg.fileTransfer!,
            status: state.status,
            progress,
            speed: state.speed,
            eta: state.eta,
            ...(state.filePath != null && { filePath: state.filePath }),
            ...(state.paused != null && { paused: state.paused })
          }
        }
      }
      return msg
    }))
  }

  const updateFileTransferStatus = (transferId: string, status: string) => {
    setMessages(prev => prev.map(msg => {
      if (msg.fileTransfer?.transferId === transferId) {
        return {
          ...msg,
          fileTransfer: {
            ...msg.fileTransfer!,
            status: status as any
          }
        }
      }
      return msg
    }))
  }

  // Accept an incoming file. `auto` saves to the app cache with no save dialog
  // (used for images so they appear inline in the chat viewer immediately).
  const acceptOffer = async (offer: any, auto: boolean) => {
    try {
      const result = auto
        ? await window.electronAPI.acceptFileTransferAuto(offer)
        : await window.electronAPI.acceptFileTransfer(offer)
      if (result.success) {
        const msg: Message = {
          id: offer.transferId,
          type: 'file',
          from: peerName,
          content: `Receiving ${offer.fileName}`,
          timestamp: Date.now(),
          fileTransfer: {
            transferId: offer.transferId,
            fileName: offer.fileName,
            fileSize: offer.fileSize,
            fileType: offer.fileType,
            status: 'active',
            direction: 'receive',
            progress: 0
          }
        }
        setMessages(prev => [...prev, msg])
      } else if (!('cancelled' in result && result.cancelled)) {
        addSystemMessage(`Failed to accept file: ${result.error}`)
      }
    } catch (error) {
      console.error('Error accepting file:', error)
      addSystemMessage('Failed to accept file')
    }
  }

  const handleFileOfferAccept = async () => {
    if (!fileOfferDialog) return
    const offer = fileOfferDialog
    setFileOfferDialog(null)
    await acceptOffer(offer, false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleFileOfferReject = async () => {
    if (!fileOfferDialog) return

    try {
      await window.electronAPI.rejectFileTransfer(fileOfferDialog.transferId)
      addSystemMessage(`Rejected file: ${fileOfferDialog.fileName}`)
    } catch (error) {
      console.error('Error rejecting file:', error)
    }

    setFileOfferDialog(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleFileDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleFileDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.target === messagesAreaRef.current) {
      setIsDragging(false)
    }
  }

  const handleFileDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    setIsDraggingInput(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    const file = files[0]
    await handleFileSend(file.path)
  }

  const handleInputAreaDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) setIsDraggingInput(true)
  }
  const handleInputAreaDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.target === e.currentTarget) setIsDraggingInput(false)
  }
  const handleInputAreaDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60)
      const secs = Math.round(seconds % 60)
      return `${minutes}m ${secs}s`
    } else {
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      return `${hours}h ${minutes}m`
    }
  }

  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <div className="peer-section no-drag">
          <div className="peer-avatar">{peerName[0]}</div>
          <div className="peer-info">
            <div className="peer-name">{peerName}</div>
            <div className="connection-status">
              <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
              {isConnected ? peerStatus : 'Disconnected'}
            </div>
            {(peerTyping || isTTSSpeaking) && (
              <div className="header-status-extra" role="status">
                {isTTSSpeaking && <span className="tts-indicator">🔊 Reading…</span>}
                {peerTyping && <span className="typing-indicator">{peerName} is typing…</span>}
              </div>
            )}
          </div>
        </div>

        <div className="header-controls no-drag">
          <StatusDropdown currentStatus={myStatus} onStatusChange={handleStatusChange} />

          <button
            className={`icon-btn ${isMuted ? 'muted' : ''}`}
            onClick={toggleMute}
            title={isMuted ? 'Unmute (speech & sounds off)' : 'Mute speech & sounds'}
            aria-label={isMuted ? 'Unmute speech and sounds' : 'Mute speech and sounds'}
            aria-pressed={isMuted}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>

          <button
            className="icon-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
            aria-label="Open settings menu"
          >
            ⋮
          </button>
        </div>
      </div>

      <details className="connection-log-wrap no-drag">
        <summary>Connection log</summary>
        <div className="connection-log" role="log">
          {connectionLog.length === 0 ? (
            <div className="connection-log-line connection-log-empty">
              No connection events yet.
            </div>
          ) : (
            connectionLog.map((e, i) => (
              <div key={i} className="connection-log-line">
                {e.message}
                {e.detail != null && e.detail !== '' && <span className="connection-log-detail"> {e.detail}</span>}
              </div>
            ))
          )}
        </div>
      </details>

      {/* Settings menu overlay */}
      {showSettings && (
        <SettingsMenu
          onClose={() => {
            setShowSettings(false)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
          onReconnect={onDisconnect}
        />
      )}

      {/* Voice listening indicator */}
      {isListening && (
        <div className="voice-indicator" role="status" aria-live="polite">
          🎤 Listening... ({isVoiceResponseMode ? 'Auto-response mode' : 'Click mic to stop'})
          {speechPreview && <span className="voice-preview"> "{speechPreview}"</span>}
          <button className="cancel-btn" onClick={cancelSpeech} aria-label="Stop voice recognition">Stop</button>
        </div>
      )}

      {/* File offer dialog */}
      {fileOfferDialog && (
        <div className="file-offer-dialog" role="dialog" aria-labelledby="file-transfer-title" aria-describedby="file-transfer-desc">
          <div className="file-offer-content">
            <h3 id="file-transfer-title">File Transfer Request</h3>
            <p id="file-transfer-desc">{peerName} wants to send you a file:</p>
            <div className="file-info">
              <div className="file-icon" aria-hidden="true">📄</div>
              <div>
                <div className="file-name">{fileOfferDialog.fileName}</div>
                <div className="file-size">{formatBytes(fileOfferDialog.fileSize)}</div>
              </div>
            </div>
            <div className="dialog-buttons">
              <button className="btn-accept" onClick={handleFileOfferAccept} aria-label="Accept file transfer">Accept</button>
              <button className="btn-reject" onClick={handleFileOfferReject} aria-label="Reject file transfer">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div
        className={`messages-area ${isDragging ? 'dragging' : ''}`}
        ref={messagesAreaRef}
        onDragEnter={handleFileDragEnter}
        onDragLeave={handleFileDragLeave}
        onDragOver={handleFileDragOver}
        onDrop={handleFileDrop}
        role="log"
        aria-label="Chat messages"
      >
        {isDragging && (
          <div className="drag-overlay">
            <div className="drag-message">
              📎 Drop file here to send
            </div>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <div className="empty-state-title">No messages yet</div>
            <div className="empty-state-subtitle">
              Send a message to {peerName} to start the conversation
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.from === userIdentity}
              onAddReaction={handleAddReaction}
              onRemoveReaction={handleRemoveReaction}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area - supports drag-drop for files */}
      <div
        className={`input-area ${isDraggingInput ? 'dragging' : ''}`}
        onDragEnter={handleInputAreaDragEnter}
        onDragLeave={handleInputAreaDragLeave}
        onDragOver={handleInputAreaDragOver}
        onDrop={handleFileDrop}
      >
        {pendingPasteImages.length > 0 && (
          <div className="paste-images-bar">
            <span>{pendingPasteImages.length} image(s) ready</span>
            <button
              type="button"
              className="glass-button paste-send-all-btn"
              onClick={async () => {
                for (const path of pendingPasteImages) {
                  await handleFileSend(path)
                }
                setPendingPasteImages([])
              }}
              disabled={!isConnected || isSending}
              aria-label="Send all pasted images"
            >
              Send all
            </button>
            <button
              type="button"
              className="glass-button paste-clear-btn"
              onClick={() => setPendingPasteImages([])}
              aria-label="Clear pasted images"
            >
              Clear
            </button>
          </div>
        )}
        <div className="input-wrapper">
          <textarea
            ref={inputRef}
            className="input-field"
            placeholder={isConnected ? "Type your message... (or paste image to send)" : "Disconnected - cannot send messages"}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            onPaste={(e) => {
              const clipboardData = e.nativeEvent.clipboardData
              const text = clipboardData?.getData('text/plain') ?? ''
              e.preventDefault()
              pasteFromClipboard(text)
            }}
            rows={1}
            disabled={!isConnected || isSending}
            aria-label="Message input"
          />
          <div className="input-tools">
            <button
              className="tool-btn"
              title="Attach file"
              onClick={handleFileSelect}
              disabled={!isConnected}
              aria-label="Attach file"
            >
              📎
            </button>
            <button
              className={`tool-btn ${isListening ? 'recording' : ''}`}
              title={
                isListening
                  ? 'Stop listening'
                  : isTTSSpeaking
                    ? 'TTS is reading. Click to interrupt and speak.'
                    : 'Click to start voice input'
              }
              onClick={handleMicClick}
              disabled={!isConnected}
              aria-label={isListening ? "Stop listening" : "Start voice input"}
            >
              🎤
            </button>
            <button
              className="tool-btn send-btn"
              title="Send message"
              onClick={handleSendMessage}
              disabled={!isConnected || !inputText.trim() || isSending}
              aria-label="Send message"
            >
              ➤
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatWindow

