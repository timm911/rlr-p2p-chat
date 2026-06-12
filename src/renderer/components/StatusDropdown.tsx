import { useState, useRef, useEffect } from 'react'
import './StatusDropdown.css'
import {
  PRESET_STATUSES,
  listCustomStatuses,
  getStatusEmoji,
  CUSTOM_STATUSES_CHANGED_EVENT,
  CustomStatus
} from '../utils/custom-statuses'

interface Props {
  currentStatus: string
  onStatusChange: (status: string) => void
}

function StatusDropdown({ currentStatus, onStatusChange }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [customInput, setCustomInput] = useState('')
  // Saved custom statuses (managed in Settings → Statuses). Kept in sync via
  // the change event so additions/deletions show up without a remount.
  const [customStatuses, setCustomStatuses] = useState<CustomStatus[]>(listCustomStatuses)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Get emoji for current status (preset or saved custom)
  const getCurrentEmoji = () => {
    return getStatusEmoji(currentStatus) ?? '✏️'
  }

  useEffect(() => {
    const refresh = () => setCustomStatuses(listCustomStatuses())
    window.addEventListener(CUSTOM_STATUSES_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(CUSTOM_STATUSES_CHANGED_EVENT, refresh)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleStatusSelect = (status: string) => {
    onStatusChange(status)
    setIsOpen(false)
    setCustomInput('')
  }

  const handleCustomSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && customInput.trim()) {
      onStatusChange(customInput.trim())
      setIsOpen(false)
      setCustomInput('')
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setCustomInput('')
    }
  }

  return (
    <div className="status-dropdown" ref={dropdownRef}>
      <button
        className="status-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`Current status: ${currentStatus}. Click to change status`}
      >
        <span className="status-current">
          <span className="status-emoji" aria-hidden="true">{getCurrentEmoji()}</span>
          <span>{currentStatus}</span>
        </span>
        <span className="dropdown-arrow" aria-hidden="true">▼</span>
      </button>

      {isOpen && (
        <div className="status-menu" role="menu" aria-label="Status options">
          {PRESET_STATUSES.map(status => (
            <button
              key={status.label}
              className="status-option"
              onClick={() => handleStatusSelect(status.label)}
              role="menuitem"
              aria-label={`Set status to ${status.label}`}
            >
              <span className="status-emoji" aria-hidden="true">{status.emoji}</span>
              <span>{status.label}</span>
            </button>
          ))}

          {/* Saved custom statuses (added in Settings → Statuses) */}
          {customStatuses.map(status => (
            <button
              key={status.id}
              className="status-option custom"
              onClick={() => handleStatusSelect(status.label)}
              role="menuitem"
              aria-label={`Set status to ${status.label}`}
            >
              <span className="status-emoji" aria-hidden="true">{status.emoji}</span>
              <span>{status.label}</span>
            </button>
          ))}

          <input
            type="text"
            className="custom-status-input"
            placeholder="Custom status..."
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={handleCustomSubmit}
            aria-label="Enter custom status"
          />
        </div>
      )}
    </div>
  )
}

export default StatusDropdown
