import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/db/client'
import { rejectUnauthorizedCron } from '@/lib/cron'

export async function GET(req: NextRequest) {
  const unauthorized = rejectUnauthorizedCron(req)
  if (unauthorized) return unauthorized

  // Delete DRAFT orders older than 2 hours (hard delete — they were never confirmed)
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000)
  const { count } = await prisma.order.deleteMany({
    where: { status: 'DRAFT', createdAt: { lt: cutoff } },
  })

  console.log(`[cron] Cleaned ${count} abandoned draft orders`)
  return NextResponse.json({ deleted: count })
}
