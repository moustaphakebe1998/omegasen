import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/db/client'

export async function GET(req: NextRequest) {
  // Verify Vercel cron secret
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago

  const { count } = await prisma.order.updateMany({
    where: {
      status: 'SERVED',
      updatedAt: { lt: cutoff },
    },
    data: { status: 'ARCHIVED' },
  })

  console.log(`[cron] Archived ${count} served orders older than 7 days`)

  return NextResponse.json({ archived: count, at: new Date().toISOString() })
}
