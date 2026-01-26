/**
 * @parsrun/entity
 *
 * Single-source entity definitions for Pars framework.
 * Define once, generate ArkType schemas and Drizzle tables.
 *
 * @example
 * ```typescript
 * import { defineEntity, ref, enumField } from '@parsrun/entity'
 * import { toPgTable } from '@parsrun/entity/pg'
 *
 * // Define entity
 * const Product = defineEntity({
 *   name: 'products',
 *   tenant: true,
 *   timestamps: true,
 *   softDelete: true,
 *   fields: {
 *     name: 'string >= 1',
 *     slug: 'string',
 *     description: { type: 'string', optional: true },
 *     price: { type: 'number', min: 0 },
 *     stock: { type: 'number.integer', min: 0, default: 0 },
 *     status: enumField(['draft', 'active', 'archived'], { default: 'draft' }),
 *     categoryId: ref('categories', { onDelete: 'set null', optional: true }),
 *   },
 *   indexes: [
 *     { fields: ['tenantId', 'slug'], unique: true },
 *     { fields: ['tenantId', 'status'] },
 *   ],
 * })
 *
 * // Use ArkType schemas
 * const input = Product.createSchema(requestBody)
 * if (input instanceof type.errors) throw new ValidationError(input)
 *
 * // Generate Drizzle table
 * const productsTable = toPgTable(Product)
 * await db.insert(productsTable).values({ tenantId, ...input })
 * ```
 */

export { defineEntity, ref, enumField, jsonField, decimal } from './define.js'

export type {
  FieldType,
  FieldDefinition,
  SimpleFieldDefinition,
  Field,
  IndexDefinition,
  EntityDefinition,
  EntitySchemas,
  Entity,
  DrizzleOptions,
  InferEntity,
  InferCreateInput,
  InferUpdateInput,
} from './types.js'

// Re-export arktype type function for convenience
export { type } from 'arktype'
