import * as path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { TranscribeConfig } from "./config.js";

/**
 * Batch transcription engine.
 * Spawns a Python worker that reads all audio from stdin, transcribes it,
 * and returns the result as a single JSON line on stdout.
 */
export class TranscriptionEngine {
  private config: TranscribeConfig;

  constructor(config: TranscribeConfig) {
    this.config = config;
  }

  /**
   * Transcribe a buffer of raw 16-bit PCM audio (16kHz mono).
   * Returns the transcribed text, or empty string if nothing was recognized.
   */
  async transcribe(audioBuffer: Buffer): Promise<string> {
    const workerScript = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "transcribe_worker.py"
    );

    const venvPython = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "..",
      ".venv",
      "bin",
      "python3"
    );

    const pythonBin = await fileExists(venvPython) ? venvPython : "python3";

    return new Promise<string>((resolve, reject) => {
      const proc = spawn(pythonBin, [workerScript, this.config.modelId], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout!.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on("error", (err: Error) => {
        reject(new Error(`Failed to start transcription worker: ${err.message}`));
      });

      proc.on("exit", (code: number | null) => {
        if (code !== 0) {
          // Try to extract error from stdout JSON
          try {
            const msg = JSON.parse(stdout.trim());
            if (msg.type === "error") {
              reject(new Error(msg.message));
              return;
            }
          } catch { /* ignore */ }
          reject(new Error(`Transcription worker exited with code ${code}: ${stderr.slice(0, 200)}`));
          return;
        }

        // Parse result from stdout — expect a single JSON line
        try {
          const msg = JSON.parse(stdout.trim());
          if (msg.type === "result") {
            resolve(msg.text || "");
          } else if (msg.type === "error") {
            reject(new Error(msg.message));
          } else {
            resolve("");
          }
        } catch {
          reject(new Error(`Failed to parse worker output: ${stdout.slice(0, 200)}`));
        }
      });

      // Write all audio to stdin and close
      proc.stdin!.write(audioBuffer, () => {
        proc.stdin!.end();
      });

      // Timeout after 30s
      setTimeout(() => {
        try { proc.kill("SIGTERM"); } catch { /* ignore */ }
        reject(new Error("Transcription timed out"));
      }, 30000);
    });
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const fs = await import("node:fs/promises");
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
