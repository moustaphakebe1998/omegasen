import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/db/client'
import { Suspense } from 'react'
import { DashboardClient } from '@/components/admin/dashboard-client'

async function getData() {
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const to = new Date()

  const [restaurants, orders, orderItems] = await Promise.all([
    prisma.restaurant.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    prisma.order.findMany({
      where: { status: { in: ['SERVED', 'READY'] }, createdAt: { gte: from, lte: to } },
      select: { total: true, createdAt: true, restaurantId: true },
    }),
    prisma.orderItem.findMany({
      where: { order: { status: { in: ['SERVED', 'READY'] }, createdAt: { gte: from, lte: to } } },
      select: { productId: true, productName: true, quantity: true, subtotal: true },
    }),
  ])

  const revenue = orders.reduce((sum, o) => sum + Number(o.total), 0)
  const orderCount = orders.length

  // Timeline
  const grouped = new Map<string, { revenue: number; orders: number }>()
  for (const order of orders) {
    const key = order.createdAt.toISOString().slice(0, 10)
    const ex = grouped.get(key) ?? { revenue: 0, orders: 0 }
    grouped.set(key, { revenue: ex.revenue + Number(order.total), orders: ex.orders + 1 })
  }
  const timeline = Array.from(grouped.entries())
    .map(([date, d]) => ({ date, ...d }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Top products
  const productMap = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const item of orderItems) {
    const ex = productMap.get(item.productId) ?? { name: item.productName, qty: 0, revenue: 0 }
    productMap.set(item.productId, { name: item.productName, qty: ex.qty + item.quantity, revenue: ex.revenue + Number(item.subtotal) })
  }
  const topProducts = Array.from(productMap.entries())
    .map(([id, d]) => ({ productId: id, productName: d.name, totalSold: d.qty, revenue: d.revenue }))
    .sort((a, b) => b.totalSold - a.totalSold)
    .slice(0, 5)

  // Per restaurant
  const restaurantStats = restaurants.map(r => {
    const rOrders = orders.filter(o => o.restaurantId === r.id)
    return { id: r.id, name: r.name, revenue: rOrders.reduce((s, o) => s + Number(o.total), 0), orderCount: rOrders.length }
  })

  return { revenue, orderCount, avgBasket: orderCount > 0 ? revenue / orderCount : 0, timeline, topProducts, restaurantStats }
}

export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'CEO') redirect('/login')
  const data = await getData()
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <DashboardClient user={user} {...data} />
    </Suspense>
  )
}
