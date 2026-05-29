import { vi, beforeEach } from 'vitest'

// Mock Prisma
vi.mock('@/db/client', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    restaurant: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    userRestaurant: {
      findFirst: vi.fn(),
    },
    orderStatusHistory: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}))

// Mock SSE broadcast
vi.mock('@/lib/sse', () => ({
  broadcast: vi.fn(),
  createSSEStream: vi.fn(),
}))

// Mock rate limiter — allow by default
vi.mock('@/lib/rate-limit', () => ({
  loginLimiter: vi.fn().mockResolvedValue({ success: true }),
  apiLimiter: vi.fn().mockResolvedValue({ success: true }),
  orderLimiter: vi.fn().mockResolvedValue({ success: true }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})
