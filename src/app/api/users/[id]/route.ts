import { NextRequest, NextResponse } from 'next/server'
import { ok, err } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/db/client'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) return err('Non authentifié', 401)
  if (user.role !== 'CEO') return err('Accès refusé', 403)

  const { id } = await params
  if (id === user.id) return err('Vous ne pouvez pas supprimer votre propre compte', 400)

  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  })
  return ok({ deleted: true })
}
