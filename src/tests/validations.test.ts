import { describe, it, expect } from 'vitest'
import { loginSchema, createOrderSchema } from '@/validations'

describe('loginSchema', () => {
  it('validates correct credentials', () => {
    const result = loginSchema.safeParse({ email: 'test@test.com', password: 'secret123' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'secret123' })
    expect(result.success).toBe(false)
  })

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ email: 'test@test.com', password: '' })
    expect(result.success).toBe(false)
  })
})

describe('createOrderSchema', () => {
  const validOrder = {
    restaurantId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
    items: [
      {
        productId: 'clxxxxxxxxxxxxxxxxxxxxxxxxy',
        quantity: 2,
      },
    ],
    idempotencyKey: 'abc123',
  }

  it('validates a correct order', () => {
    const result = createOrderSchema.safeParse(validOrder)
    expect(result.success).toBe(true)
  })

  it('rejects empty items array', () => {
    const result = createOrderSchema.safeParse({ ...validOrder, items: [] })
    expect(result.success).toBe(false)
  })

  it('rejects quantity zero', () => {
    const result = createOrderSchema.safeParse({
      ...validOrder,
      items: [{ productId: 'clxxxxxxxxxxxxxxxxxxxxxxxxy', quantity: 0 }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects quantity over max', () => {
    const result = createOrderSchema.safeParse({
      ...validOrder,
      items: [{ productId: 'clxxxxxxxxxxxxxxxxxxxxxxxxy', quantity: 101 }],
    })
    expect(result.success).toBe(false)
  })
})
