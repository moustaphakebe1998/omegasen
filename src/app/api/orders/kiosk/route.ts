import { NextRequest, NextResponse } from 'next/server'
import { ok, err, parseBody } from '@/lib/api'
import { prisma } from '@/db/client'
import { createOrderSchema } from '@/validations'
import { calculateOrderTotals, generateOrderNumber } from '@/server/orders'
import { broadcast } from '@/lib/sse'
import { orderLimiter } from '@/lib/rate-limit'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const limit = await orderLimiter(ip)
  if (limit && !limit.success) return err('Trop de commandes, veuillez patienter', 429)

  const body = await parseBody(req, createOrderSchema)
  if ('error' in body) return body.error

  const { restaurantId, items, notes, idempotencyKey } = body.data

  const restaurant = await prisma.restaurant.findFirst({
    where: { id: restaurantId, deletedAt: null },
    select: { maintenanceMode: true },
  })
  if (!restaurant) return err('Restaurant introuvable', 404)
  if (restaurant.maintenanceMode) return err('Le restaurant est actuellement fermé', 422)

  if (idempotencyKey) {
    const existing = await prisma.order.findFirst({
      where: { idempotencyKey, restaurantId },
      select: { id: true, orderNumber: true, status: true, total: true },
    })
    if (existing) return ok(existing, 200)
  }

  const validItems = (items ?? []).map(item => ({
    productId: item.productId!,
    quantity: item.quantity!,
    selectedOptions: (item.selectedOptions ?? []).map(opt => ({
      groupId: opt.groupId!,
      optionId: opt.optionId!,
    })),
  }))

  const { subtotal, taxAmount, total, items: lines } = await calculateOrderTotals(restaurantId, validItems)
  const orderNumber = await generateOrderNumber(restaurantId)

  const order = await prisma.order.create({
    data: {
      restaurantId,
      orderNumber,
      status: 'PENDING',
      subtotal,
      taxAmount,
      total,
      notes,
      idempotencyKey,
      items: {
        create: lines.map(line => ({
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          options: {
            create: (line.selectedOptions ?? []).map(opt => ({
              optionId: opt.optionId,
              optionName: opt.optionName,
              priceModifier: opt.priceModifier,
            })),
          },
        })),
      },
      statusHistory: {
        create: { toStatus: 'PENDING', reason: 'Commande créée via borne' },
      },
    },
    include: {
      items: { include: { product: { select: { name: true } } } },
    },
  })

  broadcast(restaurantId, 'order:new', {
    orderId: order.id,
    orderNumber: order.orderNumber,
    total: order.total,
    itemCount: order.items.length,
  })

  return ok({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    total: order.total,
    items: order.items.map(i => ({ name: i.product.name, quantity: i.quantity })),
  }, 201)
}
