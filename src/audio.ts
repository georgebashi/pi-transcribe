import type { TranscribeConfig } from "./config.js";

// PvRecorder types
let PvRecorder: any;
try {
  PvRecorder = require("@picovoice/pvrecorder-node").PvRecorder;
} catch {
  // Will be caught at extension init
}

export class AudioCapture {
  private config: TranscribeConfig;
  private recorder: any = null;
  private _isRecording = false;
  private readLoop: Promise<void> | null = null;
  private onData: ((samples: Int16Array, rms: number) => void) | null = null;
  private onError: ((err: Error) => void) | null = null;

  constructor(config: TranscribeConfig) {
    this.config = config;
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  /**
   * Start capturing audio from the microphone.
   * Calls `onData` with raw Int16 samples and the RMS level (0-1) for that frame.
   */
  start(
    onData: (samples: Int16Array, rms: number) => void,
    onError: (err: Error) => void
  ): void {
    if (this._isRecording) return;

    if (!PvRecorder) {
      onError(new Error("@picovoice/pvrecorder-node not available"));
      return;
    }

    this.onData = onData;
    this.onError = onError;

    try {
      // frameLength of 512 at 16kHz = 32ms per frame
      this.recorder = new PvRecorder(512);
      this.recorder.start();
      this._isRecording = true;
      this.readLoop = this.runReadLoop();
    } catch (e: any) {
      this._isRecording = false;
      this.recorder = null;

      const msg = e.message || String(e);
      if (msg.includes("permission") || msg.includes("not permitted") || msg.includes("denied")) {
        onError(
          new Error(
            "Microphone permission denied. On macOS, check System Settings → Privacy & Security → Microphone and grant access to your terminal app."
          )
        );
      } else if (msg.includes("no device") || msg.includes("device not found") || msg.includes("Invalid device")) {
        onError(new Error("No audio input device found. Please connect a microphone."));
      } else {
        onError(e);
      }
    }
  }

  /** Stop capturing audio */
  stop(): void {
    if (!this._isRecording || !this.recorder) return;
    this._isRecording = false;

    try { this.recorder.stop(); } catch { /* ignore */ }
    try { this.recorder.release(); } catch { /* ignore */ }

    this.recorder = null;
    this.onData = null;
    this.onError = null;
  }

  /** Internal read loop — polls PvRecorder for audio frames */
  private async runReadLoop(): Promise<void> {
    while (this._isRecording && this.recorder) {
      try {
        const frame: Int16Array = await this.recorder.read();
        if (!this._isRecording) break;

        // Compute RMS (0-1 range)
        let sumSq = 0;
        for (let i = 0; i < frame.length; i++) {
          const n = frame[i] / 32768.0;
          sumSq += n * n;
        }
        const rms = Math.sqrt(sumSq / frame.length);

        this.onData?.(frame, rms);
      } catch (e: any) {
        if (this._isRecording) {
          this.onError?.(e);
          break;
        }
      }
    }
  }
}
