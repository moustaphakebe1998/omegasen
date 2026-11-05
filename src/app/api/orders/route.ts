import { NextRequest, NextResponse } from 'next/server'
import { ok, err, parseBody } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/db/client'
import { createOrderSchema } from '@/validations'
import { calculateOrderTotals, generateOrderNumber } from '@/server/orders'
import { broadcast } from '@/lib/sse'
import { z } from 'zod'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) return err('Non authentifié', 401)

  const restaurantId = req.nextUrl.searchParams.get('restaurantId')
  const status = req.nextUrl.searchParams.get('status')
  const page = Number(req.nextUrl.searchParams.get('page') ?? 1)
  const pageSize = Number(req.nextUrl.searchParams.get('pageSize') ?? 20)

  if (!restaurantId) return err('restaurantId requis', 400)

  if (user.role !== 'CEO') {
    const access = await prisma.userRestaurant.findFirst({
      where: { userId: user.id, restaurantId },
    })
    if (!access) return err('Accès refusé', 403)
  }

  const where = {
    restaurantId,
    deletedAt: null as null,
    ...(status ? { status: status as never } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: { include: { product: { select: { name: true } }, options: true } },
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ])

  return ok({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) return err('Non authentifié', 401)

  const body = await parseBody(req, createOrderSchema)
  if ('error' in body) return body.error

  const { restaurantId, items, notes, idempotencyKey } = body.data

  if (user.role !== 'CEO') {
    const access = await prisma.userRestaurant.findFirst({
      where: { userId: user.id, restaurantId },
    })
    if (!access) return err('Accès refusé', 403)
  }

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
      createdById: user.id,
      items: {
        create: lines.map(line => ({
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          options: {
            create: line.selectedOptions.map(opt => ({
              optionId: opt.optionId,
              optionName: opt.optionName,
              priceModifier: opt.priceModifier,
            })),
          },
        })),
      },
      statusHistory: {
        create: { toStatus: 'PENDING', changedById: user.id },
      },
    },
    include: { items: { include: { options: true } } },
  })

  broadcast(restaurantId, 'order:new', {
    orderId: order.id,
    orderNumber: order.orderNumber,
    total: order.total,
  })

  return ok(order, 201)
}
