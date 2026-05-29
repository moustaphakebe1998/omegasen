import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ManagerDashboardClient } from '@/components/manager/dashboard-client'
import { prisma } from '@/db/client'

async function getManagerData(restaurantId: string) {
  const [restaurant, orderStats, recentOrders, products] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { openingHours: true },
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: {
        restaurantId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        status: { not: 'DRAFT' },
      },
      _count: { id: true },
      _sum: { total: true },
    }),
    prisma.order.findMany({
      where: {
        restaurantId,
        status: { notIn: ['DRAFT', 'ARCHIVED'] },
      },
      include: {
        items: { include: { product: true } },
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.product.findMany({
      where: { restaurantId, deletedAt: null },
      include: { category: true },
      orderBy: { category: { sortOrder: 'asc' } },
    }),
  ])

  return { restaurant, orderStats, recentOrders, products }
}

export default async function ManagerPage() {
  const user = await getCurrentUser()
  if (!user || !['CEO', 'MANAGER'].includes(user.role)) {
    redirect('/login')
  }

  // For manager, use their primary restaurant
  const userRestaurant = await prisma.userRestaurant.findFirst({
    where: { userId: user.id },
    include: { restaurant: true },
  })

  if (!userRestaurant && user.role !== 'CEO') {
    redirect('/login')
  }

  // CEO can pick first restaurant for demo; in real app, add restaurant switcher
  const restaurantId = userRestaurant?.restaurantId ??
    (await prisma.restaurant.findFirst({ where: { deletedAt: null } }))?.id

  if (!restaurantId) redirect('/admin')

  const data = await getManagerData(restaurantId)

  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-surface-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-surface-500">Chargement...</p>
        </div>
      </div>
    }>
      <ManagerDashboardClient
        user={user}
        restaurant={data.restaurant!}
        orderStats={data.orderStats}
        recentOrders={data.recentOrders}
        products={data.products}
      />
    </Suspense>
  )
}
