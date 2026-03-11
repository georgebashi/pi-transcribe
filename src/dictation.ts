import type { TranscribeConfig } from "./config.js";
import type { AudioCapture } from "./audio.js";
import type { TranscriptionEngine } from "./recognizer.js";

/**
 * Unicode block characters for waveform rendering, from empty to full.
 * Using lower-block elements: ▁▂▃▄▅▆▇█
 */
const WAVEFORM_BLOCKS = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/** Number of RMS samples to keep for waveform display */
const WAVEFORM_HISTORY = 60;

/** How often to push a new waveform sample (ms) */
const WAVEFORM_INTERVAL = 100;

export class DictationSession {
  private audioCapture: AudioCapture;
  private engine: TranscriptionEngine;
  private config: TranscribeConfig;

  private existingText = "";
  private _isActive = false;

  /** Raw audio buffer — accumulates all recorded PCM data */
  private audioChunks: Int16Array[] = [];
  private totalSamples = 0;

  /** Waveform state */
  private rmsHistory: number[] = [];
  private rmsAccum: number[] = [];
  private waveformTimer: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;

  /** UI refs */
  private uiCtx: any = null;
  private tui: any = null;

  constructor(
    audioCapture: AudioCapture,
    engine: TranscriptionEngine,
    config: TranscribeConfig
  ) {
    this.audioCapture = audioCapture;
    this.engine = engine;
    this.config = config;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  /** Set the TUI reference for triggering re-renders */
  setTui(tui: any): void {
    this.tui = tui;
  }

  /** Get waveform bars for rendering. Returns array of block characters. */
  getWaveformBars(maxBars: number): string[] {
    const history = this.rmsHistory;
    // Take the last `maxBars` entries
    const start = Math.max(0, history.length - maxBars);
    const slice = history.slice(start);

    // Pad with spaces if we don't have enough history yet
    const bars: string[] = [];
    for (let i = 0; i < maxBars - slice.length; i++) {
      bars.push(WAVEFORM_BLOCKS[0]);
    }

    for (const rms of slice) {
      // Map RMS to block index. RMS of speech is typically 0.01-0.15
      // Apply a curve to make speech more visible
      const normalized = Math.min(1, rms * 8);
      const idx = Math.round(normalized * (WAVEFORM_BLOCKS.length - 1));
      bars.push(WAVEFORM_BLOCKS[idx]);
    }

    return bars;
  }

  /** Get elapsed time as MM:SS */
  getElapsedTime(): string {
    if (!this._isActive) return "00:00";
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const secs = String(elapsed % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  }

  /** Start a dictation session */
  start(ctx: any): void {
    if (this._isActive) return;

    this.existingText = ctx.ui.getEditorText() || "";
    this._isActive = true;
    this.uiCtx = ctx;
    this.audioChunks = [];
    this.totalSamples = 0;
    this.rmsHistory = [];
    this.rmsAccum = [];
    this.startTime = Date.now();

    // Periodically average accumulated RMS values into a single waveform sample
    this.waveformTimer = setInterval(() => {
      if (this.rmsAccum.length > 0) {
        const avg = this.rmsAccum.reduce((a, b) => a + b, 0) / this.rmsAccum.length;
        this.rmsHistory.push(avg);
        this.rmsAccum = [];
      } else {
        this.rmsHistory.push(0);
      }
      // Trim history
      if (this.rmsHistory.length > WAVEFORM_HISTORY * 2) {
        this.rmsHistory = this.rmsHistory.slice(-WAVEFORM_HISTORY);
      }
      this.requestRender();
    }, WAVEFORM_INTERVAL);

    // Start audio capture
    this.audioCapture.start(
      (samples: Int16Array, rms: number) => {
        this.audioChunks.push(new Int16Array(samples));
        this.totalSamples += samples.length;
        this.rmsAccum.push(rms);
      },
      (err: Error) => {
        ctx.ui.notify(`Microphone error: ${err.message}`, "error");
        this.cleanup();
        ctx.ui.setWidget("pi-transcribe", undefined);
        ctx.ui.setStatus("pi-transcribe", undefined);
      }
    );
  }

  /** Stop dictation — finalize and batch-transcribe, then commit text to editor */
  async stop(ctx: any): Promise<void> {
    if (!this._isActive) return;

    this.audioCapture.stop();
    this._isActive = false;
    this.stopWaveformTimer();

    // Build the complete audio buffer from chunks
    const audioBuffer = this.buildAudioBuffer();
    const duration = this.totalSamples / this.config.sampleRate;

    if (duration < 0.3) {
      ctx.ui.notify("Recording too short", "info");
      this.cleanup();
      return;
    }

    // Transcribe the complete audio
    const text = await this.engine.transcribe(audioBuffer);

    if (text.length > 0) {
      let editorText = this.existingText;
      if (editorText.length > 0 && !editorText.endsWith(" ") && !editorText.endsWith("\n")) {
        editorText += " ";
      }
      editorText += text;
      ctx.ui.setEditorText(editorText);
      this.requestRender();
    }

    this.cleanup();
  }

  /** Cancel dictation and restore editor to original state */
  cancel(ctx: any): void {
    if (!this._isActive) return;

    this.audioCapture.stop();
    this._isActive = false;
    this.stopWaveformTimer();

    ctx.ui.setEditorText(this.existingText);
    this.requestRender();
    this.cleanup();
  }

  /** Build a single Buffer from accumulated audio chunks */
  private buildAudioBuffer(): Buffer {
    const result = new Int16Array(this.totalSamples);
    let offset = 0;
    for (const chunk of this.audioChunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return Buffer.from(result.buffer, result.byteOffset, result.byteLength);
  }

  private stopWaveformTimer(): void {
    if (this.waveformTimer) {
      clearInterval(this.waveformTimer);
      this.waveformTimer = null;
    }
  }

  private cleanup(): void {
    this.stopWaveformTimer();
    this.audioChunks = [];
    this.totalSamples = 0;
    this.rmsHistory = [];
    this.rmsAccum = [];
    this.uiCtx = null;
  }

  /** Request TUI re-render */
  private requestRender(): void {
    if (this.tui?.requestRender) {
      this.tui.requestRender();
    }
  }
}
