import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/db/client'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Delete DRAFT orders older than 2 hours (hard delete — they were never confirmed)
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000)
  const { count } = await prisma.order.deleteMany({
    where: { status: 'DRAFT', createdAt: { lt: cutoff } },
  })

  console.log(`[cron] Cleaned ${count} abandoned draft orders`)
  return NextResponse.json({ deleted: count })
}
