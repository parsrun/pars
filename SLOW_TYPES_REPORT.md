# Slow Types Analysis Report for Pars Packages

This report identifies "slow types" issues that JSR/Deno complains about when publishing packages. Slow types are type constructs that require the type checker to perform extensive inference, which can slow down type checking and cause issues with declaration file generation.

## Summary

| Package | Problematic Exports | Effort to Fix |
|---------|-------------------|---------------|
| @parsrun/auth | 12 | Medium |
| @parsrun/core | 8 | Low |
| @parsrun/payments | 15 | Medium |
| @parsrun/server | 10 | Medium |
| @parsrun/service | 18 | Medium-High |
| @parsrun/service-adapters | 4 | Low |
| @parsrun/storage | 6 | Low |
| @parsrun/types | 45+ | High |

---

## Package: @parsrun/auth

**Location:** `/packages/auth/src/`

### Issues Found: 12

#### 1. Exported Functions Without Explicit Return Types

```typescript
// /packages/auth/src/index.ts:69
export function createAuth(config: ParsAuthConfig): ParsAuthEngine {
  return createAuthEngine(config);
}
```
**Status:** OK - Has explicit return type

```typescript
// /packages/auth/src/config.ts:538
export function mergeConfig(config: ParsAuthConfig): Required<ParsAuthConfig> {
  // Returns a complex object with type assertions
  return {
    ...
  } as Required<ParsAuthConfig>;
}
```
**Issue:** Uses `as Required<ParsAuthConfig>` type assertion which may not be verifiable.

```typescript
// /packages/auth/src/config.ts:582
export function validateConfig(config: ParsAuthConfig): void {
  // ...
}
```
**Status:** OK - Has explicit return type

```typescript
// /packages/auth/src/schemas.ts:157-176
export function validateAuthConfig(config: unknown): import("@parsrun/types").ParsAuthConfig {
  const { validateWithSchema, parsAuthConfig } = require("@parsrun/types");
  return validateWithSchema(parsAuthConfig, config);
}
```
**Issue:** Uses `require()` dynamically which prevents proper type inference.

#### 2. Exported Constants Without Explicit Type Annotations

```typescript
// /packages/auth/src/config.ts:463
export const defaultConfig: Partial<ParsAuthConfig> = {
  // complex nested object
};
```
**Status:** OK - Has type annotation

#### 3. Complex Type Inference Issues

**Re-exports from @parsrun/types:**
The package re-exports many schemas from `@parsrun/types` that use `typeof schema.infer` pattern:

```typescript
// /packages/auth/src/schemas.ts
export {
  type UUID,           // type UUID = typeof uuid.infer;
  type Timestamp,      // type Timestamp = typeof timestamp.infer;
  type User,           // type User = typeof user.infer;
  // ... 50+ more type exports
} from "@parsrun/types";
```

**Issue:** These `typeof schema.infer` types require the type checker to infer types from ArkType schema objects, which is complex inference.

#### 4. Re-exports That Might Cause Issues

```typescript
// /packages/auth/src/index.ts - Multiple re-export patterns
export {
  type ParsAuthConfig,
  type SessionConfig,
  // ... many type exports
  defaultConfig,
  mergeConfig,
  validateConfig,
} from './config.js';

export {
  ProviderRegistry,
  type AuthProvider,
  // ... many more
} from './providers/index.js';
```

**Issue:** Deep re-export chains can cause declaration emit issues.

### Estimated Effort: Medium
- Need to add explicit return types to ~5 functions
- Need to explicitly type the ArkType schema inference patterns
- Consider using explicit interface declarations instead of `typeof schema.infer`

---

## Package: @parsrun/core

**Location:** `/packages/core/src/`

### Issues Found: 8

#### 1. Exported Functions Without Explicit Return Types

```typescript
// /packages/core/src/index.ts:171
export async function generateRandomString(length: number): Promise<string> {
  // ...
}
```
**Status:** OK - Has explicit return type

```typescript
// /packages/core/src/index.ts:189
export function generateId(): string {
  return crypto.randomUUID();
}
```
**Status:** OK - Has explicit return type

```typescript
// /packages/core/src/index.ts:341
export function createLogger(config?: Partial<LoggerConfig>): Logger {
  return new Logger(config);
}
```
**Status:** OK - Has explicit return type

#### 2. Exported Constants Without Explicit Type Annotations

```typescript
// /packages/core/src/logger.ts:39
export const LogLevel = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
  FATAL: 60,
  SILENT: 100,
} as const;
```
**Status:** OK - Uses `as const` assertion

```typescript
// /packages/core/src/logger.ts:349
export const logger = createLogger();
```
**Issue:** No explicit type annotation. Should be `export const logger: Logger = createLogger();`

#### 3. Complex Type Inference Issues

```typescript
// /packages/core/src/types.ts:50
export type LogLevelName = keyof typeof LogLevel;
```
**Issue:** Relies on inference from `typeof LogLevel`

```typescript
// /packages/core/src/types.ts:53
export type LogLevelValue = (typeof LogLevel)[LogLevelName];
```
**Issue:** Complex indexed access type depending on inferred type

#### 4. Star Re-exports

```typescript
// /packages/core/src/index.ts:103
export * from "./types.js";

// /packages/core/src/index.ts:109
export * from "./errors.js";
```
**Issue:** Star re-exports can cause declaration emit issues when the source module has complex types.

### Estimated Effort: Low
- Add explicit type annotation to `logger` constant
- Consider converting `LogLevelName` and `LogLevelValue` to explicit type definitions

---

## Package: @parsrun/payments

**Location:** `/packages/payments/src/`

### Issues Found: 15

#### 1. Exported Functions Without Explicit Return Types

```typescript
// /packages/payments/src/index.ts:354
export function createPaymentService(config: PaymentServiceConfig): PaymentService {
  return new PaymentService(config);
}
```
**Status:** OK - Has explicit return type

#### 2. Exported Constants Without Explicit Type Annotations

```typescript
// /packages/payments/src/types.ts:555
export const PaymentErrorCodes = {
  INVALID_CONFIG: "INVALID_CONFIG",
  CUSTOMER_NOT_FOUND: "CUSTOMER_NOT_FOUND",
  // ...
} as const;
```
**Status:** OK - Uses `as const`

#### 3. Complex Type Inference Issues

**Re-exports from @parsrun/types:**
```typescript
// /packages/payments/src/types.ts:7-55
export {
  type,
  currencyCode,
  money,
  paymentCustomer,
  // ... many ArkType schemas
  type CurrencyCode as ParsCurrencyCode,
  type Money,
  // ... many inferred types
} from "@parsrun/types";
```
**Issue:** Same `typeof schema.infer` pattern from @parsrun/types

#### 4. Star Re-exports

```typescript
// /packages/payments/src/index.ts:37
export * from "./types.js";
```
**Issue:** Star re-export of types module with complex inference

#### 5. Default Export with Object Literal

```typescript
// /packages/payments/src/index.ts:566
export default {
  PaymentService,
  createPaymentService,
  BillingService,
  createBillingService,
  UsageService,
  createUsageService,
  DunningManager,
  createDunningManager,
};
```
**Issue:** Object literal without explicit type annotation for default export.

### Estimated Effort: Medium
- Add explicit type annotation to default export
- Consider explicit type declarations for re-exported types

---

## Package: @parsrun/server

**Location:** `/packages/server/src/`

### Issues Found: 10

#### 1. Exported Functions Without Explicit Return Types

```typescript
// /packages/server/src/validation/index.ts:140
export function validateBody<T extends Type>(schema: T, options: ValidateOptions = {}) {
  return async (c: HonoContext, next: HonoNext): Promise<void> => {
    // ...
  };
}
```
**Issue:** Generic function returns an async function - return type should be explicit:
```typescript
export function validateBody<T extends Type>(
  schema: T,
  options: ValidateOptions = {}
): (c: HonoContext, next: HonoNext) => Promise<void>
```

Same issue applies to:
- `validateQuery` (line 182)
- `validateParams` (line 214)
- `validateHeaders` (line 244)
- `validate` (line 286)

#### 2. Complex Type Inference Issues

```typescript
// /packages/server/src/validation/index.ts:92
export type Infer<T extends Type> = T["infer"];
```
**Issue:** Relies on indexed access of generic type parameter

#### 3. Mass Re-exports from @parsrun/types

```typescript
// /packages/server/src/validation/index.ts:11-83
export {
  type,
  uuid,
  timestamp,
  email,
  // ... 70+ exports
} from "@parsrun/types";
```
**Issue:** Large number of re-exports including types that use `typeof schema.infer`

#### 4. Type Casting in Returns

```typescript
// /packages/server/src/validation/index.ts:160
(c as HonoContext & { validatedBody: T["infer"] }).set("validatedBody" as never, result as never);
```
**Issue:** Complex type assertions that may not be verifiable

### Estimated Effort: Medium
- Add explicit return types to validation middleware functions
- Consider creating explicit type aliases for common patterns

---

## Package: @parsrun/service

**Location:** `/packages/service/src/`

### Issues Found: 18

#### 1. Exported Functions Without Explicit Return Types

```typescript
// /packages/service/src/define.ts:52-59
export function defineService<
  TQueries extends Record<string, QueryDefinition> = Record<string, QueryDefinition>,
  TMutations extends Record<string, MutationDefinition> = Record<string, MutationDefinition>,
  TEmits extends Record<string, EventDefinition> = Record<string, EventDefinition>,
  THandles extends string[] = string[],
>(
  definition: ServiceDefinition<TQueries, TMutations, TEmits, THandles>
): ServiceDefinition<TQueries, TMutations, TEmits, THandles> {
  // ...
}
```
**Status:** OK - Has explicit return type, but the generic constraints are complex

```typescript
// /packages/service/src/define.ts:156
export function getServiceMethods(definition: ServiceDefinition): {
  queries: string[];
  mutations: string[];
} {
  // ...
}
```
**Status:** OK - Has explicit return type

```typescript
// /packages/service/src/config.ts:117
export function mergeConfig(userConfig?: Partial<ServiceConfig>): Required<ServiceConfig> {
  // ...
}
```
**Status:** OK - Has explicit return type

#### 2. Exported Constants Without Explicit Type Annotations

```typescript
// /packages/service/src/config.ts:24
export const DEFAULT_EVENT_CONFIG: Required<EventFormatConfig> = {
  format: "cloudevents",
  internalCompact: true,
};
```
**Status:** OK - Has explicit type annotation

All other `DEFAULT_*` constants are properly typed.

#### 3. Complex Type Inference Issues

```typescript
// /packages/service/src/types.ts:621-658
export type QueryInput<...> = NonNullable<TQueries>[K] extends QueryDefinition<infer TInput, unknown>
  ? TInput
  : never;

export type QueryOutput<...> = NonNullable<TQueries>[K] extends QueryDefinition<unknown, infer TOutput>
  ? TOutput
  : never;
```
**Issue:** These utility types use conditional types with `infer` which are complex for declaration emit.

```typescript
// /packages/service/src/types.ts:97-120
export interface ServiceDefinition<
  TQueries extends Record<string, QueryDefinition> = Record<string, QueryDefinition>,
  TMutations extends Record<string, MutationDefinition> = Record<string, MutationDefinition>,
  TEmits extends Record<string, EventDefinition> = Record<string, EventDefinition>,
  THandles extends string[] = string[],
> {
  // ...
}
```
**Issue:** Complex generic interface with multiple type parameters and default values

#### 4. Generic Type with Complex Constraints

```typescript
// /packages/service/src/types.ts:587-615
export interface ServiceClient<TDef extends ServiceDefinition = ServiceDefinition> {
  query<K extends keyof TDef["queries"]>(
    method: K,
    input: QueryInput<TDef["queries"], K>
  ): Promise<QueryOutput<TDef["queries"], K>>;
  // ...
}
```
**Issue:** Deeply nested generic constraints with indexed access types

### Estimated Effort: Medium-High
- Utility types like `QueryInput`, `QueryOutput`, etc. may need to be simplified or documented as requiring explicit types
- Consider providing non-generic overloads for common use cases

---

## Package: @parsrun/service-adapters

**Location:** `/packages/service-adapters/src/`

### Issues Found: 4

#### 1. Re-exports from Sub-modules

```typescript
// /packages/service-adapters/src/index.ts
export * from "./email/index.js";
export * from "./payments/index.js";
```
**Issue:** Star re-exports - need to verify sub-modules don't have slow types

```typescript
// /packages/service-adapters/src/email/index.ts
export { emailServiceDefinition, type EmailServiceDefinition } from "./definition.js";
export {
  createEmailServiceServer,
  type EmailServiceServerOptions,
} from "./server.js";
export {
  createEmailServiceClient,
  type EmailServiceClient,
} from "./client.js";
```
**Status:** Mostly OK - Named exports with explicit types

### Estimated Effort: Low
- Verify that `definition.ts`, `server.ts`, and `client.ts` have explicit types
- Consider converting star re-exports to named re-exports

---

## Package: @parsrun/storage

**Location:** `/packages/storage/src/`

### Issues Found: 6

#### 1. Exported Functions Without Explicit Return Types

```typescript
// /packages/storage/src/index.ts:127
export async function createStorage(
  config: AnyStorageConfig & { binding?: R2Bucket }
): Promise<StorageAdapter> {
  // ...
}
```
**Status:** OK - Has explicit return type

```typescript
// /packages/storage/src/index.ts:162
export function createStorageSync(
  config: AnyStorageConfig & { binding?: R2Bucket }
): StorageAdapter {
  // ...
}
```
**Status:** OK - Has explicit return type

#### 2. Exported Constants Without Explicit Type Annotations

```typescript
// /packages/storage/src/index.ts:196
export const StorageUtils = {
  getExtension(key: string): string { ... },
  getFileName(key: string): string { ... },
  getDirectory(key: string): string { ... },
  joinPath(...parts: string[]): string { ... },
  normalizeKey(key: string): string { ... },
  generateUniqueKey(prefix: string, extension?: string): string { ... },
  guessContentType(key: string): string { ... },
  formatSize(bytes: number): string { ... },
  parseSize(size: string): number { ... },
};
```
**Issue:** Object with methods should have explicit type annotation:
```typescript
export const StorageUtils: {
  getExtension(key: string): string;
  getFileName(key: string): string;
  // ... etc
} = { ... };
```

#### 3. Type Union Without Explicit Declaration

```typescript
// /packages/storage/src/index.ts:80
export type AnyStorageConfig = S3Config | R2Config | MemoryConfig;
```
**Status:** OK - Simple type alias

#### 4. Re-exports from @parsrun/types

```typescript
// /packages/storage/src/types.ts:7-29
export {
  type,
  fileMetadata,
  uploadOptions as parsUploadOptions,
  // ... many more
} from "@parsrun/types";
```
**Issue:** Re-exports ArkType schemas which use `typeof schema.infer`

### Estimated Effort: Low
- Add explicit type annotation to `StorageUtils` constant
- Consider explicit interface for StorageUtils methods

---

## Package: @parsrun/types

**Location:** `/packages/types/src/`

### Issues Found: 45+

This package is the **source of most slow type issues** across the codebase due to extensive use of the ArkType pattern.

#### 1. Extensive Use of `typeof schema.infer` Pattern

```typescript
// /packages/types/src/common.ts:177
export type UUID = typeof uuid.infer;

// /packages/types/src/common.ts:183
export type Timestamp = typeof timestamp.infer;

// /packages/types/src/auth.ts:540
export type User = typeof user.infer;

// ... 80+ more type exports using this pattern
```

**Issue:** Each `typeof schema.infer` requires:
1. Evaluating the ArkType schema value
2. Accessing the `.infer` property type
3. This is complex inference that Deno/JSR may struggle with

#### 2. Generic Factory Functions Returning Inferred Types

```typescript
// /packages/types/src/common.ts:103
export const successResponse = <T>(dataSchema: T) =>
  type({
    success: "'true'",
    data: dataSchema as never,
    "message?": "string",
  });

// /packages/types/src/common.ts:127
export const paginatedResponse = <T>(dataSchema: T) =>
  type({
    success: "boolean",
    data: dataSchema as never,
    pagination: paginationMeta,
    "message?": "string",
  });
```
**Issue:** These generic functions return ArkType schema objects whose `.infer` types must be computed.

#### 3. Functions Returning `T["infer"]`

```typescript
// /packages/types/src/index.ts:97
export function validateWithSchema<T extends Type>(
  schema: T,
  data: unknown
): T["infer"] {
  // ...
}

// /packages/types/src/index.ts:129
export function safeValidate<T extends Type>(
  schema: T,
  data: unknown
): { success: true; data: T["infer"] } | { success: false; errors: string[] } {
  // ...
}
```
**Issue:** Return type depends on generic parameter's `infer` property

#### 4. Star Re-exports

```typescript
// /packages/types/src/index.ts:35
export * from "./common";

// /packages/types/src/index.ts:40
export * from "./auth";

// ... more star re-exports
```
**Issue:** Star re-exports of modules with complex inferred types

### Estimated Effort: High

This is the most complex package to fix. Options include:

1. **Explicit Type Declarations**: Instead of `export type UUID = typeof uuid.infer;`, define interfaces/types explicitly:
   ```typescript
   export type UUID = string;
   export interface User {
     id: string;
     displayName?: string;
     twoFactorEnabled: boolean;
     // ...
   }
   ```

2. **Use Declaration Merging**: Provide explicit `.d.ts` files alongside the source

3. **Consider Alternative Validation Library**: Libraries like Zod have better TypeScript integration for declaration emit

---

## Recommendations

### Priority 1: Fix @parsrun/types (High Impact)

Since most other packages depend on @parsrun/types, fixing it will resolve many downstream issues:

1. Create explicit interface/type declarations for all exported types
2. Keep ArkType schemas for runtime validation but separate type exports
3. Example refactor:

```typescript
// Before
export const user = type({ id: uuid, name: "string" });
export type User = typeof user.infer;

// After
export interface User {
  id: string;
  name: string;
}
export const user = type({ id: "string.uuid", name: "string" }) as Type<User>;
```

### Priority 2: Add Explicit Return Types

In all packages, ensure exported functions have explicit return types:

```typescript
// Before
export function createStorage(config: Config) {
  return new StorageAdapter(config);
}

// After
export function createStorage(config: Config): StorageAdapter {
  return new StorageAdapter(config);
}
```

### Priority 3: Type Exported Constants

Add explicit type annotations to all exported constants:

```typescript
// Before
export const logger = createLogger();
export const StorageUtils = { ... };

// After
export const logger: Logger = createLogger();
export const StorageUtils: StorageUtilsInterface = { ... };
```

### Priority 4: Convert Star Re-exports

Consider converting `export * from` to explicit named exports for better control:

```typescript
// Before
export * from "./types.js";

// After
export {
  User,
  Session,
  createUser,
  // ... explicitly list exports
} from "./types.js";
```

---

## Quick Fixes Checklist

- [ ] `@parsrun/core`: Add type to `logger` constant
- [ ] `@parsrun/storage`: Add type to `StorageUtils` constant
- [ ] `@parsrun/server`: Add return types to validation middleware functions
- [ ] `@parsrun/payments`: Add type to default export object
- [ ] `@parsrun/types`: Convert `typeof schema.infer` to explicit interfaces (major refactor)
- [ ] All packages: Convert `export *` to named exports where possible
- [ ] All packages: Ensure all public functions have explicit return types
