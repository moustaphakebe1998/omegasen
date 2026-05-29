import { NextRequest, NextResponse } from 'next/server'
import { ok, err, parseBody } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/db/client'
import { broadcast } from '@/lib/sse'
import { z } from 'zod'

const createCategorySchema = z.object({
  restaurantId: z.string().cuid(),
  name: z.string().min(1).max(80).trim(),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/).trim(),
  description: z.string().max(300).optional(),
  sortOrder: z.number().int().min(0).default(0),
  isVisible: z.boolean().default(true),
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  const restaurantId = req.nextUrl.searchParams.get('restaurantId')
  if (!restaurantId) return err('restaurantId requis', 400)

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId, deletedAt: null },
    include: {
      products: {
        where: { deletedAt: null },
        include: {
          optionGroups: {
            include: { options: { orderBy: { sortOrder: 'asc' } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { sortOrder: 'asc' },
  })
  return ok(categories)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) return err('Non authentifié', 401)
  if (!['CEO', 'MANAGER'].includes(user.role)) return err('Accès refusé', 403)

  const body = await parseBody(req, createCategorySchema)
  if ('error' in body) return body.error

  const { restaurantId, name, slug, description, sortOrder, isVisible } = body.data

  if (user.role !== 'CEO') {
    const access = await prisma.userRestaurant.findFirst({
      where: { userId: user.id, restaurantId },
    })
    if (!access) return err('Accès refusé', 403)
  }

  const existing = await prisma.menuCategory.findFirst({
    where: { restaurantId, slug, deletedAt: null },
  })
  if (existing) return err('Un slug identique existe déjà', 409)

  const category = await prisma.menuCategory.create({
    data: { restaurantId, name, slug, description, sortOrder, isVisible },
  })

  broadcast(restaurantId, 'menu:update', { action: 'category:created', categoryId: category.id })
  return ok(category, 201)
}
