import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import StatusDropdown from './StatusDropdown'
import MessageBubble from './MessageBubble'
import SettingsMenu from './SettingsMenu'
import { getSoundService } from '../services/sound-service'
import { getSpeechEngine } from '../services/speech-engine'
import { isEchoOfRecentTTS, recordSpokenText } from '../utils/echo-guard'
import { toSpokenText } from '../utils/linkify'
import { resolveInitialVoice, getSavedVoice, setSavedVoice } from '../utils/tts-prefs'
import { dayLabel, isNewDay } from '../utils/date-format'
import { windowMessages, DEFAULT_RENDER_LIMIT, LOAD_MORE_STEP } from '../utils/message-window'
import { compareVersions, CHANGELOG } from '../utils/changelog'
import { getAutoAwayEnabled, getAutoAwayMinutes } from '../utils/auto-away'
import { getSpeakAnnouncements } from '../utils/announce-prefs'
import { getQuietHours, isQuietNow } from '../utils/quiet-hours'
import { getAutoTrimEnabled, trimOldMessages } from '../utils/auto-trim'
import { getVoiceRecorder } from '../services/voice-recorder'
import { getVoiceCall, CallState, CallStateInfo } from '../services/voice-call'
import { playSelectedNotification } from '../services/notification-sound'
import { getSilenceTimeoutMs, getNoSpeechTimeoutMs } from '../utils/voice-timeouts'
import EmojiPicker from './EmojiPicker'
import MediaGallery from './MediaGallery'
import ScreenshotPicker from './ScreenshotPicker'
import ScreenShareViewer from './ScreenShareViewer'
import { getScreenShare } from '../services/screen-share'
import {
  ScheduledMessage,
  loadScheduledMessages,
  saveScheduledMessages,
  newScheduledMessage,
  dueMessages,
  presetTimes,
  formatSendAt,
  toDatetimeLocalValue
} from '../utils/scheduled-messages'
import './ChatWindow.css'

interface Props {
  userIdentity: 'RLRJupiter' | 'Ramjet' | 'Ripster'
  connectionConfig: { host: string; port: number }
  onDisconnect: () => void
  onLogoff: () => void
}

export interface Message {
  id: string
  type: 'chat' | 'system' | 'file'
  from: string
  content: string
  timestamp: number
  deliveryStatus?: 'queued' | 'sending' | 'delivered' | 'seen'
  edited?: boolean
  removed?: boolean
  pinned?: boolean
  replyTo?: {
    id: string
    from: string
    snippet: string
  }
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

export type Status = 'Talk to me' | 'Listen only' | 'BRB' | 'Bed' | 'Dinner' | 'TV' | 'Away' | 'Company' | 'Home' | string

function ChatWindow({ userIdentity, connectionConfig, onDisconnect, onLogoff }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  // Persist statuses so they survive a restart/auto-update (otherwise my own
  // status reset to the default and the header showed the wrong peer status).
  const [myStatus, setMyStatus] = useState<Status>(() => {
    try { return (localStorage.getItem('rlrchat-my-status') as Status) || 'Talk to me' } catch { return 'Talk to me' }
  })
  // Status of each OTHER person in the group, keyed by identity. The header
  // lists everyone by name with their own status underneath.
  const [peerStatuses, setPeerStatuses] = useState<Record<string, Status>>(() => {
    try { return JSON.parse(localStorage.getItem('rlrchat-peer-statuses') || '{}') } catch { return {} }
  })
  // Who is actually online right now (derived from presence heartbeats). Starts
  // empty every launch — presence is live state, never restored from disk.
  const [onlinePeers, setOnlinePeers] = useState<Set<string>>(new Set())
  const [isConnected, setIsConnected] = useState(true)
  // Link quality: round-trip time to the hub, polled from diagnostics. Only the
  // connector (client) role measures RTT — the listener/hub returns no rtt, so
  // this stays null there and the indicator is simply hidden. No new protocol
  // traffic (reuses the existing ping/pong heartbeat).
  const [rttMs, setRttMs] = useState<number | null>(null)
  // Quiet hours (E3): whether DND is currently active — drives the 🌙 header
  // indicator. Re-evaluated on a timer so it flips at the window boundaries.
  // Gating decisions use the live isQuietNow(...) call, not this state.
  const [quietActive, setQuietActive] = useState(() => isQuietNow(getQuietHours(), new Date()))
  const [replyTarget, setReplyTarget] = useState<{ id: string; from: string; snippet: string } | null>(null)
  // When set, the input edits an existing sent message instead of sending new
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isShaking, setIsShaking] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showJumpToBottom, setShowJumpToBottom] = useState(false)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  // Voice call state (full-duplex audio over the existing encrypted channel)
  const [callState, setCallState] = useState<CallState>('idle')
  const [isCallMicMuted, setIsCallMicMuted] = useState(false)
  const [callSeconds, setCallSeconds] = useState(0)
  const callTimerRef = useRef<NodeJS.Timeout | null>(null)
  const callStartTimeRef = useRef<number>(0)
  const [showSettings, setShowSettings] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  // Full emoji picker: input mode (insert into textarea) + reaction mode (react to a message)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showScreenshot, setShowScreenshot] = useState(false)
  // Live screen sharing
  const [shareSourcePicker, setShareSourcePicker] = useState(false)
  const [isSharingScreen, setIsSharingScreen] = useState(false)
  const [viewingShareFrom, setViewingShareFrom] = useState<string | null>(null)
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null)
  // Render windowing: how many of the most recent messages to mount in the DOM.
  // Grows when the user pulls in older messages via "Load earlier".
  const [renderLimit, setRenderLimit] = useState(DEFAULT_RENDER_LIMIT)
  // Scheduled messages ("Send later")
  const [showScheduler, setShowScheduler] = useState(false)
  const [showScheduledList, setShowScheduledList] = useState(false)
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>(() => loadScheduledMessages())
  const [customScheduleValue, setCustomScheduleValue] = useState('')
  // "Send later" can instead be a reminder (alert) to me or the other person
  const [scheduleAsReminder, setScheduleAsReminder] = useState(false)
  const [reminderTarget, setReminderTarget] = useState<'me' | 'peer'>('peer')
  const [isListening, setIsListening] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isDraggingInput, setIsDraggingInput] = useState(false)
  const [speechPreview, setSpeechPreview] = useState('')
  const [fileOfferDialog, setFileOfferDialog] = useState<any | null>(null)
  const [pendingPasteImages, setPendingPasteImages] = useState<string[]>([])
  const [isSending, setIsSending] = useState(false)
  const [peerTyping, setPeerTyping] = useState(false)
  const [typingFrom, setTypingFrom] = useState<string>('')
  // Full-screen image viewer (lightbox): the data URL of the image being viewed
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  // "New messages" divider (E6): id of the first message received while the
  // window was unfocused. Renders a one-time divider above that message and
  // drives the "↓ N new" jump pill. In-memory only, so a restart never shows a
  // stale divider. Cleared when the user leaves the window (next away-batch
  // starts fresh) or jumps via the pill.
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null)
  const [connectionLog, setConnectionLog] = useState<Array<{ message: string; detail?: string }>>([])
  // Brief visual "Reconnected" flash on the connection log (replaces the old
  // reconnect beep, which was annoying)
  const [reconnectFlash, setReconnectFlash] = useState(false)
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
  // Live snapshot of messages for use inside long-lived event closures (e.g.
  // the history-sync request fired on reconnect)
  const messagesRef = useRef<Message[]>([])
  const myStatusRef = useRef<Status>(myStatus)
  const peerStatusesRef = useRef<Record<string, Status>>(peerStatuses)
  // Last time we heard anything from each identity (presence beats + any
  // message carrying `from`). Used to drive the per-person online dot.
  const lastSeenRef = useRef<Record<string, number>>({})
  const lastSendTimeRef = useRef<number>(0)
  const speechLastResultRef = useRef<string>('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const noSpeechTimerRef = useRef<NodeJS.Timeout | null>(null)
  const hasSpokenRef = useRef<boolean>(false)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Whether we've already told the peer we're typing in the current burst, so
  // we send `typing:true` once per burst instead of on every keystroke.
  const typingActiveRef = useRef<boolean>(false)
  const wasDisconnectedRef = useRef<boolean>(false)
  // Offline queue: messages composed while disconnected, flushed in order on reconnect
  const pendingQueueRef = useRef<Message[]>([])
  const isConnectedRef = useRef<boolean>(true)
  const replyTargetRef = useRef<{ id: string; from: string; snippet: string } | null>(null)
  // Read receipts: last received chat message id + the last id we sent a receipt for
  const lastReceivedChatIdRef = useRef<string | null>(null)
  const lastReceiptSentIdRef = useRef<string | null>(null)
  // Real "Seen": only mark a message seen when the window is focused, the
  // latest message is actually on screen (scrolled to the bottom), AND the user
  // has interacted recently — not just "the window happened to be focused."
  const lastActivityRef = useRef<number>(Date.now())
  const atBottomRef = useRef<boolean>(true)
  // Nudge throttle + shake animation timer
  const lastNudgeSentRef = useRef<number>(0)
  const shakeTimerRef = useRef<NodeJS.Timeout | null>(null)
  const handleMicClickRef = useRef<() => void>(() => {})
  // Auto-away bookkeeping
  const autoAwayActiveRef = useRef<boolean>(false)
  const statusBeforeAwayRef = useRef<Status>('Talk to me')
  const handleStatusChangeRef = useRef<(s: Status, opts?: { auto?: boolean }) => void>(() => {})
  const myAppVersionRef = useRef<string>('')
  // Texts recently played by TTS, kept for echo detection (mic hearing speakers)
  const recentTTSTextsRef = useRef<Array<{ text: string; time: number }>>([])
  // Scheduled messages: live send function for the timer + re-entrancy guard
  const sendChatMessageRef = useRef<typeof sendChatMessage>(async () => false)
  const isProcessingScheduledRef = useRef<boolean>(false)
  // Show the "no microphone" guidance only once instead of per-message spam
  const micErrorNoticeShownRef = useRef<boolean>(false)

  // Display label for "the other side". Connectors (RLRJupiter/Ramjet) only
  // ever talk to the hub, Ripster; the hub talks to a group of connectors.
  // Actual message attribution uses each message's own `from` (group chat),
  // with peerName only as a fallback when an older payload omits it.
  const peerName = userIdentity === 'Ripster' ? 'Group' : 'Ripster'
  // Everyone else in the 3-way chat, in display order — each shown by name with
  // their own status in the header.
  const otherIdentities: string[] = (
    userIdentity === 'Ripster' ? ['RLRJupiter', 'Ramjet']
      : userIdentity === 'RLRJupiter' ? ['Ripster', 'Ramjet']
        : ['Ripster', 'RLRJupiter']
  )
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
    try { localStorage.setItem('rlrchat-my-status', myStatus) } catch {}
  }, [myStatus])

  // Remember each peer's last-known status across restarts
  useEffect(() => {
    peerStatusesRef.current = peerStatuses
    try { localStorage.setItem('rlrchat-peer-statuses', JSON.stringify(peerStatuses)) } catch {}
  }, [peerStatuses])

  // Presence: broadcast a small heartbeat so others know we're alive, and
  // recompute who is online from the last time we heard from each person. A
  // person goes offline ~70s after their last beat (≈ two missed heartbeats),
  // which is how an asleep/closed machine stops showing a green dot.
  useEffect(() => {
    const BEAT_MS = 25000
    const OFFLINE_AFTER = 70000
    const beat = () => {
      if (!isConnectedRef.current) return
      window.electronAPI.sendMessage({
        type: 'presence',
        payload: { from: userIdentity },
        timestamp: Date.now()
      }).catch(() => {})
    }
    const recompute = () => {
      const now = Date.now()
      const next = new Set<string>()
      for (const [id, t] of Object.entries(lastSeenRef.current)) {
        if (now - t < OFFLINE_AFTER) next.add(id)
      }
      setOnlinePeers(prev => {
        if (prev.size === next.size && [...prev].every(x => next.has(x))) return prev
        return next
      })
    }
    const startup = setTimeout(beat, 1500)
    const beatTimer = setInterval(beat, BEAT_MS)
    const recomputeTimer = setInterval(recompute, 5000)
    return () => {
      clearTimeout(startup)
      clearInterval(beatTimer)
      clearInterval(recomputeTimer)
    }
  }, [userIdentity])

  // Keep a ref of listening state for synchronous guards in async handlers
  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  // Connection state ref so async/timer callbacks (speech auto-send) route
  // through the offline queue correctly instead of seeing a stale value
  useEffect(() => {
    isConnectedRef.current = isConnected
  }, [isConnected])

  // Keep a live ref to handleStatusChange for the auto-away timer
  useEffect(() => {
    handleStatusChangeRef.current = handleStatusChange
  })

  // Cache our app version (for peer-version gossip) and set the update-check
  // cadence by identity: Ripster checks every 5 min so it gets new builds fast;
  // RLRJupiter every 6h and catches up out-of-cycle when Ripster reports newer.
  useEffect(() => {
    window.electronAPI.updateGetVersion().then((v) => { myAppVersionRef.current = v }).catch(() => {})
    const everyFiveMin = 5 * 60 * 1000
    const everySixHours = 6 * 60 * 60 * 1000
    void window.electronAPI.updateSetInterval(userIdentity === 'Ripster' ? everyFiveMin : everySixHours).catch?.(() => {})
  }, [userIdentity])

  // Keep a live ref to sendChatMessage for the scheduled-messages timer
  useEffect(() => {
    sendChatMessageRef.current = sendChatMessage
  })

  // Screen share: tell the service who we are, and open/close the viewer when a
  // remote share starts/stops.
  useEffect(() => {
    const ss = getScreenShare()
    ss.setIdentity(userIdentity)
    const off = ss.onViewerEvent((ev) => {
      if (ev.type === 'start') setViewingShareFrom(ev.from || peerName)
      else setViewingShareFrom(null)
    })
    return () => {
      off()
      if (ss.isSharing()) ss.stopShare()
    }
  }, [userIdentity, peerName])

  // Scheduled messages ("Send later"): localStorage is the source of truth so
  // they survive restarts. Every ~15s (plus shortly after launch, to catch
  // already-overdue ones) send whatever is due through the normal send path —
  // which also handles the offline queue if we're disconnected.
  useEffect(() => {
    const tick = async () => {
      if (isProcessingScheduledRef.current) return
      const list = loadScheduledMessages()
      const due = dueMessages(list, Date.now())
      if (due.length === 0) return
      isProcessingScheduledRef.current = true
      try {
        for (const m of due) {
          let done = false
          if (m.kind === 'reminder') {
            if (m.target === 'peer') {
              // Best-effort alert to the other person
              await window.electronAPI.sendMessage({
                type: 'reminder',
                payload: { text: m.text, from: userIdentity },
                timestamp: Date.now()
              }).catch(() => {})
              addSystemMessage(`⏰ Reminder sent: ${m.text}`)
            } else {
              // Remind myself: chime + shake + spoken, right here. Quiet hours
              // suppress the chime/shake/TTS; the reminder still shows.
              addSystemMessage(`⏰ Reminder: ${m.text}`)
              if (!isQuietNow(getQuietHours(), new Date())) {
                if (!getSoundService().isMuted()) soundService.play('nudge')
                triggerShake()
                void announceViaVoice(`Reminder. ${toSpokenText(m.text)}`, myStatusRef.current)
              }
            }
            done = true
          } else {
            done = await sendChatMessageRef.current(m.text, { source: 'scheduled', bypassThrottle: true })
          }
          if (done) {
            const next = loadScheduledMessages().filter((x) => x.id !== m.id)
            saveScheduledMessages(next)
            setScheduledMessages(next)
          }
          // On failure leave it stored — the next tick retries
        }
      } finally {
        isProcessingScheduledRef.current = false
      }
    }
    const startup = setTimeout(tick, 2000)
    const timer = setInterval(tick, 15000)
    return () => {
      clearTimeout(startup)
      clearInterval(timer)
    }
  }, [])

  // Auto-away: after N minutes idle, flip an active status to Away; restore on
  // the next interaction. Only triggers from "Talk to me"/"Listen only" so an
  // intentional status (Bed, Dinner, …) is never overridden.
  useEffect(() => {
    let lastActivity = Date.now()
    // Single pointer/keyboard activity handler covering both jobs: restoring
    // from auto-away AND refreshing the "Seen" read-receipt time. (Previously
    // two separate effects each registered the same five high-frequency
    // listeners.)
    const onActivity = () => {
      lastActivity = Date.now()
      lastActivityRef.current = lastActivity
      if (autoAwayActiveRef.current) {
        autoAwayActiveRef.current = false
        handleStatusChangeRef.current(statusBeforeAwayRef.current)
      }
      maybeMarkSeen()
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel']
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    const timer = setInterval(() => {
      if (!getAutoAwayEnabled()) return
      const idleMs = Date.now() - lastActivity
      const limit = getAutoAwayMinutes() * 60 * 1000
      const cur = myStatusRef.current
      if (!autoAwayActiveRef.current && idleMs >= limit && (cur === 'Talk to me' || cur === 'Listen only')) {
        statusBeforeAwayRef.current = cur
        autoAwayActiveRef.current = true
        handleStatusChangeRef.current('Away', { auto: true })
      }
    }, 15000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity))
      clearInterval(timer)
    }
  }, [])

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

  // Clear unread badge when window gains focus; also tell the peer the most
  // recent chat message has now been seen (read receipt)
  useEffect(() => {
    const onFocus = () => {
      setUnreadCount(0)
      window.electronAPI.setBadgeCount(0).catch(() => {})
      // Bringing the window to the front is a deliberate look → counts as activity
      lastActivityRef.current = Date.now()
      maybeMarkSeen()
    }
    // Leaving the window retires the current "New messages" divider so the next
    // away-batch gets a fresh one. The divider stays visible while focused (so
    // the user can see where they left off after returning).
    const onBlur = () => setFirstUnreadId(null)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // Link-quality poll: while connected, read the round-trip time from
  // diagnostics every 5s (IPC only, no network traffic). Cleared when
  // disconnected/unmounted so a stale ping never lingers.
  useEffect(() => {
    if (!isConnected) {
      setRttMs(null)
      return
    }
    let active = true
    const poll = async () => {
      try {
        const diag = await window.electronAPI.getDiagnostics()
        if (!active) return
        const rtt = diag?.connection?.lastRttMs
        setRttMs(typeof rtt === 'number' ? rtt : null)
      } catch (_) {
        if (active) setRttMs(null)
      }
    }
    void poll()
    const id = setInterval(poll, 5000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [isConnected])

  // Tray "Set status" submenu (E2): apply a status chosen from the system tray.
  useEffect(() => {
    const off = window.electronAPI.onTraySetStatus((status) => {
      handleStatusChangeRef.current(status as Status)
    })
    return off
  }, [])

  // Quiet-hours indicator poll: re-evaluate every 30s so the 🌙 header badge
  // flips on/off at the window boundaries. Also re-checks on the custom event
  // fired when the setting changes in Settings.
  useEffect(() => {
    const refresh = () => setQuietActive(isQuietNow(getQuietHours(), new Date()))
    refresh()
    const id = setInterval(refresh, 30000)
    window.addEventListener('rlr:quiet-hours-changed', refresh)
    return () => {
      clearInterval(id)
      window.removeEventListener('rlr:quiet-hours-changed', refresh)
    }
  }, [])

  // (Pointer/keyboard "Seen" tracking is handled by the consolidated activity
  // listener in the auto-away effect above.)

  // Typing indicator: send `typing:true` once when a typing burst starts, then
  // `typing:false` after 2s idle. Throttling to the start of the burst avoids an
  // IPC + network message on every keystroke.
  useEffect(() => {
    if (!isConnected) return
    const sendTyping = (isTyping: boolean) => {
      window.electronAPI.sendMessage({
        type: 'typing',
        payload: { isTyping, from: userIdentity },
        timestamp: Date.now()
      }).catch(() => {})
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }
    if (inputText.trim()) {
      if (!typingActiveRef.current) {
        typingActiveRef.current = true
        sendTyping(true)
      }
      typingTimeoutRef.current = setTimeout(() => {
        typingTimeoutRef.current = null
        typingActiveRef.current = false
        sendTyping(false)
      }, 2000)
    } else if (typingActiveRef.current) {
      // Input cleared mid-burst — tell the peer we stopped right away.
      typingActiveRef.current = false
      sendTyping(false)
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

  // Voice call: subscribe to call state changes and surface them in the chat
  useEffect(() => {
    const voiceCall = getVoiceCall()

    const offCallState = voiceCall.onStateChange((state: CallState, info?: CallStateInfo) => {
      setCallState(state)

      if (state === 'in-call') {
        // A live call owns the mic — never run a voice-message recording at
        // the same time (the record button is also disabled during a call)
        stopRecordingTimer()
        setIsRecordingVoice(false)
        getVoiceRecorder().cancel()
        setIsCallMicMuted(false)
        setCallSeconds(0)
        callStartTimeRef.current = Date.now()
        if (callTimerRef.current) clearInterval(callTimerRef.current)
        callTimerRef.current = setInterval(() => setCallSeconds((s) => s + 1), 1000)
        addSystemMessage('📞 Call started')
        return
      }

      if (callTimerRef.current) {
        clearInterval(callTimerRef.current)
        callTimerRef.current = null
      }

      if (state === 'idle' && info?.reason) {
        const wasInCall = info.previous === 'in-call'
        const duration = formatCallDuration(
          callStartTimeRef.current ? Math.round((Date.now() - callStartTimeRef.current) / 1000) : 0
        )
        switch (info.reason) {
          case 'ended':
          case 'peer-ended':
            if (wasInCall) addSystemMessage(`Call ended (${duration})`)
            else if (info.previous === 'ringing') addSystemMessage(`Missed call from ${peerName}`)
            else addSystemMessage('Call cancelled')
            break
          case 'declined':
            addSystemMessage('Call declined')
            break
          case 'peer-declined':
            addSystemMessage(`${peerName} declined the call`)
            break
          case 'cancelled':
            addSystemMessage('Call cancelled')
            break
          case 'missed':
            addSystemMessage(`Missed call from ${peerName}`)
            break
          case 'no-answer':
            addSystemMessage(`${peerName} didn't answer`)
            break
          case 'mic-error':
            // onError below already reported the failure details
            break
          case 'disconnected':
            if (wasInCall) addSystemMessage(`Call ended — connection lost (${duration})`)
            break
          case 'answered-elsewhere':
            addSystemMessage('Call answered on another device')
            break
        }
        callStartTimeRef.current = 0
      }
    })

    const offCallError = voiceCall.onError((error) => {
      addSystemMessage(`Call error: ${error}`)
    })

    return () => {
      offCallState()
      offCallError()
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current)
        callTimerRef.current = null
      }
      voiceCall.endLocal()
    }
  }, [peerName])

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
        if (lightboxUrl) {
          setLightboxUrl(null)
        } else if (showScheduler) {
          setShowScheduler(false)
        } else if (showScheduledList) {
          setShowScheduledList(false)
        } else if (showSettings) {
          setShowSettings(false)
        } else if (fileOfferDialog) {
          handleFileOfferReject()
        } else if (isListening) {
          cancelSpeech()
        } else if (editingId) {
          cancelEdit()
        } else if (replyTarget) {
          setReplyTargetBoth(null)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxUrl, showScheduler, showScheduledList, showSettings, fileOfferDialog, isListening, editingId, replyTarget])

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

  // Load message history on mount, then restore any persisted offline queue so
  // messages composed while disconnected survive a restart and still send.
  useEffect(() => {
    let mounted = true
    window.electronAPI.historyLoad().then((loaded: any[]) => {
      if (!mounted) return
      // History save includes queued items; drop them here — the authoritative
      // copy is the persisted queue restored just below (avoids duplicates).
      const base = (Array.isArray(loaded) ? loaded : []).filter((m: any) => m?.deliveryStatus !== 'queued')

      let queued: Message[] = []
      try {
        const raw = localStorage.getItem('rlrchat-pending-queue')
        const arr = raw ? JSON.parse(raw) : []
        if (Array.isArray(arr)) {
          queued = arr
            .filter((m: any) => m && m.id && m.type === 'chat')
            .map((m: any) => ({ ...m, deliveryStatus: 'queued' as const }))
        }
      } catch (_) {}
      pendingQueueRef.current = queued

      const seen = new Set(base.map((m: any) => m.id))
      const merged = [...base, ...queued.filter(m => !seen.has(m.id))]
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      if (merged.length > 0) setMessages(merged)

      // Already connected at mount? Flush right away.
      if (queued.length > 0 && isConnectedRef.current) void flushPendingQueue()
    })
    return () => { mounted = false }
  }, [])

  // Debounced save of message history when messages change. 4s so bursts of
  // delivery-status / reaction updates coalesce into a single write; the main
  // process additionally skips the encrypt+write when the payload is unchanged.
  useEffect(() => {
    const t = setTimeout(() => {
      window.electronAPI.historySave(messages).catch(() => {})
    }, 4000)
    return () => clearTimeout(t)
  }, [messages])

  // Keep a live snapshot for event closures (history-sync on reconnect reads it)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Auto-trim: if enabled, drop messages older than ~3 months (on launch and
  // hourly). The debounced history save then persists the trimmed list.
  useEffect(() => {
    const run = () => {
      if (!getAutoTrimEnabled()) return
      setMessages(prev => {
        const trimmed = trimOldMessages(prev)
        return trimmed.length === prev.length ? prev : trimmed
      })
    }
    const startup = setTimeout(run, 4000)
    const timer = setInterval(run, 60 * 60 * 1000)
    return () => { clearTimeout(startup); clearInterval(timer) }
  }, [])

  // Auto-post "what's new" once after updating to a new version (delayed so it
  // lands after history has loaded). Stored per device.
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const v = await window.electronAPI.updateGetVersion()
        if (!v) return
        let lastSeen = ''
        try { lastSeen = localStorage.getItem('rlrchat-last-seen-version') || '' } catch (_) {}
        if (lastSeen === v) return
        const entry = CHANGELOG.find((e) => e.version === v)
        if (entry && (!lastSeen || compareVersions(v, lastSeen) > 0)) {
          addSystemMessage(`📋 Updated to v${v} — what's new:\n` + entry.items.map((i) => `• ${i}`).join('\n'))
        }
        try { localStorage.setItem('rlrchat-last-seen-version', v) } catch (_) {}
      } catch (_) {}
    }, 2500)
    return () => clearTimeout(t)
  }, [])

  // "Post to chat" from the Release Notes viewer drops the notes in as a local
  // system message (visible in your chat; not sent to the others).
  useEffect(() => {
    const onPost = (e: Event) => {
      const text = (e as CustomEvent).detail
      if (typeof text === 'string' && text) addSystemMessage(text)
    }
    window.addEventListener('rlr:post-release-notes', onPost as EventListener)
    return () => window.removeEventListener('rlr:post-release-notes', onPost as EventListener)
  }, [])

  // Merge a batch of history messages (from the hub's history-sync reply) into
  // state, de-duped by id. Used so a machine that was asleep/off catches up on
  // everything it missed when it reconnects.
  const mergeHistory = (incoming: any[]) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return
    setMessages(prev => {
      const seen = new Set(prev.map(m => m.id))
      const additions = incoming
        .filter((m: any) => m && m.id && !seen.has(m.id) && (m.type === 'chat' || m.type === 'file'))
        .map((m: any) => ({ ...m, reactions: m.reactions || {} }))
      if (additions.length === 0) return prev
      const merged = [...prev, ...additions]
      merged.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      return merged
    })
  }

  // Add initial connection message and setup listeners (only once)
  useEffect(() => {
    // Use a ref or flag to prevent double mounting in React StrictMode
    let mounted = true

    const offHistoryCleared = window.electronAPI.onHistoryCleared(() => {
      if (!mounted) return
      // Clear EVERYTHING locally: on-screen messages, the persisted offline
      // queue, and the seen/receipt bookkeeping…
      setMessages([])
      pendingQueueRef.current = []
      try { localStorage.removeItem('rlrchat-pending-queue') } catch (_) {}
      lastReceivedChatIdRef.current = null
      lastReceiptSentIdRef.current = null
      // …and set a "cleared" watermark so history-sync won't re-pull anything
      // from before the clear when we reconnect (otherwise clear wouldn't stick
      // for a connector). New messages after this moment still sync normally.
      try { localStorage.setItem('rlrchat-history-cleared-at', String(Date.now())) } catch (_) {}
    })

    // Create handlers that won't change on re-render
    const handleMessage = async (msg: any) => {
      if (!mounted) return

      // Presence: any message carrying a sender means that person is alive now.
      const fromId = msg.payload?.from
      if (fromId && fromId !== userIdentity) lastSeenRef.current[fromId] = Date.now()

      if (msg.type === 'chat') {
        // Group chat: attribute to the actual sender carried in the payload.
        const senderName = msg.payload.from || peerName
        const chatMsg: Message = {
          id: msg.payload.id,
          type: 'chat',
          from: senderName,
          content: msg.payload.content,
          timestamp: msg.payload.timestamp,
          reactions: {},
          hasLink: msg.payload.hasLink,
          linkPreview: msg.payload.linkPreview,
          replyTo: msg.payload.replyTo
        }
        // Guard against duplicates: the same message can arrive more than once
        // (a reconnect re-flushing the offline queue, relay timing, etc.).
        setMessages(prev => prev.some(m => m.id === chatMsg.id) ? prev : [...prev, chatMsg])
        window.electronAPI.sendMessage({
          type: 'chat-ack',
          payload: { messageId: msg.payload.id },
          timestamp: Date.now()
        }).catch(() => {})
        // Read receipt: tell the peer we've actually seen it (window focused).
        // If unfocused now, the window 'focus' handler sends it later.
        lastReceivedChatIdRef.current = msg.payload.id
        // Only marks Seen if focused + at bottom + recently active
        maybeMarkSeen()
        if (!document.hasFocus()) {
          setUnreadCount(prev => {
            const n = prev + 1
            window.electronAPI.setBadgeCount(n).catch(() => {})
            return n
          })
          // Mark where the unread run starts (first of the away-batch).
          setFirstUnreadId(prev => prev ?? chatMsg.id)
        }
        window.electronAPI.notificationShowMessage(senderName, msg.payload.content)

        // Notification sound: play the selected sound only when NOT in a
        // speech status (those read the message aloud via TTS) — unless TTS is
        // turned off, in which case fall back to the sound. Mute is handled
        // inside playSelectedNotification.
        {
          const st = myStatusRef.current
          const speechStatus = st === 'Talk to me' || st === 'Listen only'
          let playNotif = !speechStatus
          if (speechStatus) {
            try { const cfg = await window.electronAPI.ttsGetConfig(); if (!cfg.enabled) playNotif = true } catch (_) {}
          }
          if (playNotif && !isQuietNow(getQuietHours(), new Date())) void playSelectedNotification()
        }

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
        // Only announce a genuine change. On reconnect each side re-broadcasts
        // its current status to re-sync; if it's unchanged, stay quiet so we
        // don't spam duplicate "changed status to X" lines.
        const statusFrom = msg.payload.from || peerName
        const newStatus = msg.payload.status
        if (peerStatusesRef.current[statusFrom] !== newStatus) {
          addSystemMessage(`${statusFrom} changed status to ${newStatus}`)
          announceEvent(`${statusFrom} is now ${newStatus}`)
        }
        setPeerStatuses(prev => ({ ...prev, [statusFrom]: newStatus }))
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
          m.id === msg.payload.messageId && m.type === 'chat' && m.deliveryStatus !== 'seen'
            ? { ...m, deliveryStatus: 'delivered' as const }
            : m
        ))
      } else if (msg.type === 'read-receipt') {
        // Peer has seen this message — upgrade its delivery status
        setMessages(prev => prev.map(m =>
          m.id === msg.payload.messageId && m.type === 'chat' && m.from === userIdentity
            ? { ...m, deliveryStatus: 'seen' as const }
            : m
        ))
      } else if (msg.type === 'nudge') {
        addSystemMessage(`${peerName} nudged you! 👋`)
        // Quiet hours suppress the buzz + shake (the message still shows).
        if (!isQuietNow(getQuietHours(), new Date())) {
          if (!getSoundService().isMuted()) {
            soundService.play('nudge')
          }
          triggerShake()
        }
      } else if (msg.type === 'app-version') {
        // Peer told us their app version. If they're on a newer build, do an
        // immediate out-of-cycle update check so we catch up without waiting
        // for the periodic timer.
        const peerVersion = String(msg.payload?.version || '')
        if (peerVersion && myAppVersionRef.current && compareVersions(peerVersion, myAppVersionRef.current) > 0) {
          console.log('[Update] Peer is on newer version', peerVersion, '— checking for update now')
          void window.electronAPI.updateCheck()
        }
      } else if (msg.type === 'typing') {
        setPeerTyping(!!msg.payload?.isTyping)
        setTypingFrom(msg.payload?.isTyping ? (msg.payload?.from || peerName) : '')
      } else if (msg.type === 'history-response') {
        // The hub answered our history-sync request with everything we missed
        mergeHistory(msg.payload?.messages)
      } else if (msg.type === 'edit') {
        // Peer edited one of their messages — update it in place
        setMessages(prev => prev.map(m =>
          m.id === msg.payload?.id ? { ...m, content: String(msg.payload?.content ?? m.content), edited: true } : m
        ))
      } else if (msg.type === 'unsend') {
        // Peer unsent one of their messages — show a tombstone
        setMessages(prev => prev.map(m =>
          m.id === msg.payload?.id ? { ...m, removed: true, content: '' } : m
        ))
      } else if (msg.type === 'pin' || msg.type === 'unpin') {
        // Peer pinned/unpinned a message — reflect it locally (syncs the bar).
        const pinned = msg.type === 'pin'
        setMessages(prev => prev.map(m =>
          m.id === msg.payload?.messageId ? { ...m, pinned } : m
        ))
      } else if (msg.type === 'reminder') {
        // A scheduled reminder fired for us — alert prominently. Quiet hours
        // suppress the chime/shake/TTS; the reminder still shows in the chat.
        const text = String(msg.payload?.text || '')
        addSystemMessage(`⏰ Reminder: ${text}`)
        if (!isQuietNow(getQuietHours(), new Date())) {
          if (!getSoundService().isMuted()) soundService.play('nudge')
          triggerShake()
          void announceViaVoice(`Reminder. ${toSpokenText(text)}`, myStatusRef.current)
        }
      } else if (msg.type === 'file-offer') {
        soundService.play('file-transfer-started')
        window.electronAPI.notificationShowFileTransfer(peerName, msg.payload.fileName)
        // Images: accept automatically and show inline in the chat viewer —
        // no "where do you want to save this?" dialog. Other file types still
        // prompt so the user chooses a destination.
        const name = String(msg.payload.fileName || '')
        const type = String(msg.payload.fileType || '')
        const isImage = /\.(jpe?g|png|gif|bmp|webp)$/i.test(name) || /(jpe?g|png|gif|bmp|webp)/i.test(type)
        const isAudio = /\.(webm|ogg|oga|mp3|m4a|wav)$/i.test(name) || /audio|webm/i.test(type)
        if (isImage) {
          void acceptOffer(msg.payload, true)
          // Announce instead of reading the file name aloud
          void announceViaVoice('Picture received', myStatusRef.current)
        } else if (isAudio) {
          // Voice messages: auto-accept and play inline (no save dialog)
          void acceptOffer(msg.payload, true)
          void announceViaVoice('Voice message received', myStatusRef.current)
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
      } else if (msg.type === 'call-request') {
        getVoiceCall().handlePeerRequest()
        announceEvent(`Incoming call from ${msg.payload?.from || peerName}`)
      } else if (msg.type === 'call-accept') {
        // If WE placed this call (we were ringing everyone), the first accept
        // wins — tell the other ringing machines to stop. A call rings all of
        // someone's devices; only the one that answered should connect.
        const wasCaller = getVoiceCall().getState() === 'calling'
        getVoiceCall().handlePeerAccept()
        if (wasCaller) {
          void window.electronAPI.sendMessage({
            type: 'call-taken',
            payload: {},
            timestamp: Date.now()
          })
        }
      } else if (msg.type === 'call-taken') {
        // Someone answered on another device — stop ringing here (no-op if
        // we're the one who answered, since we're already in-call).
        getVoiceCall().answeredElsewhere()
      } else if (msg.type === 'call-decline') {
        getVoiceCall().handlePeerDecline()
      } else if (msg.type === 'call-end') {
        getVoiceCall().handlePeerEnd()
      } else if (msg.type === 'call-audio') {
        getVoiceCall().ingestAudio(msg.payload?.data)
      } else if (msg.type === 'screen-share-start') {
        getScreenShare().handleRemoteStart(msg.payload?.from, msg.payload?.mimeType)
      } else if (msg.type === 'screen-frame') {
        getScreenShare().handleRemoteFrame(msg.payload?.data)
      } else if (msg.type === 'screen-share-stop') {
        getScreenShare().handleRemoteStop(msg.payload?.from)
      }
    }

    const handleConnectionState = (state: string) => {
      if (!mounted) return

      if (state === 'connected') {
        if (wasDisconnectedRef.current) {
          // No beep — just flash the connection log briefly
          wasDisconnectedRef.current = false
          setReconnectFlash(true)
          announceEvent('Reconnected')
          setTimeout(() => { if (mounted) setReconnectFlash(false) }, 2200)
        }
        setIsConnected(true)
        // Re-broadcast my current status so peers re-sync after either side
        // restarts/reconnects (fixes stale status in the header).
        void window.electronAPI.sendMessage({
          type: 'status',
          payload: { status: myStatusRef.current, from: userIdentity },
          timestamp: Date.now()
        })
        // Tell peers our app version — if they're newer, we'll update; if we're
        // newer, they will (peer-version-triggered out-of-cycle update).
        if (myAppVersionRef.current) {
          void window.electronAPI.sendMessage({
            type: 'app-version',
            payload: { version: myAppVersionRef.current, from: userIdentity },
            timestamp: Date.now()
          })
        }
        // History sync: connectors ask the hub (Ripster) for everything they
        // missed while asleep/offline. The hub is the source of truth, so we
        // request from our newest known message onward and merge the reply.
        if (userIdentity !== 'Ripster') {
          let newest = 0
          for (const m of messagesRef.current) {
            if ((m.type === 'chat' || m.type === 'file') && (m.timestamp || 0) > newest) newest = m.timestamp
          }
          // Never pull anything from before a manual "Clear history" — otherwise
          // reconnecting would re-download everything we just cleared.
          let clearedAt = 0
          try { clearedAt = Number(localStorage.getItem('rlrchat-history-cleared-at') || 0) } catch (_) {}
          void window.electronAPI.sendMessage({
            type: 'history-request',
            payload: { since: Math.max(newest, clearedAt) },
            timestamp: Date.now()
          })
        }
        // Announce our presence immediately so peers light up our dot fast
        void window.electronAPI.sendMessage({
          type: 'presence',
          payload: { from: userIdentity },
          timestamp: Date.now()
        })
        // Deliver anything queued while we were disconnected, in order
        void flushPendingQueue()
      } else if (state === 'disconnected') {
        wasDisconnectedRef.current = true
        setIsConnected(false)
        // We can't see anyone while our own link is down — clear presence so no
        // stale green dots linger.
        lastSeenRef.current = {}
        setOnlinePeers(new Set())
        // A call can't outlive its transport — tear it down cleanly
        getVoiceCall().endLocal('disconnected')
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

  // True "Seen": the window is focused, the newest received message is actually
  // on screen (scrolled to bottom), and the user moved/typed in the last 60s.
  // Without all three, it stays "Delivered ✓✓". Deduped by sendReadReceipt.
  const SEEN_ACTIVE_MS = 60000
  const maybeMarkSeen = () => {
    const id = lastReceivedChatIdRef.current
    if (!id) return
    if (!document.hasFocus()) return
    if (!atBottomRef.current) return
    if (Date.now() - lastActivityRef.current > SEEN_ACTIVE_MS) return
    sendReadReceipt(id)
  }

  // Tell the peer a chat message has been seen. Deduped so repeat triggers
  // don't re-send a receipt for the same message.
  const sendReadReceipt = (messageId: string) => {
    if (lastReceiptSentIdRef.current === messageId) return
    lastReceiptSentIdRef.current = messageId
    window.electronAPI.sendMessage({
      type: 'read-receipt',
      payload: { messageId },
      timestamp: Date.now()
    }).catch(() => {})
  }

  // Shake the window for ~0.6s when the peer nudges us
  const triggerShake = () => {
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current)
    setIsShaking(false)
    // Re-apply on the next frame so back-to-back nudges restart the animation
    requestAnimationFrame(() => setIsShaking(true))
    shakeTimerRef.current = setTimeout(() => {
      setIsShaking(false)
      shakeTimerRef.current = null
    }, 700)
  }

  // Persist the offline queue to disk so messages composed while disconnected
  // survive a restart/reboot mid-disconnect (the queue used to be memory-only).
  const PENDING_QUEUE_KEY = 'rlrchat-pending-queue'
  const persistPendingQueue = () => {
    try { localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(pendingQueueRef.current)) } catch (_) {}
  }

  // Send every message queued while disconnected, oldest first. Stops (and
  // keeps the rest queued) if the connection drops again mid-flush.
  const flushPendingQueue = async () => {
    while (pendingQueueRef.current.length > 0) {
      const m = pendingQueueRef.current[0]
      try {
        const result = await window.electronAPI.sendMessage({
          type: 'chat',
          payload: {
            id: m.id,
            from: userIdentity,
            content: m.content,
            timestamp: m.timestamp,
            hasLink: m.hasLink,
            linkPreview: m.linkPreview,
            replyTo: m.replyTo
          },
          timestamp: m.timestamp
        })
        if (!result.success) break
      } catch {
        break
      }
      pendingQueueRef.current.shift()
      persistPendingQueue()
      setMessages(prev => prev.map(x =>
        x.id === m.id ? { ...x, deliveryStatus: 'sending' as const } : x
      ))
    }
  }

  // Short quoted preview for a reply ("📷 Photo" / "🎙️ Voice message" for media)
  const snippetFor = (m: Message): string => {
    if (m.type === 'file' && m.fileTransfer) {
      const name = (m.fileTransfer.fileName || '').toLowerCase()
      const type = (m.fileTransfer.fileType || '').toLowerCase()
      if (/\.(jpe?g|png|gif|bmp|webp)$/.test(name) || /(jpe?g|png|gif|bmp|webp)/.test(type)) return '📷 Photo'
      if (/\.(webm|ogg|oga|mp3|m4a|wav)$/.test(name) || /audio|webm/.test(type)) return '🎙️ Voice message'
      return `📎 ${m.fileTransfer.fileName}`
    }
    const text = m.content || ''
    return text.length > 80 ? text.slice(0, 80) + '…' : text
  }

  const setReplyTargetBoth = (target: { id: string; from: string; snippet: string } | null) => {
    replyTargetRef.current = target
    setReplyTarget(target)
  }

  const handleReply = (m: Message) => {
    setReplyTargetBoth({ id: m.id, from: m.from, snippet: snippetFor(m) })
    inputRef.current?.focus()
  }

  // Edit: load the message text into the input; the next send applies the edit
  const handleStartEdit = (m: Message) => {
    setEditingId(m.id)
    setReplyTargetBoth(null)
    setInputText(m.content)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setInputText('')
  }

  const applyEdit = async () => {
    const id = editingId
    const text = inputText.trim()
    if (!id) return
    if (!text) { cancelEdit(); return }
    setMessages(prev => prev.map(m => m.id === id ? { ...m, content: text, edited: true } : m))
    setEditingId(null)
    setInputText('')
    setTimeout(() => inputRef.current?.focus(), 0)
    await window.electronAPI.sendMessage({
      type: 'edit',
      payload: { id, content: text, from: userIdentity },
      timestamp: Date.now()
    }).catch(() => {})
  }

  // Unsend: remove your own recent message everywhere
  const handleUnsend = async (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, removed: true, content: '' } : m))
    if (editingId === id) cancelEdit()
    await window.electronAPI.sendMessage({
      type: 'unsend',
      payload: { id, from: userIdentity },
      timestamp: Date.now()
    }).catch(() => {})
  }

  // 👋 nudge: throttled to one every 3 seconds
  const handleNudgeClick = async () => {
    if (!isConnected) return
    const now = Date.now()
    if (now - lastNudgeSentRef.current < 3000) return
    lastNudgeSentRef.current = now
    try {
      const result = await window.electronAPI.sendMessage({
        type: 'nudge',
        payload: {},
        timestamp: now
      })
      if (result.success) addSystemMessage(`You nudged ${peerName}`)
    } catch (error) {
      console.error('[Nudge] Failed to send:', error)
    }
  }

  const handleSendMessage = async () => {
    if (editingId) { await applyEdit(); return }
    if (!inputText.trim()) return
    await sendChatMessage(inputText, { source: 'text' })
  }

  // Insert an emoji at the textarea cursor (or append) and keep focus there
  const insertEmoji = (emoji: string) => {
    const el = inputRef.current
    if (!el) {
      setInputText(prev => prev + emoji)
      return
    }
    const start = el.selectionStart ?? inputText.length
    const end = el.selectionEnd ?? start
    setInputText(inputText.slice(0, start) + emoji + inputText.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + emoji.length
      try { el.setSelectionRange(pos, pos) } catch (_) {}
    })
  }

  // --- Scheduled messages ("Send later") ---
  const scheduleCurrentInput = (sendAt: number) => {
    const text = inputText.trim()
    if (!text) return
    if (!Number.isFinite(sendAt) || sendAt <= Date.now()) {
      addSystemMessage('Pick a time in the future to schedule the message.')
      return
    }
    const entry = newScheduledMessage(
      text,
      sendAt,
      scheduleAsReminder ? { kind: 'reminder', target: reminderTarget } : undefined
    )
    const next = [...loadScheduledMessages(), entry]
    saveScheduledMessages(next)
    setScheduledMessages(next)
    setInputText('')
    setShowScheduler(false)
    setCustomScheduleValue('')
    if (scheduleAsReminder) {
      const who = reminderTarget === 'me' ? 'you' : peerName
      addSystemMessage(`⏰ Reminder set for ${who} at ${formatSendAt(sendAt)}`)
    } else {
      addSystemMessage(`🕐 Message scheduled for ${formatSendAt(sendAt)}`)
    }
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const cancelScheduledMessage = (id: string) => {
    const next = loadScheduledMessages().filter((m) => m.id !== id)
    saveScheduledMessages(next)
    setScheduledMessages(next)
    if (next.length === 0) setShowScheduledList(false)
  }

  const handleStatusChange = async (newStatus: Status, opts?: { auto?: boolean }) => {
    // A deliberate (manual) status change cancels any pending auto-away restore
    if (!opts?.auto) autoAwayActiveRef.current = false
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

    // Send status change to peers
    await window.electronAPI.sendMessage({
      type: 'status',
      payload: { status: newStatus, from: userIdentity },
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

  // Read a single message aloud on demand (🔊 on the bubble). Works in any
  // status — unlike the "Talk to me"/"Listen only" auto-read. Calls TTS
  // directly so it never enters the auto-response pipeline (no mic auto-open).
  const handleSpeakMessage = async (text: string) => {
    const trimmed = (text || '').trim()
    if (!trimmed) return
    if (getSoundService().isMuted()) return // master mute silences spoken output
    if (isQuietNow(getQuietHours(), new Date())) return // quiet hours: no TTS reading
    // Don't disturb an in-progress auto-read/voice session: those modes already
    // read messages aloud, and stopping mid-read would trip the mic auto-open.
    if (isTTSSpeakingRef.current || isVoiceResponseModeRef.current || isListeningRef.current) return
    try {
      await window.electronAPI.ttsStop() // clear any stale/leftover speech first
      await window.electronAPI.ttsSpeak(trimmed)
    } catch (_) {}
  }

  // Pin/unpin a message (E7). Updates locally and tells peers via a pin/unpin
  // message; `pinned` rides along in history so it persists and history-syncs.
  const handleTogglePin = async (message: Message) => {
    const nextPinned = !message.pinned
    setMessages(prev => prev.map(m => m.id === message.id ? { ...m, pinned: nextPinned } : m))
    await window.electronAPI.sendMessage({
      type: nextPinned ? 'pin' : 'unpin',
      payload: { messageId: message.id, from: userIdentity },
      timestamp: Date.now()
    }).catch(() => {})
  }

  // Scroll a message into view by id, expanding the render window first if the
  // message is currently above the windowed slice.
  const jumpToMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`)
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    setRenderLimit(messages.length)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }))
  }

  // Stable callback identities for memoized <MessageBubble>. The handlers above
  // are recreated every render (and capture state like editingId), so passing
  // them directly would defeat React.memo. These shims keep a constant identity
  // while always invoking the latest handler via a ref — same pattern as
  // handleStatusChangeRef / sendChatMessageRef elsewhere in this file.
  const bubbleHandlersRef = useRef({
    addReaction: handleAddReaction,
    removeReaction: handleRemoveReaction,
    reply: handleReply,
    startEdit: handleStartEdit,
    unsend: handleUnsend,
    speak: handleSpeakMessage,
    togglePin: handleTogglePin,
  })
  bubbleHandlersRef.current = {
    addReaction: handleAddReaction,
    removeReaction: handleRemoveReaction,
    reply: handleReply,
    startEdit: handleStartEdit,
    unsend: handleUnsend,
    speak: handleSpeakMessage,
    togglePin: handleTogglePin,
  }
  const stableAddReaction = useCallback((id: string, emoji: string) => bubbleHandlersRef.current.addReaction(id, emoji), [])
  const stableRemoveReaction = useCallback((id: string, emoji: string) => bubbleHandlersRef.current.removeReaction(id, emoji), [])
  const stableReply = useCallback((m: Message) => bubbleHandlersRef.current.reply(m), [])
  const stableStartEdit = useCallback((m: Message) => bubbleHandlersRef.current.startEdit(m), [])
  const stableUnsend = useCallback((id: string) => bubbleHandlersRef.current.unsend(id), [])
  const stableSpeak = useCallback((text: string) => bubbleHandlersRef.current.speak(text), [])
  const stableTogglePin = useCallback((m: Message) => bubbleHandlersRef.current.togglePin(m), [])

  // Pinned messages (E7): the pinned bar cycles through these, newest last.
  const pinnedMessages = useMemo(() => messages.filter(m => m.pinned && !m.removed), [messages])
  const [pinnedIndex, setPinnedIndex] = useState(0)

  // "New messages" count (from the first unread to the end) — drives the jump pill.
  const newMessagesCount = useMemo(() => {
    if (!firstUnreadId) return 0
    const i = messages.findIndex(m => m.id === firstUnreadId)
    return i >= 0 ? messages.length - i : 0
  }, [messages, firstUnreadId])

  // Jump to the "New messages" divider. If it's above the rendered window,
  // expand the window first (reusing the Load-earlier mechanism) then scroll.
  const jumpToNewMessages = () => {
    const scroll = () => {
      const el = document.querySelector('.new-messages-divider')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      else messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
    if (firstUnreadId && newMessagesCount > renderLimit) {
      setRenderLimit(messages.length)
      requestAnimationFrame(() => requestAnimationFrame(scroll))
    } else {
      scroll()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const sendChatMessage = async (
    rawText: string,
    options: { source?: 'speech' | 'text' | 'scheduled'; bypassThrottle?: boolean } = {}
  ): Promise<boolean> => {
    const text = rawText.trim()
    if (!text) {
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
      const messageId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
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

      // A scheduled send fires later, on a timer — never attach whatever reply
      // quote the user happens to have open at that moment
      if (replyTargetRef.current && options.source !== 'scheduled') {
        msg.replyTo = replyTargetRef.current
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

      // Offline: queue it instead of refusing — the text shows immediately
      // with a ⏳ indicator and auto-sends when the connection returns
      if (!isConnectedRef.current) {
        msg.deliveryStatus = 'queued'
        pendingQueueRef.current.push(msg)
        persistPendingQueue()
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
        // Scheduled sends must not disturb what the user is doing right now
        // (open reply bar, half-typed input)
        if (options.source !== 'scheduled') {
          setReplyTargetBoth(null)
          if (options.source !== 'speech') {
            setInputText('')
          }
          setTimeout(() => {
            inputRef.current?.focus()
          }, 0)
        }
        return true
      }

      const sendResult = await window.electronAPI.sendMessage({
        type: 'chat',
        payload: {
          id: msg.id,
          from: userIdentity,
          content: msg.content,
          timestamp: msg.timestamp,
          hasLink: msg.hasLink,
          linkPreview: msg.linkPreview,
          replyTo: msg.replyTo
        },
        timestamp: msg.timestamp
      })

      if (!sendResult.success) {
        throw new Error('Message could not be sent because the connection is not ready.')
      }

      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])

      // Scheduled sends must not disturb what the user is doing right now
      // (open reply bar, half-typed input, focus)
      if (options.source !== 'scheduled') {
        setReplyTargetBoth(null)

        if (options.source !== 'speech') {
          setInputText('')
        }

        // Auto-focus input field after sending
        setTimeout(() => {
          inputRef.current?.focus()
        }, 0)
      }

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
    if (isQuietNow(getQuietHours(), new Date())) return // quiet hours: no TTS reading
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

  // Spoken announcements (E9): read a short peer event aloud when the setting is
  // on AND the local user is in a speech status. Speaks TTS DIRECTLY (never via
  // the auto-response queue) so it never opens the mic. Skips whenever a message
  // is being read or the user is dictating — announcements are ephemeral, so we
  // drop them rather than talk over content. No await before ttsSpeak, so the
  // guard and the speak can't be split by an incoming-message read.
  const announceEvent = (text: string) => {
    if (!text.trim()) return
    if (!getSpeakAnnouncements()) return
    if (soundService.isMuted()) return
    const st = myStatusRef.current
    if (st !== 'Talk to me' && st !== 'Listen only') return
    if (isQuietNow(getQuietHours(), new Date())) return // quiet hours: no announcements
    if (
      isTTSSpeakingRef.current ||
      isVoiceResponseModeRef.current ||
      isVoiceQueueProcessingRef.current ||
      isListenOnlyQueueProcessingRef.current ||
      isListeningRef.current
    ) return
    // Main-process TTS returns early if disabled, so no need to pre-check config.
    void window.electronAPI.ttsSpeak(text).catch(() => {})
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

  // --- Voice messages (record audio, send as a file) ---
  const startVoiceMessage = async () => {
    if (!isConnected) return
    if (callState !== 'idle') return // the call owns the mic
    try {
      // Don't run STT and recording at once
      if (isListening) { await getSpeechEngine().stop() }
      await getVoiceRecorder().start()
      setIsRecordingVoice(true)
      setRecordingSeconds(0)
      soundService.play('ptt-start')
      recordingTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000)
    } catch (error) {
      console.error('[VoiceMsg] Failed to start recording:', error)
      addSystemMessage('Could not start recording. Check your microphone.')
      setIsRecordingVoice(false)
    }
  }

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null }
  }

  const sendVoiceMessage = async () => {
    stopRecordingTimer()
    setIsRecordingVoice(false)
    soundService.play('ptt-stop')
    try {
      const rec = await getVoiceRecorder().stop()
      if (!rec || rec.durationMs < 400) {
        addSystemMessage('Recording too short.')
        return
      }
      const saved = await window.electronAPI.saveTempAudio(rec.bytes, rec.ext)
      if (!saved.success || !saved.filePath) {
        addSystemMessage('Failed to save voice message.')
        return
      }
      await handleFileSend(saved.filePath)
    } catch (error) {
      console.error('[VoiceMsg] Failed to send:', error)
      addSystemMessage('Failed to send voice message.')
    }
  }

  const cancelVoiceMessage = () => {
    stopRecordingTimer()
    setIsRecordingVoice(false)
    getVoiceRecorder().cancel()
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
          from: offer.from || peerName,
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

  const formatCallDuration = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  const handleCallButtonClick = () => {
    if (!isConnected || callState !== 'idle') return
    getVoiceCall().start()
  }

  const startScreenShare = async (sourceId: string) => {
    try {
      await getScreenShare().startShare(sourceId)
      setIsSharingScreen(true)
      addSystemMessage('🖥️ You started sharing your screen')
    } catch (e) {
      addSystemMessage('Could not start screen share: ' + (e as Error).message)
    }
  }

  const stopScreenShare = () => {
    getScreenShare().stopShare()
    setIsSharingScreen(false)
    addSystemMessage('🖥️ You stopped sharing your screen')
  }

  const toggleCallMicMute = () => {
    const next = !isCallMicMuted
    getVoiceCall().setMicMuted(next)
    setIsCallMicMuted(next)
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

  // "Seen" renders only under the most recent sent message the peer has seen
  let lastSeenOwnId: string | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.from === userIdentity && m.type === 'chat' && m.deliveryStatus === 'seen') {
      lastSeenOwnId = m.id
      break
    }
  }

  return (
    <div className={`chat-window ${isShaking ? 'nudge-shake' : ''}`}>
      {/* Full-screen image viewer (lightbox). Click anywhere or press Esc to
          close; click the image itself to toggle fit / 100% so small text in a
          screenshot becomes readable. */}
      {lightboxUrl && (
        <div
          className="image-lightbox no-drag"
          role="dialog"
          aria-label="Image viewer"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="image-lightbox-close"
            onClick={() => setLightboxUrl(null)}
            aria-label="Close image viewer"
            title="Close (Esc)"
          >
            ✕
          </button>
          <img
            src={lightboxUrl}
            alt="Full size"
            className="image-lightbox-img"
            onClick={(e) => {
              e.stopPropagation()
              e.currentTarget.classList.toggle('zoomed')
            }}
          />
        </div>
      )}

      {/* Header */}
      <div className="chat-header">
        <div className="peer-section no-drag">
          <div className="peer-info peer-list">
            {otherIdentities.map((name) => {
              const online = isConnected && onlinePeers.has(name)
              return (
                <div className={`peer-row ${name.toLowerCase()}`} key={name}>
                  <div className="peer-name">{name}</div>
                  <div className="connection-status">
                    <span className={`status-dot ${online ? 'connected' : 'disconnected'}`} />
                    {online ? (peerStatuses[name] || '—') : 'Offline'}
                  </div>
                </div>
              )
            })}
            {(peerTyping || isTTSSpeaking) && (
              <div className="header-status-extra" role="status">
                {isTTSSpeaking && <span className="tts-indicator">🔊 Reading…</span>}
                {peerTyping && <span className="typing-indicator">{typingFrom || peerName} is typing…</span>}
              </div>
            )}
          </div>
        </div>

        <div className="header-controls no-drag">
          {quietActive && (
            <span className="quiet-indicator" title="Quiet hours active — sounds & speech are silenced" role="img" aria-label="Quiet hours active">
              🌙
            </span>
          )}
          {isConnected && rttMs !== null && (
            <span
              className={`rtt-indicator ${rttMs < 100 ? 'good' : rttMs < 300 ? 'ok' : 'poor'}`}
              title={`Ping: ${rttMs} ms`}
              role="img"
              aria-label={`Connection quality: ${rttMs < 100 ? 'good' : rttMs < 300 ? 'fair' : 'poor'} (ping ${rttMs} milliseconds)`}
            >
              <span className="rtt-dot" aria-hidden="true" />
              <span className="rtt-ms" aria-hidden="true">{rttMs}ms</span>
            </span>
          )}

          <StatusDropdown currentStatus={myStatus} onStatusChange={handleStatusChange} />

          <button
            className={`icon-btn ${callState !== 'idle' ? 'active' : ''}`}
            onClick={handleCallButtonClick}
            disabled={!isConnected || callState !== 'idle'}
            title={callState === 'idle' ? `Call ${peerName}` : 'Call in progress'}
            aria-label="Start voice call"
          >
            📞
          </button>

          <button
            className={`icon-btn ${isSharingScreen ? 'active' : ''}`}
            onClick={() => (isSharingScreen ? stopScreenShare() : setShareSourcePicker(true))}
            disabled={!isConnected}
            title={isSharingScreen ? 'Stop sharing your screen' : 'Share your screen'}
            aria-label="Share screen"
          >
            🖥️
          </button>

          <button
            className="icon-btn"
            onClick={handleNudgeClick}
            disabled={!isConnected}
            title={`Nudge ${peerName}`}
            aria-label={`Nudge ${peerName}`}
          >
            👋
          </button>

          <button
            className={`icon-btn ${showSearch ? 'active' : ''}`}
            onClick={() => { setShowSearch(s => !s); if (showSearch) setSearchQuery('') }}
            title="Search messages"
            aria-label="Search messages"
            aria-pressed={showSearch}
          >
            🔍
          </button>

          <button
            className={`icon-btn ${showGallery ? 'active' : ''}`}
            onClick={() => setShowGallery(true)}
            title="Photos & files"
            aria-label="Open photos and files gallery"
          >
            🖼️
          </button>

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

      {pinnedMessages.length > 0 && (() => {
        const idx = pinnedIndex % pinnedMessages.length
        const pm = pinnedMessages[idx]
        const snippet = pm.type === 'file' ? (pm.fileTransfer?.fileName || 'File') : (pm.content || '')
        return (
          <div className="pinned-bar no-drag">
            <span className="pinned-icon" aria-hidden="true">📌</span>
            <button
              className="pinned-snippet"
              onClick={() => jumpToMessage(pm.id)}
              title="Jump to pinned message"
              aria-label={`Jump to pinned message from ${pm.from}`}
            >
              <span className="pinned-from">{pm.from}:</span> {snippet}
            </button>
            {pinnedMessages.length > 1 && (
              <button
                className="pinned-cycle"
                onClick={() => setPinnedIndex(i => (i + 1) % pinnedMessages.length)}
                aria-label="Show next pinned message"
                title="Next pinned"
              >
                {idx + 1}/{pinnedMessages.length} ›
              </button>
            )}
            <button
              className="pinned-unpin"
              onClick={() => handleTogglePin(pm)}
              aria-label="Unpin this message"
              title="Unpin"
            >
              ✕
            </button>
          </div>
        )
      })()}

      {showSearch && (
        <div className="search-bar no-drag">
          <span aria-hidden="true">🔍</span>
          <input
            autoFocus
            type="text"
            className="search-input"
            placeholder="Search messages…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setShowSearch(false); setSearchQuery('') } }}
            aria-label="Search messages"
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">×</button>
          )}
        </div>
      )}

      <details className={`connection-log-wrap no-drag ${reconnectFlash ? 'reconnected-flash' : ''}`}>
        <summary>
          Connection log
          {reconnectFlash && <span className="reconnect-flash-tag">🔌 Reconnected</span>}
        </summary>
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
          onLogoff={onLogoff}
        />
      )}

      {/* Shared media gallery — read-only view of all photos & files */}
      {showGallery && (
        <MediaGallery
          messages={messages}
          onClose={() => setShowGallery(false)}
          onOpenImage={(url) => { setShowGallery(false); setLightboxUrl(url) }}
        />
      )}

      {/* Screenshot picker — capture a window/screen, optionally crop, then send */}
      {showScreenshot && (
        <ScreenshotPicker
          onClose={() => setShowScreenshot(false)}
          onSend={(filePath) => { void handleFileSend(filePath) }}
        />
      )}

      {/* Full emoji picker — insert into the message input */}
      {showEmojiPicker && (
        <EmojiPicker
          onPick={(emoji) => { insertEmoji(emoji); setShowEmojiPicker(false) }}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}

      {/* Full emoji picker — react to a message with ANY emoji (➕ on a bubble) */}
      {reactionPickerFor && (
        <EmojiPicker
          title="React with…"
          onPick={(emoji) => {
            void handleAddReaction(reactionPickerFor, emoji)
            setReactionPickerFor(null)
          }}
          onClose={() => setReactionPickerFor(null)}
        />
      )}

      {/* "Send later" scheduler */}
      {showScheduler && (
        <div
          className="emoji-picker-backdrop no-drag"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowScheduler(false) }}
        >
          <div className="scheduler-panel" role="dialog" aria-label="Schedule message">
            <div className="scheduler-title">{scheduleAsReminder ? '⏰ Reminder' : '🕐 Send later'}</div>
            <div className="scheduler-mode">
              <label className="scheduler-reminder-toggle">
                <input
                  type="checkbox"
                  checked={scheduleAsReminder}
                  onChange={(e) => setScheduleAsReminder(e.target.checked)}
                />
                Make this a reminder (alert with chime)
              </label>
              {scheduleAsReminder && (
                <select
                  className="scheduler-target-select"
                  value={reminderTarget}
                  onChange={(e) => setReminderTarget(e.target.value as 'me' | 'peer')}
                  aria-label="Who to remind"
                >
                  <option value="peer">Remind {peerName}</option>
                  <option value="me">Remind me</option>
                </select>
              )}
            </div>
            {inputText.trim() ? (
              <div className="scheduler-snippet">
                “{inputText.trim().length > 60 ? inputText.trim().slice(0, 60) + '…' : inputText.trim()}”
              </div>
            ) : (
              <div className="scheduler-hint">Type a message first, then pick a time.</div>
            )}
            <div className="scheduler-presets">
              {presetTimes(new Date()).map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="scheduler-preset-btn"
                  onClick={() => scheduleCurrentInput(p.sendAt)}
                  disabled={!inputText.trim()}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="scheduler-custom">
              <input
                type="datetime-local"
                className="scheduler-custom-input"
                aria-label="Custom date and time"
                min={toDatetimeLocalValue(new Date())}
                value={customScheduleValue}
                onChange={(e) => setCustomScheduleValue(e.target.value)}
              />
              <button
                type="button"
                className="scheduler-confirm-btn"
                onClick={() => {
                  const t = customScheduleValue ? new Date(customScheduleValue).getTime() : NaN
                  scheduleCurrentInput(t)
                }}
                disabled={!inputText.trim() || !customScheduleValue}
                aria-label="Schedule at custom time"
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screen-share source picker */}
      {shareSourcePicker && (
        <ScreenshotPicker
          pickOnly
          title="Pick a screen or window to share"
          onPick={(id) => { void startScreenShare(id) }}
          onClose={() => setShareSourcePicker(false)}
        />
      )}

      {/* Live screen-share viewer (someone is sharing to us) */}
      {viewingShareFrom && (
        <ScreenShareViewer
          sharerName={viewingShareFrom}
          onClose={() => { getScreenShare().handleRemoteStop(); setViewingShareFrom(null) }}
        />
      )}

      {/* You are sharing your screen */}
      {isSharingScreen && (
        <div className="call-bar in-call" role="status" aria-live="polite">
          <span className="call-live-dot" aria-hidden="true" />
          You're sharing your screen
          <button className="call-btn call-hangup-btn" onClick={stopScreenShare} aria-label="Stop sharing screen">
            Stop sharing
          </button>
        </div>
      )}

      {/* Outgoing call: calling… bar with cancel */}
      {callState === 'calling' && (
        <div className="call-bar" role="status" aria-live="polite">
          <span className="call-bar-icon" aria-hidden="true">📞</span>
          Calling {peerName}…
          <button className="call-btn call-cancel-btn" onClick={() => getVoiceCall().end()} aria-label="Cancel call">
            Cancel
          </button>
        </div>
      )}

      {/* Active call: timer + mic mute + hang up */}
      {callState === 'in-call' && (
        <div className="call-bar in-call" role="status" aria-live="polite">
          <span className="call-live-dot" aria-hidden="true" />
          In call with {peerName} — {formatCallDuration(callSeconds)}
          <button
            className={`call-btn call-mute-btn ${isCallMicMuted ? 'muted' : ''}`}
            onClick={toggleCallMicMute}
            aria-label={isCallMicMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-pressed={isCallMicMuted}
          >
            {isCallMicMuted ? '🔇 Unmute' : '🎤 Mute'}
          </button>
          <button className="call-btn call-hangup-btn" onClick={() => getVoiceCall().end()} aria-label="Hang up call">
            Hang up
          </button>
        </div>
      )}

      {/* Incoming call modal */}
      {callState === 'ringing' && (
        <div className="file-offer-dialog incoming-call-dialog" role="dialog" aria-labelledby="incoming-call-title">
          <div className="file-offer-content">
            <h3 id="incoming-call-title">📞 Incoming Call</h3>
            <p>{peerName} is calling…</p>
            <div className="dialog-buttons">
              <button className="btn-accept" onClick={() => getVoiceCall().accept()} aria-label="Accept call">
                Accept
              </button>
              <button className="btn-reject" onClick={() => getVoiceCall().decline()} aria-label="Decline call">
                Decline
              </button>
            </div>
          </div>
        </div>
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
        onScroll={(e) => {
          const el = e.currentTarget
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
          setShowJumpToBottom(!nearBottom)
          atBottomRef.current = nearBottom
          if (nearBottom) maybeMarkSeen() // scrolling the newest into view = seen
        }}
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
        {(() => {
          const q = searchQuery.trim().toLowerCase()
          // When searching, scan the FULL history. Otherwise render only the
          // most recent `renderLimit` bubbles so the DOM stays bounded as
          // history grows (the main responsiveness win on old hardware).
          const { visible, hiddenCount } = q
            ? {
                visible: messages.filter(m => (m.content || '').toLowerCase().includes(q) || (m.fileTransfer?.fileName || '').toLowerCase().includes(q)),
                hiddenCount: 0,
              }
            : windowMessages(messages, renderLimit)

          if (messages.length === 0) {
            return (
              <div className="empty-state">
                <div className="empty-state-icon">💬</div>
                <div className="empty-state-title">No messages yet</div>
                <div className="empty-state-subtitle">
                  Send a message to {peerName} to start the conversation
                </div>
              </div>
            )
          }
          if (q && visible.length === 0) {
            return (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <div className="empty-state-title">No matches</div>
                <div className="empty-state-subtitle">Nothing found for “{searchQuery}”</div>
              </div>
            )
          }

          // Interleave day dividers between messages from different calendar days
          let prevTs: number | null = null
          const nodes: JSX.Element[] = []
          // Affordance to pull older messages into the rendered window
          if (hiddenCount > 0) {
            nodes.push(
              <button
                key="load-earlier"
                type="button"
                className="load-earlier-btn no-drag"
                onClick={() => setRenderLimit((n) => n + LOAD_MORE_STEP)}
              >
                ⬆ Load earlier messages ({hiddenCount})
              </button>
            )
          }
          for (const msg of visible) {
            if (isNewDay(prevTs, msg.timestamp)) {
              nodes.push(
                <div className="day-divider" key={`divider-${msg.id}`}>
                  <span>{dayLabel(msg.timestamp)}</span>
                </div>
              )
            }
            prevTs = msg.timestamp
            if (firstUnreadId && msg.id === firstUnreadId) {
              nodes.push(
                <div className="new-messages-divider" key={`newmsgs-${msg.id}`}>
                  <span>New messages</span>
                </div>
              )
            }
            nodes.push(
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.from === userIdentity}
                onAddReaction={stableAddReaction}
                onRemoveReaction={stableRemoveReaction}
                onReply={stableReply}
                onOpenReactionPicker={setReactionPickerFor}
                onOpenImage={setLightboxUrl}
                onEdit={stableStartEdit}
                onUnsend={stableUnsend}
                onSpeak={stableSpeak}
                onTogglePin={stableTogglePin}
                showSeen={msg.id === lastSeenOwnId}
              />
            )
          }
          return nodes
        })()}
        <div ref={messagesEndRef} />
        {showJumpToBottom && firstUnreadId && newMessagesCount > 0 && (
          <button
            className="new-messages-pill no-drag"
            onClick={jumpToNewMessages}
            aria-label={`Jump to ${newMessagesCount} new message${newMessagesCount === 1 ? '' : 's'}`}
            title="Jump to new messages"
          >
            ↓ {newMessagesCount} new
          </button>
        )}
        {showJumpToBottom && !firstUnreadId && (
          <button
            className="jump-to-bottom no-drag"
            onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
            aria-label="Jump to newest messages"
            title="Jump to newest"
          >
            ↓
          </button>
        )}
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
        {scheduledMessages.length > 0 && (
          <div className="scheduled-bar no-drag">
            <button
              type="button"
              className="scheduled-bar-toggle"
              onClick={() => setShowScheduledList(s => !s)}
              aria-expanded={showScheduledList}
              aria-label={`${scheduledMessages.length} scheduled message${scheduledMessages.length === 1 ? '' : 's'}`}
            >
              🕐 {scheduledMessages.length} scheduled {showScheduledList ? '▾' : '▸'}
            </button>
            {showScheduledList && (
              <div className="scheduled-list">
                {[...scheduledMessages].sort((a, b) => a.sendAt - b.sendAt).map((m) => (
                  <div key={m.id} className="scheduled-item">
                    <span className="scheduled-item-text" title={m.text}>{m.text}</span>
                    <span className="scheduled-item-time">{formatSendAt(m.sendAt)}</span>
                    <button
                      type="button"
                      className="scheduled-item-cancel"
                      onClick={() => cancelScheduledMessage(m.id)}
                      aria-label="Cancel scheduled message"
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {editingId && (
          <div className="reply-bar no-drag editing-bar">
            <div className="reply-bar-text">
              <span className="reply-bar-label">✏️ Editing message</span>
              <span className="reply-bar-snippet">Press Enter to save · Esc to cancel</span>
            </div>
            <button
              type="button"
              className="reply-bar-cancel"
              onClick={cancelEdit}
              aria-label="Cancel edit"
              title="Cancel edit"
            >
              ✕
            </button>
          </div>
        )}
        {replyTarget && (
          <div className="reply-bar no-drag">
            <div className="reply-bar-text">
              <span className="reply-bar-label">Replying to {replyTarget.from}</span>
              <span className="reply-bar-snippet">{replyTarget.snippet}</span>
            </div>
            <button
              type="button"
              className="reply-bar-cancel"
              onClick={() => setReplyTargetBoth(null)}
              aria-label="Cancel reply"
              title="Cancel reply"
            >
              ✕
            </button>
          </div>
        )}
        {isRecordingVoice && (
          <div className="voice-record-bar">
            <span className="rec-dot" aria-hidden="true" />
            <span className="rec-label">Recording… {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}</span>
            <button type="button" className="glass-button rec-cancel" onClick={cancelVoiceMessage} aria-label="Cancel voice message">Cancel</button>
            <button type="button" className="glass-button rec-send" onClick={sendVoiceMessage} aria-label="Send voice message">Send ➤</button>
          </div>
        )}
        <div className="input-wrapper" style={isRecordingVoice ? { display: 'none' } : undefined}>
          <textarea
            ref={inputRef}
            className="input-field"
            placeholder={isConnected ? "Type your message... (or paste image to send)" : "Disconnected - messages will send when reconnected"}
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
            disabled={isSending}
            aria-label="Message input"
          />
          <div className="input-tools">
            <button
              className="tool-btn"
              title="Insert emoji"
              onClick={() => setShowEmojiPicker(true)}
              aria-label="Insert emoji"
            >
              <span className="tool-ico">😊</span>
              <span className="tool-label">Emoji</span>
            </button>
            <button
              className="tool-btn"
              title="Send later / set a reminder"
              onClick={() => setShowScheduler(true)}
              aria-label="Schedule message or reminder"
            >
              <span className="tool-ico">🕐</span>
              <span className="tool-label">Later</span>
            </button>
            <button
              className="tool-btn"
              title="Attach a file"
              onClick={handleFileSelect}
              disabled={!isConnected}
              aria-label="Attach file"
            >
              <span className="tool-ico">📎</span>
              <span className="tool-label">File</span>
            </button>
            <button
              className="tool-btn"
              title="Screenshot a window or screen and send it"
              onClick={() => setShowScreenshot(true)}
              disabled={!isConnected}
              aria-label="Take and send a screenshot"
            >
              <span className="tool-ico">📸</span>
              <span className="tool-label">Screen</span>
            </button>
            <button
              className={`tool-btn ${isListening ? 'recording' : ''}`}
              title={
                isListening
                  ? 'Stop talking (dictation)'
                  : isTTSSpeaking
                    ? 'Reading aloud. Click to interrupt and talk.'
                    : 'Talk to type — speak and it becomes text'
              }
              onClick={handleMicClick}
              disabled={!isConnected}
              aria-label={isListening ? 'Stop dictation' : 'Talk to type (dictation)'}
            >
              <span className="tool-ico">🎤</span>
              <span className="tool-label">Talk</span>
            </button>
            <button
              className="tool-btn"
              title={callState === 'idle' ? 'Record and send a voice message' : 'Unavailable during a call'}
              onClick={startVoiceMessage}
              disabled={!isConnected || callState !== 'idle'}
              aria-label="Record a voice message"
            >
              <span className="tool-ico">🎙️</span>
              <span className="tool-label">Voice</span>
            </button>
            <button
              className="tool-btn send-btn"
              title={isConnected ? 'Send message' : 'Queue message (sends when reconnected)'}
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isSending}
              aria-label="Send message"
            >
              <span className="tool-ico">➤</span>
              <span className="tool-label">Send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatWindow

