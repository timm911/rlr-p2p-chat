/**
 * Linkify Utility
 * Detects URLs in text and converts them to clickable links
 */

// URL detection regex - matches http(s)://, www., and common TLDs
const URL_REGEX = /(\b(https?:\/\/|www\.)[^\s<>"{}|\\^[\]`]+)/gi

/**
 * Converts plain text URLs into clickable anchor tags
 * @param text - The text to process
 * @returns React-safe JSX elements array
 */
export function linkifyText(text: string): (string | JSX.Element)[] {
  if (!text) return [text]

  const parts: (string | JSX.Element)[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Reset regex state
  URL_REGEX.lastIndex = 0

  while ((match = URL_REGEX.exec(text)) !== null) {
    const url = match[0]
    const matchIndex = match.index

    // Add text before the URL
    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex))
    }

    // Ensure URL has protocol
    let href = url
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      href = 'https://' + url
    }

    // Remove trailing punctuation that might be part of sentence
    const trailingPunctuation = /[.,;:!?)]+$/
    let displayUrl = url
    let punctuation = ''
    
    const punctMatch = url.match(trailingPunctuation)
    if (punctMatch) {
      punctuation = punctMatch[0]
      displayUrl = url.slice(0, -punctuation.length)
      href = href.slice(0, -punctuation.length)
    }

    // Create anchor element
    parts.push(
      <a
        key={`link-${matchIndex}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-link"
        onClick={(e) => {
          e.preventDefault()
          window.electronAPI?.openExternal?.(href)
        }}
      >
        {displayUrl}
      </a>
    )

    // Add back trailing punctuation if any
    if (punctuation) {
      parts.push(punctuation)
    }

    lastIndex = matchIndex + url.length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
}

/**
 * Checks if text contains any URLs
 */
export function hasLinks(text: string): boolean {
  URL_REGEX.lastIndex = 0
  return URL_REGEX.test(text)
}

/**
 * Convert a message into what TTS should SAY, so it doesn't read raw URLs
 * (e.g. "h-t-t-p-s-colon-slash-slash...") aloud. URLs are replaced with the
 * phrase "link received"; if the message is only a link, the whole spoken
 * text is just that phrase. Surrounding words are preserved and read normally.
 */
export function toSpokenText(text: string): string {
  URL_REGEX.lastIndex = 0
  if (!URL_REGEX.test(text)) return text
  URL_REGEX.lastIndex = 0
  const withoutUrls = text.replace(URL_REGEX, ' ').replace(/\s+/g, ' ').trim()
  if (!withoutUrls) return 'Link received'
  return `${withoutUrls}, link received`
}

