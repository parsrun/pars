# @parsrun/queue

Edge-compatible message queues for Pars with multiple adapter support.

## Features

- **Multi-Adapter**: Memory, Cloudflare Queues, Upstash QStash
- **Edge-Compatible**: Works on all runtimes
- **Delayed Jobs**: Schedule jobs for later
- **Retries**: Automatic retry with backoff
- **Dead Letter Queue**: Failed job handling

## Installation

```bash
pnpm add @parsrun/queue
```

## Quick Start

```typescript
import { createQueue } from '@parsrun/queue';

const queue = createQueue({
  adapter: 'memory', // or 'cloudflare', 'qstash'
});

// Publish message
await queue.publish('email:send', {
  to: 'user@example.com',
  subject: 'Hello',
});

// Subscribe to messages
queue.subscribe('email:send', async (message) => {
  await sendEmail(message.data);
});
```

## API Overview

### Adapters

#### Memory (Development)

```typescript
import { createMemoryQueue } from '@parsrun/queue/adapters/memory';

const queue = createMemoryQueue({
  concurrency: 5,
});
```

#### Cloudflare Queues

```typescript
import { createCloudflareQueue } from '@parsrun/queue/adapters/cloudflare';

// In Cloudflare Worker
const queue = createCloudflareQueue({
  queue: env.MY_QUEUE,
});
```

#### Upstash QStash

```typescript
import { createQStashQueue } from '@parsrun/queue/adapters/qstash';

const queue = createQStashQueue({
  token: process.env.QSTASH_TOKEN,
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
});
```

### Publishing Messages

```typescript
// Simple publish
await queue.publish('topic', { data: 'value' });

// With options
await queue.publish('topic', data, {
  delay: 60,         // Delay in seconds
  retries: 3,        // Max retries
  deduplicationId: 'unique-id',
});

// Batch publish
await queue.publishBatch('topic', [
  { data: 'item1' },
  { data: 'item2' },
]);
```

### Subscribing to Messages

```typescript
queue.subscribe('topic', async (message) => {
  console.log(message.id, message.data);

  // Throw to retry
  if (shouldRetry) {
    throw new Error('Retry later');
  }
});

// With options
queue.subscribe('topic', handler, {
  concurrency: 5,
  maxRetries: 3,
  retryDelay: 1000,
});
```

### Scheduled Jobs

```typescript
// Schedule for specific time
await queue.schedule('cleanup', { type: 'daily' }, {
  runAt: new Date('2024-01-01T00:00:00Z'),
});

// Cron-like scheduling (QStash)
await queue.schedule('reports', { type: 'weekly' }, {
  cron: '0 9 * * 1', // Every Monday at 9am
});
```

### Dead Letter Queue

```typescript
const queue = createQueue({
  adapter: 'memory',
  deadLetterQueue: {
    enabled: true,
    maxRetries: 5,
    onDeadLetter: async (message) => {
      // Handle permanently failed message
      await notifyAdmin(message);
    },
  },
});
```

## Exports

```typescript
import { ... } from '@parsrun/queue';                    // Main exports
import { ... } from '@parsrun/queue/adapters/memory';     // Memory adapter
import { ... } from '@parsrun/queue/adapters/cloudflare'; // Cloudflare Queues
import { ... } from '@parsrun/queue/adapters/qstash';     // Upstash QStash
```

## License

MIT
