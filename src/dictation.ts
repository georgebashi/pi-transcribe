import type { TranscribeConfig } from "./config.js";
import type { AudioCapture } from "./audio.js";
import type { TranscriptionEngine } from "./recognizer.js";

export class DictationSession {
  private audioCapture: AudioCapture;
  private engine: TranscriptionEngine;
  private config: TranscribeConfig;

  private existingText = "";
  private committedText = "";
  private currentPartial = "";
  private _isActive = false;

  /** Pending UI update — we throttle to avoid blocking the event loop */
  private uiUpdatePending = false;
  private uiCtx: any = null;
  /** TUI reference for triggering re-renders */
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

  /** Set the TUI reference (captured from widget factory) for triggering re-renders */
  setTui(tui: any): void {
    this.tui = tui;
  }

  /** Start a dictation session */
  start(ctx: any): void {
    if (this._isActive) return;

    // Capture existing editor content
    this.existingText = ctx.ui.getEditorText() || "";
    this.committedText = "";
    this.currentPartial = "";
    this._isActive = true;
    this.uiCtx = ctx;

    // Set up engine callbacks
    this.engine.onPartialResult = (text: string) => {
      this.currentPartial = text;
      this.scheduleUIUpdate();
    };

    this.engine.onFinalizedSegment = (text: string) => {
      // Append finalized segment with space separator
      if (this.committedText.length > 0) {
        this.committedText += " " + text;
      } else {
        this.committedText = text;
      }
      this.currentPartial = "";
      this.scheduleUIUpdate();
    };

    // Start capturing — pass callbacks directly
    this.audioCapture.start(
      (samples: Float32Array) => {
        try {
          this.engine.feedAudio(samples);
        } catch (e: any) {
          ctx.ui.notify(`Transcription error: ${e.message}`, "error");
          this.audioCapture.stop();
          this._isActive = false;
        }
      },
      (err: Error) => {
        ctx.ui.notify(`Microphone error: ${err.message}`, "error");
        this._isActive = false;
        ctx.ui.setWidget("pi-transcribe", undefined);
      }
    );
  }

  /** Stop dictation and commit remaining text */
  stop(ctx: any): void {
    if (!this._isActive) return;

    this.audioCapture.stop();

    // Finalize remaining audio
    const remaining = this.engine.finalize();
    if (remaining) {
      if (this.committedText.length > 0) {
        this.committedText += " " + remaining;
      } else {
        this.committedText = remaining;
      }
    }

    this.currentPartial = "";
    this.flushEditorUpdate(ctx);
    this._isActive = false;

    // Clear engine callbacks
    this.engine.onPartialResult = null;
    this.engine.onFinalizedSegment = null;
    this.uiCtx = null;
  }

  /** Cancel dictation and restore editor to original state */
  cancel(ctx: any): void {
    if (!this._isActive) return;

    this.audioCapture.stop();
    this._isActive = false;

    // Restore original editor content
    ctx.ui.setEditorText(this.existingText);
    this.requestRender();

    // Clear engine callbacks
    this.engine.onPartialResult = null;
    this.engine.onFinalizedSegment = null;
    this.uiCtx = null;
  }

  /**
   * Schedule a UI update on the next event loop tick.
   * This decouples editor updates from the rapid audio data callbacks,
   * giving the TUI a chance to repaint between updates.
   */
  private scheduleUIUpdate(): void {
    if (this.uiUpdatePending) return;
    this.uiUpdatePending = true;

    setTimeout(() => {
      this.uiUpdatePending = false;
      if (this._isActive && this.uiCtx) {
        this.flushEditorUpdate(this.uiCtx);
      }
    }, 50); // Update UI at most ~20 times per second
  }

  /** Immediately update the editor with current transcription state */
  private flushEditorUpdate(ctx: any): void {
    let text = this.existingText;

    // Add separator between existing text and transcription
    if (text.length > 0 && (this.committedText.length > 0 || this.currentPartial.length > 0)) {
      if (!text.endsWith(" ") && !text.endsWith("\n")) {
        text += " ";
      }
    }

    text += this.committedText;

    // Add partial text
    if (this.currentPartial.length > 0) {
      if (text.length > 0 && !text.endsWith(" ")) {
        text += " ";
      }
      text += this.currentPartial;
    }

    ctx.ui.setEditorText(text);
    this.requestRender();
  }

  /** Request TUI re-render to reflect editor text changes on screen */
  private requestRender(): void {
    if (this.tui?.requestRender) {
      this.tui.requestRender();
    }
  }
}
