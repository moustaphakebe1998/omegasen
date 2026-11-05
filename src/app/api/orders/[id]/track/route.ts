import { NextRequest } from 'next/server'
import { ok, err } from '@/lib/api'
import { prisma } from '@/db/client'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      // Only expose what the customer needs — no pricing, no restaurant internals
    },
  })

  if (!order) return err('Commande introuvable', 404)

  return ok({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    updatedAt: order.updatedAt,
  })
}
