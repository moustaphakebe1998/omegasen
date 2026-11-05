import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/db/client'
import { ManagerDashboardClient } from '@/components/manager/dashboard-client'

export const dynamic = 'force-dynamic'

export default async function ManagerPage() {
  const user = await getCurrentUser()
  if (!user || !['CEO', 'MANAGER'].includes(user.role)) redirect('/login')

  const restaurantId = user.role === 'CEO'
    ? (await prisma.restaurant.findFirst({ where: { deletedAt: null }, select: { id: true } }))?.id
    : user.restaurants[0]

  if (!restaurantId) redirect('/login')

  const [restaurant, orders, products] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { openingHours: true },
    }),
    prisma.order.findMany({
      where: { restaurantId, status: { notIn: ['DRAFT', 'ARCHIVED'] } },
      include: {
        items: { include: { product: { select: { name: true } } } },
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.product.findMany({
      where: { category: { restaurantId }, deletedAt: null },
      include: { category: { select: { name: true, sortOrder: true } } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    }),
  ])

  if (!restaurant) redirect('/login')

  // Today stats
  const today = new Date(); today.setHours(0,0,0,0)
  const todayOrders = await prisma.order.findMany({
    where: { restaurantId, createdAt: { gte: today }, status: { not: 'DRAFT' } },
    select: { total: true, status: true },
  })

  return (
    <ManagerDashboardClient
      user={user}
      restaurant={restaurant}
      recentOrders={orders as never}
      products={products as never}
      todayOrders={todayOrders as never}
    />
  )
}
