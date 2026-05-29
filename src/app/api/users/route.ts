import { NextRequest } from 'next/server'
import { ok, err, withAuth, parseBody } from '@/lib/api'
import { prisma } from '@/db/client'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['CEO', 'MANAGER', 'KITCHEN', 'CLIENT']),
  restaurantIds: z.array(z.string().cuid()).optional(),
})

export async function GET(req: NextRequest) {
  return withAuth(req, ['CEO'], async () => {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        restaurants: {
          include: { restaurant: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return ok(users)
  })
}

export async function POST(req: NextRequest) {
  return withAuth(req, ['CEO'], async () => {
    const body = await parseBody(req, createUserSchema)
    if (!body.ok) return body.error

    const { name, email, password, role, restaurantIds = [] } = body.data

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return err('Cet email est déjà utilisé', 409)

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        restaurants: {
          create: restaurantIds.map(rid => ({ restaurantId: rid })),
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    })

    return ok(user, 201)
  })
}
