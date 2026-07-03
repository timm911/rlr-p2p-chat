import { useEffect, useMemo, useState } from 'react'
import type { Message } from './ChatWindow'
import './MediaGallery.css'

interface Props {
  messages: Message[]
  onClose: () => void
  /** Open the existing full-screen lightbox with a loaded image data URL. */
  onOpenImage: (dataUrl: string) => void
}

const IMAGE_RE = /\.(jpe?g|png|gif|bmp|webp)$/i
const AUDIO_RE = /\.(webm|ogg|oga|mp3|m4a|wav)$/i

function isImage(name: string, type: string): boolean {
  return IMAGE_RE.test(name) || /(jpe?g|png|gif|bmp|webp)/i.test(type)
}
function isAudio(name: string, type: string): boolean {
  return AUDIO_RE.test(name) || /audio|webm/i.test(type)
}

function formatBytes(bytes: number): string {
  if (!bytes) return ''
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

/** A single image thumbnail — loads its data URL on demand (like MessageBubble). */
function Thumb({ msg, onOpenImage }: { msg: Message; onOpenImage: (dataUrl: string) => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const filePath = msg.fileTransfer?.filePath
  useEffect(() => {
    if (!filePath) return
    let cancelled = false
    window.electronAPI.getFileDataUrl(filePath).then((r: { success?: boolean; dataUrl?: string }) => {
      if (!cancelled && r.success && r.dataUrl) setDataUrl(r.dataUrl)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [filePath])

  if (!dataUrl) {
    return <div className="gallery-thumb gallery-thumb-empty" title={msg.fileTransfer?.fileName}>🖼️</div>
  }
  return (
    <img
      className="gallery-thumb"
      src={dataUrl}
      alt={msg.fileTransfer?.fileName || 'image'}
      loading="lazy"
      title={`${msg.fileTransfer?.fileName || ''} · ${msg.from}`}
      onClick={() => onOpenImage(dataUrl)}
    />
  )
}

/**
 * Shared media gallery (E10): a read-only view over the in-memory messages —
 * a grid of all images (click → existing lightbox) and a list of other files
 * and voice messages, newest first. No new storage or protocol.
 */
function MediaGallery({ messages, onClose, onOpenImage }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Derive over the FULL messages array (not the windowed slice), newest first.
  const { images, files } = useMemo(() => {
    const completed = messages.filter(
      (m) => m.type === 'file' && m.fileTransfer && m.fileTransfer.status === 'completed'
    )
    const sorted = [...completed].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    const imgs: Message[] = []
    const others: Message[] = []
    for (const m of sorted) {
      const ft = m.fileTransfer!
      if (isImage(ft.fileName || '', ft.fileType || '') && ft.filePath) imgs.push(m)
      else others.push(m)
    }
    return { images: imgs, files: others }
  }, [messages])

  return (
    <div
      className="media-gallery-overlay no-drag"
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-gallery-title"
      onClick={onClose}
    >
      <div className="media-gallery-panel" onClick={(e) => e.stopPropagation()}>
        <div className="media-gallery-header">
          <h3 id="media-gallery-title">🖼️ Photos &amp; files</h3>
          <button type="button" className="media-gallery-close" onClick={onClose} aria-label="Close photos and files">×</button>
        </div>

        <div className="media-gallery-scroll">
          {images.length === 0 && files.length === 0 && (
            <div className="media-gallery-empty">No photos or files shared yet.</div>
          )}

          {images.length > 0 && (
            <>
              <div className="media-gallery-section-title">Photos ({images.length})</div>
              <div className="media-gallery-grid">
                {images.map((m) => (
                  <Thumb key={m.id} msg={m} onOpenImage={onOpenImage} />
                ))}
              </div>
            </>
          )}

          {files.length > 0 && (
            <>
              <div className="media-gallery-section-title">Files &amp; voice ({files.length})</div>
              <ul className="media-gallery-files">
                {files.map((m) => {
                  const ft = m.fileTransfer!
                  const audio = isAudio(ft.fileName || '', ft.fileType || '')
                  return (
                    <li key={m.id} className="media-gallery-file-row">
                      <span className="media-gallery-file-icon" aria-hidden="true">{audio ? '🎙️' : '📎'}</span>
                      <span className="media-gallery-file-info">
                        <span className="media-gallery-file-name">{audio ? 'Voice message' : ft.fileName}</span>
                        <span className="media-gallery-file-meta">
                          {m.from} · {formatDate(m.timestamp)}{ft.fileSize ? ` · ${formatBytes(ft.fileSize)}` : ''}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default MediaGallery
