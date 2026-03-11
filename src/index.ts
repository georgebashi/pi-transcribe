import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { DEFAULT_CONFIG } from "./config.js";
import { AudioCapture } from "./audio.js";
import { TranscriptionEngine } from "./recognizer.js";
import { DictationSession } from "./dictation.js";

/** Number of rapid spaces needed to trigger recording */
const SPACE_TRIGGER_COUNT = 3;
/** Max time between spaces to count as "holding" (ms) */
const SPACE_GAP_MS = 150;
/** Time after last space to consider key released (ms) */
const SPACE_RELEASE_MS = 200;

export default function (pi: ExtensionAPI) {
  const config = { ...DEFAULT_CONFIG };
  let audioCapture: AudioCapture | null = null;
  let dictation: DictationSession | null = null;
  let pvrecorderAvailable = true;
  let currentCtx: any = null;

  // Check pvrecorder availability
  try {
    require("@picovoice/pvrecorder-node");
  } catch {
    pvrecorderAvailable = false;
  }

  // --- Session lifecycle ---

  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;

    if (!pvrecorderAvailable) {
      ctx.ui.notify(
        "pi-transcribe: @picovoice/pvrecorder-node not available. Dictation disabled.",
        "error"
      );
      return;
    }

    // Install our custom editor that detects spacebar hold
    ctx.ui.setEditorComponent((tui: any, theme: any, keybindings: any) => {
      const editor = new DictationEditor(tui, theme, keybindings, {
        onRecordingStart: () => startDictation(ctx, editor),
        onRecordingStop: () => stopDictation(ctx, editor),
        pvrecorderAvailable,
      });
      return editor;
    });
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (dictation?.isActive) {
      dictation.cancel(ctx);
    }
    audioCapture = null;
    dictation = null;
    ctx.ui.setStatus("pi-transcribe", undefined);
    ctx.ui.setWidget("pi-transcribe", undefined);
    currentCtx = null;
  });

  // --- Ctrl+Shift+R shortcut (still works as toggle) ---

  pi.registerShortcut("ctrl+shift+r", {
    description: "Toggle speech-to-text dictation",
    handler: async (ctx) => {
      if (!pvrecorderAvailable) {
        ctx.ui.notify("pi-transcribe: Audio capture not available.", "error");
        return;
      }

      if (dictation?.isActive) {
        await stopDictation(ctx);
        return;
      }

      await startDictation(ctx);
    },
  });

  // --- Dictation control ---

  async function startDictation(ctx: any, editor?: DictationEditor) {
    if (dictation?.isActive) return;

    try {
      const engine = new TranscriptionEngine(config);

      if (!audioCapture) {
        audioCapture = new AudioCapture(config);
      }

      dictation = new DictationSession(audioCapture, engine, config);
      dictation.start(ctx);

      ctx.ui.setStatus("pi-transcribe", "🎤 Recording");

      // Widget shows live waveform
      ctx.ui.setWidget("pi-transcribe", (tui: any, theme: any) => {
        if (dictation) {
          dictation.setTui(tui);
        }

        return {
          render: (width: number) => {
            if (!dictation) return [""];

            const elapsed = dictation.getElapsedTime();
            const label = "🎤 ";
            const time = ` ${elapsed} `;
            const hint = " ␣ release to transcribe · Esc cancel";

            const fixedWidth = label.length + time.length + hint.length + 2;
            const barCount = Math.max(10, Math.min(50, width - fixedWidth));
            const bars = dictation.getWaveformBars(barCount);

            const waveStr = bars.map(bar =>
              bar === " "
                ? (theme?.fg?.("dim", bar) ?? bar)
                : (theme?.fg?.("accent", bar) ?? bar)
            ).join("");

            const line = (theme?.fg?.("accent", label) ?? label)
              + waveStr
              + (theme?.fg?.("muted", time) ?? time)
              + (theme?.fg?.("dim", hint) ?? hint);

            return [line];
          },
          invalidate: () => {},
        };
      }, { placement: "belowEditor" });
    } catch (e: any) {
      ctx.ui.notify(`Failed to start recording: ${e.message}`, "error");
      ctx.ui.setWidget("pi-transcribe", undefined);
      ctx.ui.setStatus("pi-transcribe", undefined);
      dictation = null;
    }
  }

  async function stopDictation(ctx: any, editor?: DictationEditor) {
    if (!dictation?.isActive) return;

    ctx.ui.setStatus("pi-transcribe", "✨ Transcribing...");
    ctx.ui.setWidget("pi-transcribe", (tui: any, theme: any) => ({
      render: () => [theme?.fg?.("accent", "✨ Transcribing audio...") ?? "✨ Transcribing audio..."],
      invalidate: () => {},
    }), { placement: "belowEditor" });

    try {
      const text = await dictation.stop(ctx);

      // Insert transcribed text at cursor position (instead of appending to editor)
      if (text && text.length > 0 && editor) {
        editor.insertTextAtCursor(text);
      }
    } catch (e: any) {
      ctx.ui.notify(`Transcription error: ${e.message}`, "error");
    }

    ctx.ui.setWidget("pi-transcribe", undefined);
    ctx.ui.setStatus("pi-transcribe", undefined);
    dictation = null;
  }

  // --- Escape handling ---

  pi.registerShortcut("escape", {
    description: "Cancel active dictation",
    handler: async (ctx) => {
      if (!dictation?.isActive) return;
      dictation.cancel(ctx);
      ctx.ui.setWidget("pi-transcribe", undefined);
      ctx.ui.setStatus("pi-transcribe", undefined);
      dictation = null;
    },
  });
}

/**
 * Custom editor that detects spacebar hold-to-record.
 *
 * When the user holds spacebar, rapid auto-repeat generates a stream of space characters.
 * After SPACE_TRIGGER_COUNT rapid spaces (within SPACE_GAP_MS of each other),
 * we switch to recording mode and consume further spaces.
 * When spaces stop arriving (SPACE_RELEASE_MS timeout), we stop recording.
 */
class DictationEditor extends CustomEditor {
  private spaceBuffer = 0;
  private lastSpaceTime = 0;
  private rapidCount = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  private isRecording = false;
  private callbacks: {
    onRecordingStart: () => void;
    onRecordingStop: () => void;
    pvrecorderAvailable: boolean;
  };

  constructor(tui: any, theme: any, keybindings: any, callbacks: {
    onRecordingStart: () => void;
    onRecordingStop: () => void;
    pvrecorderAvailable: boolean;
  }) {
    super(tui, theme, keybindings);
    this.callbacks = callbacks;
  }

  handleInput(data: string): void {
    const now = Date.now();

    if (data === " ") {
      const gap = now - this.lastSpaceTime;
      this.lastSpaceTime = now;

      if (this.isRecording) {
        // Already recording — consume space, reset release timer
        this.clearReleaseTimer();
        this.releaseTimer = setTimeout(() => this.onSpaceRelease(), SPACE_RELEASE_MS);
        return;
      }

      // Count rapid spaces (gaps within threshold)
      if (gap <= SPACE_GAP_MS && this.spaceBuffer > 0) {
        this.rapidCount++;
      } else {
        this.rapidCount = 1;
      }

      // Buffer the space (don't insert into editor yet)
      this.spaceBuffer++;

      if (this.rapidCount >= SPACE_TRIGGER_COUNT) {
        // Trigger! Discard all buffered spaces and start recording
        this.clearFlushTimer();
        this.spaceBuffer = 0;
        this.rapidCount = 0;
        this.isRecording = true;

        this.callbacks.onRecordingStart();

        this.releaseTimer = setTimeout(() => this.onSpaceRelease(), SPACE_RELEASE_MS);
        return;
      }

      // Not triggered yet — set timer to flush buffered spaces if no more come
      this.clearFlushTimer();
      this.flushTimer = setTimeout(() => {
        this.flushSpaces();
      }, SPACE_GAP_MS);

      return;
    }

    // Non-space input
    if (this.isRecording) {
      this.onSpaceRelease();
      // Don't pass the non-space through — it was accidental during recording
      return;
    }

    // Flush any buffered spaces first, then handle the character
    this.flushSpaces();
    super.handleInput(data);
  }

  /** Flush buffered spaces into the editor as normal text */
  private flushSpaces(): void {
    this.clearFlushTimer();
    if (this.spaceBuffer > 0) {
      for (let i = 0; i < this.spaceBuffer; i++) {
        super.handleInput(" ");
      }
      this.spaceBuffer = 0;
    }
    this.rapidCount = 0;
  }

  private onSpaceRelease(): void {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.spaceBuffer = 0;
    this.rapidCount = 0;
    this.clearReleaseTimer();
    this.clearFlushTimer();
    this.callbacks.onRecordingStop();
  }

  private clearReleaseTimer(): void {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
