/**
 * @parsrun/types - Queue Schemas
 * Job queue validation schemas
 */

import { type } from "arktype";
import { timestamp, uuid } from "./common";

// ============================================================================
// Job Schemas
// ============================================================================

/** Job status */
export const jobStatus = type(
  "'pending' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused'"
);

/** Job entity */
export const job = type({
  id: uuid,
  queue: "string >= 1",
  name: "string >= 1",
  data: "unknown",
  "result?": "unknown",
  "error?": "string",
  status: jobStatus,
  attempts: "number >= 0",
  maxAttempts: "number >= 1",
  "priority?": "number",
  "delay?": "number >= 0",
  "progress?": "number >= 0",
  "startedAt?": timestamp,
  "completedAt?": timestamp,
  "failedAt?": timestamp,
  "processedBy?": "string",
  insertedAt: timestamp,
  updatedAt: timestamp,
});

/** Job options */
export const jobOptions = type({
  "priority?": "number",
  "delay?": "number >= 0",
  "attempts?": "number >= 1",
  "backoff?": {
    type: "'fixed' | 'exponential'",
    "delay?": "number >= 0",
  },
  "timeout?": "number > 0",
  "removeOnComplete?": "boolean | number",
  "removeOnFail?": "boolean | number",
  "repeat?": {
    "pattern?": "string",
    "every?": "number > 0",
    "limit?": "number >= 1",
    "tz?": "string",
  },
});

/** Add job request */
export const addJobRequest = type({
  name: "string >= 1",
  data: "unknown",
  "options?": jobOptions,
});

/** Job progress update */
export const jobProgressUpdate = type({
  progress: "number >= 0",
  "message?": "string",
  "data?": "unknown",
});

// ============================================================================
// Queue Stats Schemas
// ============================================================================

/** Queue stats */
export const queueStats = type({
  name: "string",
  pending: "number >= 0",
  active: "number >= 0",
  completed: "number >= 0",
  failed: "number >= 0",
  delayed: "number >= 0",
  paused: "boolean",
});

/** Queue list options */
export const queueListOptions = type({
  "status?": jobStatus,
  "start?": "number >= 0",
  "end?": "number",
  "order?": "'asc' | 'desc'",
});

// ============================================================================
// Queue Config Schemas
// ============================================================================

/** Redis queue config */
export const redisQueueConfig = type({
  "host?": "string",
  "port?": "number > 0",
  "password?": "string",
  "db?": "number >= 0",
  "url?": "string",
  "tls?": "boolean | object",
});

/** Queue worker options */
export const workerOptions = type({
  "concurrency?": "number >= 1",
  "limiter?": {
    max: "number >= 1",
    duration: "number > 0",
  },
  "lockDuration?": "number > 0",
  "lockRenewTime?": "number > 0",
  "stalledInterval?": "number > 0",
  "maxStalledCount?": "number >= 0",
});

/** Queue config */
export const queueConfig = type({
  provider: "'bullmq' | 'sqs' | 'rabbitmq' | 'memory'",
  "defaultJobOptions?": jobOptions,
  "redis?": redisQueueConfig,
  "prefix?": "string",
  "worker?": workerOptions,
});

// ============================================================================
// Type Exports
// ============================================================================

export type JobStatus = typeof jobStatus.infer;
export type Job = typeof job.infer;
export type JobOptions = typeof jobOptions.infer;
export type AddJobRequest = typeof addJobRequest.infer;
export type JobProgressUpdate = typeof jobProgressUpdate.infer;
export type QueueStats = typeof queueStats.infer;
export type QueueListOptions = typeof queueListOptions.infer;
export type RedisQueueConfig = typeof redisQueueConfig.infer;
export type WorkerOptions = typeof workerOptions.infer;
export type QueueConfig = typeof queueConfig.infer;
