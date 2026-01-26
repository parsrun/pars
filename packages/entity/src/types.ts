import type { Type } from 'arktype'

/**
 * Supported field types for entity definitions
 */
export type FieldType =
  | 'string'
  | 'string.uuid'
  | 'string.email'
  | 'string.url'
  | 'number'
  | 'number.integer'
  | 'boolean'
  | 'Date'
  | 'json'
  | `'${string}'` // Literal string
  | `'${string}' | '${string}'` // Union of literals (expanded below)
  | string // For complex arktype expressions

/**
 * Field definition with full options
 */
export interface FieldDefinition {
  /** The arktype type string */
  type: FieldType
  /** Whether the field is optional (nullable in DB) */
  optional?: boolean
  /** Default value for the field */
  default?: unknown
  /** Minimum value/length */
  min?: number
  /** Maximum value/length */
  max?: number
  /** Regex pattern for strings */
  pattern?: RegExp
  /** Database-specific options */
  db?: {
    /** Custom column name */
    column?: string
    /** Precision for decimals */
    precision?: number
    /** Scale for decimals */
    scale?: number
    /** Whether to index this field */
    index?: boolean
    /** Whether this field is unique (within tenant if multi-tenant) */
    unique?: boolean
    /** Reference to another entity */
    references?: {
      entity: string
      field?: string
      onDelete?: 'cascade' | 'set null' | 'restrict' | 'no action'
    }
  }
}

/**
 * Simplified field definition - just the type string
 */
export type SimpleFieldDefinition = FieldType

/**
 * Field can be either simple or full definition
 */
export type Field = SimpleFieldDefinition | FieldDefinition

/**
 * Index definition
 */
export interface IndexDefinition {
  /** Fields to include in the index */
  fields: string[]
  /** Whether the index is unique */
  unique?: boolean
  /** Optional name for the index */
  name?: string
  /** SQL WHERE clause for partial index */
  where?: string
}

/**
 * Entity definition options
 */
export interface EntityDefinition<TFields extends Record<string, Field>> {
  /** Table name in the database */
  name: string
  /** Human-readable description */
  description?: string
  /** Whether this entity is tenant-scoped (adds tenantId field) */
  tenant?: boolean
  /** Field definitions */
  fields: TFields
  /** Index definitions */
  indexes?: IndexDefinition[]
  /** Whether to add timestamp fields (insertedAt, updatedAt) */
  timestamps?: boolean
  /** Whether to add soft delete (deletedAt) */
  softDelete?: boolean
}

/**
 * Generated schemas from entity definition
 */
export interface EntitySchemas<T> {
  /** Full entity schema (all fields) */
  schema: Type<T>
  /** Schema for creating (without id, timestamps) */
  createSchema: Type<Partial<T>>
  /** Schema for updating (all fields optional) */
  updateSchema: Type<Partial<T>>
  /** Schema for query filters */
  querySchema: Type<Record<string, unknown>>
  /** Schema for list response with pagination */
  listSchema: Type<{ items: T[]; total: number; nextCursor?: string }>
}

/**
 * The complete entity object returned by defineEntity
 */
export interface Entity<
  TName extends string,
  TFields extends Record<string, Field>,
  TType,
> {
  /** Entity name (table name) */
  name: TName
  /** Original definition */
  definition: EntityDefinition<TFields>
  /** ArkType schema for the full entity */
  schema: Type<TType>
  /** ArkType schema for create operations */
  createSchema: Type<Partial<TType>>
  /** ArkType schema for update operations */
  updateSchema: Type<Partial<TType>>
  /** ArkType schema for query/filter operations */
  querySchema: Type<Record<string, unknown>>
  /** TypeScript type (use typeof entity.infer) */
  infer: TType
  /** Field names that are auto-generated (id, timestamps) */
  autoFields: string[]
  /** Field names that are required for creation */
  requiredFields: string[]
  /** Field names that are optional */
  optionalFields: string[]
}

/**
 * Options for Drizzle table generation
 */
export interface DrizzleOptions {
  /** Database dialect */
  dialect: 'pg' | 'sqlite' | 'mysql'
  /** Custom schema name (PostgreSQL) */
  schema?: string
}

/**
 * Utility type to extract the inferred type from an entity
 */
export type InferEntity<E> = E extends Entity<string, Record<string, Field>, infer T> ? T : never

/**
 * Utility type to extract create input type
 */
export type InferCreateInput<E> = E extends Entity<string, Record<string, Field>, infer T>
  ? Omit<T, 'id' | 'insertedAt' | 'updatedAt' | 'deletedAt'>
  : never

/**
 * Utility type to extract update input type
 */
export type InferUpdateInput<E> = E extends Entity<string, Record<string, Field>, infer T>
  ? Partial<Omit<T, 'id' | 'tenantId' | 'insertedAt' | 'updatedAt' | 'deletedAt'>>
  : never
