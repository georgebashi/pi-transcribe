export interface TranscribeConfig {
  /** Sample rate for audio capture (must match model expectation) */
  sampleRate: number;
  /** Transcriber backend to use */
  transcriber: TranscriberConfig;
}

/**
 * Transcriber backend configuration.
 * Each backend is a CLI tool that takes an audio file and produces text.
 */
export type TranscriberConfig =
  | { type: "parakeet-mlx"; modelId?: string }
  | { type: "custom"; command: string; args?: string[] };

export const DEFAULT_CONFIG: TranscribeConfig = {
  sampleRate: 16000,
  transcriber: {
    type: "parakeet-mlx",
  },
};
