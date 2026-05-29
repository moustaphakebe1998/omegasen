import { NextRequest } from 'next/server'
import { ok, err, withAuth } from '@/lib/api'
import { getKitchenOrders } from '@/server/orders'

export async function GET(req: NextRequest) {
  return withAuth(req, ['CEO', 'MANAGER', 'KITCHEN'], async (user) => {
    const restaurantId = req.nextUrl.searchParams.get('restaurantId')
    if (!restaurantId) return err('restaurantId requis', 400)

    // Check access
    if (user.role !== 'CEO') {
      const { prisma } = await import('@/db/client')
      const access = await prisma.userRestaurant.findFirst({
        where: { userId: user.id, restaurantId },
      })
      if (!access) return err('Accès refusé', 403)
    }

    const orders = await getKitchenOrders(restaurantId)
    return ok(orders)
  })
}
