import { NextRequest } from 'next/server'
import { ok, err, parseBody } from '@/lib/api'
import { prisma } from '@/db/client'
import { createOrderSchema } from '@/validations'
import { calculateOrderTotals, generateOrderNumber } from '@/server/orders'
import { broadcast } from '@/lib/sse'
import { orderLimiter } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const limit = await orderLimiter(ip)
  if (limit && !limit.success) {
    return err('Trop de commandes, veuillez patienter', 429)
  }

  const body = await parseBody(req, createOrderSchema)
  if (!body.ok) return body.error

  const { restaurantId, items, notes, idempotencyKey } = body.data

  // Check restaurant is open
  const restaurant = await prisma.restaurant.findFirst({
    where: { id: restaurantId, deletedAt: null },
    select: { isOpen: true, maintenanceMode: true, currency: true, taxRate: true },
  })
  if (!restaurant) return err('Restaurant introuvable', 404)
  if (!restaurant.isOpen || restaurant.maintenanceMode) {
    return err('Le restaurant est actuellement fermé', 422)
  }

  // Anti double-submit via idempotency key
  if (idempotencyKey) {
    const existing = await prisma.order.findFirst({
      where: { idempotencyKey, restaurantId },
      select: { id: true, orderNumber: true, status: true, total: true },
    })
    if (existing) return ok(existing, 200)
  }

  // Recalculate totals server-side
  const { subtotal, tax, total, lines } = await calculateOrderTotals(items, restaurantId)

  const orderNumber = generateOrderNumber()

  const order = await prisma.order.create({
    data: {
      restaurantId,
      orderNumber,
      status: 'PENDING',
      subtotal,
      tax,
      total,
      notes,
      idempotencyKey,
      source: 'KIOSK',
      items: {
        create: lines.map(line => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          total: line.total,
          notes: line.notes,
          options: {
            create: line.options?.map(opt => ({
              productOptionId: opt.optionId,
              name: opt.name,
              priceModifier: opt.priceModifier,
            })) ?? [],
          },
        })),
      },
      statusHistory: {
        create: {
          status: 'PENDING',
          note: 'Commande créée via borne',
        },
      },
    },
    include: {
      items: { include: { product: { select: { name: true } }, options: true } },
    },
  })

  // Broadcast SSE
  broadcast(restaurantId, {
    type: 'order:new',
    data: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
      itemCount: order.items.length,
    },
  })

  return ok({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    total: order.total,
    items: order.items.map(i => ({ name: i.product.name, quantity: i.quantity })),
  }, 201)
}
