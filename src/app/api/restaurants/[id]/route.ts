import { NextRequest } from 'next/server'
import { ok, err, withAuth, parseBody } from '@/lib/api'
import { prisma } from '@/db/client'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isOpen: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  return withAuth(req, ['CEO', 'MANAGER'], async (user) => {
    const { id } = await params
    const body = await parseBody(req, updateSchema)
    if (!body.ok) return body.error

    if (user.role !== 'CEO') {
      const access = await prisma.userRestaurant.findFirst({
        where: { userId: user.id, restaurantId: id },
      })
      if (!access) return err('Accès refusé', 403)
    }

    const restaurant = await prisma.restaurant.update({
      where: { id },
      data: body.data,
    })

    return ok(restaurant)
  })
}
