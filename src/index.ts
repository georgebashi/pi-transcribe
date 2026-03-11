import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { DEFAULT_CONFIG } from "./config.js";
import { AudioCapture } from "./audio.js";
import { TranscriptionEngine } from "./recognizer.js";
import { DictationSession } from "./dictation.js";

export default function (pi: ExtensionAPI) {
  const config = { ...DEFAULT_CONFIG };
  let audioCapture: AudioCapture | null = null;
  let engine: TranscriptionEngine | null = null;
  let dictation: DictationSession | null = null;
  let pvrecorderAvailable = true;

  // Check pvrecorder availability
  try {
    require("@picovoice/pvrecorder-node");
  } catch (e: any) {
    pvrecorderAvailable = false;
  }

  // --- Session lifecycle ---

  pi.on("session_start", async (_event, ctx) => {
    if (!pvrecorderAvailable) {
      ctx.ui.notify(
        "pi-transcribe: @picovoice/pvrecorder-node not available. Dictation disabled.",
        "error"
      );
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (dictation?.isActive) {
      dictation.cancel(ctx);
    }
    engine = null;
    audioCapture = null;
    dictation = null;
    ctx.ui.setStatus("pi-transcribe", undefined);
    ctx.ui.setWidget("pi-transcribe", undefined);
  });

  // --- Ctrl+Shift+R shortcut ---

  pi.registerShortcut("ctrl+shift+r", {
    description: "Toggle speech-to-text dictation",
    handler: async (ctx) => {
      if (!pvrecorderAvailable) {
        ctx.ui.notify(
          "pi-transcribe: Audio capture not available. Dictation disabled.",
          "error"
        );
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

  async function startDictation(ctx: any) {
    try {
      engine = new TranscriptionEngine(config);

      if (!audioCapture) {
        audioCapture = new AudioCapture(config);
      }

      dictation = new DictationSession(audioCapture, engine, config);
      dictation.start(ctx);

      ctx.ui.setStatus("pi-transcribe", "🎤 Recording");

      // Widget shows live waveform visualization
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
            const hint = " Ctrl+Shift+R stop · Esc cancel";

            // Calculate available width for waveform
            // Account for: label + time + hint + some padding
            const fixedWidth = label.length + time.length + hint.length + 2;
            const barCount = Math.max(10, Math.min(50, width - fixedWidth));

            const bars = dictation.getWaveformBars(barCount);

            // Color the waveform bars
            const waveStr = bars.map(bar => {
              if (bar === " ") return theme?.fg?.("dim", bar) ?? bar;
              return theme?.fg?.("accent", bar) ?? bar;
            }).join("");

            const line = (theme?.fg?.("accent", label) ?? label)
              + waveStr
              + (theme?.fg?.("muted", time) ?? time)
              + (theme?.fg?.("dim", hint) ?? hint);

            return [line];
          },
          invalidate: () => {},
        };
      });
    } catch (e: any) {
      ctx.ui.notify(`Failed to start recording: ${e.message}`, "error");
      ctx.ui.setWidget("pi-transcribe", undefined);
      ctx.ui.setStatus("pi-transcribe", undefined);
      engine = null;
    }
  }

  async function stopDictation(ctx: any) {
    if (!dictation?.isActive) return;

    // Show transcribing state
    ctx.ui.setStatus("pi-transcribe", "✨ Transcribing...");
    ctx.ui.setWidget("pi-transcribe", (tui: any, theme: any) => ({
      render: (width: number) => {
        const text = "✨ Transcribing audio...";
        return [theme?.fg?.("accent", text) ?? text];
      },
      invalidate: () => {},
    }));

    try {
      await dictation.stop(ctx);
    } catch (e: any) {
      ctx.ui.notify(`Transcription error: ${e.message}`, "error");
    }

    ctx.ui.setWidget("pi-transcribe", undefined);
    ctx.ui.setStatus("pi-transcribe", undefined);
    engine = null;
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
      engine = null;
      dictation = null;
    },
  });

  pi.registerCommand("transcribe-cancel", {
    description: "Cancel active dictation and discard text",
    handler: async (_args, ctx) => {
      if (!dictation?.isActive) {
        ctx.ui.notify("No active dictation to cancel.", "info");
        return;
      }
      dictation.cancel(ctx);
      ctx.ui.setWidget("pi-transcribe", undefined);
      ctx.ui.setStatus("pi-transcribe", undefined);
      engine = null;
      dictation = null;
    },
  });
}
