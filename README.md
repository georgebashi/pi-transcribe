# pi-transcribe

Speech-to-text dictation extension for [pi](https://github.com/badlogic/pi-mono) coding agent. Hold a key, speak, and your words appear live in the prompt editor.

Uses [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) for local, offline, real-time speech recognition — no API keys, no cloud, no Python required.

## Features

- **Hold-to-talk dictation**: Press `Ctrl+Shift+R` to start/stop recording
- **Live transcription**: Text appears in the editor as you speak
- **Fully local**: All processing happens on your machine using sherpa-onnx
- **Cross-platform**: macOS (arm64/x64), Linux (x64/arm64), Windows (x64)
- **Visual feedback**: Recording widget + footer status indicator
- **Cancel support**: Press `Escape` to cancel and discard transcription

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   cd pi-transcribe
   npm install
   ```
3. Add to your Pi configuration. Either:
   - Copy/symlink to `~/.pi/agent/extensions/pi-transcribe/`
   - Or add the path to your `settings.json` extensions array

4. Download the speech recognition model:
   ```
   /transcribe-setup
   ```
   This downloads a ~128MB model to `~/.pi-transcribe/models/`. Only needed once.

## Usage

1. **Start dictation**: Press `Ctrl+Shift+R`
   - First use will load the model (takes a few seconds)
   - The widget shows `🎙️ Recording...` when active

2. **Speak**: Your words appear live in the prompt editor
   - Finalized text (after pauses) is committed permanently
   - Partial text (mid-sentence) updates in real-time

3. **Stop dictation**: Press `Ctrl+Shift+R` again
   - Any remaining speech is finalized

4. **Cancel**: Press `Escape` while recording
   - All transcribed text is discarded
   - Editor restored to pre-recording state

## Commands

| Command | Description |
|---------|-------------|
| `/transcribe-setup` | Download/update the ASR model |
| `/transcribe-cancel` | Cancel active dictation |

## Keyboard Shortcuts

| Shortcut | Description |
|----------|-------------|
| `Ctrl+Shift+R` | Toggle dictation on/off |
| `Escape` | Cancel dictation (discard text) |

## Configuration

The extension uses sensible defaults. Configuration is done by editing `src/config.ts`:

- **Model directory**: `~/.pi-transcribe/models/` — where model files are stored
- **Model**: `sherpa-onnx-streaming-zipformer-en-20M-2023-02-17` — small English streaming model
- **Sample rate**: 16kHz
- **Endpoint detection**: Controls how quickly pauses are detected
  - `rule1MinTrailingSilence`: 2.4s (long silence → endpoint)
  - `rule2MinTrailingSilence`: 1.2s (shorter silence → endpoint)
  - `rule3MinUtteranceLength`: 20s (max utterance before forced endpoint)

## Troubleshooting

### "No ASR model found"
Run `/transcribe-setup` to download the model. Requires internet access.

### "Microphone permission denied" (macOS)
Go to **System Settings → Privacy & Security → Microphone** and enable access for your terminal app (e.g., Terminal.app, iTerm2, Warp).

### "Native modules unavailable"
The extension requires native addons (`sherpa-onnx-node`, `@picovoice/pvrecorder-node`) which ship prebuilt binaries for common platforms. If your platform isn't supported, you may need to build from source.

### No audio input detected
Ensure a microphone is connected and selected as the default input device in your OS audio settings.

## Architecture

```
src/
├── index.ts          # Extension entry point — registers shortcuts, commands, events
├── config.ts         # Configuration defaults
├── model-manager.ts  # Model download, path resolution, verification
├── audio.ts          # Microphone capture via PvRecorder
├── recognizer.ts     # sherpa-onnx OnlineRecognizer wrapper
└── dictation.ts      # Orchestrator: audio → engine → editor updates
```

## Dependencies

- [sherpa-onnx-node](https://www.npmjs.com/package/sherpa-onnx-node) — Streaming ASR engine (prebuilt native addon)
- [@picovoice/pvrecorder-node](https://www.npmjs.com/package/@picovoice/pvrecorder-node) — Cross-platform audio recorder for speech processing (prebuilt native addon)

## License

MIT
