## Context

Pi is a terminal-based coding agent with a rich extension API. Extensions can register keyboard shortcuts, manipulate the editor, display widgets, and run native code. This extension adds voice-to-text dictation: the user holds a key, speaks, and their words appear live in the prompt editor.

The extension is a Pi package (directory-style extension with `package.json` + `node_modules/`) that uses two npm native addons:
- **sherpa-onnx-node**: Streaming ASR engine with prebuilt binaries for all major platforms
- **naudiodon2**: PortAudio bindings for microphone capture in Node.js

Both addons ship prebuilt native binaries — no compilation step, no Python, no system dependencies beyond a working microphone.

Sherpa-onnx's `OnlineRecognizer` provides true streaming ASR: audio samples are fed incrementally and the recognizer produces partial results in real-time. It uses endpoint detection to distinguish finalized text (speech segment complete) from draft text (mid-utterance). This maps naturally to a dictation UX where finalized words are committed to the editor and partial words shimmer as a preview.

## Goals / Non-Goals

**Goals:**
- Hold-to-talk dictation that inserts transcribed text into Pi's prompt editor in real-time
- Zero-configuration experience: first use triggers model download, then it just works
- Visual feedback at every stage: idle → recording → transcribing → done
- Cross-platform support (macOS, Linux, Windows) via sherpa-onnx prebuilt binaries
- Minimal resource usage — model stays loaded between dictation sessions within a Pi session, unloaded on shutdown

**Non-Goals:**
- Always-on / continuous listening — we explicitly use hold-to-talk to avoid this
- Voice commands (e.g., "delete last sentence") — this is dictation only, text goes into the editor
- Speaker diarization, language detection, or other advanced ASR features
- Custom model training or fine-tuning
- Support for non-English languages in v1 (sherpa-onnx supports many languages, but we'll start with English models and make it easy to swap later)

## Decisions

### D1: In-process sherpa-onnx via Node.js addon (not a subprocess)

**Decision**: Use `sherpa-onnx-node` npm package directly in the extension process.

**Rationale**: sherpa-onnx-node is a native Node.js addon (node-addon-api / N-API). Since Pi extensions run in the same Node.js process, we can call the sherpa-onnx API directly — no IPC, no subprocess lifecycle, no serialization overhead. Audio samples go straight from the PortAudio callback into the recognizer.

**Alternatives considered**:
- *Python subprocess (parakeet-mlx)*: Requires Python 3.12+, pip, MLX, numpy — heavy dependency chain, macOS-only, needs IPC protocol. Rejected.
- *Separate Node.js subprocess*: Would allow isolation but adds IPC complexity for no real benefit since sherpa-onnx is stable and well-tested.
- *WebSocket server*: Overkill for single-user local use.

### D2: Toggle-to-talk via `registerShortcut`

**Decision**: Register a keyboard shortcut (`ctrl+shift+r`) that toggles recording on/off. First press starts recording, second press stops and finalizes.

**Rationale**: Pi's `registerShortcut` API handles key-down events. Terminals do not reliably report key-up events, making hold-to-talk impractical. Toggle mode is clear and predictable — the widget always shows the current state and how to stop. `ctrl+shift+r` (R for "record") was chosen because:
1. `ctrl+shift+*` combos are reliably captured by all terminal emulators
2. It doesn't conflict with any built-in Pi keybinding
3. `ctrl+space` is commonly intercepted by terminals and input methods

### D3: Audio capture via @picovoice/pvrecorder-node

**Decision**: Use `@picovoice/pvrecorder-node` npm package for microphone access.

**Rationale**: PvRecorder is a cross-platform audio recorder designed specifically for real-time speech processing. It provides:
- Prebuilt binaries for macOS, Linux, and Windows
- 16kHz sample rate by default (what sherpa-onnx expects)
- Clean async polling API (`await recorder.read()`) returning Int16Array frames
- No debug/log output pollution (unlike naudiodon2/PortAudio which prints to stdout via C printf)
- Apache 2.0 license

The Int16 frames are converted to Float32 before feeding to sherpa-onnx.

**Alternatives considered**:
- *naudiodon2*: PortAudio wrapper — works but prints uncontrollable C-level debug output that corrupts TUI rendering.
- *node-microphone*: Uses SoX under the hood — extra system dependency.
- *Web Audio API*: Not available in Node.js.

### D4: Streaming model — Zipformer transducer (English)

**Decision**: Default to the `sherpa-onnx-streaming-zipformer-en-20M-2023-02-17` model (or similar small English streaming transducer).

**Rationale**: Zipformer transducer models are the best-supported streaming models in sherpa-onnx with excellent accuracy-to-size ratio. The ~20MB int8-quantized English model provides good accuracy with minimal resource usage. Users can configure alternative models via settings.

**Model management**: Models are stored in a configurable directory (default: `~/.pi-transcribe/models/`). The `/transcribe-setup` command downloads and verifies model files. The extension checks for model presence on first use and prompts setup if missing.

### D5: Editor integration — append finalized, preview partial

**Decision**: Use `ctx.ui.getEditorText()` and `ctx.ui.setEditorText()` to manage transcription output.

**Approach**:
1. Track a `committedText` string — the finalized transcription so far
2. Track the `existingText` — whatever was in the editor before dictation started
3. On each recognizer update:
   - Get finalized text + partial text from sherpa-onnx
   - Set editor text to: `existingText + committedText + finalizedNew + partialText`
   - When endpoint detected: move finalized text into `committedText`, clear partial
4. On recording stop: do a final decode, commit any remaining text, remove partial preview

The partial text appears at the end as the user speaks. When sherpa-onnx detects an endpoint (pause in speech), that segment becomes finalized and is permanently committed.

### D6: Visual feedback via widget + status

**Decision**: Use `ctx.ui.setWidget()` for a recording indicator above the editor, and `ctx.ui.setStatus()` for engine state in the footer.

**Widget states**:
- Hidden when idle (not recording)
- `🎙️ Recording... (Ctrl+Space to stop)` — red/accent color while recording
- `✨ Transcribing...` — shown briefly during final decode after key-up

**Status bar states**:
- `🎤 Ready` — model loaded, ready to record
- `🎤 Loading model...` — during lazy initialization
- `🎤 Recording` — while capturing audio
- Cleared when idle for more than a few seconds (don't clutter the footer permanently)

### D7: Extension structure — directory with package.json

**Decision**: Structure as a Pi package extension with its own `package.json` and `node_modules/`.

```
pi-transcribe/
├── package.json          # name, dependencies (sherpa-onnx-node, naudiodon2)
├── src/
│   ├── index.ts          # Extension entry point
│   ├── audio.ts          # Microphone capture (naudiodon2 wrapper)
│   ├── recognizer.ts     # sherpa-onnx OnlineRecognizer wrapper
│   ├── dictation.ts      # Orchestrator: ties audio → recognizer → editor
│   ├── model-manager.ts  # Model download, path resolution, verification
│   └── config.ts         # Settings, defaults, model configs
├── node_modules/         # After npm install
└── README.md
```

The extension exports a default function from `src/index.ts` that registers the shortcut, commands, and event handlers.

### D8: Model download via `/transcribe-setup` command

**Decision**: Provide a `/transcribe-setup` command that downloads model files using `pi.exec()` to run `curl` or a similar download tool.

**Rationale**: Model files (30-80MB) shouldn't be bundled with the extension. On first use, if models aren't found, the extension shows a notification directing the user to run `/transcribe-setup`. The command:
1. Creates the model directory (`~/.pi-transcribe/models/`)
2. Downloads model files from the sherpa-onnx GitHub releases (tar.bz2 archive)
3. Extracts and verifies files
4. Notifies success

This keeps the install lightweight (`npm install` for the extension) with model download as an explicit opt-in step.

## Risks / Trade-offs

**[Terminal key-up detection is unreliable]** → Mitigation: Implement toggle mode as primary UX (press to start, press to stop) with hold-to-talk as an enhancement where supported. The widget always shows clear state so the user knows when recording is active.

**[naudiodon2 prebuilt binaries may not cover all platforms]** → Mitigation: Detect missing native module at load time and show a clear error with instructions. PortAudio is available on all major platforms, so fallback to building from source is possible.

**[Microphone permissions on macOS]** → Mitigation: macOS requires explicit microphone permission for terminal apps. The extension should detect the permission error from naudiodon2 and show a helpful notification pointing to System Settings → Privacy → Microphone.

**[Model download requires internet on first use]** → Mitigation: Clear messaging in `/transcribe-setup` output. Model files are cached permanently and never re-downloaded. Users on air-gapped systems can manually place model files.

**[sherpa-onnx-node native addon ABI compatibility]** → Mitigation: sherpa-onnx-node publishes prebuilt binaries for multiple Node.js versions. Pi uses Bun which has Node.js N-API compatibility, but this needs testing. Fallback: bundle the shared library and load via FFI if native addon doesn't work.

**[Audio thread blocking]** → Mitigation: naudiodon2 runs audio capture on a separate thread. The `data` callback delivers buffers to the main thread. sherpa-onnx decoding is fast (real-time on modest CPUs) so it won't block the event loop meaningfully. If it does, we can use a worker thread.

## Open Questions

1. **Bun compatibility with sherpa-onnx-node**: Pi runs on Bun. Does Bun's N-API compatibility layer work with sherpa-onnx-node's native addon? Needs testing — may need to use the WASM version or FFI as fallback.
2. **Optimal endpoint detection settings**: sherpa-onnx has configurable endpoint rules (`rule1MinTrailingSilence`, `rule2MinTrailingSilence`, `rule3MinUtteranceLength`). What values feel natural for dictation? Likely needs user testing — start with defaults and make configurable.
3. **Punctuation**: sherpa-onnx streaming models typically don't output punctuation. Should we add a post-processing step (sherpa-onnx has a CT-transformer punctuation model) or leave it to the user? Leaning toward: add it as an optional enhancement in a follow-up.
