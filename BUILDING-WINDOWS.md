# Building on Windows - Quick Start

## Known Issue: Symlink Permission Error

When building on Windows, you may encounter this error:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
```

This is a common Windows permission issue with electron-builder's code signing tools.

## Solutions (Choose One)

### Solution 1: Enable Developer Mode (Recommended)

1. Open **Windows Settings**
2. Go to **Update & Security** > **For developers**
3. Turn on **Developer Mode**
4. Restart your terminal/IDE
5. Run the build again:
   ```bash
   npm run build:nsis
   ```

### Solution 2: Run as Administrator

1. Close your current terminal
2. Right-click **Command Prompt** or **PowerShell**
3. Select **Run as administrator**
4. Navigate to project directory:
   ```bash
   cd D:\RLRChatAppOct2025
   ```
5. Run the build:
   ```bash
   npm run build:nsis
   ```

### Solution 3: Manual Cache Fix

If you still encounter issues after trying solutions 1 and 2:

```bash
# Fix the cache
npm run clean-cache

# Then rebuild
npm run build:nsis
```

## Quick Build Commands

```bash
# Build NSIS installer
npm run build:nsis

# Build portable version
npm run build:portable

# Build both
npm run build:all
```

## Output Location

After a successful build, find your installers in:
```
D:\RLRChatAppOct2025\release\
```

Files:
- `RLR P2P Chat-Setup-1.0.0.exe` - NSIS installer
- `RLR P2P Chat-Portable-1.0.0.exe` - Portable version

## Need Help?

See the complete guide: [BUILD.md](./BUILD.md)
