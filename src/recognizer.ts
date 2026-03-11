import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import { spawn } from "node:child_process";
import type { TranscribeConfig, TranscriberConfig } from "./config.js";

/**
 * Writes a minimal WAV header for 16-bit mono PCM at the given sample rate.
 */
function writeWavHeader(pcmBuffer: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = pcmBuffer.length;
  const fileSize = 36 + dataSize;

  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);        // PCM chunk size
  header.writeUInt16LE(1, 20);         // PCM format
  header.writeUInt16LE(1, 22);         // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate (16-bit mono)
  header.writeUInt16LE(2, 32);         // block align
  header.writeUInt16LE(16, 34);        // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Run a CLI command, capture stdout/stderr, return stdout on success.
 */
function runCommand(
  cmd: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout!.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr!.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("error", (err: Error) => {
      reject(new Error(`Failed to run ${cmd}: ${err.message}`));
    });

    proc.on("exit", (code: number | null) => {
      if (code !== 0) {
        reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      resolve({ stdout, stderr });
    });

    setTimeout(() => {
      try { proc.kill("SIGTERM"); } catch { /* ignore */ }
      reject(new Error(`${cmd} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });
}

/**
 * Check if a command exists on PATH.
 */
async function commandExists(cmd: string): Promise<boolean> {
  try {
    const { execFile } = await import("node:child_process");
    return new Promise((resolve) => {
      execFile("which", [cmd], (err) => resolve(!err));
    });
  } catch {
    return false;
  }
}

/**
 * Transcription engine that delegates to a CLI transcriber.
 * 
 * Supported backends:
 * - parakeet-mlx: Apple Silicon ASR via MLX (install: `pipx install parakeet-mlx`)
 * - custom: Any CLI that takes an audio file path and outputs text
 */
export class TranscriptionEngine {
  private config: TranscribeConfig;

  constructor(config: TranscribeConfig) {
    this.config = config;
  }

  /**
   * Check if the configured transcriber is available on PATH.
   * Returns an error message if not available, or null if OK.
   */
  async check(): Promise<string | null> {
    const t = this.config.transcriber;

    if (t.type === "parakeet-mlx") {
      if (!(await commandExists("parakeet-mlx"))) {
        return (
          "parakeet-mlx not found on PATH. Install it with:\n" +
          "  pipx install parakeet-mlx\n" +
          "  # or: uv tool install parakeet-mlx"
        );
      }
      return null;
    }

    if (t.type === "custom") {
      const cmd = t.command.split(/\s+/)[0];
      if (!(await commandExists(cmd))) {
        return `Custom transcriber command not found: ${cmd}`;
      }
      return null;
    }

    return `Unknown transcriber type: ${(t as any).type}`;
  }

  /**
   * Transcribe a buffer of raw 16-bit PCM audio (16kHz mono).
   * Returns the transcribed text, or empty string if nothing was recognized.
   */
  async transcribe(audioBuffer: Buffer): Promise<string> {
    // Write PCM as WAV to a temp file
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-transcribe-"));
    const wavPath = path.join(tmpDir, "audio.wav");
    const wavData = writeWavHeader(audioBuffer, this.config.sampleRate);
    await fs.writeFile(wavPath, wavData);

    try {
      const text = await this.runTranscriber(wavPath, tmpDir);
      return text.trim();
    } finally {
      // Clean up temp files
      try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  private async runTranscriber(wavPath: string, tmpDir: string): Promise<string> {
    const t = this.config.transcriber;

    if (t.type === "parakeet-mlx") {
      return this.runParakeetMlx(wavPath, tmpDir, t.modelId);
    }

    if (t.type === "custom") {
      return this.runCustom(wavPath, t);
    }

    throw new Error(`Unknown transcriber type: ${(t as any).type}`);
  }

  /**
   * Run parakeet-mlx CLI:
   *   parakeet-mlx --output-format txt --output-dir <tmpDir> [--model <id>] <wavPath>
   * Then read the .txt output file.
   */
  private async runParakeetMlx(
    wavPath: string,
    tmpDir: string,
    modelId?: string
  ): Promise<string> {
    const outDir = path.join(tmpDir, "out");
    await fs.mkdir(outDir, { recursive: true });

    const args = [
      "--output-format", "txt",
      "--output-dir", outDir,
    ];
    if (modelId) {
      args.push("--model", modelId);
    }
    args.push(wavPath);

    await runCommand("parakeet-mlx", args, 60_000);

    // Read the .txt output — filename matches input stem
    const txtPath = path.join(outDir, "audio.txt");
    try {
      return await fs.readFile(txtPath, "utf-8");
    } catch {
      // Try to find any .txt file in the output dir
      const files = await fs.readdir(outDir);
      const txtFile = files.find((f) => f.endsWith(".txt"));
      if (txtFile) {
        return await fs.readFile(path.join(outDir, txtFile), "utf-8");
      }
      throw new Error("parakeet-mlx produced no output file");
    }
  }

  /**
   * Run a custom transcriber command.
   * The command receives the WAV file path as the last argument.
   * Expected to print transcribed text to stdout.
   */
  private async runCustom(
    wavPath: string,
    config: { command: string; args?: string[] }
  ): Promise<string> {
    const parts = config.command.split(/\s+/);
    const cmd = parts[0];
    const baseArgs = [...parts.slice(1), ...(config.args || [])];
    const args = [...baseArgs, wavPath];

    const { stdout } = await runCommand(cmd, args, 60_000);
    return stdout;
  }
}
