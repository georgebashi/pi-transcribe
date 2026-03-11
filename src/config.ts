import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

export interface TranscribeConfig {
  /** Sample rate for audio capture (must match model expectation) */
  sampleRate: number;
  /** Transcriber backend to use. Default: "auto" (detects best available) */
  transcriber: TranscriberConfig;
}

/**
 * Transcriber backend configuration.
 *
 * "auto" — Detects the best available backend for your platform:
 *   Apple Silicon: parakeet-mlx → nano-parakeet → mlx-whisper → whisper → apple
 *   macOS Intel:   nano-parakeet → whisper → apple
 *   Linux/Windows: nano-parakeet → whisper
 *
 * Or choose a specific backend:
 */
export type TranscriberConfig =
  | { type: "auto" }
  | { type: "parakeet-mlx"; model?: string }
  | { type: "nano-parakeet"; model?: string; device?: string }
  | { type: "mlx-whisper"; model?: string }
  | { type: "whisper-cpp"; modelPath: string }
  | { type: "whisper"; model?: string }
  | { type: "apple" }
  | { type: "custom"; command: string; args?: string[] };

export const DEFAULT_CONFIG: TranscribeConfig = {
  sampleRate: 16000,
  transcriber: { type: "auto" },
};

/** Config file location: ~/.pi/agent/pi-transcribe.json */
const CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "pi-transcribe.json");

/**
 * Load configuration from ~/.pi/agent/pi-transcribe.json, merged with defaults.
 *
 * The file is optional. If it doesn't exist, defaults are used.
 *
 * Supports shorthand: `"transcriber": "parakeet-mlx"` expands to `{ "type": "parakeet-mlx" }`.
 */
export function loadConfig(): TranscribeConfig {
  const config = { ...DEFAULT_CONFIG };

  let raw: any;
  try {
    const text = fs.readFileSync(CONFIG_PATH, "utf-8");
    raw = JSON.parse(text);
  } catch {
    return config; // file missing or invalid — use defaults
  }

  if (raw.sampleRate != null && typeof raw.sampleRate === "number") {
    config.sampleRate = raw.sampleRate;
  }

  if (raw.transcriber != null) {
    if (typeof raw.transcriber === "string") {
      // Shorthand: "parakeet-mlx" → { type: "parakeet-mlx" }
      config.transcriber = { type: raw.transcriber } as TranscriberConfig;
    } else if (typeof raw.transcriber === "object" && raw.transcriber.type) {
      config.transcriber = raw.transcriber as TranscriberConfig;
    }
  }

  return config;
}
