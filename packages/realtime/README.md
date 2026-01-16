# @parsrun/realtime

Edge-compatible realtime features for Pars with SSE and Durable Objects support.

## Features

- **SSE (Server-Sent Events)**: Simple real-time streaming
- **Durable Objects**: Cloudflare stateful WebSockets
- **Pub/Sub**: Channel-based messaging
- **Presence**: Online user tracking
- **Hono Integration**: Ready-to-use middleware

## Installation

```bash
pnpm add @parsrun/realtime
```

## Quick Start

```typescript
import { createSSEStream } from '@parsrun/realtime';

// In Hono route
app.get('/events', (c) => {
  const stream = createSSEStream(c);

  // Send events
  stream.send({ type: 'connected', data: { userId: '123' } });

  // Subscribe to events
  events.on('update', (data) => {
    stream.send({ type: 'update', data });
  });

  return stream.response();
});
```

## API Overview

### SSE (Server-Sent Events)

```typescript
import { createSSEAdapter, createSSEStream } from '@parsrun/realtime/adapters/sse';

// Create SSE stream
app.get('/events/:channel', async (c) => {
  const channel = c.req.param('channel');
  const stream = createSSEStream(c);

  // Send initial data
  stream.send({
    event: 'connected',
    data: { channel },
  });

  // Subscribe to channel
  const unsubscribe = pubsub.subscribe(channel, (message) => {
    stream.send({
      event: 'message',
      data: message,
    });
  });

  // Cleanup on disconnect
  c.req.raw.signal.addEventListener('abort', () => {
    unsubscribe();
  });

  return stream.response();
});
```

### Durable Objects (Cloudflare)

```typescript
import { createDurableObjectRoom } from '@parsrun/realtime/adapters/durable-objects';

// Define room class
export class ChatRoom extends createDurableObjectRoom({
  onConnect: async (ws, state) => {
    ws.send(JSON.stringify({ type: 'connected' }));
  },

  onMessage: async (ws, message, state) => {
    // Broadcast to all connections
    state.broadcast(message);
  },

  onDisconnect: async (ws, state) => {
    // Cleanup
  },
}) {}

// In worker
app.get('/ws/:roomId', async (c) => {
  const roomId = c.req.param('roomId');
  const id = env.CHAT_ROOM.idFromName(roomId);
  const room = env.CHAT_ROOM.get(id);

  return room.fetch(c.req.raw);
});
```

### Pub/Sub

```typescript
import { createPubSub } from '@parsrun/realtime';

const pubsub = createPubSub();

// Subscribe
const unsubscribe = pubsub.subscribe('channel', (message) => {
  console.log('Received:', message);
});

// Publish
await pubsub.publish('channel', { type: 'update', data: {} });

// Unsubscribe
unsubscribe();
```

### Presence

```typescript
import { createPresence } from '@parsrun/realtime';

const presence = createPresence({
  heartbeatInterval: 30000,
});

// Join
await presence.join('room:123', {
  userId: 'user:1',
  data: { name: 'John' },
});

// Get online users
const users = await presence.getMembers('room:123');

// Leave
await presence.leave('room:123', 'user:1');
```

### Hono Integration

```typescript
import { createRealtimeMiddleware } from '@parsrun/realtime/hono';

const realtime = createRealtimeMiddleware({
  pubsub,
  presence,
});

app.use('/realtime/*', realtime);

// Routes automatically created:
// GET /realtime/events/:channel - SSE stream
// POST /realtime/publish/:channel - Publish message
// GET /realtime/presence/:room - Get presence
```

## Exports

```typescript
import { ... } from '@parsrun/realtime';                      // Main exports
import { ... } from '@parsrun/realtime/adapters/sse';          // SSE adapter
import { ... } from '@parsrun/realtime/adapters/durable-objects'; // Durable Objects
import { ... } from '@parsrun/realtime/hono';                  // Hono integration
```

## License

MIT
