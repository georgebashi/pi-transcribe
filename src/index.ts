import * as path from "node:path";
import * as os from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { DEFAULT_CONFIG } from "./config.js";
import { ModelManager } from "./model-manager.js";
import { AudioCapture } from "./audio.js";
import { TranscriptionEngine } from "./recognizer.js";
import { DictationSession } from "./dictation.js";

export default function (pi: ExtensionAPI) {
  const config = { ...DEFAULT_CONFIG };
  const modelManager = new ModelManager(config, pi);
  let audioCapture: AudioCapture | null = null;
  let engine: TranscriptionEngine | null = null;
  let dictation: DictationSession | null = null;
  let nativeModulesAvailable = true;
  let idleTimeout: ReturnType<typeof setTimeout> | null = null;

  // Check native module availability
  try {
    require("sherpa-onnx-node");
    require("@picovoice/pvrecorder-node");
  } catch (e: any) {
    nativeModulesAvailable = false;
  }

  // --- Session lifecycle ---

  pi.on("session_start", async (_event, ctx) => {
    if (!nativeModulesAvailable) {
      ctx.ui.notify(
        "pi-transcribe: Native modules unavailable on this platform. Dictation disabled.",
        "error"
      );
      return;
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (idleTimeout) clearTimeout(idleTimeout);
    if (dictation?.isActive) {
      dictation.cancel(ctx);
    }
    if (engine) {
      engine.destroy();
      engine = null;
    }
    if (audioCapture) {
      audioCapture = null;
    }
    ctx.ui.setStatus("pi-transcribe", undefined);
    ctx.ui.setWidget("pi-transcribe", undefined);
  });

  // --- /transcribe-setup command ---

  pi.registerCommand("transcribe-setup", {
    description: "Download speech recognition model for dictation",
    handler: async (_args, ctx) => {
      if (!nativeModulesAvailable) {
        ctx.ui.notify(
          "Native modules (sherpa-onnx-node, @picovoice/pvrecorder-node) not available on this platform.",
          "error"
        );
        return;
      }

      const exists = await modelManager.modelsExist();
      if (exists) {
        const redownload = await ctx.ui.confirm(
          "Models already installed",
          "ASR model files already exist. Re-download?"
        );
        if (!redownload) return;
      }

      ctx.ui.setStatus("pi-transcribe", "🎤 Downloading model...");
      ctx.ui.notify("Downloading speech recognition model...", "info");

      try {
        await modelManager.downloadModel();
        ctx.ui.notify("Model downloaded successfully! Dictation is ready.", "info");
        ctx.ui.setStatus("pi-transcribe", "🎤 Ready");
        scheduleIdleClear(ctx);
      } catch (e: any) {
        ctx.ui.notify(`Model download failed: ${e.message}`, "error");
        ctx.ui.setStatus("pi-transcribe", undefined);
      }
    },
  });

  // --- Ctrl+Shift+R shortcut ---

  pi.registerShortcut("ctrl+shift+r", {
    description: "Toggle speech-to-text dictation",
    handler: async (ctx) => {
      if (!nativeModulesAvailable) {
        ctx.ui.notify(
          "pi-transcribe: Native modules not available. Dictation disabled.",
          "error"
        );
        return;
      }

      // If currently recording, stop
      if (dictation?.isActive) {
        await stopDictation(ctx);
        return;
      }

      // Lazy-load engine if needed
      if (!engine) {
        const modelsPresent = await modelManager.modelsExist();
        if (!modelsPresent) {
          ctx.ui.notify(
            "No ASR model found. Run /transcribe-setup first.",
            "warning"
          );
          return;
        }

        ctx.ui.setStatus("pi-transcribe", "🎤 Loading model...");
        try {
          engine = new TranscriptionEngine(config, modelManager);
          const ok = engine.init();
          if (!ok) {
            ctx.ui.notify(
              "Failed to initialize transcription engine. Run /transcribe-setup.",
              "error"
            );
            engine = null;
            ctx.ui.setStatus("pi-transcribe", undefined);
            return;
          }
          ctx.ui.setStatus("pi-transcribe", "🎤 Ready");
        } catch (e: any) {
          ctx.ui.notify(`Engine init failed: ${e.message}`, "error");
          engine = null;
          ctx.ui.setStatus("pi-transcribe", undefined);
          return;
        }
      }

      // Start dictation
      await startDictation(ctx);
    },
  });

  // --- Dictation control ---

  async function startDictation(ctx: any) {
    if (idleTimeout) {
      clearTimeout(idleTimeout);
      idleTimeout = null;
    }

    try {
      if (!audioCapture) {
        audioCapture = new AudioCapture(config);
      }

      dictation = new DictationSession(audioCapture, engine!, config);
      dictation.start(ctx);

      ctx.ui.setStatus("pi-transcribe", "🎤 Recording");
      ctx.ui.setWidget("pi-transcribe", (tui: any, theme: any) => {
        // Capture tui reference for triggering re-renders during dictation
        if (dictation) {
          dictation.setTui(tui);
        }
        return {
          render: () => [
            (theme?.fg?.("accent", "🎙️ Recording...") ?? "🎙️ Recording...") +
            " (Ctrl+Shift+R to stop, Escape to cancel)",
          ],
          invalidate: () => {},
        };
      });
    } catch (e: any) {
      ctx.ui.notify(`Failed to start recording: ${e.message}`, "error");
      ctx.ui.setWidget("pi-transcribe", undefined);
      ctx.ui.setStatus("pi-transcribe", "🎤 Ready");
      scheduleIdleClear(ctx);
    }
  }

  async function stopDictation(ctx: any) {
    if (!dictation?.isActive) return;

    ctx.ui.setWidget("pi-transcribe", ["✨ Transcribing..."]);
    try {
      dictation.stop(ctx);
    } catch (e: any) {
      ctx.ui.notify(`Error stopping dictation: ${e.message}`, "error");
    }

    ctx.ui.setWidget("pi-transcribe", undefined);
    ctx.ui.setStatus("pi-transcribe", "🎤 Ready");
    scheduleIdleClear(ctx);
    dictation = null;
  }

  // --- Escape handling via input event ---

  pi.on("input", async (event, ctx) => {
    // We can't intercept escape directly from input events.
    // Instead, we register a command for cancel.
    return { action: "continue" as const };
  });

  // Register /transcribe-cancel for escape-like behavior
  pi.registerCommand("transcribe-cancel", {
    description: "Cancel active dictation and discard text",
    handler: async (_args, ctx) => {
      if (!dictation?.isActive) {
        ctx.ui.notify("No active dictation to cancel.", "info");
        return;
      }
      dictation.cancel(ctx);
      ctx.ui.setWidget("pi-transcribe", undefined);
      ctx.ui.setStatus("pi-transcribe", "🎤 Ready");
      scheduleIdleClear(ctx);
      dictation = null;
    },
  });

  // --- Escape shortcut for cancel ---
  pi.registerShortcut("escape", {
    description: "Cancel active dictation",
    handler: async (ctx) => {
      if (!dictation?.isActive) return;
      dictation.cancel(ctx);
      ctx.ui.setWidget("pi-transcribe", undefined);
      ctx.ui.setStatus("pi-transcribe", "🎤 Ready");
      scheduleIdleClear(ctx);
      dictation = null;
    },
  });

  // --- Helpers ---

  function scheduleIdleClear(ctx: any) {
    if (idleTimeout) clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
      ctx.ui.setStatus("pi-transcribe", undefined);
      idleTimeout = null;
    }, 5000);
  }
}
