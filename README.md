# pi-transcribe

Speech-to-text dictation extension for [pi](https://github.com/badlogic/pi-mono) coding agent. Hold spacebar, speak, release — your words appear at the cursor.

Works on **macOS, Linux, and Windows** with automatic backend detection — installs one transcription tool and you're ready to go.

## Features

- **Hold-spacebar dictation**: Hold spacebar to record, release to transcribe — text appears at cursor
- **Live waveform**: Unicode block waveform visualization (`▁▂▃▅▇█▆▃▁`) while recording
- **Fully local**: All processing happens on your machine — no API keys, no cloud
- **Cross-platform**: Supports multiple transcription backends with automatic detection
- **Cancel support**: Press `Escape` to cancel and discard recording

## Installation

```bash
pi install npm:pi-transcribe
```

Then install a transcription backend (see below). The extension auto-detects the best available one.

## Transcription Backends

The extension auto-detects the best available backend for your platform. Install at least one:

### Recommended by platform

| Platform | Best option | Install |
|----------|------------|---------|
| **macOS Apple Silicon** | parakeet-mlx | `pipx install parakeet-mlx` |
| **Linux (NVIDIA GPU)** | nano-parakeet | `pipx install nano-parakeet` |
| **Linux (CPU only)** | nano-parakeet | `pipx install nano-parakeet` |
| **Windows** | nano-parakeet | `pipx install nano-parakeet` |

### All supported backends

Listed in auto-detect priority order. The first one found on PATH is used.

#### Apple Silicon auto-detect order

| Priority | Backend | WER | Speed | Install |
|----------|---------|-----|-------|---------|
| 1 | **parakeet-mlx** | ★★★★★ | ★★★★★ | `pipx install parakeet-mlx` |
| 2 | **nano-parakeet** | ★★★★★ | ★★★★ | `pipx install nano-parakeet` |
| 3 | **mlx-whisper** | ★★★★ | ★★★★ | `pipx install mlx-whisper` |
| 4 | **whisper** | ★★★★ | ★★ | `pipx install openai-whisper` |

#### Linux / Windows auto-detect order

| Priority | Backend | WER | Speed | Install |
|----------|---------|-----|-------|---------|
| 1 | **nano-parakeet** | ★★★★★ | ★★★★ | `pipx install nano-parakeet` |
| 2 | **whisper** | ★★★★ | ★★ | `pipx install openai-whisper` |

#### Manual-config only

These backends require explicit configuration (not part of auto-detect):

| Backend | Notes | Install |
|---------|-------|---------|
| **whisper-cpp** | Fastest CPU inference, needs model file | `brew install whisper-cpp` (macOS) |
| **custom** | Any CLI that takes a WAV file | — |

> **Note:** You can also use `uv tool install` instead of `pipx install` for any Python-based backend.

### Backend details

**parakeet-mlx** — NVIDIA Parakeet TDT 0.6B on Apple Silicon via MLX. Best-in-class English ASR with punctuation and capitalization. macOS only.

**nano-parakeet** — Same Parakeet model, pure PyTorch implementation. Works everywhere PyTorch runs (CUDA, CPU, MPS). Only 5 dependencies. ~2.5x faster than NeMo.

**mlx-whisper** — OpenAI Whisper large-v3-turbo on Apple Silicon via MLX. Good multilingual support. macOS only.

**whisper-cpp** — Whisper in C/C++. Very fast on CPU, supports Metal and CUDA. Requires downloading a GGML model file separately.

**whisper** — OpenAI's original Whisper (PyTorch). Slowest but most widely compatible. Good baseline.

## Explicit backend configuration

Edit `src/config.ts` to pin a specific backend instead of auto-detect:

```typescript
// Use a specific backend
transcriber: { type: "nano-parakeet" }

// With model override
transcriber: { type: "nano-parakeet", model: "nvidia/parakeet-tdt-0.6b-v2" }

// nano-parakeet with explicit device
transcriber: { type: "nano-parakeet", device: "cpu" }

// whisper-cpp (requires model path)
transcriber: { type: "whisper-cpp", modelPath: "/path/to/ggml-large-v3-turbo.bin" }

// Custom CLI (must accept WAV path as last arg, print text to stdout)
transcriber: { type: "custom", command: "my-transcriber", args: ["--lang", "en"] }
```

## Usage

### Hold-spacebar (primary)

1. **Hold spacebar** — recording starts after 3 rapid spaces are detected
2. **Speak** — a waveform visualization shows while recording
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

### "No transcription backend found"
Install one of the supported backends — see the table above for your platform.

### "Transcription timed out"
Models download automatically on first use (~1-2.5GB). Check `~/.cache/huggingface/` for progress.

### "Microphone permission denied" (macOS)
Go to **System Settings → Privacy & Security → Microphone** and enable access for your terminal app.

## Architecture

```
src/
├── index.ts          # Extension entry — custom editor with spacebar detection, waveform widget
├── config.ts         # Configuration (transcriber backend, sample rate)
├── audio.ts          # Microphone capture via PvRecorder, Int16 samples + RMS levels
├── recognizer.ts     # Backend registry, auto-detect, temp WAV, CLI dispatch
└── dictation.ts      # Audio buffering, waveform state, batch-transcribe on stop
```

**Audio flow**: PvRecorder → PCM buffer → temp WAV file → CLI transcriber → text → editor

**Backend abstraction**: Each backend defines a binary name, how to build CLI args, and how to extract text from the result. Adding a new backend is ~15 lines of code.

## Dependencies

- [@picovoice/pvrecorder-node](https://www.npmjs.com/package/@picovoice/pvrecorder-node) — Cross-platform audio capture
- A transcription backend (user-installed, see above)

## License

MIT
