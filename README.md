# RLR P2P Chat

> A secure, direct peer-to-peer desktop chat application for private communication between two users.

![Windows](https://img.shields.io/badge/Windows-8.1%2B-blue)
![Electron](https://img.shields.io/badge/Electron-39.0-47848f)
![React](https://img.shields.io/badge/React-18.2-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6)

---

## What is RLR P2P Chat?

RLR P2P Chat is a beautiful, modern desktop chat application that creates **direct connections** between two computers - no servers, no cloud, just you and your friend. Built specifically for **RLRJupiter** and **Ripster**, this app provides secure, private communication with a stunning glassmorphism design.

### Why P2P?

Unlike traditional messaging apps that route your messages through company servers, RLR P2P Chat connects directly between your computers. This means:
- **True Privacy** - Your messages go directly to your friend, nowhere else
- **No Data Collection** - No company storing or analyzing your conversations
- **Full Control** - You own your communication infrastructure

---

## Key Features

### Core Communication
- **Real-time messaging** - Instant delivery of text messages
- **Emoji reactions** - React to messages with ❤️👍😂😮🔥
- **URL link previews** - Automatically detect and preview web links
- **Status system** - Share what you're doing with preset and custom statuses

### Voice Features
- **Push-to-Talk** - Send voice messages using Windows Speech Recognition (built-in SAPI 5, no model downloads)
- **Text-to-Speech** - Hear incoming messages read aloud (Windows SAPI)
- **Hands-free mode** - Automatic TTS when status is "Talk to me"

### File Sharing
- **Drag & Drop** - Simply drag files into the chat to send
- **Any file type** - Documents, images, videos, archives - everything supported
- **No size limits** - Transfer files of any size (limited only by disk space)
- **Progress tracking** - Real-time progress, speed, and ETA display

### Design & Interface
- **Glassmorphism UI** - Beautiful frosted glass aesthetic with backdrop blur
- **Compact window** - Sleek 390×670px messenger design
- **Animated gradient background** - Dynamic, colorful background
- **Frameless window** - Modern borderless design with custom drag areas
- **System messages** - Elegant notifications for connection and status events

---

## Quick Start

### For End Users

1. **Download** the installer:
   - Get `RLR P2P Chat-Setup-1.0.0.exe` from the release folder

2. **Install** the application:
   - Run the installer
   - Follow the installation wizard
   - Launch "RLR P2P Chat" from your Start menu

3. **Choose your identity**:
   - **RLRJupiter** - Connects to Ripster (no port forwarding needed)
   - **Ripster** - Waits for connections (requires port forwarding)

4. **Connect**:
   - RLRJupiter: Enter Ripster's IP and port, click Connect
   - Ripster: Enter listening port, click Start Listening

5. **Start chatting!**

**Need detailed help?** See the **[User Guide](USER_GUIDE.md)** for complete instructions.

**Network setup help?** See **[Network Setup Guide](NETWORK_SETUP.md)** for port forwarding instructions.

**Having issues?** Check the **[Troubleshooting Guide](TROUBLESHOOTING.md)**.

---

## System Requirements

- **OS**: Windows 8.1, 10, or 11
- **RAM**: 2 GB minimum (4 GB recommended)
- **Disk**: 200 MB for installation
- **Network**: Internet connection for P2P connection
- **Optional**: Microphone for voice features, speakers for TTS

### Network Requirements

- **Ripster (Listener)**: Port forwarding on router (default port: 54445)
- **RLRJupiter (Connector)**: No special network configuration needed

---

## Documentation

- **[USER_GUIDE.md](USER_GUIDE.md)** - Complete user guide covering all features
- **[NETWORK_SETUP.md](NETWORK_SETUP.md)** - Detailed port forwarding and network configuration
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Solutions to common problems

---

## For Developers

### Prerequisites

- **Node.js** 18+ and npm
- **Windows** 8.1 - 11
- **Git** (for version control)

### Installation

```bash
# Clone or navigate to project directory
cd D:\RLRChatAppOct2025

# Install dependencies
npm install
```

### Development

```bash
# Run in development mode with hot-reload
npm run dev
```

This will:
- Start Electron app in development mode
- Enable hot-reload for renderer changes
- Open with DevTools available (press F12)

### Building

```bash
# Build the application
npm run build

# Package as installer/portable executable
npm run package
```

Output will be in the `release/` folder:
- `RLR P2P Chat-Setup-1.0.0.exe` - NSIS installer
- `RLR P2P Chat-Portable-1.0.0.exe` - Portable executable

### Project Structure

```
RLRChatAppOct2025/
├── src/
│   ├── main/                     # Main process (Electron/Node.js)
│   │   ├── index.ts              # Entry point
│   │   ├── ipc/handlers.ts       # IPC handlers
│   │   ├── network/              # TCP networking
│   │   │   ├── tcp-client.ts     # RLRJupiter connector
│   │   │   ├── tcp-server.ts     # Ripster listener
│   │   │   ├── protocol.ts       # Message protocol
│   │   │   └── file-transfer-manager.ts
│   │   └── services/             # Core services
│   │       ├── sapi-recognizer.ts # Windows speech recognition bridge
│   │       └── tts.ts            # Text-to-speech
│   ├── preload/                  # Preload scripts
│   │   └── index.ts              # Secure IPC bridge
│   └── renderer/                 # Renderer process (React)
│       ├── index.html
│       ├── main.tsx              # React entry point
│       ├── App.tsx               # Main app component
│       ├── components/           # React components
│       │   ├── UserSelection.tsx
│       │   ├── ConnectionSetup.tsx
│       │   ├── ChatWindow.tsx
│       │   ├── MessageBubble.tsx
│       │   ├── StatusDropdown.tsx
│       │   └── SettingsMenu.tsx
│       └── styles/               # CSS styling
│           ├── global.css
│           └── App.css
├── package.json
├── tsconfig.json
├── electron.vite.config.ts
└── electron-builder.yml
```

### Tech Stack

- **Electron** 39.0 - Desktop application framework
- **React** 18.2 - UI framework
- **TypeScript** 5.3 - Type-safe JavaScript
- **Vite** - Build tool and dev server
- **Windows Speech Recognition (SAPI 5)** - Built-in speech-to-text via PowerShell bridge
- **Say.js** - Text-to-speech (Windows SAPI)
- **Native TCP Sockets** - Direct P2P networking

---

## Features in Detail

### Completed Features

- ✅ Glassmorphism UI with frosted glass panels
- ✅ Frameless draggable window
- ✅ User identity selection (RLRJupiter / Ripster)
- ✅ Connection setup with IP/port configuration
- ✅ TCP P2P networking (client and server)
- ✅ Real-time text messaging
- ✅ Status system (Talk to me, BRB, Bed, Dinner, TV, Away, Company, Custom)
- ✅ Emoji reactions (❤️👍😂😮🔥)
- ✅ URL link detection and previews
- ✅ System messages for events and status changes
- ✅ Push-to-Talk voice input using Windows Speech Recognition (SAPI 5)
- ✅ Text-to-Speech for incoming messages
- ✅ File sharing via drag-and-drop and file picker
- ✅ File transfer progress tracking
- ✅ Settings menu with TTS configuration
- ✅ Debug console access (F12)
- ✅ Auto-reconnect on connection loss
- ✅ Connection state management

### Planned Features (V2)

- 🔜 TLS encryption with mutual authentication
- 🔜 Pinned certificates for security
- 🔜 Message history persistence
- 🔜 Typing indicators
- 🔜 Enhanced link preview scraping
- 🔜 File transfer pause/resume
- 🔜 Multiple file transfer queue

---

## Configuration

### Default Connection Settings

- **RLRJupiter** (Connector): Connects to `<your-ripster-ddns-host>:54445`
- **Ripster** (Listener): Listens on port `54445`

### Customization

Both IP address and port can be changed:
1. **Before connecting**: On the Connection Setup screen
2. **During session**: Settings menu → Change Connection

Settings are persisted to: `%USERPROFILE%\.rlrchat\config.json`

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift + Enter` | New line in message input |
| `F12` | Open/close debug console |

---

## Security & Privacy

### Current Security (V1)

- **Unencrypted TCP** - Messages sent in plain text over TCP sockets
- **Direct P2P** - No intermediary servers (your data never leaves your control)
- **No data collection** - App doesn't phone home or send telemetry
- **No message storage** - Messages only in memory, lost when app closes

**Note**: V1 is designed for rapid development and testing. Use on trusted networks.

### Planned Security (V2)

- **TLS encryption** - All traffic encrypted with industry-standard TLS
- **Mutual authentication** - Both peers verify each other's identity
- **Certificate pinning** - Prevent man-in-the-middle attacks
- **Perfect forward secrecy** - Each session has unique encryption keys

---

## Troubleshooting

### Common Issues

**Can't connect?**
- Check firewall (allow RLR Chat through Windows Firewall)
- Verify port forwarding (Ripster only, see [NETWORK_SETUP.md](NETWORK_SETUP.md))
- Confirm IP address and port are correct
- Test on local network first

**Microphone not working?**
- Grant microphone permission when prompted
- Check Windows microphone settings
- Verify microphone is connected and not muted

**Text-to-Speech silent?**
- Enable TTS in Settings menu
- Set status to "Talk to me"
- Check Windows volume is not muted
- Try different voice in TTS settings

**File transfer fails?**
- Ensure stable internet connection
- Check available disk space
- Don't move/delete file during transfer
- Close file if it's open in another program

**App crashes or freezes?**
- Restart the application
- Update Windows
- Check antivirus isn't blocking it
- View F12 console for errors

For detailed solutions, see **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**.

---

## FAQ

**Q: Can I use this with more than 2 people?**
A: No, RLR P2P Chat is specifically designed for two users (RLRJupiter and Ripster).

**Q: Does this work on Mac or Linux?**
A: Currently Windows only. Cross-platform support may come in future versions.

**Q: Is my data encrypted?**
A: V1 uses unencrypted TCP. V2 (planned) will add TLS encryption.

**Q: Where are messages stored?**
A: Messages are not stored - they only exist in memory during the session. This is for privacy.

**Q: Why do I need port forwarding?**
A: Port forwarding allows incoming connections through your router. Only Ripster (listener) needs this. See [NETWORK_SETUP.md](NETWORK_SETUP.md) for details.

**Q: Can I change my identity after selecting?**
A: Restart the app to select a different identity.

**Q: Does this use the internet?**
A: Yes, for connecting over the internet. However, you can also use it on a local network (LAN) without internet access.

---

## Credits

**Developers:**
- RLRJupiter
- Ripster

**Built With:**
- [Electron](https://www.electronjs.org/) - Desktop application framework
- [React](https://react.dev/) - UI library
- [TypeScript](https://www.typescriptlang.org/) - Programming language
- [Vite](https://vitejs.dev/) - Build tool
- [Windows Speech Recognition (SAPI)](https://learn.microsoft.com/windows/win32/speech/) - Built-in speech recognition APIs
- [Say.js](https://github.com/Marak/say.js) - Text-to-speech

**Design Inspiration:**
- Glassmorphism design principles
- Modern messenger aesthetics

---

## License

MIT License

Copyright (c) 2025 RLRJupiter & Ripster

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## Support

- **User Guide**: [USER_GUIDE.md](USER_GUIDE.md)
- **Network Setup**: [NETWORK_SETUP.md](NETWORK_SETUP.md)
- **Troubleshooting**: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **Debug Console**: Press F12 in the app

---

**Built with ❤️ by RLRJupiter and Ripster using Electron, React, and TypeScript**
