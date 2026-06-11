# Vosk Integration Example for ChatWindow

This document shows how to integrate the Vosk speech-to-text service into your ChatWindow component.

## Quick Start

### 1. Import the VoskHelper

```typescript
import { createVoskHelper, checkVoskReady, getModelDownloadInstructions } from '../services/vosk-helper'
```

### 2. Add State Variables

```typescript
const [voskHelper, setVoskHelper] = useState<any>(null)
const [isVoskReady, setIsVoskReady] = useState(false)
const [isListening, setIsListening] = useState(false)
const [partialTranscript, setPartialTranscript] = useState('')
```

### 3. Initialize on Component Mount

```typescript
useEffect(() => {
  const initVosk = async () => {
    // Check if Vosk is ready
    const readyCheck = await checkVoskReady()
    if (!readyCheck.ready) {
      console.warn('Vosk not ready:', readyCheck.error)
      // Optionally show download instructions
      const instructions = await getModelDownloadInstructions()
      console.log('Download model:', instructions.downloadUrl)
      return
    }

    // Create helper
    const helper = createVoskHelper({
      sampleRate: 16000,
      onResult: (result) => {
        if (result.text) {
          // Add transcribed text to input field
          setInputText(prev => prev + (prev ? ' ' : '') + result.text)
          setPartialTranscript('')
        }
      },
      onPartialResult: (result) => {
        if (result.partial) {
          setPartialTranscript(result.partial)
        }
      },
      onError: (error) => {
        console.error('Vosk error:', error)
        setIsListening(false)
      },
      onStateChange: (state) => {
        console.log('Vosk state:', state)
        setIsVoskReady(state === 'ready' || state === 'listening')
      }
    })

    // Initialize the helper
    const initialized = await helper.initialize()
    if (initialized) {
      setVoskHelper(helper)
      setIsVoskReady(true)
    }
  }

  initVosk()

  // Cleanup on unmount
  return () => {
    if (voskHelper) {
      voskHelper.cleanup()
    }
  }
}, [])
```

### 4. Add Microphone Button Handler

```typescript
const handleMicrophoneClick = async () => {
  if (!voskHelper || !isVoskReady) {
    console.warn('Vosk not ready')
    return
  }

  if (isListening) {
    // Stop listening
    await voskHelper.stopListening()
    setIsListening(false)
    setPartialTranscript('')
  } else {
    // Start listening
    const started = await voskHelper.startListening()
    if (started) {
      setIsListening(true)
    }
  }
}
```

### 5. Update the Microphone Button

```typescript
<button
  className={`tool-btn ${isListening ? 'listening' : ''}`}
  title={isListening ? 'Stop listening' : 'Push to talk'}
  onClick={handleMicrophoneClick}
  disabled={!isVoskReady}
>
  🎤
</button>
```

### 6. Show Partial Transcription (Optional)

```typescript
{isListening && partialTranscript && (
  <div className="partial-transcript">
    <span className="partial-label">Listening:</span>
    {partialTranscript}
  </div>
)}
```

## Complete Example Integration

Here's a more complete example showing how to integrate all the pieces:

```typescript
import { useState, useEffect, useRef } from 'react'
import { createVoskHelper, checkVoskReady, getModelDownloadInstructions } from '../services/vosk-helper'

function ChatWindow({ userIdentity, connectionConfig, onDisconnect }: Props) {
  // Existing state...
  const [inputText, setInputText] = useState('')

  // Vosk state
  const [voskHelper, setVoskHelper] = useState<any>(null)
  const [isVoskReady, setIsVoskReady] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [partialTranscript, setPartialTranscript] = useState('')

  // Initialize Vosk
  useEffect(() => {
    let helper: any = null

    const initVosk = async () => {
      try {
        // Check if model is ready
        const readyCheck = await checkVoskReady()
        if (!readyCheck.ready) {
          console.warn('Vosk model not found:', readyCheck.error)
          const instructions = await getModelDownloadInstructions()
          console.log('To use speech-to-text, download the model from:')
          console.log(instructions.downloadUrl)
          return
        }

        // Create Vosk helper with callbacks
        helper = createVoskHelper({
          sampleRate: 16000,
          onResult: (result) => {
            console.log('Final transcription:', result.text)
            if (result.text && result.text.trim()) {
              // Add transcribed text to input
              setInputText(prev => {
                const text = prev.trim()
                return text ? `${text} ${result.text}` : result.text
              })
              setPartialTranscript('')
            }
          },
          onPartialResult: (result) => {
            if (result.partial) {
              setPartialTranscript(result.partial)
            }
          },
          onError: (error) => {
            console.error('Vosk error:', error)
            setIsListening(false)
            setPartialTranscript('')
            // Optionally show error to user
            addSystemMessage(`Speech recognition error: ${error}`)
          },
          onStateChange: (state) => {
            console.log('Vosk state changed:', state)
            const ready = state === 'ready' || state === 'listening'
            setIsVoskReady(ready)
          }
        })

        // Initialize
        const initialized = await helper.initialize()
        if (initialized) {
          setVoskHelper(helper)
          setIsVoskReady(true)
          console.log('Vosk initialized successfully')
        }
      } catch (error) {
        console.error('Failed to initialize Vosk:', error)
      }
    }

    initVosk()

    // Cleanup
    return () => {
      if (helper) {
        helper.cleanup()
      }
    }
  }, [])

  // Handle microphone button click
  const handleMicrophoneClick = async () => {
    if (!voskHelper || !isVoskReady) {
      console.warn('Vosk not ready')
      // Optionally show message to user
      addSystemMessage('Speech recognition not available. Please download the Vosk model.')
      return
    }

    if (isListening) {
      // Stop listening
      await voskHelper.stopListening()
      setIsListening(false)
      setPartialTranscript('')
    } else {
      // Start listening
      const started = await voskHelper.startListening()
      if (started) {
        setIsListening(true)
      } else {
        addSystemMessage('Failed to start speech recognition. Check microphone permissions.')
      }
    }
  }

  return (
    <div className="chat-window">
      {/* Existing JSX... */}

      {/* Voice listening indicator */}
      {isListening && (
        <div className="voice-indicator">
          🎤 Listening...
          {partialTranscript && (
            <span className="partial-text">{partialTranscript}</span>
          )}
          <button className="cancel-btn" onClick={handleMicrophoneClick}>
            Stop
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="input-area">
        <div className="input-wrapper">
          <textarea
            className="input-field"
            placeholder="Type your message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            rows={1}
          />
          <div className="input-tools">
            <button className="tool-btn" title="Attach file">📎</button>
            <button
              className={`tool-btn ${isListening ? 'active' : ''}`}
              title={isListening ? 'Stop recording' : 'Push to talk'}
              onClick={handleMicrophoneClick}
              disabled={!isVoskReady}
              style={{
                backgroundColor: isListening ? '#ff4444' : undefined,
                color: isListening ? 'white' : undefined
              }}
            >
              🎤
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

## CSS Styling (Optional)

Add these styles to make the listening state more visible:

```css
/* Voice indicator */
.voice-indicator {
  position: absolute;
  top: 60px;
  left: 0;
  right: 0;
  background: #4CAF50;
  color: white;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 100;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

.voice-indicator .partial-text {
  flex: 1;
  font-style: italic;
  opacity: 0.9;
}

.voice-indicator .cancel-btn {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.4);
  color: white;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.voice-indicator .cancel-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Active microphone button */
.tool-btn.active {
  background: #ff4444;
  color: white;
  animation: pulse 1.5s ease-in-out infinite;
}

.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

## Testing

1. **Verify model is downloaded**:
   ```typescript
   const modelInfo = await window.electronAPI.voskGetModelInfo()
   console.log('Model exists:', modelInfo.exists)
   console.log('Model path:', modelInfo.path)
   ```

2. **Test microphone access**:
   ```typescript
   const devices = await navigator.mediaDevices.enumerateDevices()
   const audioInputs = devices.filter(d => d.kind === 'audioinput')
   console.log('Available microphones:', audioInputs)
   ```

3. **Check permissions**:
   - Click the microphone button
   - Allow microphone access when prompted
   - Speak clearly and wait for transcription

## Troubleshooting

### Model Not Found
- Download the model as described in VOSK_SETUP.md
- Place it in `D:\RLRChatAppOct2025\models\vosk-model-small-en-us-0.15\`

### Microphone Not Working
- Check browser/Electron permissions
- Try a different audio input device
- Ensure no other app is using the microphone

### No Transcription
- Speak clearly and not too fast
- Ensure there's no excessive background noise
- Check console for errors

### Build Errors
- Ensure vosk-browser is installed: `npm install vosk-browser`
- Check that all imports are correct
- Verify TypeScript types are properly defined

## Next Steps

1. Test the integration thoroughly
2. Add error handling and user feedback
3. Consider adding a settings panel for Vosk configuration
4. Implement push-to-talk vs continuous listening modes
5. Add support for other language models
