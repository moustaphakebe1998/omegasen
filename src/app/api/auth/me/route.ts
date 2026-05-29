import { NextRequest, NextResponse } from 'next/server'
import { ok, err } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/db/client'

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) return err('Non authentifié', 401)

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      avatarUrl: true,
      createdAt: true,
      restaurants: {
        include: {
          restaurant: {
            select: { id: true, name: true, slug: true, logoUrl: true },
          },
        },
      },
    },
  })

  if (!fullUser) return err('Utilisateur introuvable', 404)
  return ok(fullUser)
}
