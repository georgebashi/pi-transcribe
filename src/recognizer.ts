import type { TranscribeConfig } from "./config.js";
import type { ModelManager } from "./model-manager.js";

// sherpa-onnx types
let sherpa_onnx: any;
try {
  sherpa_onnx = require("sherpa-onnx-node");
} catch {
  // Will be caught at extension init
}

export type TranscriptionCallback = (text: string) => void;

export class TranscriptionEngine {
  private config: TranscribeConfig;
  private modelManager: ModelManager;
  private recognizer: any = null;
  private stream: any = null;
  private segmentIndex = 0;
  private lastText = "";

  /** Called when partial (draft) text changes */
  onPartialResult: TranscriptionCallback | null = null;

  /** Called when a segment is finalized (endpoint detected or recording stops) */
  onFinalizedSegment: TranscriptionCallback | null = null;

  constructor(config: TranscribeConfig, modelManager: ModelManager) {
    this.config = config;
    this.modelManager = modelManager;
  }

  /** Initialize the recognizer. Returns false if model files are missing. */
  init(): boolean {
    if (!sherpa_onnx) {
      throw new Error("sherpa-onnx-node not available");
    }

    const recognizerConfig = {
      featConfig: {
        sampleRate: this.config.sampleRate,
        featureDim: 80,
      },
      modelConfig: {
        transducer: {
          encoder: this.modelManager.encoderPath,
          decoder: this.modelManager.decoderPath,
          joiner: this.modelManager.joinerPath,
        },
        tokens: this.modelManager.tokensPath,
        numThreads: this.config.numThreads,
        provider: "cpu",
        debug: 0,
      },
      decodingMethod: "greedy_search",
      maxActivePaths: 4,
      enableEndpoint: true,
      rule1MinTrailingSilence: this.config.rule1MinTrailingSilence,
      rule2MinTrailingSilence: this.config.rule2MinTrailingSilence,
      rule3MinUtteranceLength: this.config.rule3MinUtteranceLength,
    };

    try {
      this.recognizer = new sherpa_onnx.OnlineRecognizer(recognizerConfig);
      this.stream = this.recognizer.createStream();
      this.segmentIndex = 0;
      this.lastText = "";
      return true;
    } catch (e: any) {
      this.recognizer = null;
      this.stream = null;
      throw e;
    }
  }

  /** Feed audio samples and trigger decoding. Calls callbacks as results arrive. */
  feedAudio(samples: Float32Array): void {
    if (!this.recognizer || !this.stream) return;

    this.stream.acceptWaveform({
      sampleRate: this.config.sampleRate,
      samples,
    });

    while (this.recognizer.isReady(this.stream)) {
      this.recognizer.decode(this.stream);
    }

    const isEndpoint = this.recognizer.isEndpoint(this.stream);
    const result = this.recognizer.getResult(this.stream);
    const text = (result.text || "").trim();

    if (isEndpoint) {
      if (text.length > 0) {
        this.onFinalizedSegment?.(text);
        this.segmentIndex++;
      }
      this.recognizer.reset(this.stream);
      this.lastText = "";
    } else if (text !== this.lastText) {
      this.lastText = text;
      if (text.length > 0) {
        this.onPartialResult?.(text);
      }
    }
  }

  /** Finalize any remaining partial text when recording stops */
  finalize(): string | null {
    if (!this.recognizer || !this.stream) return null;

    // Feed a bit of silence to flush
    const silence = new Float32Array(this.config.sampleRate * 0.3);
    this.stream.acceptWaveform({
      sampleRate: this.config.sampleRate,
      samples: silence,
    });

    while (this.recognizer.isReady(this.stream)) {
      this.recognizer.decode(this.stream);
    }

    const text = this.recognizer.getResult(this.stream).text.trim();

    // Reset stream for next use
    this.recognizer.reset(this.stream);
    this.lastText = "";

    if (text.length > 0) {
      this.segmentIndex++;
      return text;
    }
    return null;
  }

  /** Release all resources */
  destroy(): void {
    this.stream = null;
    this.recognizer = null;
    this.segmentIndex = 0;
    this.lastText = "";
    this.onPartialResult = null;
    this.onFinalizedSegment = null;
  }
}
