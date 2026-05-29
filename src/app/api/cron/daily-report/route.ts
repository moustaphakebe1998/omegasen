import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/db/client'

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const today = new Date(yesterday)
  today.setDate(today.getDate() + 1)

  const restaurants = await prisma.restaurant.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  })

  const stats = await Promise.all(
    restaurants.map(async (r) => {
      const orders = await prisma.order.findMany({
        where: {
          restaurantId: r.id,
          createdAt: { gte: yesterday, lt: today },
          status: { notIn: ['DRAFT', 'CANCELLED'] },
        },
        select: { total: true, status: true },
      })

      const revenue = orders.reduce((sum, o) => sum + Number(o.total), 0)
      const cancelled = await prisma.order.count({
        where: {
          restaurantId: r.id,
          createdAt: { gte: yesterday, lt: today },
          status: 'CANCELLED',
        },
      })

      return {
        name: r.name,
        revenue,
        total: orders.length,
        cancelled,
        avg: orders.length > 0 ? revenue / orders.length : 0,
      }
    })
  )

  const grandTotal = stats.reduce((sum, s) => sum + s.revenue, 0)
  const grandOrders = stats.reduce((sum, s) => sum + s.total, 0)
  const dateStr = yesterday.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>
    body{font-family:sans-serif;background:#f5f5f5;padding:20px}
    .card{background:white;border-radius:12px;padding:24px;margin-bottom:16px}
    h1{color:#F25314;margin:0 0 4px}
    .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}
    .kpi{background:#F4F4F5;border-radius:8px;padding:16px;text-align:center}
    .kpi-value{font-size:24px;font-weight:700}
    .kpi-label{font-size:12px;color:#71717A;margin-top:4px}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;padding:8px 12px;background:#F4F4F5;font-size:12px}
    td{padding:10px 12px;border-bottom:1px solid #F4F4F5;font-size:14px}
  </style></head><body>
  <div class="card">
    <h1>Omegasen</h1>
    <p style="color:#71717A;font-size:14px">Rapport — ${dateStr}</p>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-value">${(grandTotal / 100).toFixed(2)} €</div><div class="kpi-label">CA total</div></div>
      <div class="kpi"><div class="kpi-value">${grandOrders}</div><div class="kpi-label">Commandes</div></div>
      <div class="kpi"><div class="kpi-value">${grandOrders > 0 ? (grandTotal / grandOrders / 100).toFixed(2) : '0.00'} €</div><div class="kpi-label">Ticket moyen</div></div>
    </div>
    <table><thead><tr><th>Restaurant</th><th>CA</th><th>Commandes</th><th>Annulations</th></tr></thead>
    <tbody>${stats.map(s => `<tr><td>${s.name}</td><td>${(s.revenue / 100).toFixed(2)} €</td><td>${s.total}</td><td>${s.cancelled}</td></tr>`).join('')}</tbody>
    </table>
  </div></body></html>`

  const resendKey = process.env.RESEND_API_KEY
  const toEmail = process.env.RESEND_TO_EMAIL

  if (resendKey && toEmail) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL ?? 'onboarding@resend.dev',
        to: toEmail,
        subject: `📊 Rapport Omegasen — ${dateStr}`,
        html,
      }),
    })
  }

  return NextResponse.json({ sent: true, date: dateStr, totalRevenue: grandTotal, totalOrders: grandOrders })
}
