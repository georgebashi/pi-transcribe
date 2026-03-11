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
