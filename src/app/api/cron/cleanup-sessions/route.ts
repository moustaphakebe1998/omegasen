import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/db/client'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })

  console.log(`[cron] Cleaned ${count} expired sessions`)
  return NextResponse.json({ deleted: count })
}
