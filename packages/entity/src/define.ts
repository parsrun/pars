import { type, type Type } from 'arktype'
import type {
  EntityDefinition,
  Field,
  FieldDefinition,
  Entity,
} from './types.js'

/**
 * Convert a field definition to an ArkType type string
 */
function fieldToArkType(field: Field): string {
  const def: FieldDefinition = typeof field === 'string'
    ? { type: field }
    : field

  let typeStr = def.type

  // Handle json type - ArkType doesn't have 'json', use 'object' instead
  if (typeStr === 'json') {
    typeStr = 'object'
  }

  // Handle min/max constraints
  if (def.min !== undefined || def.max !== undefined) {
    if (typeStr === 'string' || typeStr.startsWith('string')) {
      if (def.min !== undefined && def.max !== undefined) {
        typeStr = `string >= ${def.min} <= ${def.max}`
      } else if (def.min !== undefined) {
        typeStr = `string >= ${def.min}`
      } else if (def.max !== undefined) {
        typeStr = `string <= ${def.max}`
      }
    } else if (typeStr === 'number' || typeStr.startsWith('number')) {
      const base = typeStr.includes('.integer') ? 'number.integer' : 'number'
      if (def.min !== undefined && def.max !== undefined) {
        typeStr = `${base} >= ${def.min} <= ${def.max}`
      } else if (def.min !== undefined) {
        typeStr = `${base} >= ${def.min}`
      } else if (def.max !== undefined) {
        typeStr = `${base} <= ${def.max}`
      }
    }
  }

  // Handle optional fields
  if (def.optional) {
    // For optional fields, allow undefined or the type
    typeStr = `${typeStr} | undefined`
  }

  return typeStr
}

/**
 * Build the full schema object for ArkType
 */
function buildSchemaObject(
  definition: EntityDefinition<Record<string, Field>>,
  mode: 'full' | 'create' | 'update' | 'query'
): Record<string, string> {
  const schema: Record<string, string> = {}
  const idType = definition.idType ?? 'string.uuid'

  // Add id field for full schema
  if (mode === 'full') {
    schema['id'] = idType
  }

  // Add tenantId if tenant-scoped
  if (definition.tenant) {
    if (mode === 'full' || mode === 'create') {
      schema['tenantId'] = idType
    }
    if (mode === 'query') {
      schema['tenantId?'] = idType
    }
  }

  // Add user-defined fields
  for (const [name, field] of Object.entries(definition.fields)) {
    const def: FieldDefinition = typeof field === 'string'
      ? { type: field }
      : field

    if (mode === 'update' || mode === 'query') {
      // All fields optional for update/query
      schema[`${name}?`] = fieldToArkType(field)
    } else if (mode === 'create') {
      // Skip fields with defaults or optional fields
      if (def.default !== undefined || def.optional) {
        schema[`${name}?`] = fieldToArkType(field)
      } else {
        schema[name] = fieldToArkType(field)
      }
    } else {
      // Full schema
      if (def.optional) {
        schema[`${name}?`] = fieldToArkType(field)
      } else {
        schema[name] = fieldToArkType(field)
      }
    }
  }

  // Add timestamp fields
  if (definition.timestamps) {
    if (mode === 'full') {
      schema['insertedAt'] = 'Date'
      schema['updatedAt'] = 'Date'
    }
    if (mode === 'query') {
      schema['insertedAt?'] = 'Date'
      schema['updatedAt?'] = 'Date'
      schema['insertedAfter?'] = 'Date'
      schema['insertedBefore?'] = 'Date'
    }
  }

  // Add soft delete field
  if (definition.softDelete) {
    if (mode === 'full') {
      schema['deletedAt?'] = 'Date'
    }
    if (mode === 'query') {
      schema['includeDeleted?'] = 'boolean'
    }
  }

  // Add pagination for query
  if (mode === 'query') {
    schema['limit?'] = 'number.integer > 0'
    schema['offset?'] = 'number.integer >= 0'
    schema['cursor?'] = 'string'
    schema['orderBy?'] = 'string'
    schema['orderDirection?'] = "'asc' | 'desc'"
    schema['search?'] = 'string'
  }

  return schema
}

/**
 * Define an entity with single-source schema generation
 *
 * @example
 * ```typescript
 * const Product = defineEntity({
 *   name: 'products',
 *   tenant: true,
 *   timestamps: true,
 *   softDelete: true,
 *   fields: {
 *     name: 'string >= 1',
 *     price: { type: 'number', min: 0 },
 *     status: "'draft' | 'active' | 'archived'",
 *   },
 *   indexes: [
 *     { fields: ['tenantId', 'status'] },
 *   ],
 * })
 *
 * // Use schemas
 * const validated = Product.createSchema(input)
 * const products = await db.select().from(Product.table)
 * ```
 */
export function defineEntity<
  TName extends string,
  TFields extends Record<string, Field>,
>(
  definition: EntityDefinition<TFields> & { name: TName }
): Entity<TName, TFields, Record<string, unknown>> {
  // Build schema objects
  const fullSchemaObj = buildSchemaObject(definition, 'full')
  const createSchemaObj = buildSchemaObject(definition, 'create')
  const updateSchemaObj = buildSchemaObject(definition, 'update')
  const querySchemaObj = buildSchemaObject(definition, 'query')

  // Create ArkType schemas
  const schema = type(fullSchemaObj as Record<string, string>)
  const createSchema = type(createSchemaObj as Record<string, string>)
  const updateSchema = type(updateSchemaObj as Record<string, string>)
  const querySchema = type(querySchemaObj as Record<string, string>)

  // Determine auto and required fields
  const autoFields: string[] = ['id']
  if (definition.timestamps) {
    autoFields.push('insertedAt', 'updatedAt')
  }
  if (definition.softDelete) {
    autoFields.push('deletedAt')
  }

  const requiredFields: string[] = []
  const optionalFields: string[] = []

  if (definition.tenant) {
    requiredFields.push('tenantId')
  }

  for (const [name, field] of Object.entries(definition.fields)) {
    const def: FieldDefinition = typeof field === 'string'
      ? { type: field }
      : field

    if (def.optional || def.default !== undefined) {
      optionalFields.push(name)
    } else {
      requiredFields.push(name)
    }
  }

  return {
    name: definition.name as TName,
    definition,
    schema: schema as Type<Record<string, unknown>>,
    createSchema: createSchema as Type<Record<string, unknown>>,
    updateSchema: updateSchema as Type<Record<string, unknown>>,
    querySchema: querySchema as Type<Record<string, unknown>>,
    infer: {} as Record<string, unknown>,
    autoFields,
    requiredFields,
    optionalFields,
  }
}

/**
 * Create a reference field to another entity
 */
export function ref(
  entity: string | { name: string },
  options?: {
    field?: string
    onDelete?: 'cascade' | 'set null' | 'restrict' | 'no action'
    optional?: boolean
    /** ID type for this reference (default: 'string.uuid') */
    idType?: string
  }
): FieldDefinition {
  const entityName = typeof entity === 'string' ? entity : entity.name
  const result: FieldDefinition = {
    type: (options?.idType ?? 'string.uuid') as FieldDefinition['type'],
    db: {
      references: {
        entity: entityName,
        field: options?.field ?? 'id',
        onDelete: options?.onDelete ?? 'restrict',
      },
    },
  }
  if (options?.optional !== undefined) {
    result.optional = options.optional
  }
  return result
}

/**
 * Create an enum field from a list of values
 */
export function enumField<T extends string>(
  values: readonly T[],
  options?: { default?: T; optional?: boolean }
): FieldDefinition {
  const typeStr = values.map(v => `'${v}'`).join(' | ')
  const result: FieldDefinition = {
    type: typeStr as `'${string}'`,
  }
  if (options?.default !== undefined) {
    result.default = options.default
  }
  if (options?.optional !== undefined) {
    result.optional = options.optional
  }
  return result
}

/**
 * Create a JSON field
 */
export function jsonField<T = Record<string, unknown>>(
  options?: { optional?: boolean; default?: T }
): FieldDefinition {
  const result: FieldDefinition = {
    type: 'json',
  }
  if (options?.optional !== undefined) {
    result.optional = options.optional
  }
  if (options?.default !== undefined) {
    result.default = options.default
  }
  return result
}

/**
 * Create a decimal field with precision
 */
export function decimal(
  precision: number,
  scale: number,
  options?: { min?: number; max?: number; optional?: boolean }
): FieldDefinition {
  const result: FieldDefinition = {
    type: 'number',
    db: {
      precision,
      scale,
    },
  }
  if (options?.min !== undefined) {
    result.min = options.min
  }
  if (options?.max !== undefined) {
    result.max = options.max
  }
  if (options?.optional !== undefined) {
    result.optional = options.optional
  }
  return result
}
