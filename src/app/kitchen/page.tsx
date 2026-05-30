import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/db/client'
import { KitchenClient } from '@/components/kitchen/kitchen-client'

export const dynamic = 'force-dynamic'

export default async function KitchenPage() {
  const user = await getCurrentUser()
  if (!user || !['CEO', 'MANAGER', 'KITCHEN'].includes(user.role)) redirect('/login')

  const restaurantId = user.restaurants[0]
  if (!restaurantId) redirect('/login')

  const restaurant = await prisma.restaurant.findFirst({
    where: { id: restaurantId },
    select: { id: true, name: true },
  })
  if (!restaurant) redirect('/login')

  return <KitchenClient restaurantId={restaurant.id} restaurantName={restaurant.name} />
}
