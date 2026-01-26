# @parsrun/entity

Single-source entity definitions for the Pars framework. Define once, generate ArkType validation schemas and Drizzle ORM tables.

## Installation

```bash
npm install @parsrun/entity
# or
pnpm add @parsrun/entity
```

## Quick Start

```typescript
import { defineEntity, ref, enumField } from '@parsrun/entity'
import { toPgTable } from '@parsrun/entity/pg'
// or for SQLite/D1:
// import { toSqliteTable } from '@parsrun/entity/sqlite'

// Define your entity once
const Product = defineEntity({
  name: 'products',
  tenant: true,        // Adds tenantId field
  timestamps: true,    // Adds insertedAt, updatedAt
  softDelete: true,    // Adds deletedAt

  fields: {
    name: 'string >= 1',
    slug: 'string',
    description: { type: 'string', optional: true },
    price: { type: 'number', min: 0 },
    stock: { type: 'number.integer', min: 0, default: 0 },
    status: enumField(['draft', 'active', 'archived'], { default: 'draft' }),
    categoryId: ref('categories', { onDelete: 'set null', optional: true }),
  },

  indexes: [
    { fields: ['tenantId', 'slug'], unique: true },
    { fields: ['tenantId', 'status'] },
  ],
})

// Generated schemas available:
Product.schema        // Full entity schema
Product.createSchema  // For create operations (no id, timestamps)
Product.updateSchema  // For updates (all optional)
Product.querySchema   // For filtering (includes pagination)

// Generate Drizzle table
const productsTable = toPgTable(Product)
```

## Usage

### Validation

```typescript
import { type } from 'arktype'

// Validate create input
const input = Product.createSchema(requestBody)
if (input instanceof type.errors) {
  return { error: 'Validation failed', details: input }
}

// input is now typed and validated
await db.insert(productsTable).values({
  tenantId: ctx.tenantId,
  ...input,
})
```

### Database Queries

```typescript
import { eq, and } from 'drizzle-orm'
import { toPgTable } from '@parsrun/entity/pg'

const productsTable = toPgTable(Product)

// Select
const products = await db
  .select()
  .from(productsTable)
  .where(and(
    eq(productsTable.tenantId, tenantId),
    eq(productsTable.status, 'active')
  ))

// Insert
const [product] = await db
  .insert(productsTable)
  .values({ tenantId, name: 'Widget', price: 9.99 })
  .returning()

// Update
await db
  .update(productsTable)
  .set({ price: 14.99 })
  .where(eq(productsTable.id, productId))
```

### Multiple Entities with References

```typescript
import { createPgSchema } from '@parsrun/entity/pg'

const Category = defineEntity({
  name: 'categories',
  tenant: true,
  timestamps: true,
  fields: {
    name: 'string >= 1',
    slug: 'string',
  },
})

const Product = defineEntity({
  name: 'products',
  tenant: true,
  timestamps: true,
  fields: {
    name: 'string >= 1',
    categoryId: ref(Category, { onDelete: 'cascade' }),
  },
})

// Creates tables with proper foreign key references
const schema = createPgSchema({ Category, Product })
// schema.Category, schema.Product
```

## Field Types

| Type | Description | Example |
|------|-------------|---------|
| `'string'` | Text field | `name: 'string'` |
| `'string >= N'` | Min length | `name: 'string >= 1'` |
| `'string.uuid'` | UUID field | `id: 'string.uuid'` |
| `'string.email'` | Email field | `email: 'string.email'` |
| `'string.url'` | URL field | `website: 'string.url'` |
| `'number'` | Numeric field | `price: 'number'` |
| `'number >= N'` | Min value | `price: 'number >= 0'` |
| `'number.integer'` | Integer field | `stock: 'number.integer'` |
| `'boolean'` | Boolean field | `isActive: 'boolean'` |
| `'Date'` | Timestamp | `expiresAt: 'Date'` |
| `'json'` | JSON field | `metadata: 'json'` |
| `"'a' \| 'b'"` | Union/Enum | `status: "'draft' \| 'active'"` |

## Helper Functions

### `enumField(values, options?)`

```typescript
status: enumField(['draft', 'active', 'archived'], {
  default: 'draft',
  optional: false
})
```

### `ref(entity, options?)`

```typescript
categoryId: ref('categories', {
  field: 'id',           // default: 'id'
  onDelete: 'cascade',   // 'cascade' | 'set null' | 'restrict'
  optional: true
})

// Or with entity reference
categoryId: ref(Category, { onDelete: 'cascade' })
```

### `decimal(precision, scale, options?)`

```typescript
price: decimal(10, 2, { min: 0 })  // DECIMAL(10,2)
```

### `jsonField(options?)`

```typescript
metadata: jsonField({ optional: true, default: {} })
```

## SQLite / Cloudflare D1

```typescript
import { toSqliteTable, createSqliteSchema } from '@parsrun/entity/sqlite'

const productsTable = toSqliteTable(Product)

// Or multiple tables
const schema = createSqliteSchema({ Category, Product })
```

## TypeScript Types

```typescript
import type { InferEntity, InferCreateInput, InferUpdateInput } from '@parsrun/entity'

type Product = InferEntity<typeof Product>
type CreateProductInput = InferCreateInput<typeof Product>
type UpdateProductInput = InferUpdateInput<typeof Product>
```

## License

MIT
