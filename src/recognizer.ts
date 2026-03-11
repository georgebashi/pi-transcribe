import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import type { TranscribeConfig, TranscriberConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write a minimal WAV header for 16-bit mono PCM. */
function writeWavHeader(pcmBuffer: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = pcmBuffer.length;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmBuffer]);
}

/** Run a command with timeout, capture stdout/stderr. */
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
      try { proc.kill("SIGTERM"); } catch {}
      reject(new Error(`${cmd} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });
}

/** Check if a command exists on PATH. */
function commandExists(cmd: string): Promise<boolean> {
  const which = process.platform === "win32" ? "where" : "which";
  return new Promise((resolve) => {
    execFile(which, [cmd], (err) => resolve(!err));
  });
}

/** True when running on Apple Silicon. */
function isAppleSilicon(): boolean {
  return process.platform === "darwin" && process.arch === "arm64";
}

/** Read a .txt file produced by a transcriber in an output directory. */
async function readTxtOutput(outDir: string, stem: string): Promise<string> {
  const expected = path.join(outDir, `${stem}.txt`);
  try {
    return await fs.readFile(expected, "utf-8");
  } catch {
    const files = await fs.readdir(outDir);
    const txt = files.find((f) => f.endsWith(".txt"));
    if (txt) return fs.readFile(path.join(outDir, txt), "utf-8");
    throw new Error("Transcriber produced no .txt output file");
  }
}

// ---------------------------------------------------------------------------
// Backend definitions
// ---------------------------------------------------------------------------

interface Backend {
  /** Primary binary name to check on PATH. */
  binary: string;
  /** Alternative binary names (checked in order). */
  altBinaries?: string[];
  /** Build CLI args for this backend. */
  buildArgs(wavPath: string, outDir: string, config: any): string[];
  /** Extract text from the result (stdout or output files). */
  extractText(stdout: string, outDir: string, stem: string): Promise<string>;
}

const BACKENDS: Record<string, Backend> = {
  "parakeet-mlx": {
    binary: "parakeet-mlx",
    buildArgs(wavPath, outDir, config) {
      const args = ["--output-format", "txt", "--output-dir", outDir];
      if (config.model) args.push("--model", config.model);
      args.push(wavPath);
      return args;
    },
    async extractText(_stdout, outDir, stem) {
      return readTxtOutput(outDir, stem);
    },
  },

  "nano-parakeet": {
    binary: "nano-parakeet",
    buildArgs(wavPath, _outDir, config) {
      const args: string[] = [];
      if (config.model) args.push("--model", config.model);
      // nano-parakeet defaults to CUDA; pick the right device per platform
      if (config.device) {
        args.push("--device", config.device);
      } else if (isAppleSilicon()) {
        args.push("--device", "mps");
      }
      // On Linux/Windows with CUDA, let it auto-detect (default = cuda)
      // On CPU-only systems, torch falls back automatically
      args.push(wavPath);
      return args;
    },
    async extractText(stdout) {
      return stdout;
    },
  },

  "mlx-whisper": {
    binary: "mlx_whisper",
    buildArgs(wavPath, outDir, config) {
      // mlx_whisper takes positional audio first, then flags with dashes (not underscores)
      const args = [
        wavPath,
        "--output-format", "txt",
        "-o", outDir,
        "--verbose", "False",
        "--language", "en",
      ];
      if (config.model) {
        args.push("--model", config.model);
      } else {
        args.push("--model", "mlx-community/whisper-large-v3-turbo");
      }
      return args;
    },
    async extractText(_stdout, outDir, stem) {
      return readTxtOutput(outDir, stem);
    },
  },

  "whisper-cpp": {
    binary: "whisper-cli",
    altBinaries: ["whisper-cpp", "whisper.cpp"],
    buildArgs(wavPath, _outDir, config) {
      return [
        "--no-prints",
        "--no-timestamps",
        "-m", config.modelPath,
        "-f", wavPath,
      ];
    },
    async extractText(stdout) {
      return stdout;
    },
  },

  "whisper": {
    binary: "whisper",
    buildArgs(wavPath, outDir, config) {
      // openai-whisper uses underscores in arg names, audio is positional
      const args = [
        wavPath,
        "--output_format", "txt",
        "--output_dir", outDir,
        "--language", "en",
      ];
      if (config.model) {
        args.push("--model", config.model);
      } else {
        args.push("--model", "turbo");
      }
      return args;
    },
    async extractText(_stdout, outDir, stem) {
      return readTxtOutput(outDir, stem);
    },
  },
};

/**
 * Auto-detect fallback order by platform.
 * Only includes backends that auto-download models (no manual setup).
 */
function getAutoDetectOrder(): string[] {
  if (isAppleSilicon()) {
    return ["parakeet-mlx", "nano-parakeet", "mlx-whisper", "whisper"];
  }
  return ["nano-parakeet", "whisper"];
}

// ---------------------------------------------------------------------------
// TranscriptionEngine
// ---------------------------------------------------------------------------

export class TranscriptionEngine {
  private config: TranscribeConfig;
  /** Resolved backend + binary after check(). */
  private resolved: { backend: Backend; binary: string; backendConfig: any } | null = null;

  constructor(config: TranscribeConfig) {
    this.config = config;
  }

  /**
   * Check if the configured transcriber is available.
   * For "auto", tries the fallback chain and locks the first one found.
   * Returns an error message if nothing is available, or null if OK.
   */
  async check(): Promise<string | null> {
    const t = this.config.transcriber;

    if (t.type === "auto") {
      return this.autoDetect();
    }

    if (t.type === "custom") {
      const cmd = t.command.split(/\s+/)[0];
      if (!(await commandExists(cmd))) {
        return `Custom transcriber not found: ${cmd}`;
      }
      this.resolved = {
        backend: {
          binary: cmd,
          buildArgs(wavPath) {
            const parts = t.command.split(/\s+/);
            return [...parts.slice(1), ...(t.args || []), wavPath];
          },
          async extractText(stdout) { return stdout; },
        },
        binary: cmd,
        backendConfig: t,
      };
      return null;
    }

    const backend = BACKENDS[t.type];
    if (!backend) {
      return `Unknown transcriber: ${t.type}`;
    }

    const binary = await this.findBinary(backend);
    if (!binary) {
      const installHint = INSTALL_HINTS[t.type] || "";
      return `${t.type} not found on PATH.${installHint ? " " + installHint : ""}`;
    }

    this.resolved = { backend, binary, backendConfig: t };
    return null;
  }

  /**
   * Transcribe raw 16-bit PCM audio (16kHz mono).
   * Returns transcribed text or empty string.
   */
  async transcribe(audioBuffer: Buffer): Promise<string> {
    if (!this.resolved) {
      throw new Error("TranscriptionEngine.check() must be called first");
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-transcribe-"));
    const wavPath = path.join(tmpDir, "audio.wav");
    const outDir = path.join(tmpDir, "out");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(wavPath, writeWavHeader(audioBuffer, this.config.sampleRate));

    try {
      const { backend, binary, backendConfig } = this.resolved;
      const args = backend.buildArgs(wavPath, outDir, backendConfig);
      const { stdout } = await runCommand(binary, args, 120_000);
      const text = await backend.extractText(stdout, outDir, "audio");
      return text.trim();
    } finally {
      try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  /** Return the resolved backend name, or null if not yet checked. */
  get resolvedBackend(): string | null {
    if (!this.resolved) return null;
    for (const [name, b] of Object.entries(BACKENDS)) {
      if (b === this.resolved.backend) return name;
    }
    return "custom";
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private async autoDetect(): Promise<string | null> {
    const order = getAutoDetectOrder();
    for (const name of order) {
      const backend = BACKENDS[name];
      if (!backend) continue;
      const binary = await this.findBinary(backend);
      if (binary) {
        this.resolved = { backend, binary, backendConfig: {} };
        return null;
      }
    }

    const platform = isAppleSilicon() ? "Apple Silicon" : process.platform;
    const tried = order.join(", ");
    return (
      `No transcription backend found (tried: ${tried}).\n` +
      `Install one of:\n` +
      order.map((n) => `  ${INSTALL_HINTS[n] || n}`).join("\n")
    );
  }

  private async findBinary(backend: Backend): Promise<string | null> {
    if (await commandExists(backend.binary)) return backend.binary;
    for (const alt of backend.altBinaries || []) {
      if (await commandExists(alt)) return alt;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Install hints
// ---------------------------------------------------------------------------

const INSTALL_HINTS: Record<string, string> = {
  "parakeet-mlx":  "pipx install parakeet-mlx  (or: uv tool install parakeet-mlx)",
  "nano-parakeet": "pipx install nano-parakeet  (or: uv tool install nano-parakeet)",
  "mlx-whisper":   "pipx install mlx-whisper  (or: uv tool install mlx-whisper)",
  "whisper-cpp":   "brew install whisper-cpp  (macOS) or build from source",
  "whisper":       "pipx install openai-whisper  (or: uv tool install openai-whisper)",
};
