# Windows 8.1 Compatibility Guide

## Current Status

⚠️ **The app currently does NOT support Windows 8.1 with default configuration**

- **Current Electron version**: 39.0.0
- **Minimum Windows requirement**: Windows 10 or later
- **Electron 22+** (October 2022) dropped support for Windows 7/8/8.1

---

## Option 1: Downgrade to Electron 21 (Supports Windows 8.1)

To support Windows 8.1, downgrade to Electron 21.4.4 (the last version to support Windows 8.1):

### Steps:

1. **Install Electron 21:**
   ```bash
   npm install electron@21.4.4 --save-dev
   ```

2. **Test the app:**
   ```bash
   npm run dev
   ```

3. **Build for Windows 8.1:**
   ```bash
   npm run build:all
   ```

### Potential Issues After Downgrade:

- **Node.js compatibility**: Electron 21 uses Node.js 16.x (current uses Node 20+)
- **Chromium features**: Some modern web APIs may not work
- **React 18**: Fully compatible (no issues expected)
- **vosk-browser**: Should work fine
- **say (TTS)**: Should work fine

### Testing Checklist:

After downgrading, test these features:
- ✓ TCP connections (should work)
- ✓ Text chat (should work)
- ✓ Voice recording/transcription (verify Vosk works with older Chromium)
- ✓ Text-to-Speech (should work)
- ✓ File transfers (should work)
- ⚠️ Some CSS animations may behave slightly differently

---

## Option 2: Require Windows 10+ (Recommended)

Keep the current Electron 39 and require Windows 10 or later:

### Advantages:
- ✅ Latest security updates
- ✅ Better performance
- ✅ Modern web APIs
- ✅ Longer support lifecycle
- ✅ No compatibility issues

### Update Documentation:

The system requirements in `USER_GUIDE.md` already state:
- **Minimum**: Windows 10 (64-bit)
- **Recommended**: Windows 10 version 1903 or later

---

## Option 3: Build Two Versions

Create separate builds for different Windows versions:

### For Windows 10+:
```bash
# Keep Electron 39
npm run build:all
```

### For Windows 8.1:
```bash
# Downgrade temporarily
npm install electron@21.4.4 --save-dev
npm run build:all
# Rename output files to include "Win8.1" in filename
# Restore Electron 39 afterwards
```

---

## Comparison Table

| Feature | Electron 39 (Win 10+) | Electron 21 (Win 8.1+) |
|---------|----------------------|------------------------|
| Windows 8.1 Support | ❌ No | ✅ Yes |
| Windows 10 Support | ✅ Yes | ✅ Yes |
| Node.js Version | 20.x | 16.x |
| Chromium Version | 132 | 106 |
| Security Updates | ✅ Active | ⚠️ End of life |
| Modern Web APIs | ✅ Full | ⚠️ Limited |
| Performance | ✅ Better | ⚠️ Slower |

---

## Recommendation

**If you MUST support Windows 8.1:**
- Downgrade to Electron 21.4.4
- Thoroughly test all features (especially voice and file transfer)
- Consider security implications (Electron 21 is no longer maintained)

**If Windows 10+ is acceptable:**
- Keep Electron 39 (current setup)
- Better performance and security
- Longer support lifecycle
- No compatibility testing needed

---

## Windows 8.1 Market Share (2025)

- **Global usage**: < 0.5% of desktop users
- **Windows 8.1 end of support**: January 10, 2023 (Microsoft ended all support)
- **Security risk**: No more security updates from Microsoft

**Most software companies no longer support Windows 8.1 due to:**
- Low market share
- Security vulnerabilities
- Development overhead

---

## Technical Details

### Why Electron Dropped Windows 8.1:

Electron 22+ uses Chromium 106+, which requires:
- Windows 10 SDK
- Modern C++ runtime libraries
- APIs not available in Windows 8.1

### What Doesn't Work on Windows 8.1 with Electron 39:

- App will fail to launch with error: "This app can't run on your PC"
- Even if you try to force it, Chromium will crash immediately

---

## Quick Decision Guide

**Choose Electron 21 (Windows 8.1 support) if:**
- You or your peer are definitely running Windows 8.1
- Cannot upgrade to Windows 10/11
- Accept the security risks

**Choose Electron 39 (Current setup) if:**
- Both users have Windows 10 or later
- Security and performance are priorities
- Want the latest features and updates

---

## How to Check Your Windows Version

1. Press `Windows Key + R`
2. Type `winver` and press Enter
3. A window will show your Windows version:
   - Windows 8.1 → Shows "Version 6.3"
   - Windows 10 → Shows "Version 10.0" with build number
   - Windows 11 → Shows "Version 10.0" with build 22000+

---

## Need Help?

If you choose to downgrade to Electron 21:
1. Run the npm install command above
2. Test with `npm run dev`
3. Report any issues with voice or file features
4. Build and test on actual Windows 8.1 machine

The app's core functionality (TCP chat, file transfer, voice) should work fine on Electron 21, but thorough testing is recommended.
