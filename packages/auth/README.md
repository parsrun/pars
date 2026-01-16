# @parsrun/auth

Passwordless-first, multi-runtime authentication for Pars framework.

## Features

- **Passwordless-First**: OTP (Email/SMS), Magic Links, WebAuthn/Passkeys
- **OAuth Providers**: Google, Microsoft, GitHub, Apple with PKCE support
- **Multi-Runtime**: Node.js, Deno, Cloudflare Workers, Bun
- **Multi-Tenant**: Built-in tenant management and resolution
- **Security**: Rate limiting, account lockout, CSRF protection
- **Session Management**: JWT with key rotation, token blocklist

## Installation

```bash
pnpm add @parsrun/auth
```

## Quick Start

```typescript
import { createAuth } from '@parsrun/auth';

const auth = createAuth({
  secret: process.env.AUTH_SECRET,
  adapter: myDatabaseAdapter,
  providers: {
    otp: {
      email: {
        send: async (to, code) => {
          await sendEmail(to, `Your code is: ${code}`);
        },
      },
    },
  },
});

await auth.initialize();

// Request OTP
await auth.requestOTP({ identifier: 'user@example.com', type: 'email' });

// Sign in
const result = await auth.signIn({
  provider: 'otp',
  identifier: 'user@example.com',
  credential: '123456',
  data: { type: 'email' },
});
```

## API Overview

### Core

| Export | Description |
|--------|-------------|
| `createAuth(config)` | Create auth instance |
| `ParsAuthEngine` | Main auth engine class |

### Providers

| Export | Description |
|--------|-------------|
| `OTPProvider` | Email/SMS OTP authentication |
| `MagicLinkProvider` | Magic link authentication |
| `GoogleProvider` | Google OAuth |
| `MicrosoftProvider` | Microsoft OAuth |
| `GitHubProvider` | GitHub OAuth |
| `AppleProvider` | Apple Sign In |
| `TOTPProvider` | 2FA with authenticator apps |
| `WebAuthnProvider` | Passkeys/WebAuthn |

### Middleware (Hono)

```typescript
import {
  createAuthMiddleware,
  requireRole,
  requirePermission,
  requireTenant,
  requireAdmin,
} from '@parsrun/auth';

const authMiddleware = createAuthMiddleware({ auth });

app.get('/admin', authMiddleware, requireAdmin(), handler);
app.get('/users', authMiddleware, requireRole('admin', 'manager'), handler);
app.get('/data', authMiddleware, requirePermission('data:read'), handler);
```

### Session Management

| Export | Description |
|--------|-------------|
| `JwtManager` | JWT token management with rotation |
| `SessionBlocklist` | Token revocation |
| `extractBearerToken()` | Extract token from header |

### Storage Adapters

| Export | Description |
|--------|-------------|
| `createStorage()` | Auto-detect runtime storage |
| `MemoryStorage` | In-memory (development) |
| `RedisStorage` | Redis/Upstash |
| `CloudflareKVStorage` | Cloudflare KV |
| `DenoKVStorage` | Deno KV |

### Security

| Export | Description |
|--------|-------------|
| `RateLimiter` | Request rate limiting |
| `LockoutManager` | Account lockout |
| `CsrfManager` | CSRF protection |
| `AuthorizationGuard` | Role/permission checks |

## Exports

```typescript
import { ... } from '@parsrun/auth';           // Main exports
import { ... } from '@parsrun/auth/storage';   // Storage adapters
import { ... } from '@parsrun/auth/session';   // Session management
import { ... } from '@parsrun/auth/security';  // Security utilities
import { ... } from '@parsrun/auth/providers'; // Auth providers
import { ... } from '@parsrun/auth/adapters';  // Framework adapters
```

## License

MIT
