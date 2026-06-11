# RLR P2P Chat – Optional Improvements

This document lists optional enhancements you can consider for future work. All are **optional**; the app is fully functional as-is.

---

## Implemented in This Pass

- **Connection & voice diagnostics** – Settings → "Connection & Voice Diagnostics" shows role, connected/auth state, last activity, reconnect delay, and mic listening. Refreshes every 2s when open.
- **Emoji reactions: add and remove** – Click a reaction badge on a message to remove that reaction (count decrements; syncs with peer).
- **Paste to send images** – Paste (Ctrl+V) in the message input when the clipboard contains an image; the image is saved and sent as a file. Text paste still works.
- **Design refresh** – Richer gradient (indigo → violet → fuchsia), 3D-style message bubbles (layered shadows, hover lift), stronger glassmorphism, and updated accent colors across the UI.
- **Focus behavior** – Input is refocused after closing Settings or the file offer dialog, and after sending a message (existing behavior kept).

---

## Optional Future Improvements

### UX & Polish

1. **Typing indicator** – Show “Peer is typing…” when the other side is composing (protocol already has `typing`; could add a small debounced indicator in the header or above the input).
2. **Message delivery/read cues** – Optional subtle checkmarks or “delivered” state (would need protocol and UI).
3. **Sound when reconnecting** – Optional short sound when connection state goes from disconnected to connected (you had removed connection beeps; this could be a single optional “back online” chime).
4. **Unread count / badge** – When the window is in the background, show an unread count in the taskbar or title (Electron supports this).

### File & Media

5. **Inline image preview** – For received/sent image files (e.g. .png, .jpg), show a thumbnail in the chat bubble instead of only the file card (click to open full size).
6. **Paste multiple images** – If the clipboard has multiple images (e.g. from some tools), offer to send all or the first N.
7. **Drag-and-drop onto input** – Allow dropping a file onto the input area (in addition to the messages area) to attach/send.
8. **File transfer pause/resume** – Pause and resume large transfers (would need protocol and transfer-manager changes).

### Voice & Accessibility

9. **TTS “speaking” indicator** – Small persistent indicator (e.g. in header or above messages) when TTS is reading, so it’s clear why the mic might be delayed.
10. **Configurable silence timeout** – Make the 3-second silence-to-send and 5-second no-speech timeout configurable in Settings (e.g. 2–5 s and 3–10 s).
11. **Keyboard shortcut for mic** – Global or in-window shortcut (e.g. Ctrl+Space) to start/stop voice input.

### Connection & Reliability

12. **Ping/latency in diagnostics** – Show last ping time or RTT in the diagnostics panel (e.g. from last pong timestamp).
13. **Optional “strict” connection mode** – Toggle to avoid reconnecting on auth failure or after N failures (for debugging or locked-down setups).

### Security & V2

14. **TLS encryption (V2)** – As in README: TLS with mutual auth and certificate pinning.
15. **Message history persistence** – Optional encrypted local store of recent messages (with clear “clear history” and privacy notice).

### Design & Theming

16. **Dark/light theme toggle** – Switch between current gradient/glass style and a light theme (or a second dark variant).
17. **Compact/comfortable density** – Reduce padding and font size for “compact” mode so more messages fit on screen.
18. **Custom accent color** – Let the user pick an accent (e.g. violet, blue, green) and apply it to send button, links, and focus rings.

---

## Quick Reference: What Was Touched

- **Diagnostics** – `src/main/network/tcp-client.ts`, `tcp-server.ts` (getDiagnostics); `src/main/ipc/handlers.ts` (network:get-diagnostics); `src/preload/index.ts` (getDiagnostics); `src/renderer/components/SettingsMenu.tsx` + `.css`.
- **Reactions remove** – `src/main/network/protocol.ts` (reaction-remove); `tcp-client.ts`, `tcp-server.ts` (forward); `ChatWindow.tsx` (handleRemoveReaction, reaction-remove handler); `MessageBubble.tsx` (onRemoveReaction, clickable badges) + `.css`.
- **Paste image** – `src/main/ipc/handlers.ts` (file:save-clipboard-image); `preload` (saveClipboardImage); `ChatWindow.tsx` (textarea onPaste).
- **Design** – `src/renderer/styles/global.css`, `MessageBubble.css`, `ChatWindow.css` (gradients, shadows, colors, glass).
- **Focus** – `ChatWindow.tsx` (onClose for Settings and file dialogs refocus input).

Connection logic (connect, reconnect, auth, heartbeat) was **not** changed; only read-only diagnostics were added.
