# @parsrun/core

> Core utilities and types for the Pars framework - Edge compatible.

## Features

- **Logger** - Structured logging with child loggers
- **Errors** - Standardized error classes with codes
- **Runtime Detection** - Detect Node, Cloudflare, Deno, Bun
- **Environment** - Type-safe environment variable access
- **Utilities** - Common helpers (ID generation, crypto, etc.)

## Installation

```bash
pnpm add @parsrun/core
```

## Usage

### Logger

```typescript
import { createLogger } from "@parsrun/core/logger";

const logger = createLogger({ name: "my-service" });

logger.info("User logged in", { userId: "123" });
logger.error("Failed to process", new Error("timeout"), { requestId: "abc" });

// Child logger
const childLogger = logger.child({ module: "auth" });
childLogger.debug("Token validated");
```

### Errors

```typescript
import { ParsError, createError, isRetryable } from "@parsrun/core/errors";

// Create error
throw new ParsError("User not found", "USER_NOT_FOUND", 404, {
  userId: "123",
});

// Check if error is retryable
if (isRetryable(error)) {
  await retry();
}
```

### Runtime Detection

```typescript
import { detectRuntime, isEdgeRuntime } from "@parsrun/core/runtime";

const runtime = detectRuntime(); // "node" | "cloudflare" | "deno" | "bun"

if (isEdgeRuntime()) {
  // Edge-specific code
}
```

### Environment

```typescript
import { getEnv, requireEnv, EnvSchema } from "@parsrun/core/env";

// Get with fallback
const port = getEnv("PORT", "3000");

// Required (throws if missing)
const secret = requireEnv("AUTH_SECRET");

// Typed schema
const env = EnvSchema.parse({
  DATABASE_URL: requireEnv("DATABASE_URL"),
  REDIS_URL: getEnv("REDIS_URL"),
});
```

### Utilities

```typescript
import { generateId, sleep, retry } from "@parsrun/core";

// Generate unique ID
const id = generateId(); // "abc123xyz..."

// Sleep
await sleep(1000);

// Retry with backoff
const result = await retry(
  async () => fetchData(),
  { attempts: 3, delay: 100 }
);
```

## Sub-path Imports

```typescript
import { createLogger } from "@parsrun/core/logger";
import { ParsError } from "@parsrun/core/errors";
import { detectRuntime } from "@parsrun/core/runtime";
import { getEnv } from "@parsrun/core/env";
import { Decimal } from "@parsrun/core/decimal";
import { ERROR_CODES } from "@parsrun/core/error-codes";
```

## License

MIT
