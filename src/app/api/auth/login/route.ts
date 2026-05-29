import { NextRequest, NextResponse } from 'next/server'
import { ok, err } from '@/lib/api'
import { setAuthCookie } from '@/lib/auth'
import { prisma } from '@/db/client'
import { rateLimit } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = await rateLimit(req, 'login')
  if (!limited.success) {
    return err('Trop de tentatives, réessayez dans 15 minutes', 429)
  }

  const body = { email: "", password: "" }
  try {
    body = loginSchema.parse(await req.json())
  } catch {
    return err('Email et mot de passe requis', 400)
  }

  // Délai constant pour éviter timing attacks
  const start = Date.now()

  const user = await prisma.user.findUnique({
    where: { email: body.email },
    include: {
      restaurants: { select: { restaurantId: true } },
    },
  })

  const elapsed = Date.now() - start
  if (elapsed < 100) await new Promise(r => setTimeout(r, 100 - elapsed))

  if (!user || !user.isActive || user.deletedAt) {
    return err('Email ou mot de passe incorrect', 401)
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return err('Compte temporairement bloqué', 423)
  }

  const valid = await bcrypt.compare(body.password, user.passwordHash)

  if (!valid) {
    const attempts = user.loginAttempts + 1
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null
    await prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: attempts, lockedUntil },
    })
    return err('Email ou mot de passe incorrect', 401)
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { loginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  })

  const restaurantIds = user.restaurants.map(r => r.restaurantId)

  await setAuthCookie({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    restaurants: restaurantIds,
  })

  // Audit log non-bloquant
  prisma.auditLog.create({
    data: {
      action: 'USER_LOGIN',
      actorId: user.id,
      ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
    },
  }).catch(() => {})

  return ok({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    restaurants: restaurantIds,
  })
}
