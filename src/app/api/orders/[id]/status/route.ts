import { NextRequest, NextResponse } from 'next/server'
import { ok, err, parseBody } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { updateOrderStatus, canTransition } from '@/server/orders'
import { prisma } from '@/db/client'
import { z } from 'zod'
import type { OrderStatus } from '@prisma/client'

const updateStatusSchema = z.object({
  status: z.enum(['DRAFT', 'PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED', 'ARCHIVED']),
  reason: z.string().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) return err('Non authentifié', 401)
  if (!['CEO', 'MANAGER', 'KITCHEN'].includes(user.role)) return err('Accès refusé', 403)

  const { id } = await params
  const body = await parseBody(req, updateStatusSchema)
  if ('error' in body) return body.error

  const { status, reason } = body.data

  const order = await prisma.order.findFirst({
    where: { id, deletedAt: null },
  })
  if (!order) return err('Commande introuvable', 404)

  if (user.role !== 'CEO') {
    const access = await prisma.userRestaurant.findFirst({
      where: { userId: user.id, restaurantId: order.restaurantId },
    })
    if (!access) return err('Accès refusé', 403)
  }

  if (!canTransition(order.status, status as OrderStatus, user.role)) {
    return err(`Transition ${order.status} → ${status} non autorisée`, 422)
  }

  try {
    const updated = await updateOrderStatus(
      id,
      order.restaurantId,
      status as OrderStatus,
      user.id,
      user.role,
      reason
    )
    return ok(updated)
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Erreur serveur', 500)
  }
}
