/**
 * @parsrun/storage - Type Definitions
 * Storage abstraction types for edge-compatible storage
 */

// Re-export types from @parsrun/types for convenience
export {
  type,
  fileMetadata,
  uploadOptions as parsUploadOptions,
  signedUrlOptions,
  listFilesOptions,
  listFilesResult,
  localStorageConfig,
  s3StorageConfig,
  r2StorageConfig,
  gcsStorageConfig,
  storageProviderConfig,
  type FileMetadata as ParsFileMetadata,
  type UploadOptions as ParsUploadOptions,
  type SignedUrlOptions,
  type ListFilesOptions,
  type ListFilesResult,
  type LocalStorageConfig,
  type S3StorageConfig,
  type R2StorageConfig,
  type GcsStorageConfig,
  type StorageProviderConfig,
} from "@parsrun/types";

/**
 * Storage adapter type
 */
export type StorageAdapterType = "s3" | "r2" | "do-spaces" | "memory" | "custom";

/**
 * File metadata
 */
export interface FileMetadata {
  /** File key/path */
  key: string;
  /** File size in bytes */
  size: number;
  /** Content type (MIME type) */
  contentType: string | undefined;
  /** Last modified date */
  lastModified: Date | undefined;
  /** ETag (entity tag) */
  etag: string | undefined;
  /** Custom metadata */
  metadata: Record<string, string> | undefined;
}

/**
 * Upload options
 */
export interface UploadOptions {
  /** Content type override */
  contentType?: string | undefined;
  /** Content disposition */
  contentDisposition?: string | undefined;
  /** Cache control header */
  cacheControl?: string | undefined;
  /** Content encoding */
  contentEncoding?: string | undefined;
  /** Custom metadata */
  metadata?: Record<string, string> | undefined;
  /** ACL (access control list) */
  acl?: "private" | "public-read" | undefined;
}

/**
 * Download options
 */
export interface DownloadOptions {
  /** Range start (for partial downloads) */
  rangeStart?: number | undefined;
  /** Range end (for partial downloads) */
  rangeEnd?: number | undefined;
  /** If-None-Match (ETag) */
  ifNoneMatch?: string | undefined;
  /** If-Modified-Since */
  ifModifiedSince?: Date | undefined;
}

/**
 * List options
 */
export interface ListOptions {
  /** Prefix to filter by */
  prefix?: string | undefined;
  /** Delimiter for hierarchy */
  delimiter?: string | undefined;
  /** Maximum keys to return */
  maxKeys?: number | undefined;
  /** Continuation token for pagination */
  continuationToken?: string | undefined;
}

/**
 * List result
 */
export interface ListResult {
  /** List of files */
  files: FileMetadata[];
  /** Common prefixes (for hierarchical listing) */
  prefixes: string[];
  /** Whether there are more results */
  isTruncated: boolean;
  /** Continuation token for next page */
  continuationToken: string | undefined;
}

/**
 * Presigned URL options
 */
export interface PresignedUrlOptions {
  /** URL expiration in seconds (default: 3600) */
  expiresIn?: number | undefined;
  /** Content type (for upload URLs) */
  contentType?: string | undefined;
  /** Content disposition */
  contentDisposition?: string | undefined;
  /** Response cache control */
  responseCacheControl?: string | undefined;
  /** Response content type */
  responseContentType?: string | undefined;
}

/**
 * Copy options
 */
export interface CopyOptions {
  /** Source bucket (if different from destination) */
  sourceBucket?: string | undefined;
  /** Metadata directive */
  metadataDirective?: "COPY" | "REPLACE" | undefined;
  /** New metadata (if REPLACE) */
  metadata?: Record<string, string> | undefined;
  /** New content type (if REPLACE) */
  contentType?: string | undefined;
}

/**
 * Delete result
 */
export interface DeleteResult {
  /** Whether deletion was successful */
  success: boolean;
  /** Deleted key */
  key: string;
}

/**
 * Batch delete result
 */
export interface BatchDeleteResult {
  /** Successfully deleted keys */
  deleted: string[];
  /** Failed deletions */
  errors: Array<{ key: string; error: string }>;
}

/**
 * Storage adapter interface
 * All storage adapters must implement this interface
 */
export interface StorageAdapter {
  /** Adapter type */
  readonly type: StorageAdapterType;

  /** Bucket name */
  readonly bucket: string;

  /**
   * Upload a file
   * @param key - File key/path
   * @param data - File data
   * @param options - Upload options
   */
  upload(
    key: string,
    data: Uint8Array | ReadableStream<Uint8Array> | Blob | string,
    options?: UploadOptions
  ): Promise<FileMetadata>;

  /**
   * Download a file
   * @param key - File key/path
   * @param options - Download options
   */
  download(key: string, options?: DownloadOptions): Promise<Uint8Array>;

  /**
   * Download a file as a stream
   * @param key - File key/path
   * @param options - Download options
   */
  downloadStream(
    key: string,
    options?: DownloadOptions
  ): Promise<ReadableStream<Uint8Array>>;

  /**
   * Get file metadata
   * @param key - File key/path
   */
  head(key: string): Promise<FileMetadata | null>;

  /**
   * Check if file exists
   * @param key - File key/path
   */
  exists(key: string): Promise<boolean>;

  /**
   * Delete a file
   * @param key - File key/path
   */
  delete(key: string): Promise<DeleteResult>;

  /**
   * Delete multiple files
   * @param keys - File keys/paths
   */
  deleteMany(keys: string[]): Promise<BatchDeleteResult>;

  /**
   * List files
   * @param options - List options
   */
  list(options?: ListOptions): Promise<ListResult>;

  /**
   * Copy a file
   * @param sourceKey - Source key
   * @param destKey - Destination key
   * @param options - Copy options
   */
  copy(sourceKey: string, destKey: string, options?: CopyOptions): Promise<FileMetadata>;

  /**
   * Move/rename a file
   * @param sourceKey - Source key
   * @param destKey - Destination key
   */
  move(sourceKey: string, destKey: string): Promise<FileMetadata>;

  /**
   * Generate a presigned URL for download
   * @param key - File key/path
   * @param options - URL options
   */
  getPresignedUrl(key: string, options?: PresignedUrlOptions): Promise<string>;

  /**
   * Generate a presigned URL for upload
   * @param key - File key/path
   * @param options - URL options
   */
  getUploadUrl(key: string, options?: PresignedUrlOptions): Promise<string>;
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  /** Default bucket name */
  bucket: string;
  /** Storage adapter type */
  type: StorageAdapterType;
  /** Base path prefix for all operations */
  basePath?: string | undefined;
  /** Public URL prefix */
  publicUrl?: string | undefined;
}

/**
 * S3 configuration
 */
export interface S3Config extends StorageConfig {
  type: "s3" | "do-spaces";
  /** AWS region */
  region: string;
  /** Access key ID */
  accessKeyId: string;
  /** Secret access key */
  secretAccessKey: string;
  /** Custom endpoint (for DO Spaces, MinIO, etc.) */
  endpoint?: string | undefined;
  /** Force path style (for MinIO) */
  forcePathStyle?: boolean | undefined;
}

/**
 * R2 configuration
 */
export interface R2Config extends StorageConfig {
  type: "r2";
  /** Cloudflare account ID */
  accountId: string;
  /** R2 access key ID */
  accessKeyId: string;
  /** R2 secret access key */
  secretAccessKey: string;
  /** Custom domain for public access */
  customDomain?: string | undefined;
}

/**
 * Memory storage configuration (for testing)
 */
export interface MemoryConfig extends StorageConfig {
  type: "memory";
  /** Maximum storage size in bytes */
  maxSize?: number | undefined;
}

/**
 * Storage error
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number | undefined,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "StorageError";
  }
}

/**
 * Common storage error codes
 */
export const StorageErrorCodes = {
  NOT_FOUND: "NOT_FOUND",
  ACCESS_DENIED: "ACCESS_DENIED",
  BUCKET_NOT_FOUND: "BUCKET_NOT_FOUND",
  INVALID_KEY: "INVALID_KEY",
  UPLOAD_FAILED: "UPLOAD_FAILED",
  DOWNLOAD_FAILED: "DOWNLOAD_FAILED",
  DELETE_FAILED: "DELETE_FAILED",
  COPY_FAILED: "COPY_FAILED",
  LIST_FAILED: "LIST_FAILED",
  PRESIGN_FAILED: "PRESIGN_FAILED",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  INVALID_CONFIG: "INVALID_CONFIG",
  ADAPTER_NOT_AVAILABLE: "ADAPTER_NOT_AVAILABLE",
} as const;
