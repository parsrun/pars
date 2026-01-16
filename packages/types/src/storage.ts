/**
 * @module
 * File storage validation schemas for upload and retrieval.
 * Supports local, S3, R2, and GCS providers.
 *
 * @example
 * ```typescript
 * import { uploadOptions, fileMetadata, type FileMetadata } from '@parsrun/types';
 *
 * const file: FileMetadata = {
 *   id: '...',
 *   filename: 'document.pdf',
 *   mimeType: 'application/pdf',
 *   size: 1024,
 *   bucket: 'uploads'
 * };
 * ```
 */

import { type } from "arktype";
import { timestamp, uuid } from "./common";

// ============================================================================
// File Schemas
// ============================================================================

/** File metadata */
export const fileMetadata = type({
  id: uuid,
  filename: "string >= 1",
  originalName: "string >= 1",
  mimeType: "string",
  size: "number >= 0",
  "path?": "string",
  "url?": "string",
  bucket: "string",
  "etag?": "string",
  "metadata?": "object",
  "uploadedBy?": uuid,
  "tenantId?": uuid,
  insertedAt: timestamp,
  updatedAt: timestamp,
  "deletedAt?": timestamp,
});

/** Upload options */
export const uploadOptions = type({
  "path?": "string",
  "filename?": "string",
  "contentType?": "string",
  "metadata?": "object",
  "acl?": "'private' | 'public-read' | 'authenticated-read'",
  "cacheControl?": "string",
  "contentDisposition?": "string",
});

/** Signed URL options */
export const signedUrlOptions = type({
  "expiresIn?": "number > 0",
  "method?": "'GET' | 'PUT'",
  "contentType?": "string",
  "responseContentType?": "string",
  "responseContentDisposition?": "string",
});

/** List files options */
export const listFilesOptions = type({
  "prefix?": "string",
  "limit?": "number >= 1",
  "cursor?": "string",
  "delimiter?": "string",
});

/** List files result */
export const listFilesResult = type({
  files: fileMetadata.array(),
  "nextCursor?": "string",
  hasMore: "boolean",
});

// ============================================================================
// Storage Provider Config Schemas
// ============================================================================

/** Local storage config */
export const localStorageConfig = type({
  basePath: "string >= 1",
  "baseUrl?": "string",
  "permissions?": "number",
});

/** S3 storage config */
export const s3StorageConfig = type({
  bucket: "string >= 1",
  region: "string >= 1",
  "endpoint?": "string",
  "accessKeyId?": "string",
  "secretAccessKey?": "string",
  "forcePathStyle?": "boolean",
  "acl?": "'private' | 'public-read' | 'authenticated-read'",
});

/** Cloudflare R2 config */
export const r2StorageConfig = type({
  accountId: "string >= 1",
  bucket: "string >= 1",
  accessKeyId: "string >= 1",
  secretAccessKey: "string >= 1",
  "publicUrl?": "string",
});

/** GCS config */
export const gcsStorageConfig = type({
  bucket: "string >= 1",
  "projectId?": "string",
  "credentials?": "object",
  "keyFilename?": "string",
});

/** Storage config */
export const storageProviderConfig = type({
  provider: "'local' | 's3' | 'r2' | 'gcs' | 'azure'",
  "defaultBucket?": "string",
  "local?": localStorageConfig,
  "s3?": s3StorageConfig,
  "r2?": r2StorageConfig,
  "gcs?": gcsStorageConfig,
});

// ============================================================================
// Type Exports
// ============================================================================

/**
 * File metadata type.
 * Contains file information including name, MIME type, size, path, and upload details.
 */
export type FileMetadata = typeof fileMetadata.infer;

/**
 * Upload options type.
 * Contains optional path, filename, content type, ACL, and caching settings for uploads.
 */
export type UploadOptions = typeof uploadOptions.infer;

/**
 * Signed URL options type.
 * Contains expiry, HTTP method, and content type settings for generating signed URLs.
 */
export type SignedUrlOptions = typeof signedUrlOptions.infer;

/**
 * List files options type.
 * Contains prefix filter, pagination limit, cursor, and delimiter for file listing.
 */
export type ListFilesOptions = typeof listFilesOptions.infer;

/**
 * List files result type.
 * Contains array of file metadata, pagination cursor, and hasMore flag.
 */
export type ListFilesResult = typeof listFilesResult.infer;

/**
 * Local storage configuration type.
 * Contains base path, optional base URL, and file permissions for local file storage.
 */
export type LocalStorageConfig = typeof localStorageConfig.infer;

/**
 * S3 storage configuration type.
 * Contains bucket, region, endpoint, credentials, and ACL settings for Amazon S3.
 */
export type S3StorageConfig = typeof s3StorageConfig.infer;

/**
 * Cloudflare R2 storage configuration type.
 * Contains account ID, bucket, credentials, and optional public URL for R2.
 */
export type R2StorageConfig = typeof r2StorageConfig.infer;

/**
 * Google Cloud Storage configuration type.
 * Contains bucket, project ID, and credentials for GCS.
 */
export type GcsStorageConfig = typeof gcsStorageConfig.infer;

/**
 * Storage provider configuration type.
 * Contains provider selection and provider-specific configuration.
 */
export type StorageProviderConfig = typeof storageProviderConfig.infer;
