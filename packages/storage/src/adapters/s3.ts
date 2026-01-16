/**
 * @parsrun/storage - S3 Adapter
 * S3-compatible storage adapter (AWS S3, DigitalOcean Spaces, MinIO, etc.)
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
  type S3Config,
  type StorageAdapter,
  type UploadOptions,
  StorageError,
  StorageErrorCodes,
} from "../types.js";

// Types for AWS SDK (dynamically imported)
type S3Client = import("@aws-sdk/client-s3").S3Client;
type PutObjectCommandInput = import("@aws-sdk/client-s3").PutObjectCommandInput;

/**
 * S3 Storage Adapter
 * Works with AWS S3, DigitalOcean Spaces, MinIO, and other S3-compatible services
 *
 * @example
 * ```typescript
 * // AWS S3
 * const s3 = new S3Adapter({
 *   type: 's3',
 *   bucket: 'my-bucket',
 *   region: 'us-east-1',
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
 * });
 *
 * // DigitalOcean Spaces
 * const spaces = new S3Adapter({
 *   type: 'do-spaces',
 *   bucket: 'my-space',
 *   region: 'nyc3',
 *   accessKeyId: process.env.DO_SPACES_KEY,
 *   secretAccessKey: process.env.DO_SPACES_SECRET,
 *   endpoint: 'https://nyc3.digitaloceanspaces.com',
 * });
 *
 * await s3.upload('file.txt', 'Hello, World!');
 * ```
 */
export class S3Adapter implements StorageAdapter {
  readonly type: "s3" | "do-spaces";
  readonly bucket: string;

  private client: S3Client | null = null;
  private config: S3Config;
  private basePath: string;

  constructor(config: S3Config) {
    this.type = config.type;
    this.bucket = config.bucket;
    this.config = config;
    this.basePath = config.basePath ?? "";
  }

  /**
   * Lazy load S3 client
   */
  private async getClient(): Promise<S3Client> {
    if (this.client) return this.client;

    try {
      const { S3Client } = await import("@aws-sdk/client-s3");

      const clientConfig: import("@aws-sdk/client-s3").S3ClientConfig = {
        region: this.config.region,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
      };

      // Only add optional properties if defined
      if (this.config.endpoint) {
        clientConfig.endpoint = this.config.endpoint;
      }
      if (this.config.forcePathStyle !== undefined) {
        clientConfig.forcePathStyle = this.config.forcePathStyle;
      }

      this.client = new S3Client(clientConfig);

      return this.client;
    } catch {
      throw new StorageError(
        "AWS SDK not installed. Run: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner",
        StorageErrorCodes.ADAPTER_NOT_AVAILABLE
      );
    }
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
  ): Promise<Uint8Array | ReadableStream<Uint8Array> | string> {
    if (data instanceof Uint8Array || typeof data === "string") {
      return data;
    }

    if (data instanceof Blob) {
      const buffer = await data.arrayBuffer();
      return new Uint8Array(buffer);
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

    const client = await this.getClient();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");

    const body = await this.dataToBody(data);

    const params: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: fullKey,
      Body: body as Uint8Array | string,
      ContentType: options?.contentType,
      ContentDisposition: options?.contentDisposition,
      CacheControl: options?.cacheControl,
      ContentEncoding: options?.contentEncoding,
      Metadata: options?.metadata,
    };

    if (options?.acl) {
      params.ACL = options.acl;
    }

    try {
      const result = await client.send(new PutObjectCommand(params));

      // Get size
      let size = 0;
      if (typeof body === "string") {
        size = new TextEncoder().encode(body).length;
      } else if (body instanceof Uint8Array) {
        size = body.length;
      }

      return {
        key: fullKey,
        size,
        contentType: options?.contentType ?? undefined,
        lastModified: new Date(),
        etag: result.ETag ?? undefined,
        metadata: options?.metadata ?? undefined,
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

  async download(key: string, options?: DownloadOptions): Promise<Uint8Array> {
    this.validateKey(key);
    const fullKey = this.getFullKey(key);

    const client = await this.getClient();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");

    try {
      const params: import("@aws-sdk/client-s3").GetObjectCommandInput = {
        Bucket: this.bucket,
        Key: fullKey,
      };

      if (options?.rangeStart !== undefined || options?.rangeEnd !== undefined) {
        const start = options.rangeStart ?? 0;
        const end = options.rangeEnd ?? "";
        params.Range = `bytes=${start}-${end}`;
      }

      if (options?.ifNoneMatch) {
        params.IfNoneMatch = options.ifNoneMatch;
      }

      if (options?.ifModifiedSince) {
        params.IfModifiedSince = options.ifModifiedSince;
      }

      const result = await client.send(new GetObjectCommand(params));

      if (!result.Body) {
        throw new StorageError(
          "Empty response body",
          StorageErrorCodes.DOWNLOAD_FAILED
        );
      }

      // Convert to Uint8Array
      const stream = result.Body as ReadableStream<Uint8Array>;
      return this.streamToUint8Array(stream);
    } catch (err) {
      if (
        err instanceof Error &&
        "name" in err &&
        err.name === "NoSuchKey"
      ) {
        throw new StorageError(
          `File not found: ${key}`,
          StorageErrorCodes.NOT_FOUND,
          404
        );
      }
      throw new StorageError(
        `Download failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        StorageErrorCodes.DOWNLOAD_FAILED,
        undefined,
        err
      );
    }
  }

  async downloadStream(
    key: string,
    options?: DownloadOptions
  ): Promise<ReadableStream<Uint8Array>> {
    this.validateKey(key);
    const fullKey = this.getFullKey(key);

    const client = await this.getClient();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");

    try {
      const params: import("@aws-sdk/client-s3").GetObjectCommandInput = {
        Bucket: this.bucket,
        Key: fullKey,
      };

      if (options?.rangeStart !== undefined || options?.rangeEnd !== undefined) {
        const start = options.rangeStart ?? 0;
        const end = options.rangeEnd ?? "";
        params.Range = `bytes=${start}-${end}`;
      }

      const result = await client.send(new GetObjectCommand(params));

      if (!result.Body) {
        throw new StorageError(
          "Empty response body",
          StorageErrorCodes.DOWNLOAD_FAILED
        );
      }

      return result.Body as ReadableStream<Uint8Array>;
    } catch (err) {
      if (
        err instanceof Error &&
        "name" in err &&
        err.name === "NoSuchKey"
      ) {
        throw new StorageError(
          `File not found: ${key}`,
          StorageErrorCodes.NOT_FOUND,
          404
        );
      }
      throw err;
    }
  }

  async head(key: string): Promise<FileMetadata | null> {
    this.validateKey(key);
    const fullKey = this.getFullKey(key);

    const client = await this.getClient();
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");

    try {
      const result = await client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: fullKey,
        })
      );

      return {
        key: fullKey,
        size: result.ContentLength ?? 0,
        contentType: result.ContentType ?? undefined,
        lastModified: result.LastModified ?? undefined,
        etag: result.ETag ?? undefined,
        metadata: result.Metadata ?? undefined,
      };
    } catch (err) {
      if (
        err instanceof Error &&
        "name" in err &&
        (err.name === "NoSuchKey" || err.name === "NotFound")
      ) {
        return null;
      }
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const metadata = await this.head(key);
    return metadata !== null;
  }

  async delete(key: string): Promise<DeleteResult> {
    this.validateKey(key);
    const fullKey = this.getFullKey(key);

    const client = await this.getClient();
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");

    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: fullKey,
        })
      );

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

  async deleteMany(keys: string[]): Promise<BatchDeleteResult> {
    const client = await this.getClient();
    const { DeleteObjectsCommand } = await import("@aws-sdk/client-s3");

    const objects = keys.map((key) => ({
      Key: this.getFullKey(key),
    }));

    try {
      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: objects },
        })
      );

      const deleted = result.Deleted?.map((d) => d.Key ?? "") ?? [];
      const errors =
        result.Errors?.map((e) => ({
          key: e.Key ?? "",
          error: e.Message ?? "Unknown error",
        })) ?? [];

      return { deleted, errors };
    } catch (err) {
      throw new StorageError(
        `Batch delete failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        StorageErrorCodes.DELETE_FAILED,
        undefined,
        err
      );
    }
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const client = await this.getClient();
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");

    const prefix = options?.prefix
      ? this.getFullKey(options.prefix)
      : this.basePath || undefined;

    try {
      const result = await client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          Delimiter: options?.delimiter,
          MaxKeys: options?.maxKeys,
          ContinuationToken: options?.continuationToken,
        })
      );

      const files: FileMetadata[] =
        result.Contents?.map((item) => ({
          key: item.Key ?? "",
          size: item.Size ?? 0,
          contentType: undefined,
          lastModified: item.LastModified ?? undefined,
          etag: item.ETag ?? undefined,
          metadata: undefined,
        })) ?? [];

      const prefixes =
        result.CommonPrefixes?.map((p) => p.Prefix ?? "") ?? [];

      return {
        files,
        prefixes,
        isTruncated: result.IsTruncated ?? false,
        continuationToken: result.NextContinuationToken ?? undefined,
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

  async copy(
    sourceKey: string,
    destKey: string,
    options?: CopyOptions
  ): Promise<FileMetadata> {
    this.validateKey(sourceKey);
    this.validateKey(destKey);

    const client = await this.getClient();
    const { CopyObjectCommand } = await import("@aws-sdk/client-s3");

    const sourceFullKey = this.getFullKey(sourceKey);
    const destFullKey = this.getFullKey(destKey);
    const sourceBucket = options?.sourceBucket ?? this.bucket;

    try {
      const result = await client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          Key: destFullKey,
          CopySource: `${sourceBucket}/${sourceFullKey}`,
          MetadataDirective: options?.metadataDirective,
          ContentType: options?.contentType,
          Metadata: options?.metadata,
        })
      );

      // Get metadata of copied object
      const metadata = await this.head(destKey);

      return metadata ?? {
        key: destFullKey,
        size: 0,
        contentType: options?.contentType ?? undefined,
        lastModified: result.CopyObjectResult?.LastModified ?? new Date(),
        etag: result.CopyObjectResult?.ETag ?? undefined,
        metadata: options?.metadata ?? undefined,
      };
    } catch (err) {
      throw new StorageError(
        `Copy failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        StorageErrorCodes.COPY_FAILED,
        undefined,
        err
      );
    }
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

    const client = await this.getClient();

    try {
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");

      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
        ResponseCacheControl: options?.responseCacheControl,
        ResponseContentType: options?.responseContentType,
        ResponseContentDisposition: options?.contentDisposition,
      });

      return getSignedUrl(client, command, {
        expiresIn: options?.expiresIn ?? 3600,
      });
    } catch (err) {
      throw new StorageError(
        `Presigned URL failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        StorageErrorCodes.PRESIGN_FAILED,
        undefined,
        err
      );
    }
  }

  async getUploadUrl(
    key: string,
    options?: PresignedUrlOptions
  ): Promise<string> {
    this.validateKey(key);
    const fullKey = this.getFullKey(key);

    const client = await this.getClient();

    try {
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
        ContentType: options?.contentType,
        ContentDisposition: options?.contentDisposition,
      });

      return getSignedUrl(client, command, {
        expiresIn: options?.expiresIn ?? 3600,
      });
    } catch (err) {
      throw new StorageError(
        `Upload URL failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        StorageErrorCodes.PRESIGN_FAILED,
        undefined,
        err
      );
    }
  }

  private async streamToUint8Array(
    stream: ReadableStream<Uint8Array>
  ): Promise<Uint8Array> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
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
}

/**
 * Create an S3 storage adapter
 */
export function createS3Adapter(config: S3Config): S3Adapter {
  return new S3Adapter(config);
}

/**
 * Create a DigitalOcean Spaces adapter
 */
export function createDOSpacesAdapter(
  config: Omit<S3Config, "type" | "endpoint"> & {
    region: string;
    spaceName?: string;
  }
): S3Adapter {
  return new S3Adapter({
    ...config,
    type: "do-spaces",
    endpoint: `https://${config.region}.digitaloceanspaces.com`,
    bucket: config.spaceName ?? config.bucket,
  });
}
