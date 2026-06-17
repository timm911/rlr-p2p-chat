import { useEffect, useRef, useState } from 'react'
import './ScreenshotPicker.css'

interface Source {
  id: string
  name: string
  isScreen: boolean
  thumb: string
  appIcon: string | null
}

interface Props {
  onClose: () => void
  /** Called with a temp file path of the (optionally cropped) screenshot to send */
  onSend?: (filePath: string) => void
  /** Pick-only mode: clicking a source returns its id instead of capturing
   *  (used to choose what to live-share). */
  pickOnly?: boolean
  onPick?: (sourceId: string, name: string) => void
  title?: string
}

type Rect = { x: number; y: number; w: number; h: number }

function ScreenshotPicker({ onClose, onSend, pickOnly, onPick, title }: Props) {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [captured, setCaptured] = useState<string | null>(null) // full-res data URL
  const [busy, setBusy] = useState(false)
  const [cropMode, setCropMode] = useState(false)
  const [sel, setSel] = useState<Rect | null>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    let mounted = true
    window.electronAPI.screenshotListSources().then((list) => {
      if (!mounted) return
      // Screens first, then windows
      const sorted = [...list].sort((a, b) => Number(b.isScreen) - Number(a.isScreen))
      setSources(sorted)
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pick = async (id: string, name: string) => {
    // Pick-only mode (choosing what to live-share): return the id, don't capture
    if (pickOnly) {
      onPick?.(id, name)
      onClose()
      return
    }
    setBusy(true)
    const r = await window.electronAPI.screenshotCapture(id)
    setBusy(false)
    if (r.success && r.dataUrl) {
      setCaptured(r.dataUrl)
      setCropMode(false)
      setSel(null)
    }
  }

  // --- Crop selection (coordinates in displayed-image pixels) ---
  const relPos = (e: React.MouseEvent) => {
    const img = imgRef.current
    if (!img) return { x: 0, y: 0 }
    const rect = img.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, e.clientY - rect.top))
    }
  }
  const onDown = (e: React.MouseEvent) => {
    if (!cropMode) return
    const p = relPos(e)
    dragStart.current = p
    setSel({ x: p.x, y: p.y, w: 0, h: 0 })
  }
  const onMove = (e: React.MouseEvent) => {
    if (!cropMode || !dragStart.current) return
    const p = relPos(e)
    const s = dragStart.current
    setSel({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
  }
  const onUp = () => { dragStart.current = null }

  const send = async () => {
    if (!captured) return
    setBusy(true)
    let dataUrl = captured
    // Apply crop if a real selection was drawn
    const img = imgRef.current
    if (cropMode && sel && sel.w > 6 && sel.h > 6 && img) {
      const scaleX = img.naturalWidth / img.clientWidth
      const scaleY = img.naturalHeight / img.clientHeight
      const sx = Math.round(sel.x * scaleX)
      const sy = Math.round(sel.y * scaleY)
      const sw = Math.round(sel.w * scaleX)
      const sh = Math.round(sel.h * scaleY)
      const canvas = document.createElement('canvas')
      canvas.width = sw
      canvas.height = sh
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
        dataUrl = canvas.toDataURL('image/png')
      }
    }
    const saved = await window.electronAPI.saveTempImage(dataUrl)
    setBusy(false)
    if (saved.success && saved.filePath) {
      onSend?.(saved.filePath)
      onClose()
    }
  }

  return (
    <div className="screenshot-backdrop no-drag" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="screenshot-panel" role="dialog" aria-label="Take a screenshot">
        <div className="screenshot-header">
          <h3>{captured ? 'Preview & send' : (title || 'Pick a window or screen')}</h3>
          <button className="close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        {!captured && (
          <div className="screenshot-body">
            {loading ? (
              <div className="screenshot-loading">Loading windows…</div>
            ) : sources.length === 0 ? (
              <div className="screenshot-loading">No capturable windows found.</div>
            ) : (
              <div className="screenshot-grid">
                {sources.map((s) => (
                  <button key={s.id} className="screenshot-source" onClick={() => pick(s.id, s.name)} disabled={busy} title={s.name}>
                    <div className="screenshot-thumb-wrap">
                      {s.thumb ? <img src={s.thumb} alt={s.name} className="screenshot-thumb" /> : <div className="screenshot-thumb placeholder" />}
                    </div>
                    <div className="screenshot-source-name">
                      <span className="screenshot-source-icon">{s.isScreen ? '🖥️' : '🪟'}</span>
                      <span className="screenshot-source-text">{s.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {captured && (
          <div className="screenshot-body">
            <div
              className={`screenshot-preview ${cropMode ? 'cropping' : ''}`}
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={onUp}
              onMouseLeave={onUp}
            >
              <img ref={imgRef} src={captured} alt="Screenshot preview" className="screenshot-preview-img" draggable={false} />
              {cropMode && sel && sel.w > 0 && (
                <div
                  className="screenshot-crop-rect"
                  style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }}
                />
              )}
            </div>
            <div className="screenshot-actions">
              <button className="ss-btn" onClick={() => { setCaptured(null); setSel(null); setCropMode(false) }} disabled={busy}>← Back</button>
              <button
                className={`ss-btn ${cropMode ? 'active' : ''}`}
                onClick={() => { setCropMode((c) => !c); setSel(null) }}
                disabled={busy}
                title="Drag a box on the image to crop"
              >
                {cropMode ? '✂️ Cropping (drag a box)' : '✂️ Crop'}
              </button>
              <button className="ss-btn ss-send" onClick={send} disabled={busy}>
                {busy ? 'Sending…' : (cropMode && sel && sel.w > 6 ? 'Send selection ➤' : 'Send ➤')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ScreenshotPicker
