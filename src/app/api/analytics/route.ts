import { NextRequest, NextResponse } from 'next/server'
import { ok, err } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/db/client'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) return err('Non authentifié', 401)
  if (!['CEO', 'MANAGER'].includes(user.role)) return err('Accès refusé', 403)

  const restaurantId = req.nextUrl.searchParams.get('restaurantId')
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  const granularity = req.nextUrl.searchParams.get('granularity') ?? 'day'

  if (!from || !to) return err('Paramètres from/to requis', 400)

  if (restaurantId && user.role !== 'CEO') {
    const access = await prisma.userRestaurant.findFirst({
      where: { userId: user.id, restaurantId },
    })
    if (!access) return err('Accès refusé', 403)
  }

  const fromDate = new Date(from)
  const toDate = new Date(to)

  const restaurantFilter = restaurantId
    ? { restaurantId }
    : {}

  const [currentOrders, prevOrders, cancelledCount] = await Promise.all([
    prisma.order.findMany({
      where: { ...restaurantFilter, status: { in: ['SERVED', 'READY'] }, createdAt: { gte: fromDate, lte: toDate } },
      select: { total: true, createdAt: true, taxAmount: true },
    }),
    prisma.order.findMany({
      where: {
        ...restaurantFilter,
        status: { in: ['SERVED', 'READY'] },
        createdAt: {
          gte: new Date(fromDate.getTime() - (toDate.getTime() - fromDate.getTime())),
          lt: fromDate,
        },
      },
      select: { total: true },
    }),
    prisma.order.count({
      where: { ...restaurantFilter, status: 'CANCELLED', createdAt: { gte: fromDate, lte: toDate } },
    }),
  ])

  const revenue = currentOrders.reduce((sum, o) => sum + Number(o.total), 0)
  const prevRevenue = prevOrders.reduce((sum, o) => sum + Number(o.total), 0)
  const orderCount = currentOrders.length
  const revenueChange = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0

  // Timeline
  const grouped = new Map<string, { revenue: number; orders: number }>()
  for (const order of currentOrders) {
    const d = order.createdAt
    let key: string
    if (granularity === 'month') {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    } else if (granularity === 'week') {
      const week = Math.ceil(d.getDate() / 7)
      key = `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
    } else {
      key = d.toISOString().slice(0, 10)
    }
    const existing = grouped.get(key) ?? { revenue: 0, orders: 0 }
    grouped.set(key, { revenue: existing.revenue + Number(order.total), orders: existing.orders + 1 })
  }
  const revenueTimeline = Array.from(grouped.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Top products
  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: { ...restaurantFilter, status: { in: ['SERVED', 'READY'] }, createdAt: { gte: fromDate, lte: toDate } },
    },
    select: { productId: true, productName: true, quantity: true, subtotal: true },
  })
  const productMap = new Map<string, { productName: string; totalSold: number; revenue: number }>()
  for (const item of orderItems) {
    const existing = productMap.get(item.productId) ?? { productName: item.productName, totalSold: 0, revenue: 0 }
    productMap.set(item.productId, {
      productName: item.productName,
      totalSold: existing.totalSold + item.quantity,
      revenue: existing.revenue + Number(item.subtotal),
    })
  }
  const topProducts = Array.from(productMap.entries())
    .map(([productId, data]) => ({ productId, ...data }))
    .sort((a, b) => b.totalSold - a.totalSold)
    .slice(0, 10)

  // Restaurant performance (CEO only)
  let restaurantStats = null
  if (user.role === 'CEO') {
    const restaurants = await prisma.restaurant.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
    })
    restaurantStats = await Promise.all(
      restaurants.map(async (r) => {
        const rOrders = await prisma.order.findMany({
          where: { restaurantId: r.id, status: { in: ['SERVED', 'READY'] }, createdAt: { gte: fromDate, lte: toDate } },
          select: { total: true },
        })
        const rRevenue = rOrders.reduce((sum, o) => sum + Number(o.total), 0)
        return { restaurantId: r.id, name: r.name, revenue: rRevenue, orderCount: rOrders.length }
      })
    )
  }

  return ok({
    kpis: {
      revenue,
      revenueChange: Math.round(revenueChange * 10) / 10,
      orderCount,
      averageBasket: orderCount > 0 ? revenue / orderCount : 0,
      cancellationRate: orderCount > 0 ? (cancelledCount / (orderCount + cancelledCount)) * 100 : 0,
    },
    revenueTimeline,
    topProducts,
    restaurantStats,
  })
}
