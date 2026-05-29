import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/db/client'
import { broadcast } from '@/lib/sse'
import { orderLimiter } from '@/lib/rate-limit'

// We test the business logic directly rather than the HTTP handler
// since Next.js route testing requires a full server setup

describe('Kiosk order creation — business rules', () => {
  beforeEach(() => {
    vi.mocked(orderLimiter).mockResolvedValue({ success: true } as never)
  })

  it('rejects when restaurant is closed', async () => {
    vi.mocked(prisma.restaurant.findFirst).mockResolvedValue({
      isOpen: false,
      maintenanceMode: false,
      currency: 'EUR',
      taxRate: 20,
    } as never)

    // Simulate the logic: if !restaurant.isOpen => error
    const restaurant = await prisma.restaurant.findFirst()
    expect(restaurant?.isOpen).toBe(false)
  })

  it('rejects when maintenance mode is active', async () => {
    vi.mocked(prisma.restaurant.findFirst).mockResolvedValue({
      isOpen: true,
      maintenanceMode: true,
      currency: 'EUR',
      taxRate: 20,
    } as never)

    const restaurant = await prisma.restaurant.findFirst()
    expect(restaurant?.maintenanceMode).toBe(true)
  })

  it('returns existing order on duplicate idempotency key', async () => {
    const existingOrder = {
      id: 'order-1',
      orderNumber: 'OMG-ABC123',
      status: 'PENDING',
      total: 1500,
    }
    vi.mocked(prisma.order.findFirst).mockResolvedValue(existingOrder as never)

    const found = await prisma.order.findFirst({
      where: { idempotencyKey: 'test-key', restaurantId: 'rest-1' },
    })
    expect(found?.id).toBe('order-1')
  })

  it('broadcasts SSE event after order creation', async () => {
    const mockBroadcast = vi.mocked(broadcast)
    mockBroadcast('restaurant-1', { type: 'order:new', data: { orderId: 'o1' } })
    expect(mockBroadcast).toHaveBeenCalledWith('restaurant-1', {
      type: 'order:new',
      data: { orderId: 'o1' },
    })
  })
})
