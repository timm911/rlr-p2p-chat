# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **two-user peer-to-peer encrypted desktop chat application** built with Electron, React, and TypeScript. The app enables direct P2P communication between two fixed users (RLRJupiter and Ripster) without relay servers or WebRTC.

**Key Design Principles:**
- **Direct TCP P2P only** - No WebRTC, STUN, or TURN servers
- **RLRJupiter = Connector**, **Ripster = Listener** (tie-break rule)
- **Glassmorphism UI** - Compact messenger (390x670px) with frosted glass effects
- **Frameless draggable window** with custom controls
- **Voice auto-response mode** - When receiver's status = "Talk to me", incoming messages trigger TTS → Beep → STT → Auto-send flow

## Development Commands

```bash
# Install dependencies
npm install

# Run in development mode (hot-reload enabled)
npm run dev

# Build for production
npm run build

# Package as Windows installer (MSI + portable EXE)
npm run package
```

**Output Location:** `release/` folder contains packaged installers after `npm run package`

## Architecture

### Electron Multi-Process Model

This app follows standard Electron architecture:

1. **Main Process** (`src/main/`)
   - Node.js environment with full system access
   - Manages window lifecycle, IPC handlers, TCP networking, TTS, and STT
   - Entry: `src/main/index.ts`

2. **Preload Script** (`src/preload/index.ts`)
   - Security bridge between main and renderer
   - Exposes limited APIs via `contextBridge` to `window.electronAPI`
   - **Critical:** All main↔renderer communication must go through preload

3. **Renderer Process** (`src/renderer/`)
   - Chromium browser environment running React app
   - No direct Node.js access (security isolation)
   - Entry: `src/renderer/main.tsx`

### Application Flow

```
UserSelection (Choose RLRJupiter/Ripster)
    ↓
ConnectionSetup (Configure IP:port, show local IPs)
    ↓
ChatWindow (Main messenger UI)
    ├─ StatusDropdown (8 preset + custom statuses)
    ├─ MessageBubble (Chat messages with reactions)
    └─ SettingsMenu (Reconnect, debug console)
```

**State Management:** App.tsx holds top-level state (currentScreen, userIdentity, connectionConfig) and orchestrates screen transitions.

### Message Format

Messages use this structure (defined in `ChatWindow.tsx`):

```typescript
interface Message {
  id: string
  type: 'chat' | 'system'
  from: string  // 'RLRJupiter' | 'Ripster' | 'system'
  content: string
  timestamp: number
  reactions?: { [emoji: string]: number }
  hasLink?: boolean
  linkPreview?: { url: string; title: string; description?: string }
}
```

**Display Format:** `"2:34 PM • RLRJupiter"` (time first, then sender name)

### IPC Communication Patterns

**Preload exposes:**
- `window.electronAPI.getLocalIPs()` - Returns array of local network IPs
- `window.electronAPI.minimizeWindow()` - Window control
- `window.electronAPI.closeWindow()` - Window control
- `window.electronAPI.onMessage(callback)` - Listen for incoming chat messages
- `window.electronAPI.onStatusChange(callback)` - Listen for peer status changes
- `window.electronAPI.onConnectionStateChange(callback)` - Listen for connection events
- `window.electronAPI.speechStart()` / `speechStop()` - Control STT
- `window.electronAPI.onSpeechResult(callback)` - Receive speech transcription
- `window.electronAPI.ttsSpeak(text)` / `ttsStop()` - Control TTS
- `window.electronAPI.ttsGetConfig()` / `ttsConfigure(config)` - TTS settings

**Adding new IPC channels:**
1. Add handler in `src/main/ipc/handlers.ts`
2. Expose in `src/preload/index.ts` via `contextBridge`
3. Update TypeScript types in preload's `ElectronAPI` interface

## Status System

9 preset statuses + custom:
- 💬 Talk to me (TTS reads messages → auto-enables mic for response)
- 👂 Listen only (TTS reads messages → NO auto-mic, click to speak)
- ⏰ BRB
- 😴 Bed
- 🍽️ Dinner
- 📺 TV
- 💤 Away
- 👥 Company
- ✏️ Custom (user types their own)

**Status changes generate system messages** in chat history:
`"Ripster changed status to Talk to me • 2:45 PM"`

## Voice Auto-Response Flow (Implemented)

**Manual Mode:** Click mic button to start/stop voice input

**Auto Mode:** When **receiver** has status = "Talk to me":
1. Incoming message plays via TTS (Windows SAPI)
2. 300ms pause, then `ptt-start` beep
3. STT auto-starts listening
4. Real-time text appears as user speaks (interim results)
5. After 3 seconds of silence → auto-sends message
6. Stays listening for continuous conversation

**Tech Stack for Voice (100% Offline - No Internet Required):**
- **STT (default):** Vosk small-en-us (WASM via `vosk-browser`, renderer process) — high quality, real-time partials, works on Windows 8.1/old CPUs. Model (40MB tar.gz) bundled via `extraResources` and delivered over IPC (`speech:get-vosk-model`).
- **STT (fallback):** Windows SAPI (`System.Speech.Recognition`) via PowerShell — automatic fallback and selectable in Settings → Speech Recognition. (Whisper was evaluated and rejected for live dictation on this hardware — see `WHISPER_FEASIBILITY.md`.)
- **TTS (default):** Piper neural TTS (offline) — bundled `piper-engine/` (piper.exe) + voices in `voices/` (`.onnx` + `.onnx.json` pairs). Default voice "Alan" (British, neural). Scanned on startup from the bundled `voices/` folder and a user drop-in folder at `%APPDATA%/<app>/voices`. See `src/main/services/piper-tts.ts`.
- **TTS (fallback):** Windows SAPI via `say` npm package — used when no Piper voice is selected or Piper can't run (e.g. very old hardware). Voice picker in Settings lists neural voices first, then SAPI.
- **Silence Detection:** 3s timeout, selectable 1–3s (configurable)

**Key Files:**
- `src/renderer/services/speech-engine.ts` - Engine facade (Vosk ⇄ SAPI routing + fallback)
- `src/renderer/services/vosk-speech-service.ts` - Vosk WASM STT (mic via getUserMedia)
- `src/main/speech/windows-speech.ts` - Windows native STT (fallback)
- `src/main/services/tts.ts` - Windows native TTS
- `src/renderer/components/ChatWindow.tsx` - Voice UI and auto-response logic

## TCP Networking Architecture (Implemented)

**Protocol:** JSON messages over raw TCP (no WebRTC)

```typescript
interface NetworkMessage {
  type: 'chat' | 'status' | 'typing' | 'system' | 'file-offer' | 'file-accept' | 'file-chunk' | ...
  from: 'RLRJupiter' | 'Ripster'
  payload: { ... }
  timestamp: number
}
```

**Connection Roles:**
- **RLRJupiter** (Connector): TCP client, connects to peer's IP:port
- **Ripster** (Listener): TCP server, listens on port 8082

**Default port:** 8082 (8081 was vacated for RossDashboard's 8080-8081 router forward)

**Key Files:**
- `src/main/network/tcp-server.ts` - Ripster's TCP server
- `src/main/network/tcp-client.ts` - RLRJupiter's TCP client
- `src/main/ipc/handlers.ts` - IPC handlers for network events

**Auto-reconnect:** Automatic retry on disconnect

## Styling Architecture

**Glassmorphism theme applied via:**
- `src/renderer/styles/global.css` - Animated gradient background, scrollbar styling
- `src/renderer/styles/App.css` - Reusable `.glass` class and `.glass-button`
- Component-specific CSS files (e.g., `ChatWindow.css`)

**Drag regions:** Use `.drag-region` class for frameless window dragging, `.no-drag` for interactive elements inside drag regions

## Development Phases

**✅ Phase 1-2 Complete:** Project setup + UI components (all screens functional)

**✅ Phase 3 Complete:** TCP P2P networking
- TCP server for Ripster (listener)
- TCP client for RLRJupiter (connector)
- Message send/receive via IPC
- Auto-reconnect on disconnect

**✅ Phase 4 Complete:** Voice auto-response
- Windows SAPI for offline STT (no Vosk needed)
- Windows SAPI for TTS
- Manual mic button for voice input
- Auto-start STT when "Talk to me" status receives message
- 3-second silence detection for auto-send

**✅ Phase 5 Complete:** Enhanced features
- File transfer (drag-drop and file picker)
- Emoji reactions on messages
- Link previews
- Sound effects (beeps for PTT, notifications)

**✅ Phase 6-7 Complete:** Testing and packaging
- Windows installer (NSIS) and portable EXE
- Output in `release/` folder

## Important Constraints

- **Windows-only** target (Windows 8.1-11)
- **Two users only** (no multi-user support)
- **No external servers** (fully P2P, no cloud)
- **Port forwarding required** on routers for WAN connectivity
- **Encrypted transport (V2)** - All protocol traffic (chat, status, file chunks) is AES-256-GCM encrypted. The session key is derived via scrypt from the shared session password plus a random per-session salt sent by the listener in a plaintext `hello` line at connect time (`src/main/network/secure-channel.ts`). Only `hello` and `auth-failed` are ever plaintext on the wire.
- **No sidepanels** - compact messenger design only

## Debugging

- **F12** opens DevTools console (configured in `src/main/index.ts`)
- Connection logs should be verbose (all TCP events logged to console)
- Settings menu (⋮ button) provides reconnect option

## Configuration Files

- `electron.vite.config.ts` - Vite build config for main/preload/renderer
- `electron-builder.yml` - Packaging config for MSI/EXE installers
- `tsconfig.json` - TypeScript config (ES2020, React JSX)
- `package.json` - Dependencies and npm scripts
