# RLR P2P Chat - User Guide

Welcome to RLR P2P Chat! This guide will help you get started with the application and make the most of its features.

## Table of Contents

1. [What is RLR P2P Chat?](#what-is-rlr-p2p-chat)
2. [System Requirements](#system-requirements)
3. [Installation](#installation)
4. [First Time Setup](#first-time-setup)
5. [Connecting to Your Peer](#connecting-to-your-peer)
6. [Using the Chat](#using-the-chat)
7. [Voice Features](#voice-features)
8. [File Sharing](#file-sharing)
9. [Status System](#status-system)
10. [Settings](#settings)

---

## What is RLR P2P Chat?

RLR P2P Chat is a secure, direct peer-to-peer chat application designed for two users: **RLRJupiter** and **Ripster**. Unlike traditional messaging apps that route messages through servers, this app connects directly between the two computers, providing private communication.

### Key Features

- **Direct peer-to-peer connection** - Your messages go directly to your friend, not through any servers
- **Beautiful glassmorphism design** - Modern, elegant user interface
- **Real-time messaging** - Instant delivery of messages
- **Voice input** - Push-to-talk with automatic speech-to-text
- **Text-to-speech** - Incoming messages can be read aloud
- **File sharing** - Send files directly to your peer via drag-and-drop
- **Emoji reactions** - React to messages with emojis
- **Status updates** - Let your peer know what you're doing
- **Link previews** - Automatically detect and preview URLs

---

## System Requirements

### Minimum Requirements

- **Operating System**: Windows 8.1 or later (Windows 10/11 recommended)
- **RAM**: 2 GB or more
- **Disk Space**: 200 MB for installation
- **Internet Connection**: Required for peer-to-peer connection
- **Microphone**: Optional (required for voice features)
- **Speakers/Headphones**: Optional (required for text-to-speech)

### Network Requirements

- **For Ripster (Listener)**:
  - Router with port forwarding capability
  - One open port (default: 54445)
  - Static or dynamic DNS (optional, but recommended)

- **For RLRJupiter (Connector)**:
  - Internet connection to reach Ripster's IP address
  - No special router configuration needed

---

## Installation

### Installing from Pre-built Package

1. **Download the installer**:
   - Find `RLR P2P Chat-Setup-1.0.0.exe` in the release folder
   - Or download from the distribution source

2. **Run the installer**:
   - Double-click the installer file
   - If Windows SmartScreen appears, click "More info" then "Run anyway"
   - Follow the installation wizard
   - Choose installation location (default is recommended)
   - Click "Install"

3. **Launch the application**:
   - Find "RLR P2P Chat" in your Start menu
   - Or double-click the desktop icon (if created during installation)

### Portable Version

If you prefer not to install:

1. Download `RLR P2P Chat-Portable-1.0.0.exe`
2. Place it in any folder
3. Double-click to run (no installation needed)

---

## First Time Setup

When you first launch RLR P2P Chat, you'll see the **User Selection** screen.

### Step 1: Choose Your Identity

The app supports two users, each with a specific role:

#### RLRJupiter (Connector)
- **Role**: Initiates the connection to Ripster
- **Requirements**: Needs to know Ripster's IP address and port
- **Network Setup**: No port forwarding needed

#### Ripster (Listener)
- **Role**: Waits for incoming connections from RLRJupiter
- **Requirements**: Must have port forwarding configured on router
- **Network Setup**: Requires open port (see [NETWORK_SETUP.md](NETWORK_SETUP.md))

**How to choose:**
1. Click on your identity card (either "RLRJupiter" or "Ripster")
2. The selected card will highlight
3. Click "Continue →" button

> **Note**: Both users must use different identities. One person must be RLRJupiter and the other must be Ripster.

---

## Connecting to Your Peer

After selecting your identity, you'll see the **Connection Setup** screen.

### For RLRJupiter (Connector)

1. **Enter connection details**:
   - **Host**: Enter Ripster's IP address or domain name
     - Default: `<your-ripster-ddns-host>`
     - Can be: IP address (e.g., `192.168.1.100`) or domain name
   - **Port**: Enter the port number (default: `54445`)

2. **Review your local IPs**:
   - The screen shows your reachable IP addresses
   - Useful for troubleshooting or LAN connections

3. **Click "Connect"**:
   - The button will show "Connecting..." while establishing connection
   - If successful, you'll enter the chat window
   - If failed, you'll see an error message

### For Ripster (Listener)

1. **Set listening port**:
   - **Port**: Enter the port to listen on (default: `54445`)
   - This must match the port configured in your router's port forwarding

2. **Review your local IPs**:
   - Share your public IP with RLRJupiter so they can connect
   - Your local IPs are displayed for reference

3. **Click "Start Listening"**:
   - The server will start waiting for connections
   - Status will show "Waiting for connection"
   - When RLRJupiter connects, you'll automatically enter the chat window

### Connection Tips

- **LAN Connection**: If you're on the same local network, RLRJupiter can use Ripster's local IP (e.g., 192.168.1.100)
- **Internet Connection**: If connecting over the internet, RLRJupiter needs Ripster's public IP or domain name
- **Port Number**: Both users must use the same port number
- **Firewall**: Make sure Windows Firewall allows the app (you may see a prompt on first run)

---

## Using the Chat

Once connected, you'll see the main **Chat Window**.

### Chat Window Layout

```
┌─────────────────────────────────────┐
│  [Avatar] Peer Name        [Status] │  ← Header
│  Connected                 [⋮ Menu] │
├─────────────────────────────────────┤
│                                     │
│  System: Connected to peer          │  ← Messages Area
│                                     │
│          Your message bubble    [❤] │
│                                     │
│  [❤] Peer's message bubble          │
│                                     │
│                                     │
├─────────────────────────────────────┤
│ [Type your message...]      [📎][🎤]│  ← Input Area
└─────────────────────────────────────┘
```

### Sending Messages

**Method 1: Typing**
1. Click in the text input area at the bottom
2. Type your message
3. Press `Enter` to send
   - Or click anywhere outside the input box

**Method 2: Voice Input** (see [Voice Features](#voice-features))

**Tips:**
- Press `Shift + Enter` for a new line within your message
- URLs are automatically detected and shown as link previews
- Messages appear on the right side (yours) and left side (peer's)

### Receiving Messages

- Incoming messages appear on the left side with your peer's avatar
- You'll hear a notification sound (if enabled)
- If your status is "Talk to me" and TTS is enabled, messages will be read aloud

### Emoji Reactions

Add reactions to any message (yours or your peer's):

1. **Hover over a message bubble**
2. **Click on an emoji** from the reaction bar that appears:
   - ❤️ Heart
   - 👍 Thumbs up
   - 😂 Laughing
   - 😮 Surprised
   - 🔥 Fire

3. **View reactions**: Reaction counts appear below the message

> **Note**: Both you and your peer can react to the same message. The number shows total reactions.

### Link Previews

When you send a message containing a URL:

1. The URL is automatically detected
2. A preview box appears below your message showing:
   - The URL
   - Title: "Link Preview"
   - Description: "Click to open in browser"

3. Click the preview to open the link in your default browser

**Supported URL formats:**
- `http://example.com`
- `https://example.com`
- `www.example.com` (automatically converted to https)

### System Messages

The app shows system messages (in gray) for events like:
- "Connected to [peer name]"
- "You changed status to [status]"
- "[Peer] changed status to [status]"
- "Disconnected from [peer name]"
- "File received: filename.txt"
- "File transfer failed: [reason]"

---

## Voice Features

RLR P2P Chat includes powerful voice features for hands-free communication.

### Push-to-Talk (Voice Input)

Send messages using your voice instead of typing:

1. **Press and hold** the microphone button (🎤) at the bottom right
2. **Speak clearly** into your microphone
   - You'll see "🎤 Listening..." indicator at the top
3. **Release the button** when done speaking
4. The app will:
   - Convert your speech to text using Vosk (offline speech recognition)
   - Show "Transcribing audio..." message
   - Automatically send the transcribed message

**Tips:**
- Speak clearly and at normal pace
- Ensure your microphone is properly connected and configured
- The first time you use the mic, Windows will ask for permission - click "Allow"
- If you drag your mouse away while holding, recording stops

**Cancel Recording:**
- While the "Listening..." indicator is visible, click the "Cancel" button to abort

### Text-to-Speech (TTS)

Have incoming messages read aloud automatically:

**When it works:**
- TTS is enabled in Settings (enabled by default)
- Your status is set to "Talk to me"
- You receive a message from your peer

**What happens:**
1. Message appears in the chat
2. Immediately, the message text is spoken aloud
3. Chat continues normally

**Configure TTS:**
1. Click the menu button (⋮) in the top right
2. Click "Text-to-Speech Settings"
3. Expand the settings panel
4. Configure:
   - **Enable Text-to-Speech**: Toggle on/off
   - **Voice**: Choose from available system voices
   - **Speed**: Adjust speaking speed (0.5x to 2.0x)
5. Click "Test Speech" to hear a sample

### Troubleshooting Voice Features

**Microphone not working?**
- Check microphone is connected and not muted
- Verify Windows has granted microphone permission
- Test microphone in Windows Sound Settings
- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed help

**TTS not speaking?**
- Ensure TTS is enabled in Settings
- Verify your status is "Talk to me"
- Check system volume is not muted
- Try different voice in TTS settings

---

## File Sharing

Share files directly with your peer - no file size limits!

### Sending Files

**Method 1: Drag and Drop**
1. **Open your file explorer** and locate the file
2. **Drag the file** into the chat messages area
3. You'll see a blue highlight: "📎 Drop file here to send"
4. **Release the mouse** to drop the file
5. The file transfer begins immediately

**Method 2: Paperclip Button**
1. **Click the paperclip button** (📎) at the bottom right
2. **File picker opens** - browse and select your file
3. Click "Open"
4. The file transfer begins immediately

### Receiving Files

When your peer sends you a file:

1. **File offer dialog appears** showing:
   - File name
   - File size
   - File type icon

2. **Choose your action**:
   - **Accept**: Click to choose where to save the file
     - File picker opens - choose location and click "Save"
     - Transfer begins with progress bar
   - **Reject**: Click to decline the file
     - Your peer is notified of rejection

### File Transfer Progress

During file transfer, you'll see:

1. **Progress bar** showing percentage complete
2. **Transfer speed** (e.g., "2.5 MB/s")
3. **Estimated time remaining** (e.g., "30s")
4. **Status messages**:
   - "Sending [filename]" or "Receiving [filename]"
   - "File sent: [filename]" when complete
   - "File received: [filename]" when complete
   - "File transfer failed: [reason]" if error occurs

### File Transfer Tips

- **Supported file types**: All file types are supported (documents, images, videos, archives, etc.)
- **File size**: No size limit (limited only by available disk space)
- **Speed**: Transfer speed depends on your internet connection
- **Security**: Files are transferred directly peer-to-peer (not through any servers)
- **Multiple files**: Send files one at a time (wait for current transfer to complete)
- **Canceling**: If transfer fails, you'll see an error message - just try again

### Troubleshooting File Transfers

**File transfer stuck?**
- Check both users have stable internet connection
- Verify file is not in use by another application
- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## Status System

Let your peer know what you're doing with the status system.

### Setting Your Status

1. **Click the status dropdown** in the top right of the chat window
   - Shows current status with emoji (e.g., "💬 Talk to me")
2. **Select a preset status**:
   - 💬 **Talk to me** - Available for chat (enables TTS)
   - ⏰ **BRB** - Be right back
   - 😴 **Bed** - Going to sleep
   - 🍽️ **Dinner** - Eating
   - 📺 **TV** - Watching TV
   - 💤 **Away** - Away from keyboard
   - 👥 **Company** - Have company/visitors

3. **Or create a custom status**:
   - Type in the "Custom status..." field
   - Press `Enter` to set

### Status Behavior

**When you change status:**
- Your peer sees the new status immediately
- A system message appears: "You changed status to [status]"
- Your peer receives notification: "[Your name] changed status to [status]"

**Special status: "Talk to me"**
- When set, TTS automatically reads incoming messages aloud
- Signals to your peer that you're actively available
- Recommended for hands-free operation

### Viewing Peer Status

Your peer's current status is shown:
- In the header area at the top
- Next to their avatar
- Updates in real-time when they change it

---

## Settings

Access settings by clicking the menu button (⋮) in the top right of the chat window.

### Available Settings

#### 🔄 Change Connection
- Returns you to the connection setup screen
- Allows you to change IP address or port
- Disconnects current session
- Useful for switching networks or troubleshooting

#### 🔧 Debug Console (F12)
- Opens developer console for technical troubleshooting
- Shows detailed connection logs
- View error messages and debug information
- **Keyboard shortcut**: Press `F12` anytime

#### 🔊 Text-to-Speech Settings
Click to expand TTS configuration panel:

**Enable Text-to-Speech**
- Checkbox to turn TTS on/off
- When off, messages are never read aloud
- When on, messages read aloud when status is "Talk to me"

**Voice**
- Dropdown list of available system voices
- Default: System Default
- Options depend on Windows TTS voices installed
- Try different voices to find your preference

**Speed**
- Slider from 0.5x (slow) to 2.0x (fast)
- Default: 1.0x (normal speed)
- Adjust for comfortable listening
- Shows current speed (e.g., "1.2x")

**Test Speech**
- Button to hear a test message
- Uses current voice and speed settings
- Helps you configure before chatting

**Info**
- Reminder: "TTS will speak incoming messages when your status is 'Talk to me'"

#### 🔒 Encryption (V2)
- Currently disabled (shows grayed out)
- Planned for future version
- Will add TLS encryption to connections

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `Shift + Enter` | New line in message |
| `F12` | Open/close debug console |
| `Esc` | Close settings menu |

---

## Tips for Best Experience

### Communication Tips

1. **Set appropriate status** - Keep your peer informed about your availability
2. **Use reactions** - Quick way to acknowledge messages without typing
3. **Enable TTS for "Talk to me"** - Allows hands-free communication
4. **Use voice input** - Faster than typing for longer messages

### Performance Tips

1. **Keep app updated** - Check for new versions regularly
2. **Restart if sluggish** - Close and reopen the app
3. **Check F12 console** - Look for errors if something isn't working
4. **Stable connection** - Use wired Ethernet if possible for better reliability

### Privacy Tips

1. **Direct connection** - Your messages go directly to your peer, not through servers
2. **Local network** - Use LAN connection when both on same network for maximum privacy
3. **Firewall** - App respects Windows Firewall rules
4. **Encryption coming** - V2 will add TLS encryption for enhanced security

### Network Tips

1. **Ripster needs port forwarding** - See [NETWORK_SETUP.md](NETWORK_SETUP.md) for detailed guide
2. **Use DDNS** - Dynamic DNS (like <your-ripster-ddns-host>) is better than raw IP addresses
3. **Test connectivity** - Use the connection setup screen to verify IPs
4. **LAN first** - Test on local network before trying internet connection

---

## Getting Help

### Documentation

- **This guide** - General usage and features
- **[NETWORK_SETUP.md](NETWORK_SETUP.md)** - Port forwarding and network configuration
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common problems and solutions

### Debug Information

Press `F12` to access debug console with:
- Connection state logs
- Error messages
- Network information
- File transfer status

### Common Questions

**Q: Can I use this with more than 2 people?**
A: No, this app is designed specifically for two users (RLRJupiter and Ripster).

**Q: Does this work on Mac or Linux?**
A: Currently Windows only. Mac/Linux support may come in future versions.

**Q: Is my data encrypted?**
A: V1 (current) uses unencrypted TCP. V2 (planned) will add TLS encryption.

**Q: Can I change my identity after selecting?**
A: You need to restart the app to change identity.

**Q: Why is the app called RLR P2P Chat?**
A: RLR stands for the creators (RLRJupiter and Ripster). P2P means peer-to-peer.

**Q: Where are my messages saved?**
A: Messages are not saved - chat history is lost when you close the app. This is for privacy.

---

## Appendix: Technical Details

### Configuration File

Settings are saved to: `%USERPROFILE%\.rlrchat\config.json`

This stores:
- Last used connection settings (host, port)
- TTS configuration (voice, speed, enabled)
- User preferences

### Audio Formats

- **Voice Input**: Records in WebM/Opus format, converts to 16kHz mono PCM for Vosk
- **TTS Output**: Uses Windows native TTS engine (SAPI)

### File Transfer Protocol

- Files sent in chunks (configurable chunk size)
- Progress tracking with speed and ETA calculation
- Automatic retry on chunk failure
- Supports pause/resume (in future versions)

### Network Protocol

- TCP sockets for reliable delivery
- JSON message protocol
- Message types: chat, status, reaction, file-offer, file-chunk, etc.
- Auto-reconnect with exponential backoff

---

**Enjoy chatting with RLR P2P Chat!**

For issues, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md). For network setup help, see [NETWORK_SETUP.md](NETWORK_SETUP.md).
