import * as path from "node:path";
import * as os from "node:os";

export interface TranscribeConfig {
  /** Directory where model files are stored */
  modelDir: string;
  /** Name of the model archive (without extension) */
  modelName: string;
  /** Download URL for the model archive */
  modelUrl: string;
  /** Sample rate for audio capture */
  sampleRate: number;
  /** Endpoint detection: min trailing silence for rule 1 (seconds) */
  rule1MinTrailingSilence: number;
  /** Endpoint detection: min trailing silence for rule 2 (seconds) */
  rule2MinTrailingSilence: number;
  /** Endpoint detection: min utterance length for rule 3 (seconds) */
  rule3MinUtteranceLength: number;
  /** Number of threads for the recognizer */
  numThreads: number;
}

const MODEL_NAME = "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17";

export const DEFAULT_CONFIG: TranscribeConfig = {
  modelDir: path.join(os.homedir(), ".pi-transcribe", "models"),
  modelName: MODEL_NAME,
  modelUrl: `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${MODEL_NAME}.tar.bz2`,
  sampleRate: 16000,
  rule1MinTrailingSilence: 2.4,
  rule2MinTrailingSilence: 1.2,
  rule3MinUtteranceLength: 20,
  numThreads: 2,
};
