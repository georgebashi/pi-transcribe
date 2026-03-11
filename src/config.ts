
export interface TranscribeConfig {
  /** HuggingFace model ID for parakeet-mlx */
  modelId: string;
  /** Sample rate for audio capture (must match model expectation) */
  sampleRate: number;
}

export const DEFAULT_CONFIG: TranscribeConfig = {
  modelId: "mlx-community/parakeet-tdt-0.6b-v2",
  sampleRate: 16000,
};
