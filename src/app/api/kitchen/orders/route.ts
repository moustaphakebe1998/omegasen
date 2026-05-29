import { NextRequest, NextResponse } from 'next/server'
import { ok, err } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/db/client'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) return err('Non authentifié', 401)
  if (!['CEO', 'MANAGER', 'KITCHEN'].includes(user.role)) return err('Accès refusé', 403)

  const restaurantId = req.nextUrl.searchParams.get('restaurantId')
  if (!restaurantId) return err('restaurantId requis', 400)

  if (user.role !== 'CEO') {
    const access = await prisma.userRestaurant.findFirst({
      where: { userId: user.id, restaurantId },
    })
    if (!access) return err('Accès refusé', 403)
  }

  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
      deletedAt: null,
    },
    include: {
      items: {
        include: {
          product: { select: { name: true, preparationTime: true } },
          options: true,
        },
      },
      statusHistory: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'asc' },
  })

  return ok(orders)
}
