/**
 * SQLite Drizzle table generation from entity definitions
 * Compatible with Cloudflare D1
 */
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import type { Entity, Field, FieldDefinition } from './types.js'

/**
 * Convert field definition to Drizzle SQLite column builder
 */
function fieldToColumn(name: string, field: Field) {
  const def: FieldDefinition = typeof field === 'string' ? { type: field } : field

  const columnName = toSnakeCase(name)
  let column: any

  // Determine column type based on field type
  const fieldType = def.type.split(' ')[0] ?? 'string'

  switch (fieldType) {
    case 'string.uuid':
    case 'string.email':
    case 'string.url':
    case 'string':
      column = text(columnName)
      break

    case 'number.integer':
      column = integer(columnName)
      break

    case 'number':
      column = real(columnName)
      break

    case 'boolean':
      column = integer(columnName, { mode: 'boolean' })
      break

    case 'Date':
      column = text(columnName)
      break

    case 'json':
      column = text(columnName, { mode: 'json' })
      break

    default:
      column = text(columnName)
  }

  // Apply modifiers
  if (!def.optional && def.default === undefined) {
    column = column.notNull()
  }

  if (def.default !== undefined) {
    if (typeof def.default === 'object') {
      column = column.default(JSON.stringify(def.default))
    } else {
      column = column.default(def.default)
    }
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
 * Generate a Drizzle sqliteTable from an entity definition
 */
export function toSqliteTable<E extends Entity<string, Record<string, Field>, unknown>>(
  entity: E,
  tableRefs?: Record<string, any>
): any {
  const def = entity.definition
  const columns: Record<string, any> = {}

  // Add id column
  columns['id'] = text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

  // Add tenantId if tenant-scoped
  if (def.tenant) {
    const tenantsTable = tableRefs?.['tenants']
    if (tenantsTable) {
      columns['tenantId'] = text('tenant_id')
        .notNull()
        .references(() => tenantsTable.id, { onDelete: 'cascade' })
    } else {
      columns['tenantId'] = text('tenant_id').notNull()
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

        let col = text(toSnakeCase(name)).references(() => refTable[refField], { onDelete })
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
    columns['insertedAt'] = text('inserted_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString())

    columns['updatedAt'] = text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString())
      .$onUpdate(() => new Date().toISOString())
  }

  // Add soft delete field
  if (def.softDelete) {
    columns['deletedAt'] = text('deleted_at')
  }

  // Create table with indexes
  return sqliteTable(def.name, columns, (t: any) => {
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
 * Create multiple SQLite tables with resolved references
 */
export function createSqliteSchema<
  T extends Record<string, Entity<string, Record<string, Field>, unknown>>,
>(entities: T): { [K in keyof T]: any } {
  const tables: Record<string, any> = {}

  // First pass: create tables without references
  for (const [key, entity] of Object.entries(entities)) {
    tables[key] = toSqliteTable(entity)
  }

  // Second pass: recreate tables with resolved references
  for (const [key, entity] of Object.entries(entities)) {
    tables[key] = toSqliteTable(entity, tables)
  }

  return tables as { [K in keyof T]: any }
}

export { toSqliteTable as toTable }
