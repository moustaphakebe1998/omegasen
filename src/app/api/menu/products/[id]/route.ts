import { NextRequest, NextResponse } from 'next/server'
import { ok, err, parseBody } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/db/client'
import { z } from 'zod'

const updateProductSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  price: z.number().positive().optional(),
  imageUrl: z.string().url().nullable().optional(),
  isAvailable: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  allergens: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params
  const product = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    include: {
      category: true,
      optionGroups: { include: { options: true } },
    },
  })
  if (!product) return err('Produit introuvable', 404)
  return ok(product)
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) return err('Non authentifié', 401)
  if (!['CEO', 'MANAGER'].includes(user.role)) return err('Accès refusé', 403)

  const { id } = await params
  const body = await parseBody(req, updateProductSchema)
  if ('error' in body) return body.error

  const product = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    include: { category: true },
  })
  if (!product) return err('Produit introuvable', 404)

  if (user.role !== 'CEO') {
    const access = await prisma.userRestaurant.findFirst({
      where: { userId: user.id, restaurantId: product.category.restaurantId },
    })
    if (!access) return err('Accès refusé', 403)
  }

  const updated = await prisma.product.update({
    where: { id },
    data: body.data,
    include: { category: true },
  })
  return ok(updated)
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) return err('Non authentifié', 401)
  if (!['CEO', 'MANAGER'].includes(user.role)) return err('Accès refusé', 403)

  const { id } = await params
  const product = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    include: { category: true },
  })
  if (!product) return err('Produit introuvable', 404)

  if (user.role !== 'CEO') {
    const access = await prisma.userRestaurant.findFirst({
      where: { userId: user.id, restaurantId: product.category.restaurantId },
    })
    if (!access) return err('Accès refusé', 403)
  }

  await prisma.product.update({
    where: { id },
    data: { deletedAt: new Date(), isAvailable: false, isVisible: false },
  })
  return ok({ deleted: true })
}
