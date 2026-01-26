import { describe, it, expect } from 'vitest'
import { defineEntity, ref, enumField, jsonField, decimal } from './define.js'

describe('defineEntity', () => {
  it('should create entity with basic fields', () => {
    const Product = defineEntity({
      name: 'products',
      fields: {
        name: 'string',
        price: 'number',
      },
    })

    expect(Product.name).toBe('products')
    expect(Product.requiredFields).toContain('name')
    expect(Product.requiredFields).toContain('price')
    expect(Product.autoFields).toContain('id')
  })

  it('should handle tenant-scoped entities', () => {
    const Order = defineEntity({
      name: 'orders',
      tenant: true,
      fields: {
        total: 'number',
      },
    })

    expect(Order.requiredFields).toContain('tenantId')
  })

  it('should handle timestamps', () => {
    const Post = defineEntity({
      name: 'posts',
      timestamps: true,
      fields: {
        title: 'string',
      },
    })

    expect(Post.autoFields).toContain('insertedAt')
    expect(Post.autoFields).toContain('updatedAt')
  })

  it('should handle soft delete', () => {
    const User = defineEntity({
      name: 'users',
      softDelete: true,
      fields: {
        email: 'string.email',
      },
    })

    expect(User.autoFields).toContain('deletedAt')
  })

  it('should handle optional fields', () => {
    const Profile = defineEntity({
      name: 'profiles',
      fields: {
        bio: { type: 'string', optional: true },
        age: 'number',
      },
    })

    expect(Profile.optionalFields).toContain('bio')
    expect(Profile.requiredFields).toContain('age')
  })

  it('should handle fields with defaults', () => {
    const Settings = defineEntity({
      name: 'settings',
      fields: {
        theme: { type: 'string', default: 'light' },
      },
    })

    expect(Settings.optionalFields).toContain('theme')
  })
})

describe('helper functions', () => {
  it('ref should create a reference field', () => {
    const field = ref('users', { onDelete: 'cascade' })

    expect(field.type).toBe('string.uuid')
    expect(field.db?.references?.entity).toBe('users')
    expect(field.db?.references?.onDelete).toBe('cascade')
  })

  it('enumField should create union type', () => {
    const field = enumField(['draft', 'published', 'archived'] as const)

    expect(field.type).toBe("'draft' | 'published' | 'archived'")
  })

  it('jsonField should create json field', () => {
    const field = jsonField({ optional: true })

    expect(field.type).toBe('json')
    expect(field.optional).toBe(true)
  })

  it('decimal should create decimal field', () => {
    const field = decimal(10, 2, { min: 0 })

    expect(field.type).toBe('number')
    expect(field.db?.precision).toBe(10)
    expect(field.db?.scale).toBe(2)
    expect(field.min).toBe(0)
  })
})
