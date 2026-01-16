/**
 * @parsrun/storage - R2 Adapter
 * Cloudflare R2 storage adapter (edge-native)
 *
 * This adapter works in two modes:
 * 1. Worker binding (native R2 API) - fastest, edge-native
 * 2. S3-compatible API - for non-Worker environments
 */

import {
  type BatchDeleteResult,
  type CopyOptions,
  type DeleteResult,
  type DownloadOptions,
  type FileMetadata,
  type ListOptions,
  type ListResult,
  type PresignedUrlOptions,
  type R2Config,
  type StorageAdapter,
  type UploadOptions,
  StorageError,
  StorageErrorCodes,
} from "../types.js";

/**
 * Cloudflare R2 Bucket binding type
 */
export interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string | null | Blob,
    options?: R2PutOptions
  ): Promise<R2Object>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: R2ListOptions): Promise<R2Objects>;
  createMultipartUpload(key: string, options?: R2MultipartOptions): Promise<R2MultipartUpload>;
}

interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  checksums: R2Checksums;
  uploaded: Date;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  range?: R2Range;
}

interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
  blob(): Promise<Blob>;
}

interface R2Checksums {
  md5?: ArrayBuffer;
  sha1?: ArrayBuffer;
  sha256?: ArrayBuffer;
  sha384?: ArrayBuffer;
  sha512?: ArrayBuffer;
}

interface R2HTTPMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

interface R2Range {
  offset: number;
  length: number;
}

interface R2GetOptions {
  onlyIf?: R2Conditional;
  range?: R2Range | { offset?: number; length?: number; suffix?: number };
}

interface R2PutOptions {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  md5?: ArrayBuffer | string;
  sha1?: ArrayBuffer | string;
  sha256?: ArrayBuffer | string;
  sha384?: ArrayBuffer | string;
  sha512?: ArrayBuffer | string;
}

interface R2Conditional {
  etagMatches?: string;
  etagDoesNotMatch?: string;
  uploadedBefore?: Date;
  uploadedAfter?: Date;
}

interface R2ListOptions {
  prefix?: string;
  cursor?: string;
  delimiter?: string;
  limit?: number;
  include?: ("httpMetadata" | "customMetadata")[];
}

interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
  delimitedPrefixes: string[];
}

interface R2MultipartOptions {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
}

interface R2MultipartUpload {
  key: string;
  uploadId: string;
  uploadPart(partNumber: number, value: ArrayBuffer | ArrayBufferView | ReadableStream | string | Blob): Promise<R2UploadedPart>;
  abort(): Promise<void>;
  complete(uploadedParts: R2UploadedPart[]): Promise<R2Object>;
}

interface R2UploadedPart {
  partNumber: number;
  etag: string;
}

/**
 * R2 Storage Adapter
 * Native Cloudflare R2 adapter optimized for Workers/Edge
 *
 * @example
 * ```typescript
 * // In Cloudflare Worker with binding
 * const r2 = new R2Adapter({
 *   type: 'r2',
 *   bucket: 'my-bucket',
 *   accountId: env.CF_ACCOUNT_ID,
 *   accessKeyId: env.R2_ACCESS_KEY,
 *   secretAccessKey: env.R2_SECRET_KEY,
 *   binding: env.MY_BUCKET, // R2 binding
 * });
 *
 * // Using S3-compatible API (non-Worker)
 * const r2 = new R2Adapter({
 *   type: 'r2',
 *   bucket: 'my-bucket',
 *   accountId: env.CF_ACCOUNT_ID,
 *   accessKeyId: env.R2_ACCESS_KEY,
 *   secretAccessKey: env.R2_SECRET_KEY,
 * });
 * ```
 */
export class R2Adapter implements StorageAdapter {
  readonly type = "r2" as const;
  readonly bucket: string;

  private binding: R2Bucket | null = null;
  private s3Adapter: StorageAdapter | null = null;
  private config: R2Config & { binding?: R2Bucket };
  private basePath: string;

  constructor(config: R2Config & { binding?: R2Bucket }) {
    this.bucket = config.bucket;
    this.config = config;
    this.basePath = config.basePath ?? "";
    this.binding = config.binding ?? null;
  }

  /**
   * Get S3 adapter for fallback
   */
  private async getS3Adapter(): Promise<StorageAdapter> {
    if (this.s3Adapter) return this.s3Adapter;

    // Dynamically import S3 adapter
    const { S3Adapter } = await import("./s3.js");

    this.s3Adapter = new S3Adapter({
      type: "s3",
      bucket: this.bucket,
      region: "auto",
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      endpoint: `https://${this.config.accountId}.r2.cloudflarestorage.com`,
    });

    return this.s3Adapter;
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

  private async dataToBody(
    data: Uint8Array | ReadableStream<Uint8Array> | Blob | string
  ): Promise<ArrayBuffer | ReadableStream | string | Blob> {
    if (data instanceof Uint8Array) {
      // Create a proper ArrayBuffer from the Uint8Array
      const buffer = new ArrayBuffer(data.length);
      new Uint8Array(buffer).set(data);
      return buffer;
    }
    return data;
  }

  async upload(
    key: string,
    data: Uint8Array | ReadableStream<Uint8Array> | Blob | string,
    options?: UploadOptions
  ): Promise<FileMetadata> {
    this.validateKey(key);
    const fullKey = this.getFullKey(key);

    // Use binding if available (Worker environment)
    if (this.binding) {
      const body = await this.dataToBody(data);

      // Build httpMetadata only with defined values
      const httpMetadata: R2HTTPMetadata = {};
      if (options?.contentType) httpMetadata.contentType = options.contentType;
      if (options?.contentDisposition) httpMetadata.contentDisposition = options.contentDisposition;
      if (options?.cacheControl) httpMetadata.cacheControl = options.cacheControl;
      if (options?.contentEncoding) httpMetadata.contentEncoding = options.contentEncoding;

      const putOptions: R2PutOptions = {
        httpMetadata,
      };
      if (options?.metadata) {
        putOptions.customMetadata = options.metadata;
      }

      try {
        const result = await this.binding.put(fullKey, body, putOptions);

        return {
          key: fullKey,
          size: result.size,
          contentType: result.httpMetadata?.contentType ?? undefined,
          lastModified: result.uploaded,
          etag: result.etag,
          metadata: result.customMetadata ?? undefined,
        };
      } catch (err) {
        throw new StorageError(
          `Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          StorageErrorCodes.UPLOAD_FAILED,
          undefined,
          err
        );
      }
    }

    // Fallback to S3-compatible API
    const s3 = await this.getS3Adapter();
    return s3.upload(key, data, options);
  }

  async download(key: string, options?: DownloadOptions): Promise<Uint8Array> {
    this.validateKey(key);
    const fullKey = this.getFullKey(key);

    // Use binding if available
    if (this.binding) {
      try {
        const getOptions: R2GetOptions = {};

        if (options?.rangeStart !== undefined || options?.rangeEnd !== undefined) {
          const rangeOpts: { offset?: number; length?: number } = {
            offset: options.rangeStart ?? 0,
          };
          if (options.rangeEnd !== undefined) {
            rangeOpts.length = options.rangeEnd - (options.rangeStart ?? 0) + 1;
          }
          getOptions.range = rangeOpts;
        }

        if (options?.ifNoneMatch || options?.ifModifiedSince) {
          const conditional: R2Conditional = {};
          if (options.ifNoneMatch) conditional.etagDoesNotMatch = options.ifNoneMatch;
          if (options.ifModifiedSince) conditional.uploadedAfter = options.ifModifiedSince;
          getOptions.onlyIf = conditional;
        }

        const result = await this.binding.get(fullKey, getOptions);

        if (!result) {
          throw new StorageError(
            `File not found: ${key}`,
            StorageErrorCodes.NOT_FOUND,
            404
          );
        }

        const buffer = await result.arrayBuffer();
        return new Uint8Array(buffer);
      } catch (err) {
        if (err instanceof StorageError) throw err;
        throw new StorageError(
          `Download failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          StorageErrorCodes.DOWNLOAD_FAILED,
          undefined,
          err
        );
      }
    }

    // Fallback to S3-compatible API
    const s3 = await this.getS3Adapter();
    return s3.download(key, options);
  }

  async downloadStream(
    key: string,
    options?: DownloadOptions
  ): Promise<ReadableStream<Uint8Array>> {
    this.validateKey(key);
    const fullKey = this.getFullKey(key);

    // Use binding if available
    if (this.binding) {
      try {
        const getOptions: R2GetOptions = {};

        if (options?.rangeStart !== undefined || options?.rangeEnd !== undefined) {
          const rangeOpts: { offset?: number; length?: number } = {
            offset: options.rangeStart ?? 0,
          };
          if (options.rangeEnd !== undefined) {
            rangeOpts.length = options.rangeEnd - (options.rangeStart ?? 0) + 1;
          }
          getOptions.range = rangeOpts;
        }

        const result = await this.binding.get(fullKey, getOptions);

        if (!result) {
          throw new StorageError(
            `File not found: ${key}`,
            StorageErrorCodes.NOT_FOUND,
            404
          );
        }

        return result.body as ReadableStream<Uint8Array>;
      } catch (err) {
        if (err instanceof StorageError) throw err;
        throw new StorageError(
          `Download failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          StorageErrorCodes.DOWNLOAD_FAILED,
          undefined,
          err
        );
      }
    }

    // Fallback to S3-compatible API
    const s3 = await this.getS3Adapter();
    return s3.downloadStream(key, options);
  }

  async head(key: string): Promise<FileMetadata | null> {
    this.validateKey(key);
    const fullKey = this.getFullKey(key);

    // Use binding if available
    if (this.binding) {
      try {
        const result = await this.binding.head(fullKey);

        if (!result) {
          return null;
        }

        return {
          key: fullKey,
          size: result.size,
          contentType: result.httpMetadata?.contentType ?? undefined,
          lastModified: result.uploaded,
          etag: result.etag,
          metadata: result.customMetadata ?? undefined,
        };
      } catch {
        return null;
      }
    }

    // Fallback to S3-compatible API
    const s3 = await this.getS3Adapter();
    return s3.head(key);
  }

  async exists(key: string): Promise<boolean> {
    const metadata = await this.head(key);
    return metadata !== null;
  }

  async delete(key: string): Promise<DeleteResult> {
    this.validateKey(key);
    const fullKey = this.getFullKey(key);

    // Use binding if available
    if (this.binding) {
      try {
        await this.binding.delete(fullKey);
        return { success: true, key: fullKey };
      } catch (err) {
        throw new StorageError(
          `Delete failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          StorageErrorCodes.DELETE_FAILED,
          undefined,
          err
        );
      }
    }

    // Fallback to S3-compatible API
    const s3 = await this.getS3Adapter();
    return s3.delete(key);
  }

  async deleteMany(keys: string[]): Promise<BatchDeleteResult> {
    // Use binding if available
    if (this.binding) {
      const fullKeys = keys.map((key) => this.getFullKey(key));

      try {
        await this.binding.delete(fullKeys);
        return { deleted: fullKeys, errors: [] };
      } catch (err) {
        return {
          deleted: [],
          errors: fullKeys.map((key) => ({
            key,
            error: err instanceof Error ? err.message : "Unknown error",
          })),
        };
      }
    }

    // Fallback to S3-compatible API
    const s3 = await this.getS3Adapter();
    return s3.deleteMany(keys);
  }

  async list(options?: ListOptions): Promise<ListResult> {
    // Use binding if available
    if (this.binding) {
      try {
        const listOpts: R2ListOptions = {
          include: ["httpMetadata", "customMetadata"],
        };

        // Only add defined options
        const prefix = options?.prefix
          ? this.getFullKey(options.prefix)
          : this.basePath || null;
        if (prefix) listOpts.prefix = prefix;
        if (options?.delimiter) listOpts.delimiter = options.delimiter;
        if (options?.maxKeys) listOpts.limit = options.maxKeys;
        if (options?.continuationToken) listOpts.cursor = options.continuationToken;

        const result = await this.binding.list(listOpts);

        const files: FileMetadata[] = result.objects.map((obj) => ({
          key: obj.key,
          size: obj.size,
          contentType: obj.httpMetadata?.contentType ?? undefined,
          lastModified: obj.uploaded,
          etag: obj.etag,
          metadata: obj.customMetadata ?? undefined,
        }));

        return {
          files,
          prefixes: result.delimitedPrefixes,
          isTruncated: result.truncated,
          continuationToken: result.cursor ?? undefined,
        };
      } catch (err) {
        throw new StorageError(
          `List failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          StorageErrorCodes.LIST_FAILED,
          undefined,
          err
        );
      }
    }

    // Fallback to S3-compatible API
    const s3 = await this.getS3Adapter();
    return s3.list(options);
  }

  async copy(
    sourceKey: string,
    destKey: string,
    options?: CopyOptions
  ): Promise<FileMetadata> {
    // R2 binding doesn't have native copy, download and upload
    if (this.binding) {
      const data = await this.download(sourceKey);
      const sourceMetadata = await this.head(sourceKey);

      const uploadOptions: UploadOptions =
        options?.metadataDirective === "REPLACE"
          ? {
              contentType: options.contentType,
              metadata: options.metadata,
            }
          : {
              contentType: sourceMetadata?.contentType,
              metadata: sourceMetadata?.metadata,
            };

      return this.upload(destKey, data, uploadOptions);
    }

    // Fallback to S3-compatible API
    const s3 = await this.getS3Adapter();
    return s3.copy(sourceKey, destKey, options);
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
    // R2 binding doesn't support presigned URLs, use S3 API
    const s3 = await this.getS3Adapter();
    return s3.getPresignedUrl(key, options);
  }

  async getUploadUrl(
    key: string,
    options?: PresignedUrlOptions
  ): Promise<string> {
    // R2 binding doesn't support presigned URLs, use S3 API
    const s3 = await this.getS3Adapter();
    return s3.getUploadUrl(key, options);
  }

  /**
   * Get public URL for a file (if custom domain is configured)
   */
  getPublicUrl(key: string): string | null {
    if (!this.config.customDomain) {
      return null;
    }

    const fullKey = this.getFullKey(key);
    return `https://${this.config.customDomain}/${fullKey}`;
  }
}

/**
 * Create an R2 storage adapter
 */
export function createR2Adapter(
  config: R2Config & { binding?: R2Bucket }
): R2Adapter {
  return new R2Adapter(config);
}
