## 1. Project Setup

- [x] 1.1 Initialize the extension directory with `package.json` (name: `pi-transcribe`, type: module, pi.extensions entry point)
- [x] 1.2 Add dependencies: `sherpa-onnx-node`, `naudiodon2`, and dev dependency `@mariozechner/pi-coding-agent` (for types)
- [x] 1.3 Run `npm install` and verify native addons load without errors on the current platform
- [x] 1.4 Create the source file structure: `src/index.ts`, `src/audio.ts`, `src/recognizer.ts`, `src/dictation.ts`, `src/model-manager.ts`, `src/config.ts`
- [x] 1.5 Create the extension entry point (`src/index.ts`) with a default export function that takes `ExtensionAPI`, and verify it loads in Pi via `pi -e ./src/index.ts`

## 2. Configuration and Model Management

- [x] 2.1 Implement `src/config.ts` — define defaults for model directory (`~/.pi-transcribe/models/`), default model name, hotkey (`ctrl+space`), endpoint detection settings (rule1: 2.4s, rule2: 1.2s, rule3: 20s), and sample rate (16kHz)
- [x] 2.2 Implement `src/model-manager.ts` — model path resolution: check if required files (encoder.onnx, decoder.onnx, joiner.onnx, tokens.txt) exist in the model directory
- [x] 2.3 Implement model download in `src/model-manager.ts` — download the default streaming model archive from sherpa-onnx GitHub releases using `pi.exec()` with `curl`, extract with `tar`, verify required files are present
- [x] 2.4 Handle download failures: clean up partial files on error, report failure reason via callback
- [x] 2.5 Register the `/transcribe-setup` command in `src/index.ts` — calls model-manager download, shows progress via `ctx.ui.notify()`, handles "already installed" case with confirm dialog for re-download
- [ ] 2.6 Test `/transcribe-setup` end-to-end: run command, verify model files downloaded and verified

## 3. Audio Capture Module

- [x] 3.1 Implement `src/audio.ts` — `AudioCapture` class wrapping naudiodon2's `AudioIO` with PortAudio input stream (mono, 16kHz, float32)
- [x] 3.2 Implement `start()` method: open PortAudio stream, begin emitting `data` events with Float32Array samples
- [x] 3.3 Implement `stop()` method: close PortAudio stream, emit a `stopped` event
- [x] 3.4 Implement error handling: catch microphone permission errors, no-device errors, and emit typed error events with descriptive messages (including macOS permission guidance)
- [x] 3.5 Implement guard against concurrent recording: `start()` is a no-op if already recording, `isRecording` getter
- [ ] 3.6 Test audio capture: verify stream opens, delivers sample buffers, and closes cleanly

## 4. Transcription Engine Module

- [x] 4.1 Implement `src/recognizer.ts` — `TranscriptionEngine` class wrapping sherpa-onnx's `OnlineRecognizer`
- [x] 4.2 Implement lazy `init()` method: create `OnlineRecognizer` with model config (transducer encoder/decoder/joiner paths, tokens path, endpoint rules), create `OnlineStream`. Return false if model files missing.
- [x] 4.3 Implement `feedAudio(samples: Float32Array)` method: call `stream.acceptWaveform()`, then `recognizer.decode(stream)` in a loop while `recognizer.isReady(stream)`, return current result text
- [x] 4.4 Implement endpoint detection: after each decode, check `recognizer.isEndpoint(stream)`. When detected, emit finalized segment text, call `recognizer.reset(stream)`, increment segment counter
- [x] 4.5 Implement `finalize()` method: for when recording stops — return any remaining partial text as a final segment
- [x] 4.6 Implement `destroy()` method: release OnlineRecognizer and OnlineStream resources
- [x] 4.7 Expose callbacks/events: `onPartialResult(text)`, `onFinalizedSegment(text)` for the dictation orchestrator to consume
- [ ] 4.8 Test transcription engine: feed a known audio file, verify partial results arrive and endpoints are detected

## 5. Dictation Orchestrator

- [x] 5.1 Implement `src/dictation.ts` — `DictationSession` class that ties audio capture → transcription engine → editor updates
- [x] 5.2 Implement `startDictation(ctx)`: capture `existingText` from editor, initialize `committedText = ""`, start audio capture, show recording widget
- [x] 5.3 Implement the audio→transcription pipeline: on each audio `data` event, feed samples to the transcription engine
- [x] 5.4 Implement editor text updates: on partial result, set editor text to `existingText + committedText + partialText`. On finalized segment, append to `committedText` (with leading space if needed) and clear partial
- [x] 5.5 Implement `stopDictation()`: stop audio capture, call engine `finalize()`, commit any remaining text, hide recording widget
- [x] 5.6 Implement `cancelDictation()`: stop audio capture, discard all transcription, restore editor to `existingText`, hide widget
- [ ] 5.7 Test dictation orchestrator end-to-end: start dictation, speak, verify text appears in editor, stop, verify text persists

## 6. Hotkey and Command Registration

- [x] 6.1 Register `ctrl+space` shortcut via `pi.registerShortcut()` in `src/index.ts` — toggles dictation on/off
- [x] 6.2 Implement toggle logic: if not recording → call `startDictation()`, if recording → call `stopDictation()`
- [x] 6.3 Handle Escape during recording: intercept via the recording widget's `onKey` handler, call `cancelDictation()`
- [x] 6.4 Guard shortcut handler: if native modules failed to load, show error notification and return early
- [x] 6.5 Guard shortcut handler: if model not loaded, trigger lazy load (with status indicator), then start dictation

## 7. Visual Feedback

- [x] 7.1 Implement recording widget via `ctx.ui.setWidget()`: show `🎙️ Recording... (Ctrl+Space to stop)` with accent styling during recording
- [x] 7.2 Implement transcribing widget state: show `✨ Transcribing...` briefly during final decode after stop
- [x] 7.3 Implement widget hide: clear widget (set to undefined) when idle
- [x] 7.4 Implement footer status via `ctx.ui.setStatus()`: show `🎤 Loading model...` during init, `🎤 Ready` when loaded, `🎤 Recording` during capture
- [x] 7.5 Implement idle status clear: clear footer status after 5 seconds of idle to avoid clutter

## 8. Lifecycle and Error Handling

- [x] 8.1 Register `session_start` handler: attempt to detect native module availability (try-catch require), disable extension gracefully if modules unavailable
- [x] 8.2 Register `session_shutdown` handler: stop any active recording, destroy recognizer resources, close audio streams
- [x] 8.3 Implement error notifications: wrap all critical paths in try-catch, display errors via `ctx.ui.notify()` with actionable messages
- [x] 8.4 Ensure recording errors preserve already-committed text in the editor (don't blank the editor on error)

## 9. Testing and Polish

- [ ] 9.1 Manual end-to-end test: install extension, run `/transcribe-setup`, press `ctrl+space`, speak, see live text, press again to stop
- [ ] 9.2 Test cancel flow: start recording, press Escape, verify editor restored
- [ ] 9.3 Test with existing editor text: type something, start dictation, verify existing text preserved
- [ ] 9.4 Test error cases: no model files, no microphone, permission denied
- [x] 9.5 Write README.md: installation instructions, usage guide, configuration options, troubleshooting (microphone permissions, model download)
