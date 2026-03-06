## Why

Pi's interactive TUI currently requires manual typing for all user input. Voice input would dramatically speed up prompt authoring — especially for long or complex instructions — and improve accessibility. Local transcription via sherpa-onnx provides fast, private, offline speech-to-text without API keys or network dependency. sherpa-onnx has native Node.js bindings (`sherpa-onnx-node` on npm) with prebuilt binaries for macOS, Linux, and Windows — no Python, no MLX, no compilation required. It supports true real-time streaming ASR with partial results, making it ideal for live dictation. A hold-to-talk interaction (spacebar) makes it natural and intentional, avoiding always-on microphone concerns.

## What Changes

- New Pi extension that captures microphone audio while the user holds a configurable hotkey (spacebar by default)
- Audio is captured via `naudiodon2` (PortAudio bindings for Node.js) and streamed directly to sherpa-onnx's `OnlineRecognizer` — all in-process, no subprocess needed
- sherpa-onnx decodes audio in real-time, providing partial (in-progress) and finalized text segments via its streaming API
- Transcribed text appears live in Pi's prompt editor as the user speaks — finalized text is committed, partial text shown as a draft preview
- Visual indicators show recording state (🎙️ recording), live transcription, and errors via Pi's widget and status APIs
- The extension manages model loading (lazy, on first use) and cleanup on session shutdown
- Configurable settings: hotkey, model selection, endpoint detection sensitivity
- A setup command (`/transcribe-setup`) downloads the required model files on first use

## Capabilities

### New Capabilities
- `audio-capture`: Capturing microphone audio via a hold-to-talk keyboard shortcut using naudiodon2/PortAudio, buffering PCM samples at 16kHz, and managing the recording lifecycle (start on key-down, stop on key-up, cancel on escape)
- `transcription-engine`: Managing the sherpa-onnx OnlineRecognizer in-process — loading streaming ASR models (e.g., zipformer transducer or CTC), feeding audio samples, decoding in real-time, distinguishing partial results from finalized segments via endpoint detection, and resetting the stream between utterances
- `editor-integration`: Inserting live transcription text into Pi's prompt editor — finalized text appended incrementally, partial/draft text shown transiently — with visual status indicators (widget above editor showing recording state + live transcript, status bar showing engine state)

### Modified Capabilities
<!-- No existing specs to modify — this is a greenfield project -->

## Impact

- **Dependencies**: `sherpa-onnx-node` (npm, prebuilt native addon for macOS/Linux/Windows), `naudiodon2` (npm, PortAudio bindings for mic capture). Both install via npm with no system-level prerequisites beyond a working audio device. Model files (~30-80MB for streaming models) downloaded on first setup.
- **Platform**: macOS (arm64 + x64), Linux (x64, arm64), Windows (x64). sherpa-onnx provides prebuilt binaries for all major platforms. The extension should detect platform support and notify users of any issues.
- **Pi APIs used**: `registerShortcut` (hold-to-talk hotkey), `setWidget` (recording/transcription indicator above editor), `setStatus` (footer status for engine state), `setEditorText`/`getEditorText` (live text insertion), `registerCommand` (`/transcribe-setup` for model download, `/transcribe` toggle), `on("session_start")`/`on("session_shutdown")` (lifecycle management), `notify` (error reporting)
- **System resources**: Microphone access permission, ~30-80MB disk for streaming model weights, minimal CPU during transcription (sherpa-onnx is highly optimized, runs real-time on modest hardware)
- **No breaking changes** — this is an additive extension with no modifications to Pi core
