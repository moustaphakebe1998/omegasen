import { NextRequest, NextResponse } from 'next/server'
import { ok, err, parseBody } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/db/client'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

const createUserSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['CEO', 'MANAGER', 'KITCHEN', 'KIOSK']),
  restaurantIds: z.array(z.string().cuid()).optional(),
})

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) return err('Non authentifié', 401)
  if (user.role !== 'CEO') return err('Accès refusé', 403)

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
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
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) return err('Non authentifié', 401)
  if (user.role !== 'CEO') return err('Accès refusé', 403)

  const body = await parseBody(req, createUserSchema)
  if ('error' in body) return body.error

  const { firstName, lastName, email, password, role, restaurantIds = [] } = body.data
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return err('Cet email est déjà utilisé', 409)

  const passwordHash = await bcrypt.hash(password, 12)
  const newUser = await prisma.user.create({
    data: {
      firstName,
      lastName,
      email,
      passwordHash,
      role,
      restaurants: {
        create: restaurantIds.map((rid: string) => ({ restaurantId: rid, role })),
      },
    },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, createdAt: true },
  })
  return ok(newUser, 201)
}
