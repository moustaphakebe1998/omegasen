import { NextRequest } from 'next/server'
import { ok, err, withAuth, parseBody } from '@/lib/api'
import { prisma } from '@/db/client'
import { z } from 'zod'

const updateProductSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  price: z.number().int().positive().optional(),
  imageUrl: z.string().url().nullable().optional(),
  isAvailable: z.boolean().optional(),
  isHidden: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  categoryId: z.string().cuid().optional(),
  allergens: z.array(z.string()).optional(),
  calories: z.number().int().nullable().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const product = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    include: {
      category: true,
      optionGroups: { include: { options: { where: { deletedAt: null } } } },
    },
  })
  if (!product) return err('Produit introuvable', 404)
  return ok(product)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  return withAuth(req, ['CEO', 'MANAGER'], async (user) => {
    const { id } = await params
    const body = await parseBody(req, updateProductSchema)
    if (!body.ok) return body.error

    const product = await prisma.product.findFirst({ where: { id, deletedAt: null } })
    if (!product) return err('Produit introuvable', 404)

    if (user.role !== 'CEO') {
      const access = await prisma.userRestaurant.findFirst({
        where: { userId: user.id, restaurantId: product.restaurantId },
      })
      if (!access) return err('Accès refusé', 403)
    }

    const updated = await prisma.product.update({
      where: { id },
      data: body.data,
      include: { category: true },
    })

    return ok(updated)
  })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return withAuth(req, ['CEO', 'MANAGER'], async (user) => {
    const { id } = await params
    const product = await prisma.product.findFirst({ where: { id, deletedAt: null } })
    if (!product) return err('Produit introuvable', 404)

    if (user.role !== 'CEO') {
      const access = await prisma.userRestaurant.findFirst({
        where: { userId: user.id, restaurantId: product.restaurantId },
      })
      if (!access) return err('Accès refusé', 403)
    }

    // Soft delete
    await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isAvailable: false, isHidden: true },
    })

    return ok({ deleted: true })
  })
}
