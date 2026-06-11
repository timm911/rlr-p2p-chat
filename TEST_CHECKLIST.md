# RLR P2P Chat Application - Testing Checklist

This document provides comprehensive testing procedures for the RLR P2P Chat application. Use this checklist to perform manual testing of features that cannot be fully automated.

## Test Environment Setup

- [ ] Install application on both test machines
- [ ] Ensure both machines are on the same network (or have proper port forwarding configured)
- [ ] Verify firewall settings allow TCP connections on configured port (default: 54445)
- [ ] Have test files ready for file transfer tests (small, medium, large files)

---

## 1. Connection Establishment Tests

### 1.1 Basic Connection - Server Mode (Ripster)
- [ ] Launch application and select "Ripster" identity
- [ ] Verify connection setup screen shows correct IP addresses
- [ ] Click "Start Listening"
- [ ] Verify status shows "Waiting for connection..."
- [ ] Verify local IP addresses are displayed correctly
- [ ] Note down the IP address and port for client connection

**Expected Result:** Server starts listening without errors, displays connection information

### 1.2 Basic Connection - Client Mode (RLRJupiter)
- [ ] Launch application on second machine and select "RLRJupiter" identity
- [ ] Enter server IP address and port from test 1.1
- [ ] Click "Connect"
- [ ] Verify status shows "Connecting..." then "Connected"
- [ ] Verify both machines show "Connected" status

**Expected Result:** Client successfully connects to server, both show connected status

### 1.3 Connection Error Scenarios
- [ ] **Wrong IP Address:** Try connecting to invalid IP (e.g., 192.168.1.999)
  - Expected: Error message displayed, connection fails gracefully
- [ ] **Wrong Port:** Try connecting with incorrect port number
  - Expected: Connection timeout or error message
- [ ] **No Server Running:** Try connecting when server is not running
  - Expected: Connection error displayed
- [ ] **Port Already in Use:** Start two servers on same machine/port
  - Expected: Second server shows error that port is in use

### 1.4 Reconnection Tests
- [ ] Establish connection between client and server
- [ ] Close server application
- [ ] Verify client detects disconnection
- [ ] Restart server
- [ ] Verify client automatically reconnects
- [ ] Check that reconnection completes successfully

**Expected Result:** Client automatically attempts reconnection with exponential backoff

### 1.5 Network Interruption
- [ ] Establish connection
- [ ] Temporarily disable network adapter on one machine
- [ ] Re-enable network adapter
- [ ] Verify connection is restored

**Expected Result:** Connection recovers after network is restored

---

## 2. Messaging Tests

### 2.1 Basic Text Messaging
- [ ] Send message from RLRJupiter to Ripster
  - **Message:** "Hello from Jupiter!"
  - Expected: Message appears in Ripster's chat window
- [ ] Send message from Ripster to RLRJupiter
  - **Message:** "Hello from Ripster!"
  - Expected: Message appears in Jupiter's chat window
- [ ] Verify sender name is displayed correctly
- [ ] Verify timestamp is displayed correctly
- [ ] Verify message bubbles have correct styling (sender vs receiver)

### 2.2 Special Characters in Messages
- [ ] Send message with emoji: "Testing emoji 😊 👍 ❤️"
  - Expected: Emojis display correctly
- [ ] Send message with special characters: "Test: @#$%^&*()_+-={}[]|\\:\";<>?,./"
  - Expected: All characters display correctly
- [ ] Send message with multiple languages: "Hello, Hola, 你好, مرحبا"
  - Expected: All characters display correctly
- [ ] Send message with newlines (Shift+Enter)
  - Expected: Newlines are preserved in message display
- [ ] Send very long message (>1000 characters)
  - Expected: Message sends and displays correctly, wraps appropriately

### 2.3 Rapid Fire Messaging
- [ ] Send 10 messages rapidly from one side
- [ ] Verify all messages appear in correct order
- [ ] Verify no messages are lost
- [ ] Check for any UI lag or freezing

### 2.4 Link Detection
- [ ] Send message with URL: "Check this out: https://example.com"
  - Expected: Link is detected and styled differently
- [ ] Send message with multiple links
  - Expected: All links are detected
- [ ] Click on a link
  - Expected: Link opens in default browser
- [ ] Test various URL formats:
  - [ ] http://example.com
  - [ ] https://example.com
  - [ ] www.example.com
  - [ ] example.com/path/to/page

---

## 3. Status Updates

### 3.1 Status Changes
- [ ] Change status to "Online"
  - Expected: Peer sees status update notification
- [ ] Change status to "Away"
  - Expected: Peer sees status update, status icon changes color
- [ ] Change status to "Busy"
  - Expected: Status updates correctly on both sides
- [ ] Change status to "Offline" (without disconnecting)
  - Expected: Status shows offline but connection remains

### 3.2 Status Persistence
- [ ] Set status to "Away"
- [ ] Send messages and verify status doesn't change
- [ ] Verify status persists across message exchanges

---

## 4. Reactions

### 4.1 Adding Reactions
- [ ] Send a message from RLRJupiter
- [ ] On Ripster side, hover over message
- [ ] Click reaction button
- [ ] Select emoji (e.g., 👍)
  - Expected: Reaction appears on message
- [ ] Verify reaction appears on Jupiter's side
- [ ] Add reaction from Jupiter to Ripster's message
  - Expected: Reaction appears on both sides

### 4.2 Multiple Reactions
- [ ] Add multiple different reactions to same message
  - Expected: All reactions display correctly
- [ ] Remove a reaction
  - Expected: Reaction is removed on both sides
- [ ] Test rapid reaction adding/removing
  - Expected: All changes sync correctly

### 4.3 Reaction Edge Cases
- [ ] Add reaction to very old message (scroll up)
  - Expected: Reaction works on older messages
- [ ] Add reaction during slow network
  - Expected: Reaction syncs when connection is stable

---

## 5. Typing Indicators

### 5.1 Basic Typing Indicator
- [ ] Start typing on RLRJupiter side
  - Expected: "Ripster is typing..." appears on Ripster's side
- [ ] Stop typing
  - Expected: Typing indicator disappears after a few seconds
- [ ] Start typing on Ripster side
  - Expected: Typing indicator appears on Jupiter's side

### 5.2 Typing Indicator Edge Cases
- [ ] Type and delete all text without sending
  - Expected: Typing indicator appears then disappears
- [ ] Type very slowly (one character every few seconds)
  - Expected: Typing indicator behavior is reasonable
- [ ] Send message while typing indicator is showing
  - Expected: Indicator clears when message is sent

---

## 6. File Transfer Tests

### 6.1 Small File Transfer (<1MB)
- [ ] Click file attachment button
- [ ] Select a small text file (e.g., 100KB)
- [ ] Verify file offer appears in chat
- [ ] On receiving side, click "Accept"
- [ ] Choose save location
- [ ] Verify transfer completes
- [ ] Verify progress bar shows during transfer
- [ ] Open received file and verify content matches original

**Test Files:**
- Small text file (1-10KB)
- Image file (100-500KB)

### 6.2 Medium File Transfer (1-10MB)
- [ ] Send a medium-sized file (e.g., 5MB image)
- [ ] Accept file on receiving end
- [ ] Monitor transfer progress
- [ ] Verify transfer speed is displayed
- [ ] Verify ETA is displayed and reasonable
- [ ] Verify file completes successfully
- [ ] Compare checksums or file content

**Test Files:**
- PDF document (2-5MB)
- High-resolution image (5-10MB)

### 6.3 Large File Transfer (10-100MB)
- [ ] Send a large file (e.g., 50MB video)
- [ ] Accept file
- [ ] Monitor progress throughout transfer
- [ ] Verify transfer can complete without errors
- [ ] Verify file integrity after transfer

**Warning:** Large file test may take several minutes

### 6.4 Multiple File Types
Test file transfers with various file types:
- [ ] Text file (.txt)
- [ ] PDF document (.pdf)
- [ ] Image file (.jpg, .png)
- [ ] Video file (.mp4)
- [ ] Audio file (.mp3)
- [ ] Archive file (.zip)
- [ ] Executable file (.exe) - Use caution!

### 6.5 File Transfer Rejection
- [ ] Send a file offer
- [ ] On receiving side, click "Reject"
- [ ] Verify sender is notified of rejection
- [ ] Verify transfer doesn't start

### 6.6 File Transfer Cancellation
- [ ] Start a large file transfer
- [ ] During transfer, click "Cancel" on sending side
- [ ] Verify transfer stops
- [ ] Verify receiver is notified
- [ ] Start another file transfer
- [ ] Cancel from receiving side during transfer
- [ ] Verify both sides handle cancellation

### 6.7 File Transfer Error Scenarios
- [ ] **Disconnect During Transfer:** Start file transfer, disconnect network
  - Expected: Transfer fails with appropriate error message
- [ ] **Disk Full:** Send file larger than available disk space (if possible)
  - Expected: Error message about insufficient space
- [ ] **File Name Conflicts:** Send file with same name twice
  - Expected: User can choose different save location
- [ ] **Very Large File (>500MB):** Attempt to send file larger than 500MB limit
  - Expected: Error message about file size limit

### 6.8 File Transfer Performance
- [ ] Monitor CPU usage during file transfer
  - Expected: Reasonable CPU usage (<50%)
- [ ] Monitor memory usage during file transfer
  - Expected: No memory leaks, reasonable memory usage
- [ ] Perform file transfer while sending messages
  - Expected: Messages still send/receive during transfer

---

## 7. Voice Features (TTS - Text-to-Speech)

### 7.1 Basic TTS Functionality
- [ ] Open Settings menu
- [ ] Enable TTS
- [ ] Send a text message from peer
- [ ] Verify message is read aloud
- [ ] Adjust volume setting
  - Expected: Volume changes affect TTS playback
- [ ] Adjust speed setting
  - Expected: Speech rate changes

### 7.2 TTS Voice Selection
- [ ] Open TTS settings
- [ ] Select different voice from dropdown
- [ ] Test with sample message
- [ ] Verify voice changes

### 7.3 TTS Edge Cases
- [ ] Send message with special characters
  - Expected: TTS handles gracefully or skips special chars
- [ ] Send very long message
  - Expected: Entire message is read
- [ ] Send multiple messages rapidly
  - Expected: Messages queue or handle appropriately
- [ ] Disable TTS mid-speech
  - Expected: Speech stops immediately

### 7.4 TTS Test Button
- [ ] Click "Test TTS" button in settings
  - Expected: Sample text is spoken
- [ ] Verify test works with different voices
- [ ] Verify test respects volume/speed settings

---

## 8. Voice Features (STT - Speech-to-Text / Vosk)

### 8.1 Vosk Setup Verification
- [ ] Check if Vosk model is installed
- [ ] If not installed, follow download instructions
- [ ] Verify model path is correct
- [ ] Enable Vosk in settings

### 8.2 Basic STT Functionality
- [ ] Click microphone button to start recording
- [ ] Speak clearly: "Hello this is a test"
- [ ] Verify partial results appear in real-time (if implemented)
- [ ] Stop recording
- [ ] Verify text is inserted into message input
- [ ] Send the message

### 8.3 STT Accuracy Tests
Test with various phrases:
- [ ] "Send this message to my friend"
- [ ] "Testing one two three four five"
- [ ] Numbers: "One hundred twenty-three dollars"
- [ ] Special words: "New York City, California, Microsoft"
- [ ] Different speaking speeds (slow, normal, fast)

### 8.4 STT Edge Cases
- [ ] **Background Noise:** Test with music or TV in background
  - Expected: Reasonable accuracy or noise filtering
- [ ] **Silence:** Start recording but don't speak
  - Expected: No text or indication of silence
- [ ] **Very Long Recording:** Speak continuously for 30+ seconds
  - Expected: Entire speech is transcribed
- [ ] **Stop Mid-Sentence:** Stop recording in middle of sentence
  - Expected: Partial text is captured

### 8.5 STT Error Handling
- [ ] Disable microphone in OS settings, try to record
  - Expected: Error message about microphone access
- [ ] Try STT without Vosk model installed
  - Expected: Clear error message and setup instructions
- [ ] Test with invalid model path
  - Expected: Error handled gracefully

---

## 9. User Interface Tests

### 9.1 Window Controls
- [ ] Minimize window
  - Expected: Window minimizes to taskbar
- [ ] Maximize window
  - Expected: Window maximizes
- [ ] Restore window
  - Expected: Window returns to normal size
- [ ] Resize window manually
  - Expected: Window resizes smoothly, minimum size enforced
- [ ] Close window
  - Expected: Application closes, connections terminate

### 9.2 Settings Menu
- [ ] Open settings menu
- [ ] Verify all settings categories are accessible
- [ ] Change TTS settings
- [ ] Change Vosk settings
- [ ] Close settings
  - Expected: Settings are saved
- [ ] Reopen settings
  - Expected: Previous settings are retained

### 9.3 User Selection Screen
- [ ] Launch application
- [ ] Select "RLRJupiter"
  - Expected: Proceeds to connection setup
- [ ] Restart app, select "Ripster"
  - Expected: Proceeds to connection setup

### 9.4 Chat Window Layout
- [ ] Verify header displays user identity
- [ ] Verify status dropdown works
- [ ] Verify settings icon opens settings
- [ ] Verify disconnect button works
- [ ] Verify message input area is accessible
- [ ] Verify chat scroll area works correctly
- [ ] Scroll through long chat history
  - Expected: Smooth scrolling, no performance issues

### 9.5 Responsive Design
- [ ] Resize window to minimum width
  - Expected: UI adapts, no elements cut off
- [ ] Resize to maximum width
  - Expected: UI scales appropriately
- [ ] Verify message bubbles wrap correctly at different widths

---

## 10. Performance Tests

### 10.1 Message History Performance
- [ ] Send 100 messages
- [ ] Scroll through chat history
  - Expected: Smooth scrolling, no lag
- [ ] Send another message
  - Expected: New message appears without delay

### 10.2 Long Running Session
- [ ] Keep application running for 1+ hour
- [ ] Send messages periodically
- [ ] Monitor memory usage
  - Expected: No memory leaks, stable memory usage
- [ ] Verify no degradation in performance

### 10.3 Concurrent Operations
- [ ] Send messages while file transfer is in progress
  - Expected: Both operations work correctly
- [ ] Change status while sending messages
  - Expected: All updates sync properly
- [ ] Add reactions while messages are being sent
  - Expected: No conflicts or errors

---

## 11. Error Handling and Edge Cases

### 11.1 Invalid Input Handling
- [ ] Try to send empty message
  - Expected: Message is not sent or input is validated
- [ ] Enter non-numeric value for port number
  - Expected: Validation error or ignored
- [ ] Enter invalid IP address format
  - Expected: Validation error or connection fails gracefully

### 11.2 Crash Recovery
- [ ] Force close application during active connection
- [ ] Restart application
- [ ] Attempt to reconnect
  - Expected: Application recovers, can establish new connection

### 11.3 Resource Exhaustion
- [ ] Send very large file (approaching 500MB limit)
  - Expected: Transfer works or shows appropriate error
- [ ] Send many messages very quickly (100+ in quick succession)
  - Expected: All messages eventually send, no crashes

---

## 12. Security and Privacy Tests

### 12.1 Connection Security
- [ ] Verify only one client can connect to server at a time
  - Try connecting second client while one is connected
  - Expected: Second client fails or first is disconnected
- [ ] Verify connection is peer-to-peer (check network traffic if possible)

### 12.2 Data Validation
- [ ] Send malformed message (requires dev tools or packet manipulation)
  - Expected: Application handles gracefully, doesn't crash
- [ ] Send extremely large message
  - Expected: Message is truncated or rejected

---

## 13. Platform-Specific Tests (Windows)

### 13.1 Windows Integration
- [ ] Verify application appears in task manager correctly
- [ ] Check application icon in taskbar
- [ ] Verify native notifications work (if implemented)
- [ ] Test with Windows Firewall enabled
  - Expected: Firewall prompt appears on first run, connection works after allowing

### 13.2 Multi-Monitor Setup
- [ ] Move window between monitors
  - Expected: Window displays correctly on both monitors
- [ ] Maximize on secondary monitor
  - Expected: Window maximizes correctly

---

## 14. Installation and Setup Tests

### 14.1 First Run Experience
- [ ] Install application for first time
- [ ] Launch application
- [ ] Verify user selection screen appears
- [ ] Complete setup wizard
  - Expected: Smooth first-run experience

### 14.2 Updates (if applicable)
- [ ] Test update mechanism (if implemented)
- [ ] Verify application version is displayed

---

## 15. Accessibility Tests

### 15.1 Keyboard Navigation
- [ ] Navigate UI using Tab key
  - Expected: All interactive elements are accessible
- [ ] Use Enter to send message
  - Expected: Message sends
- [ ] Use keyboard shortcuts (if any)
  - Expected: Shortcuts work correctly

### 15.2 Screen Reader Compatibility (Optional)
- [ ] Test with Windows Narrator or NVDA
- [ ] Verify important UI elements are announced

---

## Bug Reporting Template

When you find a bug, please document it using this template:

**Bug Title:** Brief description of the issue

**Severity:** Critical / High / Medium / Low

**Steps to Reproduce:**
1. Step one
2. Step two
3. Step three

**Expected Result:** What should happen

**Actual Result:** What actually happened

**Screenshots/Logs:** Attach any relevant screenshots or log files

**Environment:**
- OS: Windows version
- Application Version:
- Network Setup: (same LAN, VPN, etc.)

---

## Test Summary Report

After completing all tests, fill out this summary:

**Date:** _____________
**Tester:** _____________
**Application Version:** _____________

**Test Results:**
- Total Tests Executed: ___
- Tests Passed: ___
- Tests Failed: ___
- Tests Blocked: ___

**Critical Issues Found:** ___
**High Priority Issues:** ___
**Medium Priority Issues:** ___
**Low Priority Issues:** ___

**Overall Assessment:**
- [ ] Ready for release
- [ ] Ready with minor issues
- [ ] Needs significant work
- [ ] Blocked by critical issues

**Notes:**
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________

---

## Quick Smoke Test (5 minutes)

Use this abbreviated test for quick verification:

1. [ ] Launch both instances (RLRJupiter and Ripster)
2. [ ] Establish connection
3. [ ] Send message in both directions
4. [ ] Change status
5. [ ] Add a reaction
6. [ ] Send small file and accept
7. [ ] Test TTS (if enabled)
8. [ ] Disconnect and reconnect
9. [ ] Close both applications

**Result:** Pass / Fail
**Issues Found:** ___________________

---

## Automated Tests

Remember to also run the automated test suite:

```bash
npm test                    # Run all tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:coverage      # With coverage report
```

Refer to `tests/README.md` for detailed information about automated tests.
