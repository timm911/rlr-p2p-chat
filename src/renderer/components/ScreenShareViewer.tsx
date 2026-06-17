import { useEffect, useRef } from 'react'
import { getScreenShare } from '../services/screen-share'
import './ScreenShareViewer.css'

interface Props {
  sharerName: string
  onClose: () => void
}

/**
 * Plays an incoming live screen share. Frames (WebM chunks from the sharer's
 * MediaRecorder) are appended to a MediaSource SourceBuffer and shown in a
 * <video>. We keep playback near the live edge by jumping forward if we fall
 * behind, and evict old buffered data so memory stays bounded.
 */
function ScreenShareViewer({ sharerName, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const mime = getScreenShare().getMimeType() || 'video/webm;codecs=vp8'
    const mediaSource = new MediaSource()
    const queue: Uint8Array[] = []
    let sourceBuffer: SourceBuffer | null = null
    let objectUrl = URL.createObjectURL(mediaSource)
    video.src = objectUrl

    const evictOld = () => {
      if (!sourceBuffer || sourceBuffer.updating) return
      try {
        const b = sourceBuffer.buffered
        if (b.length > 0) {
          const start = b.start(0)
          const end = b.end(b.length - 1)
          // Keep ~20s; drop anything older to bound memory
          if (end - start > 30 && video.currentTime - start > 20) {
            sourceBuffer.remove(start, video.currentTime - 15)
            return true
          }
        }
      } catch (_) {}
      return false
    }

    const pump = () => {
      if (!sourceBuffer || sourceBuffer.updating) return
      if (evictOld()) return // removal is async; appending resumes on updateend
      const next = queue.shift()
      if (!next) return
      try {
        sourceBuffer.appendBuffer(next as unknown as BufferSource)
      } catch (err) {
        // QuotaExceeded or out-of-order — drop a bit and keep going
        queue.length = 0
      }
    }

    const keepLive = () => {
      try {
        const b = video.buffered
        if (b.length > 0) {
          const end = b.end(b.length - 1)
          if (end - video.currentTime > 1.5) video.currentTime = end - 0.4
        }
      } catch (_) {}
    }

    const onSourceOpen = () => {
      try {
        sourceBuffer = mediaSource.addSourceBuffer(mime)
        sourceBuffer.mode = 'sequence'
        sourceBuffer.addEventListener('updateend', () => { pump(); keepLive() })
        pump()
      } catch (err) {
        console.error('[ScreenShare] addSourceBuffer failed:', err)
      }
    }
    mediaSource.addEventListener('sourceopen', onSourceOpen)

    const offFrame = getScreenShare().onFrame((bytes) => {
      queue.push(bytes)
      pump()
    })

    video.muted = true
    video.autoplay = true
    const tryPlay = () => { video.play().catch(() => {}) }
    video.addEventListener('canplay', tryPlay)

    return () => {
      offFrame()
      video.removeEventListener('canplay', tryPlay)
      try { mediaSource.removeEventListener('sourceopen', onSourceOpen) } catch (_) {}
      try { if (mediaSource.readyState === 'open') mediaSource.endOfStream() } catch (_) {}
      try { URL.revokeObjectURL(objectUrl) } catch (_) {}
      video.removeAttribute('src')
      try { video.load() } catch (_) {}
    }
  }, [])

  return (
    <div className="screenshare-viewer no-drag" role="dialog" aria-label={`${sharerName} is sharing their screen`}>
      <div className="screenshare-bar">
        <span className="screenshare-live-dot" aria-hidden="true" />
        <span className="screenshare-title">{sharerName} is sharing their screen</span>
        <button className="screenshare-close" onClick={onClose} aria-label="Close screen share">✕ Close</button>
      </div>
      <div className="screenshare-stage">
        <video ref={videoRef} className="screenshare-video" playsInline />
      </div>
    </div>
  )
}

export default ScreenShareViewer
