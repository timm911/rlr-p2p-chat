# RLR P2P Chat - Troubleshooting Guide

This guide helps you diagnose and fix common issues with RLR P2P Chat.

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Connection Issues](#connection-issues)
3. [Voice Features Issues](#voice-features-issues)
4. [File Transfer Issues](#file-transfer-issues)
5. [Application Issues](#application-issues)
6. [Performance Issues](#performance-issues)
7. [Accessing Logs](#accessing-logs)
8. [Getting Additional Help](#getting-additional-help)

---

## Quick Diagnostics

Before diving into specific issues, try these quick checks:

### 5-Minute Quick Fix Checklist

1. [ ] **Restart the app** - Close completely and reopen
2. [ ] **Check internet connection** - Open a web browser, verify you can browse
3. [ ] **Check Windows Firewall** - Ensure RLR Chat is allowed
4. [ ] **Verify port number** - Both users using same port (default 54445)?
5. [ ] **Check F12 console** - Look for error messages
6. [ ] **Restart router** - Unplug for 30 seconds, plug back in

### Basic Information Collection

When troubleshooting, gather this information:

- **Your role**: RLRJupiter (connector) or Ripster (listener)?
- **Connection type**: Local network (LAN) or Internet?
- **Error messages**: Exact text of any errors
- **When it fails**: During startup, while chatting, randomly?
- **What works**: Can you connect? Send messages? Use voice?

---

## Connection Issues

### Problem: "Connection Failed" When RLRJupiter Tries to Connect

**Symptoms:**
- RLRJupiter clicks "Connect" button
- Shows "Connecting..." briefly
- Error message: "Connection failed: [reason]"
- Returns to Connection Setup screen

**Common Causes & Solutions:**

#### Cause 1: Wrong IP Address or Port

**Check:**
- [ ] RLRJupiter using Ripster's **public IP** (for internet) or **local IP** (for LAN)
- [ ] Port number matches exactly (both use 54445)
- [ ] No typos in IP address or domain name

**Fix:**
1. Ripster: Find your public IP at [https://whatismyip.com](https://whatismyip.com)
2. Share this IP with RLRJupiter (e.g., via phone, email)
3. RLRJupiter: Enter exact IP and port
4. Try connecting again

**For local network:**
1. Ripster: Run `ipconfig` in Command Prompt
2. Find "IPv4 Address" (e.g., 192.168.1.100)
3. RLRJupiter: Use this local IP
4. Both must be on same WiFi/network

#### Cause 2: Ripster Not Listening

**Check:**
- [ ] Ripster clicked "Start Listening" button
- [ ] Ripster sees "Waiting for connection" status
- [ ] RLR Chat app still open on Ripster's computer

**Fix:**
1. Ripster: Ensure app is running
2. Click "Start Listening" if not already done
3. Don't close the app
4. RLRJupiter: Try connecting now

#### Cause 3: Port Forwarding Not Configured (Internet Connection)

**Check:**
- [ ] Are you connecting over internet (not same WiFi)?
- [ ] Has Ripster configured port forwarding on router?
- [ ] Is port forwarding enabled?

**Fix:**
1. See [NETWORK_SETUP.md](NETWORK_SETUP.md) for complete port forwarding guide
2. Ripster: Log into router
3. Verify port forwarding rule exists and is enabled:
   - External port: 54445
   - Internal port: 54445
   - Internal IP: Ripster's local IP
   - Protocol: TCP
4. Save and restart router if needed

**Test port forwarding:**
1. Ripster: Visit [https://canyouseeme.org](https://canyouseeme.org)
2. Enter port 54445
3. Click "Check Port"
4. Should say "Success" (if RLR Chat is listening)

#### Cause 4: Firewall Blocking Connection

**Check:**
- [ ] Windows Firewall blocking RLR Chat?
- [ ] Antivirus software blocking network access?
- [ ] Router firewall rules?

**Fix - Windows Firewall:**
1. Open **Windows Security**
2. Click **Firewall & network protection**
3. Click **Allow an app through firewall**
4. Find "RLR P2P Chat" in list
5. Check boxes for **Private** and **Public** networks
6. If not in list:
   - Click "Change settings" (admin required)
   - Click "Allow another app..."
   - Browse to RLR Chat executable
   - Add it

**Fix - Antivirus:**
1. Open your antivirus software (Norton, McAfee, Avast, etc.)
2. Find "Firewall" or "Network Protection" settings
3. Add RLR P2P Chat to allowed/trusted apps
4. Or temporarily disable antivirus (for testing only)

**Fix - Router Firewall:**
1. Log into router admin page
2. Find "Firewall" or "Security" settings
3. Ensure incoming TCP traffic on port 54445 is allowed
4. Some routers have separate firewall rules apart from port forwarding

#### Cause 5: ISP Blocking Port or Using CGNAT

**Check:**
- [ ] Does port checker show port open when app listening?
- [ ] Does router's WAN IP match your public IP?

**Fix - Blocked Port:**
1. Try different port (e.g., 54446, 55000)
2. Update port in router port forwarding rule
3. Update port in RLR Chat connection settings (both users)
4. Test again

**Fix - CGNAT (Carrier-Grade NAT):**
1. Compare router's WAN IP to public IP from whatismyip.com
2. If different, ISP uses CGNAT (port forwarding won't work)
3. Solutions:
   - **Contact ISP**: Request public IP address (may have fee)
   - **Use VPN**: VPN service with port forwarding support
   - **Use virtual LAN**: Software like Hamachi or ZeroTier
   - **Switch roles**: If RLRJupiter has better network, switch identities

---

### Problem: Connection Drops Randomly During Chat

**Symptoms:**
- Connection works initially
- Chat window shows "Disconnected from [peer]"
- Happens after few minutes or hours
- May reconnect automatically or require restart

**Common Causes & Solutions:**

#### Cause 1: Unstable Internet Connection

**Check:**
- [ ] Is internet connection stable?
- [ ] WiFi signal strong?
- [ ] Other apps having network issues?

**Fix:**
1. Run speed test: [https://speedtest.net](https://speedtest.net)
2. Check for packet loss
3. Move closer to WiFi router or use Ethernet cable
4. Restart modem and router (unplug 30 seconds)
5. Contact ISP if internet frequently drops

#### Cause 2: Router Timeout / NAT Table Expiry

**Check:**
- [ ] Does disconnect happen after consistent time period?
- [ ] Longer idle periods = more likely to disconnect?

**Fix:**
1. Send messages occasionally to keep connection alive
2. Router timeout settings (if available):
   - Log into router
   - Find "NAT timeout" or "TCP timeout"
   - Increase timeout value (e.g., from 300 to 3600 seconds)
3. Update router firmware (may improve stability)

#### Cause 3: Power Saving Settings

**Check:**
- [ ] Laptop or desktop?
- [ ] On battery power?
- [ ] Network adapter power saving enabled?

**Fix - Network Adapter:**
1. Open **Device Manager** (search in Start menu)
2. Expand **Network adapters**
3. Right-click your adapter → **Properties**
4. Go to **Power Management** tab
5. **Uncheck**: "Allow computer to turn off this device to save power"
6. Click **OK**

**Fix - Windows Power Plan:**
1. Open **Control Panel** → **Power Options**
2. Select **High Performance** plan (or create custom)
3. Or modify current plan:
   - Click "Change plan settings"
   - Click "Change advanced power settings"
   - Expand "Wireless Adapter Settings" (or "Network")
   - Set to "Maximum Performance"

#### Cause 4: App Bug or Memory Issue

**Check:**
- [ ] Does app run for long time before disconnect?
- [ ] Computer low on memory?

**Fix:**
1. Close other apps to free memory
2. Restart RLR Chat app
3. Check for app updates
4. Check F12 console for errors before disconnect

---

### Problem: Can Connect on LAN but Not Over Internet

**Symptoms:**
- Connection works when both on same WiFi/network
- Connection fails when one user on different network
- RLRJupiter gets "Connection failed" from internet

**Common Causes & Solutions:**

#### Cause: Port Forwarding Issue

**Fix:**
1. **Test port forwarding** (see [NETWORK_SETUP.md](NETWORK_SETUP.md))
2. Ripster: Ensure using **public IP** (not local IP):
   - Get from [https://whatismyip.com](https://whatismyip.com)
   - Share with RLRJupiter
3. Verify port forwarding rule:
   - External port matches internal port
   - Internal IP is Ripster's local IP
   - Protocol is TCP
   - Rule is enabled
4. Restart router after making changes
5. Test port with online checker while app is listening

---

## Voice Features Issues

### Problem: Microphone Not Working (Push-to-Talk)

**Symptoms:**
- Click and hold microphone button
- "Listening..." indicator doesn't appear
- Or appears but no transcription happens
- May see error message about microphone

**Common Causes & Solutions:**

#### Cause 1: Microphone Not Connected or Selected

**Check:**
- [ ] Microphone physically connected?
- [ ] Microphone shows in Windows Sound settings?
- [ ] Correct microphone selected as default?

**Fix:**
1. Open **Settings** → **System** → **Sound**
2. Under **Input**, verify:
   - Microphone is listed
   - Correct microphone selected from dropdown
   - Volume slider moves when you speak (test mic)
3. If no microphone:
   - Plug in USB microphone
   - Or enable built-in laptop mic
   - Or connect headset with mic
4. Test in Windows Voice Recorder app first

#### Cause 2: Microphone Permission Denied

**Check:**
- [ ] Did you allow microphone access when prompted?
- [ ] Windows microphone privacy settings?

**Fix - Browser/App Permission:**
1. First time using mic, Windows asks permission
2. If you clicked "Deny", need to re-enable
3. Close and restart RLR Chat
4. Try push-to-talk again
5. When prompted, click "Allow"

**Fix - Windows Privacy:**
1. Open **Settings** → **Privacy** → **Microphone**
2. Ensure "Allow apps to access your microphone" is **On**
3. Scroll down, ensure RLR P2P Chat has access
4. Restart app

#### Cause 3: Microphone Muted or Volume Too Low

**Check:**
- [ ] Physical mute button on microphone/headset?
- [ ] Windows microphone muted?
- [ ] Volume level too low?

**Fix:**
1. Check physical mute switch on microphone
2. Open **Sound settings** → **Input** → **Device properties**
3. Ensure volume is 80-100%
4. Test microphone: Speak and watch level meter
5. Should see blue bars moving

#### Cause 4: Vosk Model Not Loaded or Missing

**Check:**
- [ ] Does "Transcribing..." message appear after recording?
- [ ] Any error messages about Vosk or model?
- [ ] First time using voice feature?

**Fix:**
1. Check F12 debug console for Vosk errors
2. App should download Vosk model automatically on first use
3. If failed, may need internet connection for initial download
4. Restart app to retry download
5. Check `%USERPROFILE%\.rlrchat\` folder for model files

#### Cause 5: Recording Too Short or Audio Processing Failed

**Check:**
- [ ] Did you speak for at least 1-2 seconds?
- [ ] Release button after speaking?

**Fix:**
1. Hold microphone button longer (at least 2-3 seconds)
2. Speak clearly and not too fast
3. Release button completely after speaking
4. Wait for "Transcribing..." message
5. If transcription fails, try again with clearer speech

**Error: "Transcription failed"**
- Speech not clear enough
- Too much background noise
- Recording too short
- Try again, speak louder and slower

---

### Problem: Text-to-Speech Not Speaking

**Symptoms:**
- Receive message from peer
- No voice speaks the message
- Status is set to "Talk to me"
- TTS enabled in settings

**Common Causes & Solutions:**

#### Cause 1: TTS Disabled in Settings

**Check:**
- [ ] TTS enabled in settings?
- [ ] Status is "Talk to me"?

**Fix:**
1. Click menu (⋮) → **Text-to-Speech Settings**
2. Expand the panel
3. Check **"Enable Text-to-Speech"** checkbox
4. Click **"Test Speech"** to verify
5. If works, ensure status is "Talk to me"

#### Cause 2: System Volume Muted or Too Low

**Check:**
- [ ] Speakers/headphones connected?
- [ ] Windows volume not muted?
- [ ] Volume level sufficient?

**Fix:**
1. Check volume icon in Windows taskbar
2. Click and adjust volume to 50%+
3. Ensure not muted (icon shouldn't have X)
4. Test with other audio (YouTube, music)
5. Try TTS "Test Speech" button in settings

#### Cause 3: TTS Voice Not Available

**Check:**
- [ ] Does "Test Speech" work in settings?
- [ ] Any errors in F12 console?

**Fix:**
1. Settings → TTS Settings → Voice dropdown
2. Try different voice
3. If only "System Default" available:
   - Windows may be missing TTS voices
   - Install additional voices:
     - Settings → Time & Language → Speech
     - Click "Add voices"
     - Download a voice (e.g., Microsoft David, Zira)
4. Restart RLR Chat after installing voices

#### Cause 4: Status Not Set to "Talk to me"

**Check:**
- [ ] Current status is exactly "Talk to me"?
- [ ] Not a custom status or different preset?

**Fix:**
- TTS **only works** when status is "Talk to me"
- Click status dropdown (top right)
- Select "💬 Talk to me"
- TTS will now speak incoming messages

---

## File Transfer Issues

### Problem: File Transfer Fails to Start

**Symptoms:**
- Drag file or click paperclip
- File offer doesn't appear for peer
- Or error message "Failed to send file"

**Common Causes & Solutions:**

#### Cause 1: File Too Large or Disk Space

**Check:**
- [ ] File extremely large (multiple GB)?
- [ ] Enough disk space on both computers?
- [ ] File located on accessible drive?

**Fix:**
1. Check file size (right-click → Properties)
2. Very large files take time - be patient
3. Ensure recipient has disk space for file
4. For huge files (>1 GB), consider alternate method
5. Don't use files from network drives or removable media

#### Cause 2: File In Use / Locked

**Check:**
- [ ] Is file currently open in another program?
- [ ] File located in protected system folder?

**Fix:**
1. Close any programs using the file
2. Don't send files from:
   - Program Files folder
   - Windows System folders
   - Locked directories
3. Copy file to Desktop or Documents first
4. Try sending again

#### Cause 3: Connection Issue

**Check:**
- [ ] Chat connection still active?
- [ ] "Connected" status shown?

**Fix:**
1. Verify connection is active (green dot)
2. Try sending a text message first
3. If disconnected, reconnect before sending file
4. Unstable connection can cause file transfer to fail

---

### Problem: File Transfer Stuck or Very Slow

**Symptoms:**
- File transfer starts
- Progress bar doesn't move or moves very slowly
- Transfer speed shows 0 KB/s or very low
- May eventually timeout with error

**Common Causes & Solutions:**

#### Cause 1: Slow Internet Connection

**Check:**
- [ ] Upload/download speeds?
- [ ] WiFi vs Ethernet?
- [ ] Other users on network?

**Fix:**
1. Run speed test: [https://speedtest.net](https://speedtest.net)
2. File transfer limited by slower of:
   - Sender's upload speed
   - Receiver's download speed
3. Pause other downloads/uploads
4. Use Ethernet instead of WiFi
5. For large files, may take hours on slow connection (normal)

**Example speeds:**
- 1 Mbps upload = ~125 KB/s = ~7.5 MB/minute
- 10 Mbps = ~1.25 MB/s = ~75 MB/minute
- 100 Mbps = ~12.5 MB/s = ~750 MB/minute

#### Cause 2: Connection Interruption

**Check:**
- [ ] Stable internet?
- [ ] Connection dropped during transfer?

**Fix:**
1. Check for "Disconnected" message
2. If disconnected, reconnect and retry file
3. Avoid moving laptops during transfer (WiFi stability)
4. Keep both computers connected to power

#### Cause 3: Firewall or Antivirus Scanning

**Check:**
- [ ] Antivirus scanning file during transfer?
- [ ] Firewall inspecting packets?

**Fix:**
1. Temporarily disable antivirus real-time scanning
2. Add RLR Chat to antivirus exclusions
3. After transfer, re-enable antivirus
4. Or add exception for RLR Chat network traffic

---

### Problem: File Transfer Fails Partway Through

**Symptoms:**
- Transfer starts successfully
- Progress reaches 20%, 50%, etc.
- Then fails with error message
- "File transfer failed: [reason]"

**Common Causes & Solutions:**

#### Cause: Connection Lost During Transfer

**Fix:**
1. Ensure stable connection before starting
2. Don't close app during transfer
3. Keep computers powered on
4. If fails, retry from beginning (no resume yet)

#### Cause: Disk Space Ran Out

**Fix:**
1. Check available disk space on receiving computer
2. Free up space if needed
3. Retry transfer

#### Cause: File Access Error

**Fix:**
1. Receiving side: Ensure selected save location is writable
2. Don't save to read-only folders or network drives
3. Save to Desktop, Documents, or Downloads

---

### Problem: Can't Find Received File

**Symptoms:**
- File transfer completes successfully
- Message says "File received: filename.txt"
- Can't find the file on computer

**Solution:**

**Where to look:**
1. **Check the location you selected** when accepting file
   - Dialog asked "Save As" location
   - Look in that exact folder
2. **Common default locations:**
   - Desktop
   - Downloads folder
   - Documents folder
3. **Search for file:**
   - Press `Windows + S`
   - Type filename
   - Look in search results
4. **Check recent files:**
   - Open File Explorer
   - Click "Quick access"
   - Look in "Recent files"

---

## Application Issues

### Problem: App Won't Start or Crashes on Launch

**Symptoms:**
- Double-click app icon
- App window appears briefly or not at all
- Then closes immediately
- Or Windows error about app crashing

**Common Causes & Solutions:**

#### Cause 1: Corrupted Installation

**Fix:**
1. **Uninstall app:**
   - Settings → Apps → RLR P2P Chat → Uninstall
   - Or Control Panel → Programs → Uninstall
2. **Delete app data:**
   - Press `Windows + R`
   - Type: `%USERPROFILE%\.rlrchat`
   - Delete the `.rlrchat` folder
3. **Reinstall:**
   - Run installer again
   - Launch app

#### Cause 2: Missing Windows Updates or .NET Framework

**Fix:**
1. Open **Windows Update**
2. Check for updates
3. Install all pending updates
4. Restart computer
5. Try launching app again

#### Cause 3: Port Already in Use

**Check:**
- Is another instance of RLR Chat running?
- Is another app using port 54445?

**Fix:**
1. Open Task Manager (`Ctrl + Shift + Esc`)
2. Find "RLR P2P Chat" process
3. Right-click → End task
4. Try launching again
5. Or use different port in connection settings

#### Cause 4: Antivirus False Positive

**Check:**
- Did antivirus quarantine app?
- Any antivirus notifications?

**Fix:**
1. Open antivirus quarantine/vault
2. Restore RLR P2P Chat
3. Add to exclusions/whitelist
4. Reinstall if needed

---

### Problem: App Freezes or Becomes Unresponsive

**Symptoms:**
- App window stops responding
- Can't click buttons
- Window shows "Not Responding" in title bar
- May eventually recover or need force close

**Common Causes & Solutions:**

#### Cause 1: Vosk Model Loading

**Fix:**
- First-time voice feature use may freeze briefly
- Vosk model loading into memory (takes 10-30 seconds)
- Wait patiently
- Subsequent uses will be fast

#### Cause 2: Large File Transfer

**Fix:**
- Very large file transfers can slow UI temporarily
- Not a bug, just processing
- Wait for transfer to complete
- Keep app open

#### Cause 3: Low Memory

**Check:**
- [ ] Many apps running?
- [ ] Computer slow overall?

**Fix:**
1. Open Task Manager → Performance tab
2. Check Memory usage
3. If >90%, close other apps
4. Restart RLR Chat
5. Consider adding more RAM to computer

#### Cause 4: Bug or Crash

**Fix:**
1. Press F12 to open console
2. Look for error messages
3. Note any errors
4. Close app (force close if needed):
   - Task Manager → RLR P2P Chat → End task
5. Restart app
6. If repeatable, report bug with error messages

---

### Problem: F12 Debug Console Won't Open

**Symptoms:**
- Press F12 key
- Nothing happens
- Or console opens but is blank

**Solutions:**

**Try:**
1. Press F12 multiple times
2. Try `Ctrl + Shift + I` (alternative shortcut)
3. Click menu (⋮) → "Debug Console (F12)"
4. Restart app and try again
5. Console may be minimized or off-screen:
   - Try dragging from edges of app window
   - Resize app window

---

### Problem: Can't Close App / App Stuck in System Tray

**Symptoms:**
- Click X button to close
- App window disappears
- Process still running (can't reopen app)

**Solution:**

1. Open Task Manager (`Ctrl + Shift + Esc`)
2. Find "RLR P2P Chat" in processes list
3. Right-click → **End task**
4. If not in list, check "Details" tab
5. Find any processes with "rlr" or "chat" in name
6. End those tasks

---

## Performance Issues

### Problem: High CPU Usage

**Symptoms:**
- Computer fan loud
- Task Manager shows RLR Chat using high CPU
- Computer sluggish

**Common Causes & Solutions:**

#### Cause 1: Vosk Processing Voice

**Normal Behavior:**
- When using push-to-talk, CPU spikes during transcription
- This is expected (Vosk is processing audio)
- CPU returns to normal after transcription completes

**If CPU stays high:**
1. Voice feature may be stuck processing
2. Restart app
3. Avoid very long voice recordings (keep under 30 seconds)

#### Cause 2: File Transfer

**Normal Behavior:**
- File transfer causes moderate CPU use
- Encryption/decryption and network I/O
- Returns to normal when transfer completes

#### Cause 3: Memory Leak or Bug

**Fix:**
1. Restart app periodically if running for many hours
2. Check for app updates
3. Report issue if CPU constantly high with no activity

---

### Problem: High Memory Usage

**Symptoms:**
- Task Manager shows RLR Chat using lots of RAM
- Computer slowing down

**Common Causes & Solutions:**

#### Cause: Vosk Model Loaded

**Normal Behavior:**
- Vosk speech model uses ~50-200 MB RAM when loaded
- This is expected for offline speech recognition
- Memory released when app closed

**If memory keeps growing:**
1. Long chat sessions accumulate messages in memory
2. Restart app to clear
3. Memory should stabilize after initial load

---

## Accessing Logs

### Debug Console (F12)

**To open:**
1. Press `F12` key anytime app is running
2. Or click menu (⋮) → "Debug Console (F12)"

**What you'll see:**
- Connection logs (connected, disconnected, reconnecting)
- Message send/receive events
- Error messages (red text)
- Warning messages (yellow text)
- Network events

**Useful for:**
- Diagnosing connection issues
- Seeing exact error messages
- Understanding what app is doing
- Reporting bugs

**Example logs:**
```
[INFO] Starting TCP client...
[INFO] Connecting to <your-ripster-ddns-host>:54445
[ERROR] Connection failed: ECONNREFUSED
[INFO] Retrying in 5 seconds...
```

### Log File Locations

App doesn't currently write log files to disk. All logs visible in F12 console.

**Configuration file:**
- Location: `%USERPROFILE%\.rlrchat\config.json`
- Contains: Connection settings, TTS preferences
- JSON format

---

## Getting Additional Help

### Before Asking for Help

Collect this information:

1. **What you're trying to do**
   - Example: "Connect over internet" or "Send a file"

2. **What happens instead**
   - Exact error message (screenshot helpful)
   - Behavior you observe

3. **What you've tried**
   - Steps from this troubleshooting guide
   - Other attempts to fix

4. **Your setup:**
   - Your role (RLRJupiter or Ripster)
   - Connection type (LAN or internet)
   - Windows version (Settings → System → About)
   - RLR Chat version

5. **F12 console output:**
   - Open debug console
   - Reproduce the issue
   - Copy error messages (right-click → Save as...)
   - Or take screenshot

### Documentation Resources

- **[USER_GUIDE.md](USER_GUIDE.md)** - Complete guide to all features
- **[NETWORK_SETUP.md](NETWORK_SETUP.md)** - Port forwarding and network configuration
- **This guide** - Troubleshooting common issues

### System Information

**To find Windows version:**
1. Settings → System → About
2. Look for "Windows specifications"
3. Note "Edition" and "Version"

**To find app version:**
1. App not currently showing version in UI
2. Check filename of installer or executable
3. Or note download date

---

## Common Error Messages

### "Connection failed: ECONNREFUSED"

**Meaning:** Target computer refused connection
**Causes:**
- Ripster not listening
- Wrong port number
- Firewall blocking

**Fix:** See [Connection Failed](#problem-connection-failed-when-rlrjupiter-tries-to-connect) section above

---

### "Connection failed: ETIMEDOUT"

**Meaning:** Connection attempt timed out (no response)
**Causes:**
- Wrong IP address
- Port forwarding not configured
- Firewall dropping packets
- Network unreachable

**Fix:**
- Verify IP address is correct
- Check port forwarding (see NETWORK_SETUP.md)
- Test with online port checker

---

### "Connection failed: ENOTFOUND"

**Meaning:** Hostname/domain not found
**Causes:**
- Wrong domain name
- Typo in hostname
- DNS not resolving
- DDNS not configured

**Fix:**
- Double-check spelling of domain
- Try using IP address instead
- Verify DDNS is active (if using)
- Check internet connection

---

### "Port 54445 is already in use"

**Meaning:** Another program using the port
**Causes:**
- Another instance of RLR Chat running
- Different app using port 54445

**Fix:**
1. Close other RLR Chat instances (check Task Manager)
2. Or change port to 54446 in connection settings (both users)
3. Update router port forwarding if needed

---

### "Microphone permission denied"

**Meaning:** App doesn't have access to microphone
**Fix:**
1. Settings → Privacy → Microphone
2. Enable microphone access
3. Restart RLR Chat
4. Try push-to-talk again
5. Click "Allow" when prompted

---

### "Failed to send file: File not found"

**Meaning:** File moved or deleted before transfer
**Fix:**
- Ensure file still exists
- Don't move/delete file after selecting it
- Try again with stable file location

---

### "File transfer failed: Connection lost"

**Meaning:** Network connection dropped during transfer
**Fix:**
- Ensure stable connection
- Reconnect and retry file transfer
- Use wired Ethernet if WiFi unstable

---

## Still Need Help?

If this guide didn't solve your problem:

1. **Check F12 console** for specific error messages
2. **Try the basics:** Restart app, router, computer
3. **Test systematically:**
   - Does local connection work?
   - Does internet connection work?
   - Does it work with different port?
4. **Document the issue:**
   - Screenshots of errors
   - F12 console output
   - Exact steps to reproduce
5. **Contact support** with detailed information collected above

---

## Troubleshooting Flowchart

```
Can't connect?
├─ Same WiFi/LAN?
│  ├─ Yes → Use local IP (192.168.x.x)
│  │        Check Windows Firewall
│  │        Both using same port?
│  │
│  └─ No (Internet) → Check port forwarding
│                      Use public IP
│                      Test port online
│                      Check router firewall
│
Voice not working?
├─ Push-to-talk (mic)?
│  ├─ Microphone connected?
│  │  Microphone permission granted?
│  │  Check Sound settings
│  │
│  └─ TTS (speaker)?
│     Status = "Talk to me"?
│     TTS enabled in settings?
│     Volume not muted?
│     Try different voice?
│
File transfer fails?
├─ Starts but fails?
│  ├─ Connection stable?
│  │  Disk space available?
│  │  File not in use?
│  │
│  └─ Doesn't start?
│     File exists?
│     Connected to peer?
│     File not locked?
│
App crashes/freezes?
├─ Won't start?
│  ├─ Reinstall app
│  │  Update Windows
│  │  Check antivirus
│  │
│  └─ Freezes during use?
│     Close other apps
│     Check Task Manager (memory/CPU)
│     Restart app
│     Check F12 for errors
```

---

**Good luck troubleshooting! Most issues can be resolved with patience and systematic checking.**
