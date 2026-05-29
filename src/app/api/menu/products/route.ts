import { NextRequest, NextResponse } from 'next/server'
import { ok, err, parseBody } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/db/client'
import { z } from 'zod'

const createProductSchema = z.object({
  categoryId: z.string().cuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  price: z.number().int().positive(),
  imageUrl: z.string().url().optional(),
  isAvailable: z.boolean().optional().default(true),
  isHidden: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
  taxRate: z.number().min(0).max(100).optional().default(20),
  allergens: z.array(z.string()).optional(),
  calories: z.number().int().optional(),
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  const restaurantId = req.nextUrl.searchParams.get('restaurantId')
  if (!restaurantId) return err('restaurantId requis', 400)

  const products = await prisma.product.findMany({
    where: { restaurantId, deletedAt: null },
    include: {
      category: { select: { id: true, name: true, sortOrder: true } },
      optionGroups: { include: { options: { where: { deletedAt: null } } } },
    },
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
  })
  return ok(products)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) return err('Non authentifié', 401)
  if (!['CEO', 'MANAGER'].includes(user.role)) return err('Accès refusé', 403)

  const body = await parseBody(req, createProductSchema)
  if ('error' in body) return body.error

  const { categoryId, ...data } = body.data
  const category = await prisma.menuCategory.findFirst({ where: { id: categoryId, deletedAt: null } })
  if (!category) return err('Catégorie introuvable', 404)

  if (user.role !== 'CEO') {
    const access = await prisma.userRestaurant.findFirst({
      where: { userId: user.id, restaurantId: category.restaurantId },
    })
    if (!access) return err('Accès refusé', 403)
  }

  const product = await prisma.product.create({
    data: { ...data, categoryId, restaurantId: category.restaurantId },
    include: { category: true },
  })
  return ok(product, 201)
}
