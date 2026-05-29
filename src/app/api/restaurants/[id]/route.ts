import { NextRequest, NextResponse } from 'next/server'
import { ok, err, parseBody } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/db/client'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  maintenanceMode: z.boolean().optional(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  email: z.string().email().optional().nullable(),
  timezone: z.string().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) return err('Non authentifié', 401)
  if (!['CEO', 'MANAGER'].includes(user.role)) return err('Accès refusé', 403)

  const { id } = await params
  const body = await parseBody(req, updateSchema)
  if ('error' in body) return body.error

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
}
