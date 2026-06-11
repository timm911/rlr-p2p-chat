# Vosk Quick Reference Card

## Download Model First!

```bash
# 1. Download from:
https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip

# 2. Extract to:
D:\RLRChatAppOct2025\models\vosk-model-small-en-us-0.15\
```

## Import in React Component

```typescript
import { createVoskHelper } from '../services/vosk-helper'
```

## Basic Setup (Add to ChatWindow.tsx)

```typescript
// 1. Add state
const [voskHelper, setVoskHelper] = useState<any>(null)
const [isListening, setIsListening] = useState(false)

// 2. Initialize on mount
useEffect(() => {
  const helper = createVoskHelper({
    onResult: (result) => {
      setInputText(prev => prev + ' ' + result.text)
    },
    onError: (error) => console.error(error)
  })

  helper.initialize().then(() => setVoskHelper(helper))

  return () => helper?.cleanup()
}, [])

// 3. Wire up microphone button
const handleMicClick = async () => {
  if (isListening) {
    await voskHelper.stopListening()
    setIsListening(false)
  } else {
    await voskHelper.startListening()
    setIsListening(true)
  }
}

// 4. Update button
<button onClick={handleMicClick}>🎤</button>
```

## API Reference

### VoskHelper Methods
```typescript
await helper.initialize()           // Load model
await helper.startListening()       // Start recognition
await helper.stopListening()        // Stop recognition
await helper.cleanup()              // Release resources
helper.getIsListening()             // Check state
helper.getIsInitialized()           // Check if ready
```

### Window API Methods
```typescript
await window.electronAPI.voskCheckModel()
await window.electronAPI.voskTestReady()
await window.electronAPI.voskGetModelInfo()
await window.electronAPI.voskStartListening()
await window.electronAPI.voskStopListening()
```

### Callbacks
```typescript
createVoskHelper({
  onResult: (result) => {
    // Final transcription
    console.log(result.text)
  },
  onPartialResult: (result) => {
    // Real-time feedback
    console.log(result.partial)
  },
  onError: (error) => {
    // Handle errors
    console.error(error)
  },
  onStateChange: (state) => {
    // Track state: idle, initializing, ready, listening, error
    console.log(state)
  }
})
```

## Files Location

```
D:\RLRChatAppOct2025\
├── models\                                    # Put model here
│   └── vosk-model-small-en-us-0.15\
├── src\
│   ├── main\
│   │   ├── services\
│   │   │   └── vosk.ts                       # Main service
│   │   └── ipc\
│   │       └── handlers.ts                   # IPC handlers
│   ├── preload\
│   │   └── index.ts                          # Preload bridge
│   └── renderer\
│       └── services\
│           └── vosk-helper.ts                # Renderer helper
├── VOSK_SETUP.md                             # Full setup guide
├── VOSK_INTEGRATION_EXAMPLE.md               # Integration example
└── VOSK_IMPLEMENTATION_SUMMARY.md            # Implementation details
```

## Test Commands

```typescript
// Check if model exists
const check = await window.electronAPI.voskCheckModel()
console.log(check.exists, check.path)

// Get model info
const info = await window.electronAPI.voskGetModelInfo()
console.log(info)

// Test if ready
const ready = await window.electronAPI.voskTestReady()
console.log(ready.ready, ready.error)
```

## Build & Run

```bash
npm run build    # Build project
npm run dev      # Run in development
```

## Common Issues

**Model not found?**
- Download: https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
- Extract to: `models/vosk-model-small-en-us-0.15/`

**No microphone access?**
- Check Electron permissions
- Allow microphone when prompted

**No transcription?**
- Speak clearly
- Check console for errors
- Verify model is loaded

## Architecture

```
User speaks → Microphone
              ↓
          Web Audio API (Renderer)
              ↓
          vosk-browser (WebAssembly)
              ↓
          VoskHelper callbacks
              ↓
          Update input text
```

## State Flow

```
idle → initializing → ready → listening → ready
         ↓                         ↓
       error                    error
```

## Memory Usage

- Model: ~40 MB
- Audio buffer: ~16 KB
- Total: ~50 MB

## Packages

```json
{
  "vosk-browser": "^0.0.8"  // Already installed
}
```

No additional packages needed!

## Next Steps

1. Download model
2. Add code to ChatWindow.tsx
3. Test microphone button
4. Enjoy speech-to-text!

---

**For detailed information, see:**
- VOSK_SETUP.md
- VOSK_INTEGRATION_EXAMPLE.md
- VOSK_IMPLEMENTATION_SUMMARY.md
