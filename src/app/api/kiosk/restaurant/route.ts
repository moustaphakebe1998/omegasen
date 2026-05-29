import { NextRequest } from 'next/server'
import { ok, err } from '@/lib/api'
import { prisma } from '@/db/client'

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return err('slug requis', 400)

  const restaurant = await prisma.restaurant.findFirst({
    where: { slug, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      isOpen: true,
      maintenanceMode: true,
      currency: true,
      taxRate: true,
    },
  })

  if (!restaurant) return err('Restaurant introuvable', 404)
  if (restaurant.maintenanceMode) {
    return ok({ ...restaurant, maintenance: true })
  }

  return ok(restaurant)
}
