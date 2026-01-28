# @parsrun/sms

Edge-compatible SMS sending for Pars applications.

## Features

- 🌐 **Edge Compatible** - Works in Cloudflare Workers, Vercel Edge, Deno, Bun
- 📱 **Multiple Providers** - NetGSM (Turkey), with Twilio coming soon
- 🔧 **TypeScript First** - Full type definitions included
- 🧪 **Dev Mode** - Console provider for local development

## Installation

```bash
npm install @parsrun/sms
# or
bun add @parsrun/sms
```

## Quick Start

```typescript
import { createSMSService } from '@parsrun/sms';

// Create SMS service with NetGSM
const sms = createSMSService({
  provider: 'netgsm',
  username: process.env.NETGSM_USERNAME,
  password: process.env.NETGSM_PASSWORD,
  from: 'MYSENDER', // Sender ID registered with NetGSM
});

// Send a single SMS
await sms.send({
  to: '905551234567',
  message: 'Hello from Pars!',
});

// Send OTP
await sms.sendOTP('905551234567', '123456', 10);

// Send welcome message
await sms.sendWelcome('905551234567', 'John');
```

## Providers

### NetGSM (Turkey)

```typescript
import { createSMSService } from '@parsrun/sms';

const sms = createSMSService({
  provider: 'netgsm',
  username: 'your-username',
  password: 'your-password',
  from: 'SENDER_ID',
  // Optional custom API URL
  providerUrl: 'https://api.netgsm.com.tr/sms/send/otp',
});
```

### Console (Development)

```typescript
import { createSMSService } from '@parsrun/sms';

const sms = createSMSService({
  provider: 'console',
  from: 'TEST',
});

// SMS will be logged to console instead of being sent
await sms.send({
  to: '905551234567',
  message: 'Test message',
});
```

## Environment Variables

```bash
# NetGSM
NETGSM_USERNAME=your-username
NETGSM_PASSWORD=your-password
NETGSM_SENDER=MYSENDER
NETGSM_URL=https://api.netgsm.com.tr/sms/send/otp
```

## API Reference

### SMSService

```typescript
class SMSService {
  // Send a single SMS
  send(options: SMSOptions): Promise<SMSResult>;

  // Send multiple SMS messages
  sendBatch(options: BatchSMSOptions): Promise<BatchSMSResult>;

  // Verify provider configuration
  verify(): Promise<boolean>;

  // Send OTP verification SMS
  sendOTP(phone: string, code: string, expiresInMinutes?: number): Promise<SMSResult>;

  // Send welcome SMS
  sendWelcome(phone: string, name?: string): Promise<SMSResult>;
}
```

### Types

```typescript
interface SMSOptions {
  to: string;           // Recipient phone number
  message: string;      // SMS content
  from?: string;        // Sender ID override
  tags?: Record<string, string>;
}

interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  data?: unknown;
}
```

## License

MIT
