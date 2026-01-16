# @parsrun/email

Edge-compatible email sending for Pars with multiple provider support.

## Features

- **Multi-Provider**: Resend, SendGrid, Postmark
- **Edge-Compatible**: Works on Cloudflare Workers, Deno
- **Templates**: Built-in email templates
- **Queue Support**: Async email sending

## Installation

```bash
pnpm add @parsrun/email
```

## Quick Start

```typescript
import { createEmailService } from '@parsrun/email';

const email = createEmailService({
  provider: 'resend',
  apiKey: process.env.RESEND_API_KEY,
  from: 'noreply@example.com',
});

await email.send({
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello World</h1>',
});
```

## API Overview

### Providers

#### Resend

```typescript
import { createResendProvider } from '@parsrun/email/providers/resend';

const provider = createResendProvider({
  apiKey: process.env.RESEND_API_KEY,
});
```

#### SendGrid

```typescript
import { createSendGridProvider } from '@parsrun/email/providers/sendgrid';

const provider = createSendGridProvider({
  apiKey: process.env.SENDGRID_API_KEY,
});
```

#### Postmark

```typescript
import { createPostmarkProvider } from '@parsrun/email/providers/postmark';

const provider = createPostmarkProvider({
  serverToken: process.env.POSTMARK_SERVER_TOKEN,
});
```

#### Console (Development)

```typescript
import { createConsoleProvider } from '@parsrun/email/providers/console';

const provider = createConsoleProvider(); // Logs emails to console
```

### Email Service

```typescript
const email = createEmailService({
  provider: resendProvider,
  from: 'noreply@example.com',
  replyTo: 'support@example.com',
});

// Send simple email
await email.send({
  to: 'user@example.com',
  subject: 'Hello',
  html: '<p>Hello World</p>',
  text: 'Hello World',
});

// Send with attachments
await email.send({
  to: 'user@example.com',
  subject: 'Report',
  html: '<p>See attached</p>',
  attachments: [
    {
      filename: 'report.pdf',
      content: pdfBuffer,
    },
  ],
});
```

### Templates

```typescript
import { templates } from '@parsrun/email/templates';

// OTP Email
const html = templates.otp({
  code: '123456',
  expiresIn: '10 minutes',
});

// Welcome Email
const html = templates.welcome({
  name: 'John',
  appName: 'MyApp',
});

// Magic Link
const html = templates.magicLink({
  url: 'https://app.example.com/verify?token=...',
  expiresIn: '15 minutes',
});
```

## Exports

```typescript
import { ... } from '@parsrun/email';                  // Main exports
import { ... } from '@parsrun/email/providers/resend';   // Resend
import { ... } from '@parsrun/email/providers/sendgrid'; // SendGrid
import { ... } from '@parsrun/email/providers/postmark'; // Postmark
import { ... } from '@parsrun/email/templates';          // Email templates
```

## License

MIT
