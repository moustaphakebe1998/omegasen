import { NextRequest, NextResponse } from 'next/server'
import { ok, err, parseBody } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/db/client'
import { z } from 'zod'

const createProductSchema = z.object({
  categoryId: z.string().cuid(),
  name: z.string().min(1).max(120).trim(),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/).trim(),
  description: z.string().max(500).optional(),
  price: z.number().positive(),
  imageUrl: z.string().url().optional(),
  isAvailable: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  allergens: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  const restaurantId = req.nextUrl.searchParams.get('restaurantId')
  if (!restaurantId) return err('restaurantId requis', 400)

  const products = await prisma.product.findMany({
    where: { category: { restaurantId }, deletedAt: null },
    include: {
      category: { select: { id: true, name: true, sortOrder: true } },
      optionGroups: { include: { options: { orderBy: { sortOrder: 'asc' } } } },
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

  const { categoryId, name, slug, description, price, imageUrl, isAvailable, isVisible, sortOrder, allergens, tags } = body.data

  const category = await prisma.menuCategory.findFirst({ where: { id: categoryId, deletedAt: null } })
  if (!category) return err('Catégorie introuvable', 404)

  if (user.role !== 'CEO') {
    const access = await prisma.userRestaurant.findFirst({
      where: { userId: user.id, restaurantId: category.restaurantId },
    })
    if (!access) return err('Accès refusé', 403)
  }

  const product = await prisma.product.create({
    data: {
      categoryId,
      name,
      slug,
      description,
      price,
      imageUrl,
      isAvailable: isAvailable ?? true,
      isVisible: isVisible ?? true,
      sortOrder: sortOrder ?? 0,
      allergens: allergens ?? [],
      tags: tags ?? [],
    },
    include: { category: true },
  })
  return ok(product, 201)
}
