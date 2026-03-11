# pi-transcribe

Speech-to-text dictation extension for [pi](https://github.com/badlogic/pi-mono) coding agent. Hold spacebar, speak, release — your words appear at the cursor.

Uses [parakeet-mlx](https://github.com/senstella/parakeet-mlx) (NVIDIA's Parakeet ASR model on Apple Silicon via MLX) for local, offline, high-quality speech recognition — no API keys, no cloud.

## Features

- **Hold-spacebar dictation**: Hold spacebar to record, release to transcribe — text appears at cursor
- **Live waveform**: Unicode block waveform visualization (`▁▂▃▅▇█▆▃▁`) while recording
- **Fully local**: All processing happens on your machine using parakeet-mlx
- **High accuracy**: Parakeet TDT 0.6B v2 — best-in-class English ASR with punctuation & capitalization
- **Batch transcription**: Records complete audio, transcribes at full quality on release
- **Cancel support**: Press `Escape` to cancel and discard recording

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

### Hold-spacebar (primary)

1. **Hold spacebar** — recording starts after 3 rapid spaces are detected
2. **Speak** — a waveform visualization shows in the widget while recording
3. **Release spacebar** — audio is transcribed and inserted at cursor position
4. **Cancel** — press `Escape` while recording to discard

The extension detects spacebar auto-repeat (rapid stream of space characters) to distinguish holding from normal typing. The spaces typed before recording are automatically removed.

### Ctrl+Shift+R (toggle)

You can also use `Ctrl+Shift+R` to toggle recording on/off, like a traditional push-to-talk.

## Keyboard Shortcuts

| Shortcut | Description |
|----------|-------------|
| **Hold Spacebar** | Record while held, transcribe on release |
| `Ctrl+Shift+R` | Toggle dictation on/off |
| `Escape` | Cancel recording (discard audio) |

## Commands

| Command | Description |
|---------|-------------|
| `/transcribe-cancel` | Cancel active dictation |

## Configuration

The extension uses sensible defaults. Edit `src/config.ts` to change:

- **Model**: `mlx-community/parakeet-tdt-0.6b-v2` — HuggingFace model ID
- **Sample rate**: 16kHz

## Troubleshooting

### "Transcription worker timed out"
The model (~2.5GB) may still be downloading. Check `~/.cache/huggingface/` for progress.

### "Microphone permission denied" (macOS)
Go to **System Settings → Privacy & Security → Microphone** and enable access for your terminal app.

### "Failed to start transcription worker"
Ensure the Python venv exists at `.venv/` in the project directory and has `parakeet-mlx` installed:
```bash
source .venv/bin/activate
pip install parakeet-mlx
```

## Architecture

```
src/
├── index.ts               # Extension entry — custom editor with spacebar detection, waveform widget
├── config.ts              # Configuration defaults (model ID, sample rate)
├── audio.ts               # Microphone capture via PvRecorder, provides Int16 samples + RMS levels
├── recognizer.ts          # Spawns one-shot Python worker, pipes audio buffer, returns text
├── dictation.ts           # Buffers audio, manages waveform state, batch-transcribes on stop
└── transcribe_worker.py   # Python worker: reads s16le PCM from stdin, transcribes via parakeet-mlx
```

**Node.js side**: Captures microphone audio via PvRecorder, accumulates raw PCM in memory, renders waveform from RMS levels. On stop, pipes complete audio to Python worker.

**Python side**: Reads all audio from stdin, computes log-mel spectrogram, runs parakeet-mlx inference, outputs JSON result.

## Dependencies

- [@picovoice/pvrecorder-node](https://www.npmjs.com/package/@picovoice/pvrecorder-node) — Cross-platform audio recorder
- [parakeet-mlx](https://pypi.org/project/parakeet-mlx/) — NVIDIA Parakeet ASR on Apple Silicon via MLX (Python)

## License

MIT
