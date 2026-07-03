# RLR P2P Chat — v3.5 Enhancement Plan

**Date:** 2026-07-03 · **Current version:** 3.4.2 · **Author:** Claude (Fable 5) survey of the full codebase
**Executor:** Claude Opus, driven by `/goal` (see `OPUS_KICKOFF_PROMPT.md`)

This plan contains **1 priority bug fix (P0)** and **10 enhancements (E1–E10)**, each with rationale, exact files, implementation steps, what-not-to-break constraints, and verification steps. Items are ordered so the safest/smallest land first. Nothing here touches the encryption layer, the handshake, or the TCP framing.

---

## Codebase facts the executor must know (verified 2026-07-03)

- **Three identities now, not two:** `RLRJupiter`, `Ramjet`, `Ripster` (`src/renderer/App.tsx:10`). Ripster is the hub/listener; the hub relays chat between connectors (`src/main/network/tcp-server.ts`). The project `CLAUDE.md` still says "two users" — it is outdated on this point.
- **Native window frame:** `frame: true` in `src/main/index.ts:79`. The in-page `AppHeader` (frameless-era header) still exists but the chat screen's top bar is `.chat-header` in `ChatWindow.tsx:2493` — status dropdown + 📞 🖥️ 👋 🔍 🔊 ⋮ icon buttons (`.header-controls`).
- **Old runtime on purpose:** Electron **21.4.4** (Chromium 106) because RLRJupiter runs **Windows 8.1 on old hardware**. Do not use JS/CSS/Electron APIs newer than that. Do not upgrade Electron.
- **Statuses:** presets live in ONE place — `PRESET_STATUSES` in `src/renderer/utils/custom-statuses.ts:22`. `Status` type union at `src/renderer/components/ChatWindow.tsx:79`. Only the exact strings `"Talk to me"` / `"Listen only"` trigger speech behavior; every other status is "plain".
- **History:** persisted encrypted to `%APPDATA%/<app>/history.json` via `history:save`/`history:load` IPC (`src/main/ipc/handlers.ts:301`); hub answers `history-request` for reconnecting peers. Messages render windowed (last 200 + "Load earlier") via `src/renderer/utils/message-window.ts`.
- **Perf work just landed (3.4.2):** `MessageBubble` is memoized with stabilized callback props; history saves are debounced/deduped. **Any new prop passed to `MessageBubble` must be referentially stable** (useCallback/useMemo) or the memoization regresses.
- **RTT plumbing already exists:** `getDiagnostics()` already returns `lastRttMs` / `lastPongTime` (`src/preload/index.ts:225-238`) — it is just not surfaced in the UI.
- **Already implemented — do NOT re-build:** reply-to, edit/unsend, read receipts ("Seen"), reactions + full emoji picker, screenshots + crop, screen share, voice calls, voice messages, scheduled messages & reminders, nudge, search, date dividers, auto-away, auto-trim, offline queue (survives restart), history sync, taskbar unread badge, notification sound picker, custom statuses manager, themes/backgrounds/accent/density/text size, spell check, start-with-Windows, auto-update (electron-updater via GitHub releases), bundled emoji font.
- **Tests:** Jest (`tests/unit`, `tests/integration`) + a Playwright smoke test. `npm test` must pass. Changelog for the Release Notes viewer lives in `src/renderer/utils/changelog.ts` (newest-first) and must get a new entry when a release is cut.

### Protocol-compatibility rule (applies to E7, E10 and any new `NetworkMessage.type`)

Peers auto-update at different times, so a 3.5 client will talk to a 3.4.2 client. Before adding any new message type, **verify how an unknown `type` is handled** in `src/main/network/tcp-server.ts` (its `switch`, and what the hub relays), `tcp-client.ts`, and the renderer's `onMessage` dispatch in `ChatWindow.tsx`. New types must be **silently ignored** by old clients — if any layer throws/logs-loudly/disconnects on unknown types, fix that first (defensively, as part of the feature). Never change the meaning of existing types or the plaintext `hello`/`auth-failed` handshake.

---

## P0 — BUG: header icons disappear while dragging the window

**Symptom (reported):** moving the window left/right makes the top icons (status dropdown + 📞 🖥️ 👋 🔍 🔊 ⋮ in `.header-controls`) disappear; they come back on hover/interaction.

**Likely cause (verify before fixing):** a known Chromium (≤106) Windows compositing bug: GPU-promoted layers fail to repaint during/after an OS window move. This app has two aggravators: (1) `backdrop-filter: blur` used widely (`.glass` in `src/renderer/styles/App.css:19`, `AppHeader.css:8`, dropdown/settings menus), and (2) the animated gradient background (`gradientShift` keyframes in `src/renderer/styles/global.css`) which keeps the page composited while it drifts.

**Diagnosis first (do not skip):** run `npm run dev`, drag the window horizontally, reproduce. Then in DevTools (F12) toggle suspects: disable the body background animation, disable `backdrop-filter` on the header/menus, add `transform: translateZ(0)` to `.header-controls` — find which change actually stops the vanishing. Fix the confirmed cause with the least invasive option below.

**Candidate fixes, in order of preference:**
1. **CSS layer promotion (renderer-only, zero risk):** add `transform: translateZ(0); will-change: transform;` to `.header-controls`, `.status-btn`, and `.icon-btn` (`ChatWindow.css`) so the icons live on their own compositor layer that survives moves.
2. **Forced repaint on move (main process):** in `src/main/index.ts`, listen to the window's `move`/`moved` events and call a **throttled** `mainWindow.webContents.invalidate()` (at most ~every 100–150 ms during move, plus once on `moved`). Throttling matters — RLRJupiter's machine is weak; an unthrottled invalidate per move-event will peg the CPU.
3. **Pause the background animation during moves:** on `move`, send an IPC event; renderer adds a `body.window-moving` class with `animation-play-state: paused`, removed ~200 ms after the last move event.
4. **Last resort:** replace `backdrop-filter` on the always-visible header chrome with a slightly more opaque flat background (keep blur on transient popups only).

**Don't break:** glassmorphism look on menus/popups; light theme; custom backgrounds (`background.ts` sets a body attribute); performance on old hardware.

**Verify:** drag the window in every direction, fast and slow, on both dark and light theme and at least one custom background; icons must stay visible. Watch Task Manager CPU while dragging — no sustained spike. Also drag on the user-selection and connection-setup screens (AppHeader with its own blur).

---

## E1 — 🏠 "Home" preset status  *(size: S)*

**What:** add `Home` as a preset status, a plain status like `Bed`/`Away` (notification sound plays; no TTS, no auto-mic, no auto-away trigger).

**Files & steps:**
1. `src/renderer/utils/custom-statuses.ts` — add `{ emoji: '🏠', label: 'Home' }` to `PRESET_STATUSES` (place it after `Company`, before nothing — presets render in array order in the dropdown).
2. `src/renderer/components/ChatWindow.tsx:79` — extend the `Status` union with `'Home'` (cosmetic since `| string` is present, but keep the union honest).
3. **Collision migration:** `addCustomStatus` rejects labels colliding with presets, but a user may have ALREADY saved a custom status labeled "Home" (case-insensitive). Add a one-time cleanup: in `listCustomStatuses()`, filter out any saved custom whose lowercased label matches a preset, and persist the filtered list if it changed. This keeps the dropdown free of duplicates forever, including for any preset added in the future.
4. Update the project `CLAUDE.md` status list (currently says "9 preset"; count changes) and add a changelog line when the release is cut.

**Don't break:** status persistence (`rlrchat-my-status`), the speech statuses' exact-string matching, custom statuses saved on the peer's machine. Old peers receiving `"Home"` just display the raw string in the header — that's fine (verify the emoji-less display looks OK).

**Verify:** unit test for the new preset + the collision cleanup in `tests/unit` (custom-statuses helpers are pure). Manually: pick Home → system message posted, status persists across restart, peer header shows "Home", notification sounds still play, TTS does NOT read messages aloud while in Home.

---

## E2 — System tray icon + minimize-to-tray  *(size: M)*

**What:** a tray icon (app icon) with menu: Open, set status (submenu of presets), Quit. New Settings toggle **"Close button hides to tray"** (default OFF to preserve current behavior). When enabled, the ✕/close hides the window to tray instead of quitting; a first-time balloon/tooltip explains where it went. Bonus: with "Start with Windows" on and tray mode on, start hidden using the already-stubbed `'--hidden'` login-item arg (`src/main/index.ts:209` comment).

**Files & steps:** `src/main/index.ts` (create `Tray` in `app.whenReady`, guard single instance; intercept `close` → `hide()` when the setting is on; real quit from tray menu sets a flag), a small IPC pair to read/write the setting (persist in main via a JSON settings file or reuse an existing settings channel — check how `auto-reconnect` persists first and follow that pattern), `SettingsMenu.tsx` toggle, icon: reuse `build/` app icon (verify path works packaged AND in dev).

**Don't break:** `window-all-closed` → `app.quit()` logic; auto-update restart flow (`quitAndInstall` must actually quit, not hide — set the quitting flag in the updater path in `src/main/updater.ts`); the Playwright smoke test that launches two instances (tray must not fight over a single-instance lock — if adding `requestSingleInstanceLock`, skip it when `RLR_USER_DATA` is set, or don't add it at all).

**Verify:** close hides to tray when enabled and quits when disabled; tray status-change sends the status message to peers; auto-update still restarts the app; unread taskbar badge still works after hide/show cycles.

---

## E3 — Quiet hours (scheduled Do-Not-Disturb)  *(size: M)*

**What:** Settings section "Quiet hours": enable toggle + start/end time pickers (e.g. 10:00 PM–8:00 AM). During quiet hours: no notification sounds, no nudge sound/shake, no TTS reading, no reminder chimes — messages still arrive silently and the unread badge still updates. Header shows a small 🌙 indicator while active. Overnight ranges (start > end) must work.

**Files & steps:** new pure util `src/renderer/utils/quiet-hours.ts` (persist in localStorage like `auto-away.ts`; export `isQuietNow(cfg, now)` as a pure function for unit tests); wire the checks at the choke points: `sound-service.ts`/`notification-sound.ts` play paths, the TTS-read decision in `ChatWindow.tsx` (~line 968 where speech statuses branch), nudge handling, and reminder alerts (`scheduled-messages` alert path). Settings UI mirrors the auto-away section pattern (`SettingsMenu.tsx:375-409`).

**Don't break:** manual mute button semantics (mute and quiet-hours are independent ORed conditions); "Talk to me" auto-response when quiet hours are OFF; reminders scheduled during quiet hours should still show visually.

**Verify:** unit-test `isQuietNow` including the overnight wraparound and exact-boundary minutes. Manually: set quiet hours to now → send message from a second dev instance (`RLR_USER_DATA` env trick, see `src/main/index.ts:6-12`) → silent arrival, badge updates, 🌙 shows.

---

## E4 — Connection quality indicator in header  *(size: S)*

**What:** surface the already-collected `lastRttMs` as a small signal indicator next to each online dot (or one global one near the header controls): green <100 ms, yellow <300 ms, red ≥300 ms/stale; tooltip shows "Ping: 87 ms". Data comes from polling `window.electronAPI.getDiagnostics()` every ~5 s while connected — **no protocol changes**.

**Files & steps:** `ChatWindow.tsx` header (a `useEffect` poll storing `rttMs` state; render in the `.connection-status` row), few lines of CSS. If `lastRttMs` turns out to be populated only for one role (check `tcp-client.ts`/`tcp-server.ts` ping-pong), show the indicator only where data exists rather than inventing new protocol traffic.

**Don't break:** the 5 s poll must be cheap (it's IPC; keep interval ≥5 s), and cleared on unmount/disconnect.

**Verify:** connected → indicator shows a plausible ms; disconnect → indicator disappears (offline state unchanged).

---

## E5 — Export chat history  *(size: M)*

**What:** Settings → "Export chat history…": saves the decrypted conversation as a readable **HTML file** (sender-colored, timestamps, day headers, `[Photo]`/`[File: name]` placeholders — optionally embed images as data URIs behind a checkbox) plus a plain **.txt** option. Uses Electron's save dialog.

**Files & steps:** new IPC `history:export` in `src/main/ipc/handlers.ts` (it already knows how to load+decrypt `history.json`; add `dialog.showSaveDialog` + template rendering in main, where Node fs lives); expose in `src/preload/index.ts` (+ its `ElectronAPI` type); button in `SettingsMenu.tsx`.

**Don't break:** history encryption at rest (export writes a NEW plaintext file the user chose; never touch `history.json` itself); large histories (stream/concat efficiently; embedding images optional because data-URI bloat).

**Verify:** export with a history containing text, emoji, an image, a file transfer, system messages; open the HTML in a browser — readable, correctly ordered, correct senders. Cancel dialog → no file, no error.

---

## E6 — "New messages" divider + jump-to-unread  *(size: M)*

**What:** when messages arrive while the window is unfocused, insert a one-time "— New messages —" divider above the first unread message when the user returns, and if they're scrolled up, show a floating "↓ N new" pill that scrolls to the divider. Divider clears next time the conversation is read.

**Files & steps:** `ChatWindow.tsx` already tracks `unreadCount` (line 145, reset-on-focus at ~495) and renders day dividers inline (~2901–2925) — add a `firstUnreadId` ref captured when unread goes 0→1, render the divider before that message the same way day dividers render, and a pill styled like existing floating UI. **Careful:** the render-window (`message-window.ts`) may hide the first unread above the 200-message window — jumping must expand the window (reuse the "Load earlier" mechanism) if needed.

**Don't break:** the 3.4.2 memoization (divider must key off message id, not index; no new unstable props into `MessageBubble` — render the divider as a sibling, exactly like `day-divider`); auto-scroll-to-bottom behavior for the focused case; "Seen" receipt logic (unchanged — this is purely visual).

**Verify:** background the window, receive 3 messages from a second instance, refocus → divider above the first of the 3; scroll up, receive a message → pill appears, click scrolls correctly; restart app → no stale divider.

---

## E7 — Pinned messages  *(size: M/L — do this one late)*

**What:** right-click/long-press action "📌 Pin" on any message; a slim pinned bar under the header cycles through pinned messages (click → jump to message); unpin from the bar. Pins sync to all peers via a new `pin`/`unpin` NetworkMessage and persist inside the message objects in history (`pinned: true` field), so history sync carries them automatically.

**Files & steps:** extend `Message` with optional `pinned?: boolean` (`ChatWindow.tsx` interface + `MessageBubble` context-menu/actions where reply/edit already live); new protocol type handled in `tcp-server.ts` relay + renderer dispatch; pinned bar component + jump logic (same window-expansion caveat as E6).

**Don't break:** **protocol-compat rule above is mandatory here** — old clients must ignore `pin` messages gracefully (verify first). History `filter`/validation in `handlers.ts:loadHistoryArrayFrom` and the history-sync "clean" filter (~line 163) must not strip the new field.

**Verify:** pin on machine A → bar appears on B; unpin syncs; pins survive restart (history.json) and history sync on a fresh reconnect; a simulated old client (comment out the handler) doesn't crash when receiving `pin`.

---

## E8 — Per-message "read aloud" button  *(size: S)*

**What:** a small 🔊 action on any message bubble (next to existing reply/react actions) that reads that message via the existing TTS (`ttsSpeak`) regardless of status — for rereading something missed without switching to "Talk to me". Respects mute and quiet hours (E3).

**Files & steps:** `MessageBubble.tsx` action row (pass ONE stable `onSpeak(text)` callback from `ChatWindow` — created with `useCallback` to preserve memoization) → `window.electronAPI.ttsSpeak(...)`; skip for system messages and file-only messages (speak the caption or filename).

**Don't break:** memoized `MessageBubble` (stable callback!); the echo-guard/auto-response flow — a manual read-aloud must NOT trigger the mic auto-open that "Talk to me" incoming messages do (call `ttsSpeak` directly, not the auto-response pipeline).

**Verify:** click 🔊 on a text message → spoken with configured voice; while muted → does nothing (or brief tooltip); clicking during an active auto-response doesn't interleave (ttsStop first).

---

## E9 — Spoken announcements (status changes & incoming calls)  *(size: S/M)*

**What:** Settings toggle "Speak announcements" (default OFF): when the local user is in a speech status ("Talk to me"/"Listen only"), TTS announces peer events: "Ripster is now Away", "Incoming call from Ramjet", "Ripster reconnected". Built for the voice-first user who isn't looking at the screen.

**Files & steps:** small localStorage-backed pref (follow `tts-prefs.ts` pattern); hook the existing event sites in `ChatWindow.tsx`: peer status-change handler (~line 960), incoming-call handler, reconnect flash. Queue through the same TTS path so it never talks over a message being read (check how message TTS serializes; reuse it).

**Don't break:** the auto-response mic flow (announcements must not open the mic); mute/quiet-hours suppress announcements; no announcement storms on reconnect (peers re-sync statuses on connect ~line 984 — announce only real CHANGES, not re-syncs of the same value; that code already distinguishes "unchanged, stay quiet" — hook after that check).

**Verify:** toggle on, peer changes status → spoken once; peer reconnects with same status → silent; incoming call → spoken before/while ringing; toggle off → silent.

---

## E10 — Shared media gallery  *(size: M)*

**What:** Settings (or 🔍 area) entry "Photos & files" opening a panel that grids all image messages (thumbnails, click → existing lightbox) and lists all file/voice messages (name, date, sender), newest first. Read-only view over the in-memory `messages` array — no new storage, no protocol changes.

**Files & steps:** new `MediaGallery.tsx` + CSS (modal pattern copied from `ReleaseNotes.tsx` which already does overlay + close-on-Esc); derive items with a `useMemo` over `messages` filtered by image/file types (check how image messages are represented — find the lightbox source field used at `ChatWindow.tsx:2480`); reuse `image-lightbox` for full-size.

**Don't break:** memory on old hardware — thumbnails must reuse the already-loaded data (no duplicate decode at full size; render small with CSS, or `loading="lazy"`); message windowing — the gallery should read the FULL `messages` array, not the windowed slice.

**Verify:** send several photos + files + a voice message across two instances → gallery shows all, newest first, from both senders; click a photo → lightbox; close with Esc and ✕; open with 500+ message history → no noticeable lag.

---

## Cross-cutting invariants (every item)

1. **Never commit without the user's explicit go-ahead.** Work on a feature branch if asked to commit.
2. **Electron 21 / Chromium 106 / Windows 8.1 compatibility** — no newer APIs, no dependency upgrades, no new native modules.
3. **Protocol backward compatibility** with 3.4.x peers (rule at top). Encryption/handshake untouched.
4. **Perf:** don't regress the 3.4.2 work — every new prop into `MessageBubble` stable; no per-render allocations in the message map; no new intervals faster than 5 s.
5. **`npm run build` clean (TypeScript strict) and `npm test` green** after every item; add unit tests for every new pure util (quiet-hours, custom-statuses migration, export formatting helpers if pure).
6. **A11y:** every new button gets `aria-label`/`title` matching the existing style.
7. **Changelog:** one entry per shipped feature in `src/renderer/utils/changelog.ts` when the release is cut (single 3.5.0 entry listing all items), plus `package.json` version bump — **only when the user says to cut the release**.
8. **Both roles tested:** listener (Ripster) and connector, using the two-instance trick (`RLR_USER_DATA` env var) before calling any networking-adjacent item done.

## Suggested execution order

P0 → E1 → E4 → E8 → E9 → E3 → E5 → E6 → E2 → E10 → E7. (Bug first, then small/safe wins, then the items that add settings/persistence, tray and protocol-touching pins last.)
