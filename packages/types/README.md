# @parsrun/types

Core types and validation schemas for Pars framework using ArkType.

## Features

- **Type-Safe**: Full TypeScript support
- **Runtime Validation**: ArkType-based validation
- **Reusable Schemas**: Common validation patterns
- **Inference**: Automatic type inference from schemas

## Installation

```bash
pnpm add @parsrun/types
```

## Quick Start

```typescript
import { type, createValidator } from '@parsrun/types';

// Define a schema
const userSchema = type({
  id: 'string',
  email: 'string.email',
  name: 'string',
  age: 'number >= 0',
});

// Infer TypeScript type
type User = typeof userSchema.infer;

// Validate data
const result = userSchema(data);
if (result.problems) {
  console.error(result.problems);
} else {
  console.log(result.data);
}
```

## API Overview

### Common Types

```typescript
import {
  // Primitives
  StringType,
  NumberType,
  BooleanType,
  DateType,

  // Common patterns
  EmailType,
  UUIDType,
  URLType,

  // Pars-specific
  TenantId,
  UserId,
  SessionId,
} from '@parsrun/types';
```

### Validation Helpers

```typescript
import { createValidator, validate } from '@parsrun/types';

// Create reusable validator
const validateUser = createValidator(userSchema);

// Validate with detailed errors
const { data, errors } = validate(userSchema, input);
```

### Schema Composition

```typescript
import { type } from '@parsrun/types';

const addressSchema = type({
  street: 'string',
  city: 'string',
  country: 'string',
});

const userWithAddressSchema = type({
  ...userSchema.def,
  address: addressSchema,
});
```

### Optional & Nullable

```typescript
const schema = type({
  required: 'string',
  optional: 'string?',        // string | undefined
  nullable: 'string | null',  // string | null
});
```

## Built-in Schemas

| Schema | Description |
|--------|-------------|
| `EmailSchema` | Email validation |
| `UUIDSchema` | UUID v4 format |
| `URLSchema` | Valid URL |
| `DateSchema` | ISO date string |
| `PaginationSchema` | `{ page, limit }` |
| `SortSchema` | `{ field, order }` |

## Exports

```typescript
import {
  type,
  createValidator,
  validate,
  // Built-in schemas
  EmailSchema,
  UUIDSchema,
  PaginationSchema,
} from '@parsrun/types';
```

## License

MIT
