# pi-transcribe

Speech-to-text dictation extension for [pi](https://github.com/badlogic/pi-mono) coding agent. Press a key, speak, and your words appear live in the prompt editor.

Uses [parakeet-mlx](https://github.com/senstella/parakeet-mlx) (NVIDIA's Parakeet ASR model on Apple Silicon via MLX) for local, offline, high-quality speech recognition — no API keys, no cloud.

## Features

- **Toggle dictation**: Press `Ctrl+Shift+R` to start/stop recording
- **Live transcription**: Text streams into the editor as you speak, in chunks
- **Fully local**: All processing happens on your machine using parakeet-mlx
- **High accuracy**: Parakeet TDT 0.6B v2 — best-in-class English ASR with punctuation & capitalization
- **Visual feedback**: Recording widget + footer status indicator
- **Cancel support**: Press `Escape` to cancel and discard transcription

## Requirements

- **macOS with Apple Silicon** (M1/M2/M3/M4) — required for MLX
- **Python 3.10+** with a virtual environment containing `parakeet-mlx`
- A working microphone

## Installation

1. Clone or download this repository
2. Install Node.js dependencies:
   ```bash
   cd pi-transcribe
   npm install
   ```
3. Set up the Python environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install parakeet-mlx
   ```
4. Add to your Pi configuration. Either:
   - Copy/symlink to `~/.pi/agent/extensions/pi-transcribe/`
   - Or add the path to your `settings.json` extensions array

5. On first use, the model (~2.5GB) will be downloaded automatically from HuggingFace to `~/.cache/huggingface/`.

## Usage

1. **Start dictation**: Press `Ctrl+Shift+R`
   - First use loads the model (takes a few seconds)
   - The widget shows `🎙️ Recording...` when active

2. **Speak**: Your words stream into the prompt editor
   - Transcription arrives in chunks as parakeet-mlx processes audio
   - Text updates in real-time as more audio is processed

3. **Stop dictation**: Press `Ctrl+Shift+R` again
   - Any remaining speech is finalized

4. **Cancel**: Press `Escape` while recording
   - All transcribed text is discarded
   - Editor restored to pre-recording state

## Commands

| Command | Description |
|---------|-------------|
| `/transcribe-cancel` | Cancel active dictation |

## Keyboard Shortcuts

| Shortcut | Description |
|----------|-------------|
| `Ctrl+Shift+R` | Toggle dictation on/off |
| `Escape` | Cancel dictation (discard text) |

## Configuration

The extension uses sensible defaults. Edit `src/config.ts` to change:

- **Model**: `mlx-community/parakeet-tdt-0.6b-v2` — HuggingFace model ID
- **Sample rate**: 16kHz

## Troubleshooting

### "Transcription worker timed out loading model"
The model (~2.5GB) may still be downloading. Check `~/.cache/huggingface/` for progress. First run takes longer.

### "Microphone permission denied" (macOS)
Go to **System Settings → Privacy & Security → Microphone** and enable access for your terminal app (e.g., Terminal.app, iTerm2, Warp).

### "Failed to start transcription worker"
Ensure the Python venv exists at `.venv/` in the project directory and has `parakeet-mlx` installed:
```bash
source .venv/bin/activate
pip install parakeet-mlx
```

### No audio input detected
Ensure a microphone is connected and selected as the default input device in your OS audio settings.

## Architecture

```
src/
├── index.ts               # Extension entry point — registers shortcuts, commands, events
├── config.ts              # Configuration defaults (model ID, sample rate)
├── audio.ts               # Microphone capture via PvRecorder (Node.js)
├── recognizer.ts          # Spawns Python worker, feeds audio via stdin, reads JSON results
├── dictation.ts           # Orchestrator: audio → engine → editor updates
└── transcribe_worker.py   # Python worker: parakeet-mlx streaming transcription
```

The architecture bridges Node.js and Python:
- **Node.js side**: Captures microphone audio via `@picovoice/pvrecorder-node`, streams raw PCM to the Python worker via stdin
- **Python side**: Runs `parakeet-mlx` streaming transcription, emits JSON-line results to stdout
- **Protocol**: stdin receives raw s16le PCM at 16kHz; stdout emits `{"type":"partial","text":"..."}` and `{"type":"final","text":"..."}` JSON lines

## Dependencies

- [@picovoice/pvrecorder-node](https://www.npmjs.com/package/@picovoice/pvrecorder-node) — Cross-platform audio recorder (prebuilt native addon)
- [parakeet-mlx](https://pypi.org/project/parakeet-mlx/) — NVIDIA Parakeet ASR on Apple Silicon via MLX (Python)

## License

MIT
