/**
 * @parsrun/types - Storage Schemas
 * File storage validation schemas
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

export type FileMetadata = typeof fileMetadata.infer;
export type UploadOptions = typeof uploadOptions.infer;
export type SignedUrlOptions = typeof signedUrlOptions.infer;
export type ListFilesOptions = typeof listFilesOptions.infer;
export type ListFilesResult = typeof listFilesResult.infer;
export type LocalStorageConfig = typeof localStorageConfig.infer;
export type S3StorageConfig = typeof s3StorageConfig.infer;
export type R2StorageConfig = typeof r2StorageConfig.infer;
export type GcsStorageConfig = typeof gcsStorageConfig.infer;
export type StorageProviderConfig = typeof storageProviderConfig.infer;
