import { useState, useEffect } from 'react'
import './MessageBubble.css'
import type { Message } from './ChatWindow'
import { linkifyText } from '../utils/linkify'

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
function isImageFile(fileType: string): boolean {
  return IMAGE_EXTENSIONS.some(ext => fileType.toLowerCase().endsWith(ext) || fileType.toLowerCase() === ext.slice(1))
}

const AUDIO_EXTENSIONS = ['.webm', '.ogg', '.oga', '.mp3', '.m4a', '.wav']
function isAudioFile(fileType: string): boolean {
  const t = (fileType || '').toLowerCase()
  return AUDIO_EXTENSIONS.some(ext => t.endsWith(ext) || t === ext.slice(1)) || t.includes('audio')
}

interface Props {
  message: Message
  isOwn: boolean
  onAddReaction: (messageId: string, emoji: string) => void
  onRemoveReaction: (messageId: string, emoji: string) => void
  onReply: (message: Message) => void
  /** Open the full emoji picker to react with ANY emoji (➕ button) */
  onOpenReactionPicker?: (messageId: string) => void
  /** Open the full-screen image viewer (lightbox) for an inline image */
  onOpenImage?: (dataUrl: string) => void
  /** Edit your own recent message (loads it into the input) */
  onEdit?: (message: Message) => void
  /** Unsend (remove) your own recent message */
  onUnsend?: (messageId: string) => void
  showSeen?: boolean
}

// Per-sender tint class so it's easy to tell who sent what in the group chat
// (RLRJupiter vs Ramjet vs Ripster). Used on received bubbles.
function senderClass(from: string): string {
  if (from === 'RLRJupiter') return 'from-rlrjupiter'
  if (from === 'Ramjet') return 'from-ramjet'
  if (from === 'Ripster') return 'from-ripster'
  return ''
}

const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '🔥']

function MessageBubble({ message, isOwn, onAddReaction, onRemoveReaction, onReply, onOpenReactionPicker, onOpenImage, onEdit, onUnsend, showSeen }: Props) {
  // Your own text messages can always be edited or unsent (no time limit)
  const canEditUnsend = isOwn && message.type === 'chat' && !message.removed
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (message.type !== 'file' || !message.fileTransfer) return
    const ft = message.fileTransfer
    if (ft.status !== 'completed' || !ft.filePath) return
    const image = isImageFile(ft.fileType) || isImageFile(ft.fileName)
    const audio = isAudioFile(ft.fileType) || isAudioFile(ft.fileName)
    if (!image && !audio) return
    let cancelled = false
    window.electronAPI.getFileDataUrl(ft.filePath).then((r: { success?: boolean; dataUrl?: string }) => {
      if (cancelled || !r.success || !r.dataUrl) return
      if (image) setImageDataUrl(r.dataUrl)
      else setAudioDataUrl(r.dataUrl)
    })
    return () => { cancelled = true }
  }, [message.type, message.fileTransfer?.status, message.fileTransfer?.filePath, message.fileTransfer?.fileType, message.fileTransfer?.fileName])

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s'
  }

  const formatETA = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60)
      return `${minutes}m`
    } else {
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      return `${hours}h ${minutes}m`
    }
  }

  const getFileIcon = (fileType: string): string => {
    const ext = fileType.toLowerCase()
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) return '🖼️'
    if (['.pdf'].includes(ext)) return '📕'
    if (['.doc', '.docx', '.txt', '.rtf'].includes(ext)) return '📄'
    if (['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext)) return '🎬'
    if (['.mp3', '.wav', '.ogg', '.flac', '.m4a'].includes(ext)) return '🎵'
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return '📦'
    return '📎'
  }

  if (message.type === 'system') {
    return (
      <div className="system-message" role="status" aria-live="polite">
        <span>{message.content}</span>
        <span className="system-time"> • {formatTime(message.timestamp)}</span>
      </div>
    )
  }

  if (message.type === 'file' && message.fileTransfer) {
    const { fileTransfer } = message
    return (
      <div className={`message-wrapper ${isOwn ? 'sent' : 'received'}`}>
        <div
          className={`message-bubble file-message ${isOwn ? '' : senderClass(message.from)}`}
          onMouseEnter={() => setShowReactionPicker(true)}
          onMouseLeave={() => setShowReactionPicker(false)}
        >
          {showReactionPicker && (
            <div className="reaction-picker" role="toolbar" aria-label="Message actions">
              {REACTION_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  className="emoji-btn"
                  onClick={() => onAddReaction(message.id, emoji)}
                  aria-label={`React with ${emoji}`}
                  type="button"
                >
                  {emoji}
                </button>
              ))}
              {onOpenReactionPicker && (
                <button
                  className="emoji-btn more-reactions-btn"
                  onClick={() => onOpenReactionPicker(message.id)}
                  aria-label="More reactions"
                  title="React with any emoji"
                  type="button"
                >
                  ➕
                </button>
              )}
              <button
                className="emoji-btn reply-btn"
                onClick={() => onReply(message)}
                aria-label="Reply to this message"
                title="Reply"
                type="button"
              >
                ↩️
              </button>
            </div>
          )}
          <div className="file-transfer-card">
            <div className="file-header">
              <div className="file-icon-large">{(isAudioFile(fileTransfer.fileType) || isAudioFile(fileTransfer.fileName)) ? '🎙️' : getFileIcon(fileTransfer.fileType)}</div>
              <div className="file-details">
                <div className="file-name">{(isAudioFile(fileTransfer.fileType) || isAudioFile(fileTransfer.fileName)) ? 'Voice message' : fileTransfer.fileName}</div>
                <div className="file-size">{formatBytes(fileTransfer.fileSize)}</div>
              </div>
            </div>

            {fileTransfer.status === 'active' && (
              <div className="file-progress">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${fileTransfer.progress || 0}%` }}></div>
                </div>
                <div className="progress-info">
                  <span>{Math.round(fileTransfer.progress || 0)}%</span>
                  {fileTransfer.paused && <span className="transfer-paused">Paused</span>}
                  {!fileTransfer.paused && fileTransfer.speed && fileTransfer.speed > 0 && (
                    <span className="transfer-speed">{formatSpeed(fileTransfer.speed)}</span>
                  )}
                  {!fileTransfer.paused && fileTransfer.eta && fileTransfer.eta > 0 && (
                    <span className="transfer-eta">ETA: {formatETA(fileTransfer.eta)}</span>
                  )}
                </div>
                <div className="file-transfer-actions">
                  {fileTransfer.paused ? (
                    <button
                      type="button"
                      className="file-action-btn resume-btn"
                      onClick={() => window.electronAPI.resumeFileTransfer(fileTransfer.transferId)}
                      aria-label="Resume transfer"
                    >
                      Resume
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="file-action-btn pause-btn"
                      onClick={() => window.electronAPI.pauseFileTransfer(fileTransfer.transferId)}
                      aria-label="Pause transfer"
                    >
                      Pause
                    </button>
                  )}
                </div>
              </div>
            )}

            {fileTransfer.status === 'completed' && (
              <>
                {imageDataUrl && (
                  <div className="file-inline-image">
                    <img
                      src={imageDataUrl}
                      alt={fileTransfer.fileName}
                      className="inline-image-thumb"
                      title="Click to view full size"
                      onClick={() => onOpenImage?.(imageDataUrl)}
                    />
                  </div>
                )}
                {audioDataUrl && (
                  <div className="file-inline-audio">
                    <audio controls preload="metadata" src={audioDataUrl} />
                  </div>
                )}
                {!audioDataUrl && (
                  <div className="file-status completed">
                    ✓ Transfer complete
                  </div>
                )}
              </>
            )}

            {fileTransfer.status === 'failed' && (
              <div className="file-status failed">
                ✗ Transfer failed {fileTransfer.error && `(${fileTransfer.error})`}
              </div>
            )}

            {fileTransfer.status === 'cancelled' && (
              <div className="file-status cancelled">
                Transfer cancelled
              </div>
            )}

            {fileTransfer.status === 'pending' && (
              <div className="file-status pending">
                Waiting for response...
              </div>
            )}
          </div>

          {message.reactions && Object.keys(message.reactions).length > 0 && (
            <div className="reactions">
              {Object.entries(message.reactions).map(([emoji, count]) => (
                <button
                  key={emoji}
                  type="button"
                  className="reaction-badge reaction-badge-btn"
                  onClick={() => onRemoveReaction(message.id, emoji)}
                  title="Click to remove this reaction"
                  aria-label={`Remove ${emoji} reaction`}
                >
                  {emoji} <span className="reaction-count">{count}</span>
                </button>
              ))}
            </div>
          )}

          <div className="message-time">
            {formatTime(message.timestamp)} • {message.from}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`message-wrapper ${isOwn ? 'sent' : 'received'}`}>
      <div
        className={`message-bubble ${isOwn ? '' : senderClass(message.from)}`}
        onMouseEnter={() => setShowReactionPicker(true)}
        onMouseLeave={() => setShowReactionPicker(false)}
      >
        {showReactionPicker && (
          <div className="reaction-picker" role="toolbar" aria-label="Add reaction">
            {REACTION_EMOJIS.map(emoji => (
              <button
                key={emoji}
                className="emoji-btn"
                onClick={() => onAddReaction(message.id, emoji)}
                aria-label={`React with ${emoji}`}
                type="button"
              >
                {emoji}
              </button>
            ))}
            {onOpenReactionPicker && (
              <button
                className="emoji-btn more-reactions-btn"
                onClick={() => onOpenReactionPicker(message.id)}
                aria-label="More reactions"
                title="React with any emoji"
                type="button"
              >
                ➕
              </button>
            )}
            <button
              className="emoji-btn reply-btn"
              onClick={() => onReply(message)}
              aria-label="Reply to this message"
              title="Reply"
              type="button"
            >
              ↩️
            </button>
            {canEditUnsend && onEdit && (
              <button
                className="emoji-btn edit-btn"
                onClick={() => onEdit(message)}
                aria-label="Edit this message"
                title="Edit"
                type="button"
              >
                ✏️
              </button>
            )}
            {canEditUnsend && onUnsend && (
              <button
                className="emoji-btn unsend-btn"
                onClick={() => onUnsend(message.id)}
                aria-label="Unsend this message"
                title="Unsend (delete for everyone)"
                type="button"
              >
                🗑️
              </button>
            )}
          </div>
        )}

        {message.replyTo && (
          <div className="reply-quote" title={`Replying to ${message.replyTo.from}`}>
            <div className="reply-quote-from">{message.replyTo.from}</div>
            <div className="reply-quote-snippet">{message.replyTo.snippet}</div>
          </div>
        )}

        {message.removed ? (
          <div className="message-text message-removed">🚫 This message was removed</div>
        ) : (
          <div className="message-text">
            {linkifyText(message.content)}
            {message.edited && <span className="edited-tag"> (edited)</span>}
          </div>
        )}

        {!message.removed && message.linkPreview && (
          <div className="link-preview">
            <div className="link-preview-content">
              <a
                href={message.linkPreview.url}
                className="link-url"
                target="_blank"
                rel="noopener noreferrer"
              >
                🔗 {message.linkPreview.url}
              </a>
              <div className="link-title">{message.linkPreview.title}</div>
              {message.linkPreview.description && (
                <div className="link-desc">{message.linkPreview.description}</div>
              )}
            </div>
          </div>
        )}

        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className="reactions">
            {Object.entries(message.reactions).map(([emoji, count]) => (
              <button
                key={emoji}
                type="button"
                className="reaction-badge reaction-badge-btn"
                onClick={() => onRemoveReaction(message.id, emoji)}
                title="Click to remove this reaction"
                aria-label={`Remove ${emoji} reaction`}
              >
                {emoji} <span className="reaction-count">{count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="message-time">
          {formatTime(message.timestamp)} • {message.from}
          {isOwn && message.type === 'chat' && message.deliveryStatus && (
            <span
              className="delivery-status"
              title={
                message.deliveryStatus === 'queued'
                  ? 'Queued — sends when reconnected'
                  : message.deliveryStatus === 'sending'
                    ? 'Sending'
                    : message.deliveryStatus === 'seen'
                      ? 'Seen'
                      : 'Delivered'
              }
            >
              {message.deliveryStatus === 'queued' ? ' ⏳' : message.deliveryStatus === 'sending' ? ' ✓' : ' ✓✓'}
            </span>
          )}
        </div>

        {showSeen && isOwn && message.type === 'chat' && (
          <div className="seen-label">Seen</div>
        )}
      </div>
    </div>
  )
}

export default MessageBubble
