#!/usr/bin/env python3
"""
Batch transcription worker for pi-transcribe.

Reads raw 16-bit PCM audio (16kHz, mono) from stdin until EOF.
Transcribes the complete audio using parakeet-mlx.
Writes a single JSON result to stdout.

Protocol:
  stdin:  raw s16le audio at 16kHz mono (complete recording)
  stdout: single JSON line:
    {"type": "result", "text": "..."}   — transcription result
    {"type": "error", "message": "..."}  — error
  stderr: diagnostic messages (ignored by parent)
"""

import sys
import json
import tempfile
import os
import numpy as np


def main():
    model_id = sys.argv[1] if len(sys.argv) > 1 else "mlx-community/parakeet-tdt-0.6b-v2"
    sample_rate = 16000

    try:
        import mlx.core as mx
        from parakeet_mlx import from_pretrained
        from parakeet_mlx.audio import get_logmel

        # Load model
        print(f"Loading model {model_id}...", file=sys.stderr, flush=True)
        model = from_pretrained(model_id)
        print("Model loaded.", file=sys.stderr, flush=True)

        # Read all audio from stdin
        print("Reading audio...", file=sys.stderr, flush=True)
        raw = sys.stdin.buffer.read()

        if not raw or len(raw) < 3200:  # Less than 0.1s of audio
            print(json.dumps({"type": "result", "text": ""}), flush=True)
            return

        # Convert s16le bytes to float32 mx.array (same as load_audio does)
        samples_int16 = np.frombuffer(raw, dtype=np.int16)
        audio = mx.array(samples_int16.flatten()).astype(mx.float32) / 32768.0

        duration = len(samples_int16) / sample_rate
        print(f"Transcribing {duration:.1f}s of audio...", file=sys.stderr, flush=True)

        # Compute log-mel spectrogram and generate transcription
        mel = get_logmel(audio, model.preprocessor_config)
        result = model.generate(mel)[0]

        text = result.text.strip()
        print(f"Result: {text[:100]}{'...' if len(text) > 100 else ''}", file=sys.stderr, flush=True)

        print(json.dumps({"type": "result", "text": text}), flush=True)

    except Exception as e:
        print(json.dumps({"type": "error", "message": str(e)}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
