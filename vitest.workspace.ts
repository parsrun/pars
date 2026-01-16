import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/types",
  "packages/core",
  "packages/server",
  "packages/auth",
  "packages/database",
  "packages/cache",
  "packages/email",
  "packages/queue",
  "packages/storage",
  "packages/payments",
]);
