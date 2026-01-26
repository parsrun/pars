/**
 * PostgreSQL Drizzle table generation from entity definitions
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  json,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { Entity, Field, FieldDefinition } from './types.js'

/**
 * Convert field definition to Drizzle column builder
 */
function fieldToColumn(name: string, field: Field) {
  const def: FieldDefinition = typeof field === 'string' ? { type: field } : field

  const columnName = def.db?.column ?? toSnakeCase(name)
  let column: any

  // Determine column type based on field type
  const fieldType = def.type.split(' ')[0] ?? 'string'

  switch (fieldType) {
    case 'string.uuid':
      column = uuid(columnName)
      break

    case 'string.email':
    case 'string.url':
    case 'string':
      column = text(columnName)
      break

    case 'number.integer':
      column = integer(columnName)
      break

    case 'number':
      if (def.db?.precision) {
        column = numeric(columnName, {
          precision: def.db.precision,
          scale: def.db.scale ?? 2,
        })
      } else {
        column = numeric(columnName)
      }
      break

    case 'boolean':
      column = boolean(columnName)
      break

    case 'Date':
      column = timestamp(columnName, { withTimezone: true })
      break

    case 'json':
      column = json(columnName)
      break

    default:
      // Union types like "'draft' | 'active'" become text
      column = text(columnName)
  }

  // Apply modifiers
  if (!def.optional && def.default === undefined) {
    column = column.notNull()
  }

  if (def.default !== undefined) {
    column = column.default(def.default)
  }

  return column
}

/**
 * Convert camelCase to snake_case
 */
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

/**
 * Generate a Drizzle pgTable from an entity definition
 */
export function toPgTable<E extends Entity<string, Record<string, Field>, unknown>>(
  entity: E,
  tableRefs?: Record<string, any>
): any {
  const def = entity.definition
  const columns: Record<string, any> = {}

  // Add id column
  columns['id'] = uuid('id').primaryKey().defaultRandom()

  // Add tenantId if tenant-scoped
  if (def.tenant) {
    const tenantsTable = tableRefs?.['tenants']
    if (tenantsTable) {
      columns['tenantId'] = uuid('tenant_id')
        .notNull()
        .references(() => tenantsTable.id, { onDelete: 'cascade' })
    } else {
      columns['tenantId'] = uuid('tenant_id').notNull()
    }
  }

  // Add user-defined fields
  for (const [name, field] of Object.entries(def.fields)) {
    const fieldDef: FieldDefinition = typeof field === 'string' ? { type: field } : field

    // Handle references
    if (fieldDef.db?.references && tableRefs) {
      const refTable = tableRefs[fieldDef.db.references.entity]
      if (refTable) {
        const refField = fieldDef.db.references.field ?? 'id'
        const onDelete = fieldDef.db.references.onDelete ?? 'restrict'

        let col = uuid(toSnakeCase(name)).references(() => refTable[refField], { onDelete })
        if (!fieldDef.optional) {
          col = col.notNull()
        }
        columns[name] = col
      } else {
        columns[name] = fieldToColumn(name, field)
      }
    } else {
      columns[name] = fieldToColumn(name, field)
    }
  }

  // Add timestamp fields
  if (def.timestamps) {
    columns['insertedAt'] = timestamp('inserted_at', { withTimezone: true })
      .notNull()
      .defaultNow()

    columns['updatedAt'] = timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date())
  }

  // Add soft delete field
  if (def.softDelete) {
    columns['deletedAt'] = timestamp('deleted_at', { withTimezone: true })
  }

  // Create table with indexes
  return pgTable(def.name, columns, (t: any) => {
    const indexes: Record<string, any> = {}

    // Add indexes from definition
    if (def.indexes) {
      for (const idx of def.indexes) {
        const idxName = idx.name ?? `${def.name}_${idx.fields.join('_')}_idx`
        const idxColumns = idx.fields.map((f) => t[f]).filter(Boolean)

        if (idxColumns.length === 0) continue

        if (idx.unique) {
          if (idx.where) {
            indexes[idxName] = uniqueIndex(idxName)
              .on(...(idxColumns as [any, ...any[]]))
              .where(sql.raw(idx.where))
          } else {
            indexes[idxName] = uniqueIndex(idxName).on(...(idxColumns as [any, ...any[]]))
          }
        } else {
          if (idx.where) {
            indexes[idxName] = index(idxName)
              .on(...(idxColumns as [any, ...any[]]))
              .where(sql.raw(idx.where))
          } else {
            indexes[idxName] = index(idxName).on(...(idxColumns as [any, ...any[]]))
          }
        }
      }
    }

    // Add default tenant index if tenant-scoped
    if (def.tenant && t.tenantId) {
      const tenantIdxName = `${def.name}_tenant_id_idx`
      if (!indexes[tenantIdxName]) {
        indexes[tenantIdxName] = index(tenantIdxName).on(t.tenantId)
      }
    }

    return indexes
  })
}

/**
 * Create multiple tables with resolved references
 */
export function createPgSchema<
  T extends Record<string, Entity<string, Record<string, Field>, unknown>>,
>(entities: T): { [K in keyof T]: any } {
  const tables: Record<string, any> = {}

  // First pass: create tables without references
  for (const [key, entity] of Object.entries(entities)) {
    tables[key] = toPgTable(entity)
  }

  // Second pass: recreate tables with resolved references
  for (const [key, entity] of Object.entries(entities)) {
    tables[key] = toPgTable(entity, tables)
  }

  return tables as { [K in keyof T]: any }
}

export { toPgTable as toTable }
