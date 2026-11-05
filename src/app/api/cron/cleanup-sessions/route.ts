import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/db/client'
import { rejectUnauthorizedCron } from '@/lib/cron'

export async function GET(req: NextRequest) {
  const unauthorized = rejectUnauthorizedCron(req)
  if (unauthorized) return unauthorized

  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })

  console.log(`[cron] Cleaned ${count} expired sessions`)
  return NextResponse.json({ deleted: count })
}
