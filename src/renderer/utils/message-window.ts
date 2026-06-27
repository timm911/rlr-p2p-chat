// Render windowing for the message list.
//
// ChatWindow keeps the full conversation in memory, but mounting every bubble
// in the DOM is the dominant cost on old hardware once history grows. We render
// only the most recent `limit` messages and let the user pull older ones in on
// demand. Newest messages are always in the window (we keep the tail), so the
// live conversation is never affected.

export const DEFAULT_RENDER_LIMIT = 200
export const LOAD_MORE_STEP = 200

export interface WindowedMessages<T> {
  /** The slice to render (the most recent `limit`, in original order). */
  visible: T[]
  /** How many older messages are not rendered (0 when nothing is hidden). */
  hiddenCount: number
}

/**
 * Return the last `limit` messages plus a count of how many are hidden above.
 * A non-positive limit means "no windowing" (render everything).
 */
export function windowMessages<T>(messages: T[], limit: number): WindowedMessages<T> {
  if (limit <= 0 || messages.length <= limit) {
    return { visible: messages, hiddenCount: 0 }
  }
  return {
    visible: messages.slice(messages.length - limit),
    hiddenCount: messages.length - limit,
  }
}
