import * as path from "node:path";
import * as fs from "node:fs";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { TranscribeConfig } from "./config.js";

export class ModelManager {
  private config: TranscribeConfig;
  private pi: ExtensionAPI;

  constructor(config: TranscribeConfig, pi: ExtensionAPI) {
    this.config = config;
    this.pi = pi;
  }

  /** Directory containing the extracted model files */
  get modelPath(): string {
    return path.join(this.config.modelDir, this.config.modelName);
  }

  get encoderPath(): string {
    return path.join(this.modelPath, "encoder-epoch-99-avg-1.int8.onnx");
  }

  get decoderPath(): string {
    return path.join(this.modelPath, "decoder-epoch-99-avg-1.int8.onnx");
  }

  get joinerPath(): string {
    return path.join(this.modelPath, "joiner-epoch-99-avg-1.int8.onnx");
  }

  get tokensPath(): string {
    return path.join(this.modelPath, "tokens.txt");
  }

  /** Check if all required model files exist */
  async modelsExist(): Promise<boolean> {
    try {
      const files = [
        this.encoderPath,
        this.decoderPath,
        this.joinerPath,
        this.tokensPath,
      ];
      for (const f of files) {
        fs.accessSync(f, fs.constants.R_OK);
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Download and extract the model archive */
  async downloadModel(): Promise<void> {
    // Ensure the model directory exists
    fs.mkdirSync(this.config.modelDir, { recursive: true });

    const archivePath = path.join(
      this.config.modelDir,
      `${this.config.modelName}.tar.bz2`
    );

    try {
      // Download
      const dlResult = await this.pi.exec(
        "curl",
        ["-fSL", "-o", archivePath, this.config.modelUrl],
        { timeout: 300000 } // 5 minute timeout
      );

      if (dlResult.code !== 0) {
        throw new Error(
          `Download failed (exit ${dlResult.code}): ${dlResult.stderr}`
        );
      }

      // Extract
      const extractResult = await this.pi.exec(
        "tar",
        ["-xjf", archivePath, "-C", this.config.modelDir],
        { timeout: 60000 }
      );

      if (extractResult.code !== 0) {
        throw new Error(
          `Extraction failed (exit ${extractResult.code}): ${extractResult.stderr}`
        );
      }

      // Verify
      const exists = await this.modelsExist();
      if (!exists) {
        throw new Error(
          "Model files not found after extraction. Archive may be corrupt."
        );
      }

      // Clean up archive
      try {
        fs.unlinkSync(archivePath);
      } catch {
        // non-critical
      }
    } catch (e) {
      // Clean up partial files on error
      try {
        fs.unlinkSync(archivePath);
      } catch {
        // ignore
      }
      throw e;
    }
  }
}
