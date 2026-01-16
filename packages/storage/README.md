# @parsrun/storage

Edge-compatible object storage for Pars with S3 and R2 support.

## Features

- **Multi-Adapter**: S3, Cloudflare R2, Memory
- **Edge-Compatible**: Works on all runtimes
- **Presigned URLs**: Secure direct uploads
- **Streaming**: Large file support
- **Metadata**: File metadata management

## Installation

```bash
pnpm add @parsrun/storage
```

## Quick Start

```typescript
import { createStorage } from '@parsrun/storage';

const storage = createStorage({
  adapter: 'r2', // or 's3', 'memory'
  bucket: 'my-bucket',
});

// Upload file
await storage.put('uploads/photo.jpg', fileBuffer, {
  contentType: 'image/jpeg',
});

// Get file
const file = await storage.get('uploads/photo.jpg');

// Delete file
await storage.delete('uploads/photo.jpg');
```

## API Overview

### Adapters

#### S3

```typescript
import { createS3Adapter } from '@parsrun/storage/adapters/s3';

const storage = createS3Adapter({
  region: 'us-east-1',
  bucket: 'my-bucket',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});
```

#### Cloudflare R2

```typescript
import { createR2Adapter } from '@parsrun/storage/adapters/r2';

// In Cloudflare Worker
const storage = createR2Adapter({
  bucket: env.MY_BUCKET,
});
```

#### Memory (Development)

```typescript
import { createMemoryAdapter } from '@parsrun/storage/adapters/memory';

const storage = createMemoryAdapter();
```

### File Operations

```typescript
// Upload
await storage.put('path/to/file.txt', 'Hello World', {
  contentType: 'text/plain',
  metadata: { uploadedBy: 'user:1' },
});

// Upload from stream
await storage.put('path/to/large-file.zip', readableStream, {
  contentType: 'application/zip',
});

// Get file
const file = await storage.get('path/to/file.txt');
console.log(file.body);      // Content
console.log(file.metadata);  // Metadata
console.log(file.size);      // Size in bytes

// Get as stream
const stream = await storage.getStream('path/to/large-file.zip');

// Check existence
const exists = await storage.exists('path/to/file.txt');

// Delete
await storage.delete('path/to/file.txt');

// Delete multiple
await storage.deleteMany(['file1.txt', 'file2.txt']);
```

### Listing Files

```typescript
// List files
const files = await storage.list('uploads/', {
  limit: 100,
  cursor: 'next-page-token',
});

for (const file of files.objects) {
  console.log(file.key, file.size, file.lastModified);
}

// Continue with next page
if (files.cursor) {
  const nextPage = await storage.list('uploads/', {
    cursor: files.cursor,
  });
}
```

### Presigned URLs

```typescript
// Generate upload URL (PUT)
const uploadUrl = await storage.getPresignedUrl('uploads/new-file.jpg', {
  method: 'PUT',
  expiresIn: 3600, // 1 hour
  contentType: 'image/jpeg',
});

// Generate download URL (GET)
const downloadUrl = await storage.getPresignedUrl('uploads/photo.jpg', {
  method: 'GET',
  expiresIn: 3600,
});

// Client-side upload
await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': 'image/jpeg' },
});
```

### Copy & Move

```typescript
// Copy file
await storage.copy('source/file.txt', 'dest/file.txt');

// Move file
await storage.move('old/path.txt', 'new/path.txt');
```

## Exports

```typescript
import { ... } from '@parsrun/storage';              // Main exports
import { ... } from '@parsrun/storage/adapters/s3';    // S3 adapter
import { ... } from '@parsrun/storage/adapters/r2';    // R2 adapter
import { ... } from '@parsrun/storage/adapters/memory'; // Memory adapter
```

## License

MIT
