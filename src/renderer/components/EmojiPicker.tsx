import { useEffect } from 'react'
import './EmojiPicker.css'

/**
 * Self-contained offline emoji picker: a popover with a scrollable grid of
 * curated Unicode emoji. No libraries, no network — just hard-coded strings.
 *
 * Used in two places:
 *  - Message input (😊 button): insert an emoji at the cursor
 *  - Reaction picker (➕ button on a bubble): react with ANY emoji
 *
 * Closes on outside-click (backdrop) and Escape. Escape is handled in the
 * capture phase with stopPropagation so ChatWindow's own Escape chain
 * (settings / reply / mic) doesn't also fire.
 */

export const EMOJI_CATEGORIES: Array<{ name: string; emojis: string[] }> = [
  {
    name: 'Smileys',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
      '🙂', '😉', '😌', '😍', '🥰', '😘', '😋', '😛', '😜', '🤪',
      '🤔', '🤨', '😐', '😴', '🥱', '😎', '🤓', '🥳', '😏', '😒',
      '😞', '😢', '😭', '😤', '😠', '😡', '🤯', '😳', '🥺', '😬',
      '🙄', '😷', '🤒', '🤧', '🤢', '😈', '🤡', '💀', '👻', '🤖'
    ]
  },
  {
    name: 'Gestures',
    emojis: [
      '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
      '👆', '👇', '☝️', '✋', '🖐️', '🖖', '👋', '🤝', '🙏', '💪',
      '👏', '🙌', '🤲', '🤜', '🤛', '✊', '👊'
    ]
  },
  {
    name: 'Hearts',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝'
    ]
  },
  {
    name: 'Animals',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🦆', '🦅', '🦉',
      '🐴', '🦄', '🐝', '🦋', '🐢', '🐍', '🐙', '🦀', '🐬', '🐳'
    ]
  },
  {
    name: 'Food',
    emojis: [
      '🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒', '🍑', '🍍',
      '🥑', '🍅', '🌽', '🥕', '🍞', '🧀', '🍗', '🥓', '🍔', '🍟',
      '🍕', '🌭', '🌮', '🍝', '🍜', '🍣', '🍦', '🍩', '🍪', '🎂',
      '🍰', '🍫', '🍿', '☕', '🍺', '🍷', '🥂'
    ]
  },
  {
    name: 'Activities',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🎱', '🏓', '🎣', '🎳',
      '⛳', '🎯', '🎮', '🎲', '🧩', '🎬', '🎤', '🎧', '🎸', '🎹',
      '🥁', '🎺', '🎻'
    ]
  },
  {
    name: 'Travel',
    emojis: [
      '🚗', '🚕', '🚌', '🏎️', '🚓', '🚑', '🚒', '🚜', '🚲', '🏍️',
      '✈️', '🚀', '🚁', '⛵', '🚂', '🗽', '🏰', '🏖️', '🏕️', '⛰️'
    ]
  },
  {
    name: 'Objects',
    emojis: [
      '⌚', '📱', '💻', '🖥️', '📷', '🎥', '📺', '📻', '⏰', '🔋',
      '💡', '🔦', '🛒', '💰', '💎', '🔧', '🔨', '🔑', '🔒', '📦',
      '📚', '✏️', '📌', '📎', '✂️', '🛏️', '🚪', '🧸', '🎁', '🎈',
      '🎉'
    ]
  },
  {
    name: 'Symbols',
    emojis: [
      '✅', '❌', '⭐', '🌟', '✨', '💫', '🔥', '💯', '⚡', '💥',
      '💤', '💦', '🌈', '☀️', '🌙', '⛅', '☔', '❄️', '🎵', '🎶',
      '❓', '❗', '⚠️', '🚫', '🔔', '🔕', '📢', '♻️'
    ]
  }
]

interface Props {
  title?: string
  onPick: (emoji: string) => void
  onClose: () => void
}

function EmojiPicker({ title, onPick, onClose }: Props) {
  // Escape closes the picker (capture phase wins over ChatWindow's handlers)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      className="emoji-picker-backdrop no-drag"
      onMouseDown={(e) => {
        // Outside-click closes; clicks inside the panel bubble up but miss this check
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="emoji-picker-panel" role="dialog" aria-label={title || 'Emoji picker'}>
        {title && <div className="emoji-picker-title">{title}</div>}
        <div className="emoji-picker-scroll">
          {EMOJI_CATEGORIES.map((cat) => (
            <div key={cat.name} className="emoji-picker-category">
              <div className="emoji-picker-category-name">{cat.name}</div>
              <div className="emoji-picker-grid">
                {cat.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="emoji-picker-emoji"
                    onClick={() => onPick(emoji)}
                    aria-label={`Emoji ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default EmojiPicker
