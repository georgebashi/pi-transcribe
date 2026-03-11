# pi-transcribe

Speech-to-text dictation extension for [pi](https://github.com/badlogic/pi-mono) coding agent. Hold spacebar, speak, release — your words appear at the cursor.

Uses [parakeet-mlx](https://github.com/senstella/parakeet-mlx) by default (NVIDIA's Parakeet ASR on Apple Silicon via MLX) for local, offline, high-quality speech recognition — no API keys, no cloud. Supports pluggable transcription backends.

## Features

- **Hold-spacebar dictation**: Hold spacebar to record, release to transcribe — text appears at cursor
- **Live waveform**: Unicode block waveform visualization (`▁▂▃▅▇█▆▃▁`) while recording
- **Fully local**: All processing happens on your machine
- **High accuracy**: Parakeet TDT 0.6B v2 — best-in-class English ASR with punctuation & capitalization
- **Pluggable backends**: Use parakeet-mlx, whisper.cpp, or any custom CLI transcriber
- **Cancel support**: Press `Escape` to cancel and discard recording

## Requirements

- A working microphone
- A transcription backend installed on your PATH (see below)

## Installation

### 1. Install the pi extension

```bash
pi install npm:pi-transcribe
```

Or for development:
```bash
git clone <repo>
cd pi-transcribe
npm install
# Add path to your pi settings
```

### 2. Install a transcription backend

#### parakeet-mlx (default, macOS Apple Silicon only)

```bash
pipx install parakeet-mlx
# or: uv tool install parakeet-mlx
```

On first use the model (~2.5GB) downloads automatically from HuggingFace.

#### Custom transcriber

Any CLI that takes a WAV file path as its last argument and prints text to stdout. Configure in `src/config.ts`:

```typescript
transcriber: {
  type: "custom",
  command: "whisper-cpp",
  args: ["--model", "base.en", "--no-timestamps"],
}
```

## Usage

### Hold-spacebar (primary)

1. **Hold spacebar** — recording starts after 3 rapid spaces are detected
2. **Speak** — a waveform visualization shows in the widget while recording
3. **Release spacebar** — audio is transcribed and inserted at cursor position
4. **Cancel** — press `Escape` while recording to discard

### Ctrl+Shift+R (toggle)

You can also use `Ctrl+Shift+R` to toggle recording on/off.

## Keyboard Shortcuts

| Shortcut | Description |
|----------|-------------|
| **Hold Spacebar** | Record while held, transcribe on release |
| `Ctrl+Shift+R` | Toggle dictation on/off |
| `Escape` | Cancel recording (discard audio) |

## Troubleshooting

### "parakeet-mlx not found on PATH"
Install it: `pipx install parakeet-mlx` or `uv tool install parakeet-mlx`

### "Transcription timed out"
The model (~2.5GB) may still be downloading on first use. Check `~/.cache/huggingface/` for progress.

### "Microphone permission denied" (macOS)
Go to **System Settings → Privacy & Security → Microphone** and enable access for your terminal app.

## Architecture

```
src/
├── index.ts          # Extension entry — custom editor with spacebar detection, waveform widget
├── config.ts         # Configuration (transcriber backend, sample rate)
├── audio.ts          # Microphone capture via PvRecorder, provides Int16 samples + RMS levels
├── recognizer.ts     # Writes temp WAV, runs CLI transcriber, reads output
└── dictation.ts      # Buffers audio, manages waveform state, batch-transcribes on stop
```

**Audio flow**: PvRecorder → PCM buffer → temp WAV file → CLI transcriber → text → editor

**Transcriber abstraction**: Any CLI that accepts a WAV file path and outputs text works as a backend. The `TranscriberConfig` type in `config.ts` defines the interface.

## Dependencies

- [@picovoice/pvrecorder-node](https://www.npmjs.com/package/@picovoice/pvrecorder-node) — Cross-platform audio recorder
- [parakeet-mlx](https://pypi.org/project/parakeet-mlx/) — Default transcription backend (user-installed)

## License

MIT
