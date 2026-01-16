/**
 * @module
 * Edge-compatible storage abstraction for Pars.
 *
 * Supports:
 * - AWS S3
 * - Cloudflare R2
 * - DigitalOcean Spaces
 * - MinIO (S3-compatible)
 * - Memory (for testing)
 *
 * @example
 * ```typescript
 * import { createStorage } from '@parsrun/storage';
 *
 * // AWS S3
 * const s3 = createStorage({
 *   type: 's3',
 *   bucket: 'my-bucket',
 *   region: 'us-east-1',
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
 * });
 *
 * // Cloudflare R2
 * const r2 = createStorage({
 *   type: 'r2',
 *   bucket: 'my-bucket',
 *   accountId: process.env.CF_ACCOUNT_ID,
 *   accessKeyId: process.env.R2_ACCESS_KEY,
 *   secretAccessKey: process.env.R2_SECRET_KEY,
 * });
 *
 * // Upload
 * await s3.upload('path/to/file.txt', 'Hello, World!');
 *
 * // Download
 * const data = await s3.download('path/to/file.txt');
 *
 * // Get presigned URL
 * const url = await s3.getPresignedUrl('path/to/file.txt', { expiresIn: 3600 });
 * ```
 */

// Types
export {
  type StorageAdapterType,
  type FileMetadata,
  type UploadOptions,
  type DownloadOptions,
  type ListOptions,
  type ListResult,
  type PresignedUrlOptions,
  type CopyOptions,
  type DeleteResult,
  type BatchDeleteResult,
  type StorageAdapter,
  type StorageConfig,
  type S3Config,
  type R2Config,
  type MemoryConfig,
  StorageError,
  StorageErrorCodes,
} from "./types.js";

// Adapters
export { MemoryAdapter, createMemoryAdapter } from "./adapters/memory.js";
export { S3Adapter, createS3Adapter, createDOSpacesAdapter } from "./adapters/s3.js";
export { R2Adapter, createR2Adapter } from "./adapters/r2.js";

// Re-export R2 bucket type for typing
export type { R2Bucket } from "./adapters/r2.js";

import type { S3Config, R2Config, MemoryConfig, StorageAdapter } from "./types.js";
import { StorageError, StorageErrorCodes } from "./types.js";

/**
 * Combined storage configuration
 */
export type AnyStorageConfig = S3Config | R2Config | MemoryConfig;

/**
 * R2 binding type
 */
type R2Bucket = import("./adapters/r2.js").R2Bucket;

/**
 * Create a storage adapter based on configuration
 *
 * @param config - Storage configuration
 * @returns Storage adapter instance
 *
 * @example
 * ```typescript
 * // Memory (for testing)
 * const memory = createStorage({ type: 'memory', bucket: 'test' });
 *
 * // AWS S3
 * const s3 = createStorage({
 *   type: 's3',
 *   bucket: 'my-bucket',
 *   region: 'us-east-1',
 *   accessKeyId: 'xxx',
 *   secretAccessKey: 'xxx',
 * });
 *
 * // Cloudflare R2
 * const r2 = createStorage({
 *   type: 'r2',
 *   bucket: 'my-bucket',
 *   accountId: 'xxx',
 *   accessKeyId: 'xxx',
 *   secretAccessKey: 'xxx',
 * });
 *
 * // DigitalOcean Spaces
 * const spaces = createStorage({
 *   type: 'do-spaces',
 *   bucket: 'my-space',
 *   region: 'nyc3',
 *   accessKeyId: 'xxx',
 *   secretAccessKey: 'xxx',
 *   endpoint: 'https://nyc3.digitaloceanspaces.com',
 * });
 * ```
 */
export async function createStorage(
  config: AnyStorageConfig & { binding?: R2Bucket }
): Promise<StorageAdapter> {
  switch (config.type) {
    case "memory": {
      const { MemoryAdapter } = await import("./adapters/memory.js");
      return new MemoryAdapter(config);
    }

    case "s3":
    case "do-spaces": {
      const { S3Adapter } = await import("./adapters/s3.js");
      return new S3Adapter(config as S3Config);
    }

    case "r2": {
      const { R2Adapter } = await import("./adapters/r2.js");
      return new R2Adapter(config as R2Config & { binding?: R2Bucket });
    }

    default:
      throw new StorageError(
        `Unknown storage type: ${(config as AnyStorageConfig).type}`,
        StorageErrorCodes.INVALID_CONFIG
      );
  }
}

/**
 * Create storage adapter synchronously
 * Note: Some adapters may require async initialization for full functionality
 *
 * @param config - Storage configuration
 * @returns Storage adapter instance
 */
export function createStorageSync(
  config: AnyStorageConfig & { binding?: R2Bucket }
): StorageAdapter {
  switch (config.type) {
    case "memory": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MemoryAdapter } = require("./adapters/memory.js") as typeof import("./adapters/memory.js");
      return new MemoryAdapter(config);
    }

    case "s3":
    case "do-spaces": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { S3Adapter } = require("./adapters/s3.js") as typeof import("./adapters/s3.js");
      return new S3Adapter(config as S3Config);
    }

    case "r2": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { R2Adapter } = require("./adapters/r2.js") as typeof import("./adapters/r2.js");
      return new R2Adapter(config as R2Config & { binding?: R2Bucket });
    }

    default:
      throw new StorageError(
        `Unknown storage type: ${(config as AnyStorageConfig).type}`,
        StorageErrorCodes.INVALID_CONFIG
      );
  }
}

/**
 * Storage utilities
 */
export const StorageUtils = {
  /**
   * Get file extension from key
   */
  getExtension(key: string): string {
    const parts = key.split(".");
    const lastPart = parts[parts.length - 1];
    return parts.length > 1 && lastPart ? lastPart.toLowerCase() : "";
  },

  /**
   * Get file name from key
   */
  getFileName(key: string): string {
    return key.split("/").pop() ?? key;
  },

  /**
   * Get directory from key
   */
  getDirectory(key: string): string {
    const parts = key.split("/");
    parts.pop();
    return parts.join("/");
  },

  /**
   * Join paths safely
   */
  joinPath(...parts: string[]): string {
    return parts
      .filter(Boolean)
      .map((p) => p.replace(/^\/|\/$/g, ""))
      .join("/");
  },

  /**
   * Normalize key (remove leading slash, handle ..)
   */
  normalizeKey(key: string): string {
    return key
      .replace(/^\/+/, "")
      .split("/")
      .filter((p) => p !== ".." && p !== ".")
      .join("/");
  },

  /**
   * Generate a unique key with timestamp
   */
  generateUniqueKey(prefix: string, extension?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 10);
    const ext = extension ? `.${extension}` : "";
    return `${prefix}/${timestamp}-${random}${ext}`;
  },

  /**
   * Guess content type from file extension
   */
  guessContentType(key: string): string {
    const ext = StorageUtils.getExtension(key);
    const contentTypes: Record<string, string> = {
      // Text
      txt: "text/plain",
      html: "text/html",
      htm: "text/html",
      css: "text/css",
      csv: "text/csv",
      xml: "text/xml",

      // Application
      js: "application/javascript",
      mjs: "application/javascript",
      json: "application/json",
      pdf: "application/pdf",
      zip: "application/zip",
      gzip: "application/gzip",
      gz: "application/gzip",
      tar: "application/x-tar",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",

      // Images
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      ico: "image/x-icon",
      bmp: "image/bmp",
      tiff: "image/tiff",
      tif: "image/tiff",

      // Audio
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      flac: "audio/flac",
      aac: "audio/aac",

      // Video
      mp4: "video/mp4",
      webm: "video/webm",
      avi: "video/x-msvideo",
      mov: "video/quicktime",
      mkv: "video/x-matroska",

      // Fonts
      woff: "font/woff",
      woff2: "font/woff2",
      ttf: "font/ttf",
      otf: "font/otf",
      eot: "application/vnd.ms-fontobject",
    };

    return contentTypes[ext] ?? "application/octet-stream";
  },

  /**
   * Format file size to human readable string
   */
  formatSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex > 0 ? 2 : 0)} ${units[unitIndex]}`;
  },

  /**
   * Parse file size string to bytes
   */
  parseSize(size: string): number {
    const units: Record<string, number> = {
      b: 1,
      kb: 1024,
      mb: 1024 * 1024,
      gb: 1024 * 1024 * 1024,
      tb: 1024 * 1024 * 1024 * 1024,
    };

    const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/);
    if (!match || !match[1]) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2] ?? "b";

    return Math.floor(value * (units[unit] ?? 1));
  },
};
