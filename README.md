# pi-transcribe

Voice dictation for [pi](https://github.com/badlogic/pi-mono). Hold spacebar, speak, release — your words appear at the cursor.

All transcription runs locally on your machine. No API keys, no cloud.

## Install

```bash
pi install npm:pi-transcribe
```

Then install a speech-to-text engine (see next section).

## Speech-to-text engine

pi-transcribe needs a transcription tool on your PATH. It auto-detects the best one available — just install one and go.

> **Tip:** You can use `uv tool install` instead of `pipx install` if you prefer [uv](https://github.com/astral-sh/uv).

Models download automatically on first use (~1–2.5 GB to `~/.cache/huggingface/`).

### macOS (Apple Silicon)

Pick one. Listed best → worst. The first one found is used automatically.

| Engine | Install | Notes |
|--------|---------|-------|
| **parakeet-mlx** | `pipx install parakeet-mlx` | Best quality + fastest. Recommended. |
| **nano-parakeet** | `pipx install nano-parakeet` | Same model, PyTorch. Slightly slower on Mac. |
| **mlx-whisper** | `pipx install mlx-whisper` | Whisper large-v3-turbo on MLX. |
| **whisper** | `pipx install openai-whisper` | Original OpenAI Whisper. Slowest. |
| **apple** | *(built-in)* | macOS Speech framework. Zero install, but requires Siri or Dictation enabled in System Settings. |

### Linux & Windows

| Engine | Install | Notes |
|--------|---------|-------|
| **nano-parakeet** | `pipx install nano-parakeet` | Best quality. Uses CUDA if available, falls back to CPU. |
| **whisper** | `pipx install openai-whisper` | Widely compatible fallback. |

## Usage

### Hold spacebar

Hold spacebar → speak → release. Text is transcribed and inserted at the cursor.

A live waveform (`▁▂▃▅▇█▆▃▁`) shows while recording. Press **Escape** to cancel.

### Ctrl+Shift+R

Toggle recording on/off (alternative to hold-spacebar).

## How it works

1. **Audio capture** — PvRecorder captures 16kHz mono PCM from your microphone
2. **Recording** — Audio accumulates in memory while you hold spacebar; a waveform renders from RMS levels
3. **Transcription** — On release, audio is written to a temp WAV file and passed to whichever speech-to-text engine is available
4. **Insertion** — Transcribed text is inserted at the cursor position

The engine auto-detection runs once at startup. It walks the priority list for your platform and locks the first binary it finds on PATH.

## Configuration

Optional. Create `~/.pi/agent/pi-transcribe.json` to pin a specific engine:

```json
{ "transcriber": "parakeet-mlx" }
```

Backends with options use the object form:

```json
{ "transcriber": { "type": "nano-parakeet", "device": "cpu" } }
{ "transcriber": { "type": "whisper-cpp", "modelPath": "/path/to/ggml-large-v3-turbo.bin" } }
{ "transcriber": { "type": "custom", "command": "my-transcriber", "args": ["--lang", "en"] } }
```

No config file = auto-detect (recommended).

## Troubleshooting

**"No transcription backend found"** — Install one of the engines listed above for your platform.

**First run is slow** — The model downloads automatically (~1–2.5 GB). Subsequent runs are fast.

**"Microphone permission denied"** (macOS) — System Settings → Privacy & Security → Microphone → enable your terminal app.

**"Siri and Dictation are disabled"** (apple backend) — System Settings → Keyboard → Dictation → enable.

## License

MIT
