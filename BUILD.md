# RLR P2P Chat - Build Documentation

This document describes how to build distributable Windows installers for the RLR P2P Chat application.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Build Configuration](#build-configuration)
- [Building the Application](#building-the-application)
- [Build Outputs](#build-outputs)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software
- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** (optional, for version control)

### Windows-Specific Requirements
- **Windows 8.1/10/11** (64-bit)
  - The app uses Electron 21.4.4 which supports Windows 8.1 and later
- **Visual Studio Build Tools** (for native modules like `canvas`)
  - Install via: `npm install --global windows-build-tools` (as Administrator)
  - Or download Visual Studio Community with "Desktop development with C++" workload

### Optional Tools
- **ImageMagick** - For icon conversion (if you need to regenerate icons)
  - Download from: https://imagemagick.org/script/download.php
- **Developer Mode** (Windows) - To avoid symlink permission issues
  - Settings > Update & Security > For developers > Developer Mode: ON

## Project Structure

```
RLRChatAppOct2025/
├── src/
│   ├── main/          # Electron main process
│   ├── preload/       # Preload scripts
│   └── renderer/      # React frontend
├── models/            # Legacy Vosk speech models (no longer required)
├── build/             # Build resources
│   └── icons/         # Application icons
├── dist-electron/     # Compiled Electron code
├── out/               # Compiled renderer code
├── release/           # Final build output
├── electron-builder.yml  # Build configuration
└── package.json       # Project dependencies and scripts
```

## Build Configuration

The build configuration is defined in `electron-builder.yml`:

- **App ID**: com.rlr.p2pchat
- **Product Name**: RLR P2P Chat
- **Targets**:
  - NSIS Installer (Setup.exe)
  - Portable executable
- **Included Resources**:
  - All application code
  - PowerShell bridge generated at runtime (no external speech models required)
  - Node modules

### Icon Files

Application icons are located in `build/icons/`:
- `icon.ico` - Windows installer and app icon (256x256)
- `icon.svg` - Source SVG for regeneration
- `icon-*.png` - PNG versions in multiple sizes

## Building the Application

### Step 1: Install Dependencies

```bash
cd D:\RLRChatAppOct2025
npm install
```

### Step 2: Build for Production

#### Option A: Build Both NSIS and Portable

```bash
npm run build:all
```

This will:
1. Build the Electron app with electron-vite
2. Create both NSIS installer and portable version
3. Output to `release/` directory

#### Option B: Build NSIS Installer Only

```bash
npm run build:nsis
```

#### Option C: Build Portable Version Only

```bash
npm run build:portable
```

#### Option D: Quick Build Command

```bash
npm run build:win
```

### Build Scripts Reference

```json
{
  "build": "electron-vite build",                    // Build app code only
  "build:win": "npm run build && electron-builder --win",
  "build:nsis": "npm run build && electron-builder --win nsis",
  "build:portable": "npm run build && electron-builder --win portable",
  "build:all": "npm run build && electron-builder --win"
}
```

## Build Outputs

After a successful build, you'll find the following in the `release/` directory:

### NSIS Installer
- **Filename**: `RLR P2P Chat-Setup-1.0.0.exe`
- **Type**: Windows installer with install wizard
- **Features**:
  - Custom installation directory
  - Desktop shortcut creation
  - Start Menu integration
  - Uninstaller included

### Portable Version
- **Filename**: `RLR P2P Chat-Portable-1.0.0.exe`
- **Type**: Standalone executable
- **Features**:
  - No installation required
  - Run from USB or any directory
  - Self-contained

### Unpacked Directory
- **Location**: `release/win-unpacked/`
- **Contents**: All application files before packaging
- **Use**: Testing, debugging, or manual distribution

## Troubleshooting

### Common Issues and Solutions

#### 1. Symlink Permission Error (winCodeSign)

**Error:**
```
ERROR: Cannot create symbolic link : A required privilege is not held by the client
```

**Solutions:**

**A. Enable Windows Developer Mode** (Recommended)
1. Open Windows Settings
2. Go to: Update & Security > For developers
3. Enable "Developer Mode"
4. Restart your terminal/IDE
5. Retry the build

**B. Run as Administrator**
```bash
# Open PowerShell or Command Prompt as Administrator
cd D:\RLRChatAppOct2025
npm run build:nsis
```

**C. Fix Cache Manually**
```bash
# Fix the winCodeSign cache
node scripts/fix-winsign-cache.js
# Then retry build
npm run build:nsis
```

**D. Clean and Rebuild**
```bash
# Clear electron-builder cache
npm run clean-cache
# Or manually:
rm -rf C:\Users\<YourUsername>\AppData\Local\electron-builder\Cache
# Then rebuild
npm install
npm run build:nsis
```

#### 2. Native Module Build Errors

**Error:**
```
Error: Cannot find module 'canvas'
```

**Solution:**
```bash
# Install Visual Studio Build Tools
npm install --global windows-build-tools

# Rebuild native modules
npm rebuild

# Or reinstall canvas
npm uninstall canvas
npm install canvas
```

#### 3. Speech Recognition Fails to Start

**Symptoms:** Push-to-talk never shows the listening banner or immediately reports an error.

**Checks:**
- Confirm the Windows **Speech Recognition** and **Dictation** features are installed for the current language.
- Run PowerShell and ensure execution policy allows local scripts:
  ```powershell
  Get-ExecutionPolicy
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
  ```
- Try launching Windows Speech Recognition (`control speech`) to verify the OS can access the microphone.
- If the microphone is blocked by security policies, whitelist `powershell.exe` for audio capture.

#### 4. Icon File Missing

**Error:**
```
Icon file not found: build/icons/icon.ico
```

**Solution:**
```bash
# Regenerate icon
node build/icons/create-ico.js
node build/icons/png-to-ico.js

# Or manually create icon.ico and place in build/icons/
```

#### 5. Build Size Too Large

**Issue:** Output is over 500MB

**Solutions:**
- Remove `node_modules` before building (electron-builder will include only necessary modules)
- Use `.npmrc` with `production=true`
- Check `files` configuration in `electron-builder.yml` to exclude unnecessary files

```yml
files:
  - "!**/.git"
  - "!**/.vscode"
  - "!**/test"
  - "!**/tests"
```

#### 6. Application Won't Start After Install

**Symptoms:** Installer succeeds but app doesn't launch

**Debugging:**
```bash
# Run from unpacked directory to see errors
cd release/win-unpacked
"RLR P2P Chat.exe"

# Check Windows Event Viewer for crash logs
# eventvwr.msc > Windows Logs > Application
```

**Common Causes:**
- Missing dependencies in `package.json`
- Native modules not properly packaged
- Paths not resolved correctly (use `app.getPath()` in main process)

### Clean Build

If you encounter persistent issues, perform a clean build:

```bash
# 1. Remove all build artifacts
rm -rf dist-electron out release

# 2. Clear node_modules
rm -rf node_modules

# 3. Clear npm cache
npm cache clean --force

# 4. Clear electron-builder cache
rm -rf $APPDATA/electron-builder/Cache

# 5. Reinstall and rebuild
npm install
npm run build:all
```

### Getting Help

If you continue to experience issues:

1. Check the [electron-builder documentation](https://www.electron.build/)
2. Review error logs in `release/builder-debug.yml`
3. Search [electron-builder issues](https://github.com/electron-userland/electron-builder/issues)
4. Verify your `electron-builder.yml` configuration

## Advanced Configuration

### Code Signing (Optional)

To sign your application for production:

1. Obtain a code signing certificate
2. Configure in `electron-builder.yml`:

```yml
win:
  certificateFile: path/to/cert.pfx
  certificatePassword: ${env.WIN_CSC_KEY_PASSWORD}
```

3. Set environment variable:
```bash
set WIN_CSC_KEY_PASSWORD=your_password
npm run build:nsis
```

### Auto-Updates

To enable auto-updates:

1. Configure a release server
2. Add to `electron-builder.yml`:

```yml
publish:
  provider: generic
  url: https://your-release-server.com/releases
```

3. Implement update logic in main process using `electron-updater`

## Testing the Build

### Before Distribution

1. **Test Installation**
   ```bash
   # Install from the NSIS installer
   release/"RLR P2P Chat-Setup-1.0.0.exe"
   ```

2. **Test Portable Version**
   ```bash
   # Run portable exe directly
   release/"RLR P2P Chat-Portable-1.0.0.exe"
   ```

3. **Verify Features**
   - Application launches correctly
   - Push-to-talk activates Windows speech recognition and returns text
   - TTS functionality works
   - P2P connections establish
   - UI renders properly

4. **Test Uninstallation** (for NSIS installer)
   - Use Windows "Add or Remove Programs"
   - Verify complete removal

### Distribution Checklist

- [ ] Application version updated in `package.json`
- [ ] CHANGELOG.md updated with release notes
- [ ] All tests passing (`npm test`)
- [ ] Icons and branding correct
- [ ] Build succeeds on clean machine
- [ ] Installer tested on fresh Windows installation
- [ ] File associations working (if applicable)
- [ ] README.md included in release

## Build Performance

Typical build times (on modern hardware):
- **Initial build**: 3-5 minutes
- **Incremental build**: 30-60 seconds
- **Clean build**: 5-7 minutes

To improve build performance:
- Use SSD for project directory
- Exclude project folder from antivirus scanning
- Close unnecessary applications
- Use `--dir` flag for testing (skips compression)

## Version Management

Update version before building:

```bash
# Update version in package.json
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0

# Then build
npm run build:all
```

## Support

For additional support:
- **Project Repository**: [GitHub URL]
- **Issues**: [GitHub Issues URL]
- **Documentation**: See README.md
- **Contact**: RLRJupiter & Ripster

---

**Last Updated**: October 30, 2025
**Version**: 1.0.0
