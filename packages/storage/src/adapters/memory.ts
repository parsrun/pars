/**
 * @parsrun/storage - Memory Adapter
 * In-memory storage adapter for development and testing
 */

import {
  type BatchDeleteResult,
  type CopyOptions,
  type DeleteResult,
  type DownloadOptions,
  type FileMetadata,
  type ListOptions,
  type ListResult,
  type MemoryConfig,
  type PresignedUrlOptions,
  type StorageAdapter,
  type UploadOptions,
  StorageError,
  StorageErrorCodes,
} from "../types.js";

/**
 * Internal file storage structure
 */
interface StoredFile {
  data: Uint8Array;
  metadata: FileMetadata;
}

/**
 * Memory Storage Adapter
 * Stores files in memory - useful for development and testing
 *
 * @example
 * ```typescript
 * const storage = new MemoryAdapter({
 *   type: 'memory',
 *   bucket: 'test-bucket',
 * });
 *
 * await storage.upload('test.txt', 'Hello, World!');
 * const data = await storage.download('test.txt');
 * ```
 */
export class MemoryAdapter implements StorageAdapter {
  readonly type = "memory" as const;
  readonly bucket: string;

  private files: Map<string, StoredFile> = new Map();
  private maxSize: number;
  private currentSize = 0;
  private basePath: string;

  constructor(config: MemoryConfig) {
    this.bucket = config.bucket;
    this.maxSize = config.maxSize ?? Infinity;
    this.basePath = config.basePath ?? "";
  }

  private getFullKey(key: string): string {
    return this.basePath ? `${this.basePath}/${key}` : key;
  }

  private validateKey(key: string): void {
    if (!key || key.includes("..") || key.startsWith("/")) {
      throw new StorageError(
        `Invalid key: ${key}`,
        StorageErrorCodes.INVALID_KEY
      );
    }
  }

  private dataToUint8Array(
    data: Uint8Array | ReadableStream<Uint8Array> | Blob | string
  ): Promise<Uint8Array> | Uint8Array {
    if (data instanceof Uint8Array) {
      return data;
    }

    if (typeof data === "string") {
      return new TextEncoder().encode(data);
    }

    if (data instanceof Blob) {
      return data.arrayBuffer().then((buffer) => new Uint8Array(buffer));
    }

    // ReadableStream
    return this.streamToUint8Array(data);
  }

  private async streamToUint8Array(
    stream: ReadableStream<Uint8Array>
  ): Promise<Uint8Array> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  async upload(
    key: string,
    data: Uint8Array | ReadableStream<Uint8Array> | Blob | string,
    options?: UploadOptions
  ): Promise<FileMetadata> {
    this.validateKey(key);
    const fullKey = this.getFullKey(key);

    const uint8Data = await this.dataToUint8Array(data);

    // Check quota
    const existingFile = this.files.get(fullKey);
    const sizeDiff = uint8Data.length - (existingFile?.data.length ?? 0);

    if (this.currentSize + sizeDiff > this.maxSize) {
      throw new StorageError(
        "Storage quota exceeded",
        StorageErrorCodes.QUOTA_EXCEEDED
      );
    }

    const metadata: FileMetadata = {
      key: fullKey,
      size: uint8Data.length,
      contentType: options?.contentType ?? this.guessContentType(key),
      lastModified: new Date(),
      etag: this.generateEtag(uint8Data),
      metadata: options?.metadata ?? undefined,
    };

    this.files.set(fullKey, { data: uint8Data, metadata });
    this.currentSize += sizeDiff;

    return metadata;
  }

  async download(key: string, _options?: DownloadOptions): Promise<Uint8Array> {
    this.validateKey(key);
    const fullKey = this.getFullKey(key);

    const file = this.files.get(fullKey);
    if (!file) {
      throw new StorageError(
        `File not found: ${key}`,
        StorageErrorCodes.NOT_FOUND,
        404
      );
    }

    return file.data;
  }

  async downloadStream(
    key: string,
    _options?: DownloadOptions
  ): Promise<ReadableStream<Uint8Array>> {
    const data = await this.download(key);

    return new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });
  }

  async head(key: string): Promise<FileMetadata | null> {
    this.validateKey(key);
    const fullKey = this.getFullKey(key);

    const file = this.files.get(fullKey);
    return file?.metadata ?? null;
  }

  async exists(key: string): Promise<boolean> {
    this.validateKey(key);
    const fullKey = this.getFullKey(key);
    return this.files.has(fullKey);
  }

  async delete(key: string): Promise<DeleteResult> {
    this.validateKey(key);
    const fullKey = this.getFullKey(key);

    const file = this.files.get(fullKey);
    if (file) {
      this.currentSize -= file.data.length;
      this.files.delete(fullKey);
    }

    return { success: true, key: fullKey };
  }

  async deleteMany(keys: string[]): Promise<BatchDeleteResult> {
    const deleted: string[] = [];
    const errors: Array<{ key: string; error: string }> = [];

    for (const key of keys) {
      try {
        await this.delete(key);
        deleted.push(this.getFullKey(key));
      } catch (err) {
        errors.push({
          key: this.getFullKey(key),
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return { deleted, errors };
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const prefix = options?.prefix
      ? this.getFullKey(options.prefix)
      : this.basePath;
    const delimiter = options?.delimiter ?? "/";
    const maxKeys = options?.maxKeys ?? 1000;

    const files: FileMetadata[] = [];
    const prefixSet = new Set<string>();

    for (const [key, file] of this.files) {
      if (prefix && !key.startsWith(prefix)) {
        continue;
      }

      const relativePath = prefix ? key.slice(prefix.length) : key;

      // Handle delimiter for hierarchical listing
      if (delimiter) {
        const delimiterIndex = relativePath.indexOf(delimiter);
        if (delimiterIndex !== -1) {
          const commonPrefix = key.slice(0, prefix.length + delimiterIndex + 1);
          prefixSet.add(commonPrefix);
          continue;
        }
      }

      files.push(file.metadata);

      if (files.length >= maxKeys) {
        break;
      }
    }

    return {
      files,
      prefixes: Array.from(prefixSet),
      isTruncated: files.length >= maxKeys,
      continuationToken: undefined,
    };
  }

  async copy(
    sourceKey: string,
    destKey: string,
    options?: CopyOptions
  ): Promise<FileMetadata> {
    this.validateKey(sourceKey);
    this.validateKey(destKey);

    const sourceFullKey = this.getFullKey(sourceKey);
    const destFullKey = this.getFullKey(destKey);

    const sourceFile = this.files.get(sourceFullKey);
    if (!sourceFile) {
      throw new StorageError(
        `Source file not found: ${sourceKey}`,
        StorageErrorCodes.NOT_FOUND,
        404
      );
    }

    const newMetadata: FileMetadata =
      options?.metadataDirective === "REPLACE"
        ? {
            key: destFullKey,
            size: sourceFile.data.length,
            contentType: options.contentType ?? sourceFile.metadata.contentType,
            lastModified: new Date(),
            etag: sourceFile.metadata.etag,
            metadata: options.metadata ?? undefined,
          }
        : {
            ...sourceFile.metadata,
            key: destFullKey,
            lastModified: new Date(),
          };

    this.files.set(destFullKey, {
      data: sourceFile.data,
      metadata: newMetadata,
    });
    this.currentSize += sourceFile.data.length;

    return newMetadata;
  }

  async move(sourceKey: string, destKey: string): Promise<FileMetadata> {
    const metadata = await this.copy(sourceKey, destKey);
    await this.delete(sourceKey);
    return metadata;
  }

  async getPresignedUrl(
    key: string,
    options?: PresignedUrlOptions
  ): Promise<string> {
    this.validateKey(key);
    const fullKey = this.getFullKey(key);

    // Memory adapter doesn't support real presigned URLs
    // Return a fake URL for testing purposes
    const expiresIn = options?.expiresIn ?? 3600;
    const expires = Date.now() + expiresIn * 1000;

    return `memory://${this.bucket}/${fullKey}?expires=${expires}`;
  }

  async getUploadUrl(
    key: string,
    options?: PresignedUrlOptions
  ): Promise<string> {
    return this.getPresignedUrl(key, options);
  }

  /**
   * Clear all files (useful for testing)
   */
  clear(): void {
    this.files.clear();
    this.currentSize = 0;
  }

  /**
   * Get current storage size
   */
  getSize(): number {
    return this.currentSize;
  }

  /**
   * Get file count
   */
  getFileCount(): number {
    return this.files.size;
  }

  private guessContentType(key: string): string {
    const ext = key.split(".").pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      txt: "text/plain",
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      json: "application/json",
      xml: "application/xml",
      pdf: "application/pdf",
      zip: "application/zip",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      mp3: "audio/mpeg",
      mp4: "video/mp4",
      webm: "video/webm",
    };
    return contentTypes[ext ?? ""] ?? "application/octet-stream";
  }

  private generateEtag(data: Uint8Array): string {
    // Simple hash for testing - not cryptographically secure
    let hash = 0;
    for (const byte of data) {
      hash = ((hash << 5) - hash + byte) | 0;
    }
    return `"${Math.abs(hash).toString(16)}"`;
  }
}

/**
 * Create a memory storage adapter
 */
export function createMemoryAdapter(
  config: Omit<MemoryConfig, "type">
): MemoryAdapter {
  return new MemoryAdapter({ ...config, type: "memory" });
}
