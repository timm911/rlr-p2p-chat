# Whisper Feasibility for RLR P2P Chat (Windows 8.1)

**Question:** Windows SAPI speech recognition is poor on RLRJupiter's Windows 8.1
machine. Is OpenAI Whisper possible as a replacement?

**Short answer:** Whisper *can* run on Windows 8.1, but **not as live dictation
on 2013-era hardware** — and live dictation is exactly what the "Talk to me"
auto-response flow needs. **Vosk was integrated instead** (see below), which
gives real-time streaming recognition with much better accuracy than SAPI.

## Why Whisper doesn't fit this app

1. **CPU instruction requirements.** Official whisper.cpp Windows binaries are
   built with AVX2 + FMA + F16C enabled. CPUs older than Intel Haswell
   (mid-2013) crash with an illegal instruction — silently. Ivy Bridge/Sandy
   Bridge machines (most likely for a Win8.1 holdout) require a custom no-AVX2
   build, which runs 2–4× slower.
   ([whisper.cpp discussion #1793](https://github.com/ggml-org/whisper.cpp/discussions/1793))

2. **Not a streaming recognizer.** Whisper transcribes audio windows, not a
   live stream. The `whisper-stream` tool fakes streaming by re-transcribing a
   sliding window every ~500ms; on old hardware with the tiny.en model the
   text arrives in chunks **1–3+ seconds behind speech** (or worse without
   AVX2). There are no instant partial results, so the live "text appears as
   you speak" UX degrades badly.

3. **In-renderer Whisper is ruled out.** Electron 21 = Chromium 106, which has
   no WebGPU. Whisper via WASM (whisper.wasm or transformers.js) on a 2013 CPU
   runs far below real time.
   ([whisper.wasm README](https://github.com/ggml-org/whisper.cpp/blob/master/examples/whisper.wasm/README.md))

## When Whisper WOULD be viable here

- **Push-to-talk, utterance-at-a-time** transcription (speak → release → wait
  ~2–5s → text appears), spawning `whisper-cli` with **tiny.en** (75MB model,
  ~273MB RAM) from the main process.
- Only if the CPU is **Haswell (2013) or newer** for official binaries; older
  CPUs need a custom `-DGGML_AVX2=OFF -DGGML_FMA=OFF -DGGML_F16C=OFF` build
  (or the prebuilt DLLs from `Whisper.net.Runtime.NoAvx`).

This could be added later as a third engine for high-accuracy non-realtime
notes, but it cannot replace the live dictation engine.

## What was done instead: Vosk

**Vosk small-en-us-0.15** is now the default recognition engine
(`Settings → Speech Recognition → Recognition engine`):

| | Vosk (integrated) | Whisper | Windows SAPI |
|---|---|---|---|
| Works on Win 8.1 | ✅ | ⚠️ build-dependent | ✅ |
| Old CPUs (no AVX) | ✅ no SIMD requirements | ❌ crash or very slow | ✅ |
| Real-time partial results | ✅ word-by-word | ❌ chunked, seconds behind | ✅ |
| Accuracy | Good (WER ~9.85 librispeech) | Best | Poor |
| Offline | ✅ | ✅ | ✅ |
| Model size | 40 MB (bundled) | 75–142 MB | built-in |

Implementation notes:
- `src/renderer/services/vosk-speech-service.ts` — vosk-browser (WASM) running
  in the renderer; no native DLLs, no SharedArrayBuffer requirement, works in
  Chromium 106 / Electron 21.
- Model is bundled in the installer (`extraResources` in electron-builder.yml)
  and delivered to the renderer over IPC as a Blob (the renderer cannot
  `fetch()` file:// URLs in a packaged build).
- The recognizer is created at the AudioContext's real sample rate
  (44.1/48kHz) — creating it at 16kHz is a known way to get garbage output
  ([vosk-browser issue #52](https://github.com/ccoreilly/vosk-browser/issues/52)).
- Windows SAPI remains as automatic fallback (model missing, mic blocked) and
  as a manual setting.

**Last Updated:** June 10, 2026
