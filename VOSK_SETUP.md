# Vosk Speech-to-Text Setup Guide

This document provides instructions for setting up and using Vosk offline speech recognition in the RLR P2P Chat application.

## Overview

The Vosk speech-to-text implementation uses a hybrid architecture:
- **Main Process**: VoskService coordinates state management and provides helper functions
- **Renderer Process**: Uses `vosk-browser` (WebAssembly) for actual speech recognition
- **IPC Bridge**: Connects the two processes for seamless communication

## Installation

### 1. Package Dependencies

The required package `vosk-browser` is already installed in `package.json`:

```json
"dependencies": {
  "vosk-browser": "^0.0.8"
}
```

### 2. Download the Vosk Model

The application requires the **vosk-model-small-en-us-0.15** model for English speech recognition.

#### Download Instructions:

1. **Download the model**:
   - Visit: https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
   - Size: ~40 MB (compressed)

2. **Extract the model**:
   - Extract the ZIP file
   - You should have a folder named `vosk-model-small-en-us-0.15`

3. **Place the model in the correct location**:

   **For Development:**
   ```
   D:\RLRChatAppOct2025\models\vosk-model-small-en-us-0.15\
   ```

   **For Production (packaged app):**
   ```
   {app-location}\models\vosk-model-small-en-us-0.15\
   ```

4. **Verify the model structure**:
   The extracted folder should contain:
   ```
   vosk-model-small-en-us-0.15/
   ├── am/
   ├── conf/
   │   └── mfcc.conf
   ├── graph/
   ├── ivector/
   └── README
   ```

## Architecture

### Main Process Service (D:\RLRChatAppOct2025\src\main\services\vosk.ts)

The `VoskService` class provides:
- Model path validation and verification
- State management (idle, initializing, ready, listening, error)
- Configuration management
- Event coordination between main and renderer processes

### IPC Handlers (D:\RLRChatAppOct2025\src\main\ipc\handlers.ts)

Added handlers for:
- `vosk:get-config` - Get current configuration
- `vosk:configure` - Update configuration
- `vosk:check-model` - Verify model exists
- `vosk:get-model-path` - Get path to model
- `vosk:get-model-info` - Get detailed model information
- `vosk:test-ready` - Test if Vosk is ready to use
- `vosk:start-listening` - Begin speech recognition
- `vosk:stop-listening` - Stop speech recognition
- `vosk:is-listening` - Check listening state
- And more...

### Preload Bridge (D:\RLRChatAppOpt2025\src\preload\index.ts)

Exposes Vosk functions to renderer through `window.electronAPI`:
- `voskGetConfig()`
- `voskStartListening()`
- `voskStopListening()`
- `onVoskResult(callback)`
- `onVoskPartialResult(callback)`
- And more...

## Usage in Renderer Process

### Basic Implementation Example

```typescript
// Import vosk-browser in your React component
import { createModel, createRecognizer } from 'vosk-browser'

// 1. Initialize Vosk
async function initializeVosk() {
  try {
    // Check if model exists
    const modelCheck = await window.electronAPI.voskCheckModel()
    if (!modelCheck.exists) {
      console.error('Model not found:', modelCheck.error)
      const instructions = await window.electronAPI.voskGetDownloadInstructions()
      console.log('Download instructions:', instructions)
      return
    }

    // Get model path from main process
    const modelPath = await window.electronAPI.voskGetModelPath()

    // Load the model (vosk-browser)
    const model = await createModel(modelPath)

    // Create recognizer with sample rate
    const recognizer = await createRecognizer(model, 16000)

    // Set state to ready
    await window.electronAPI.voskSetState('ready')

    return { model, recognizer }
  } catch (error) {
    console.error('Failed to initialize Vosk:', error)
    await window.electronAPI.voskHandleError(error.message)
  }
}

// 2. Start listening
async function startListening(recognizer) {
  try {
    // Notify main process
    await window.electronAPI.voskStartListening()

    // Get microphone access
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1
      }
    })

    // Setup audio processing
    const audioContext = new AudioContext({ sampleRate: 16000 })
    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)

    processor.onaudioprocess = (event) => {
      const audioData = event.inputBuffer.getChannelData(0)
      recognizer.acceptWaveform(audioData)
    }

    source.connect(processor)
    processor.connect(audioContext.destination)

    // Handle results
    recognizer.on('result', async (result) => {
      console.log('Final result:', result.text)
      await window.electronAPI.voskHandleResult(result)
    })

    recognizer.on('partialresult', async (result) => {
      console.log('Partial result:', result.partial)
      await window.electronAPI.voskHandlePartialResult(result)
    })

    return { stream, audioContext, processor }
  } catch (error) {
    console.error('Failed to start listening:', error)
    await window.electronAPI.voskHandleError(error.message)
  }
}

// 3. Stop listening
async function stopListening(audioComponents) {
  try {
    const { stream, audioContext, processor } = audioComponents

    // Stop audio processing
    processor.disconnect()
    stream.getTracks().forEach(track => track.stop())
    await audioContext.close()

    // Notify main process
    await window.electronAPI.voskStopListening()
  } catch (error) {
    console.error('Failed to stop listening:', error)
  }
}
```

### Event Listeners

```typescript
// Listen for state changes
window.electronAPI.onVoskStateChanged((data) => {
  console.log('Vosk state changed:', data.oldState, '->', data.newState)
})

// Listen for final results
window.electronAPI.onVoskResult((result) => {
  console.log('Transcription:', result.text)
  // Use the transcribed text in your chat input
})

// Listen for partial results (real-time feedback)
window.electronAPI.onVoskPartialResult((result) => {
  console.log('Partial:', result.partial)
  // Show partial transcription while user is speaking
})

// Listen for errors
window.electronAPI.onVoskError((error) => {
  console.error('Vosk error:', error)
})
```

## Configuration

### VoskConfig Interface

```typescript
interface VoskConfig {
  modelPath?: string        // Path to Vosk model
  sampleRate?: number       // Audio sample rate (default: 16000)
  enabled?: boolean         // Enable/disable Vosk
  language?: string         // Language code (default: 'en-us')
}
```

### Configure Vosk

```typescript
await window.electronAPI.voskConfigure({
  enabled: true,
  sampleRate: 16000,
  language: 'en-us'
})
```

## Testing

### Check if Vosk is Ready

```typescript
const readyCheck = await window.electronAPI.voskTestReady()
if (readyCheck.ready) {
  console.log('Vosk is ready to use!')
} else {
  console.error('Vosk not ready:', readyCheck.error)
}
```

### Get Model Information

```typescript
const modelInfo = await window.electronAPI.voskGetModelInfo()
console.log('Model:', modelInfo.name)
console.log('Path:', modelInfo.path)
console.log('Exists:', modelInfo.exists)
console.log('Sample Rate:', modelInfo.sampleRate)
```

## Troubleshooting

### Model Not Found

If you get a "Model not found" error:

1. Verify the model is in the correct location:
   ```
   D:\RLRChatAppOct2025\models\vosk-model-small-en-us-0.15\
   ```

2. Check the folder structure:
   ```typescript
   const modelInfo = await window.electronAPI.voskGetModelInfo()
   console.log(modelInfo)
   ```

3. Get download instructions:
   ```typescript
   const instructions = await window.electronAPI.voskGetDownloadInstructions()
   console.log(instructions)
   ```

### Microphone Access Issues

If microphone access fails:

1. Check browser/Electron permissions
2. Verify audio device is available:
   ```typescript
   const devices = await navigator.mediaDevices.enumerateDevices()
   const audioInputs = devices.filter(d => d.kind === 'audioinput')
   console.log('Audio inputs:', audioInputs)
   ```

### Recognition Not Working

If recognition doesn't produce results:

1. Verify the model is loaded correctly
2. Check the sample rate matches (16000 Hz)
3. Ensure audio data is being sent to the recognizer
4. Check for errors in the console

## Files Created

1. **D:\RLRChatAppOct2025\src\main\services\vosk.ts**
   - VoskService class
   - State management
   - Model validation
   - Event coordination

2. **D:\RLRChatAppOct2025\src\main\ipc\handlers.ts** (updated)
   - Added Vosk IPC handlers
   - Event forwarding

3. **D:\RLRChatAppOct2025\src\preload\index.ts** (updated)
   - Exposed Vosk functions to renderer
   - TypeScript type definitions

4. **D:\RLRChatAppOct2025\models\** (directory created)
   - Location for Vosk models

## Next Steps

To complete the integration:

1. **Download the Vosk model** following the instructions above
2. **Implement the renderer-side logic** in your React component (e.g., ChatWindow.tsx)
3. **Wire up the microphone button** to call the Vosk functions
4. **Test the speech recognition** in development mode
5. **Package the model** with your production build

## Additional Models

For other languages or improved accuracy, see:
https://alphacephei.com/vosk/models

Models available for:
- English (various sizes)
- Spanish, French, German, Italian
- Russian, Chinese, Japanese
- And many more...

Each model can be placed in the `models` directory and configured via `voskConfigure()`.

## Support

For issues with:
- **Vosk library**: https://github.com/alphacep/vosk-api
- **vosk-browser**: https://github.com/ccoreilly/vosk-browser
- **This implementation**: Check the service code in `src/main/services/vosk.ts`
