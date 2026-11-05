'use client'

import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { AuthUser } from '@/types'

interface Props {
  user: AuthUser
  revenue: number
  orderCount: number
  avgBasket: number
  timeline: { date: string; revenue: number; orders: number }[]
  topProducts: { productId: string; productName: string; totalSold: number; revenue: number }[]
  restaurantStats: { id: string; name: string; revenue: number; orderCount: number }[]
}

function formatPrice(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n / 100)
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/login'
}

export function DashboardClient({ user, revenue, orderCount, avgBasket, timeline, topProducts, restaurantStats }: Props) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-sm">O</span>
          </div>
          <div>
            <h1 className="font-bold text-gray-900">Omegasen</h1>
            <p className="text-xs text-gray-400">Dashboard CEO — 30 derniers jours</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user.firstName} {user.lastName}</span>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-red-600 transition-colors">
            Déconnexion
          </button>
        </div>
      </header>

      <main className="p-8 max-w-7xl mx-auto">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {[
            { label: 'CA total', value: formatPrice(revenue) },
            { label: 'Commandes', value: orderCount.toString() },
            { label: 'Ticket moyen', value: formatPrice(avgBasket) },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-6">
              <p className="text-sm text-gray-500 mb-2">{kpi.label}</p>
              <p className="text-3xl font-bold text-gray-900">{kpi.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Chart */}
          <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Évolution du CA</h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={timeline.map(d => ({ ...d, revenue: d.revenue / 100 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${Number(v ?? 0).toFixed(2)} €`, 'CA']} />
                <Line type="monotone" dataKey="revenue" stroke="#F25314" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Top products */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Top produits</h2>
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div key={p.productId} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-orange-50 text-orange-600 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.productName}</p>
                    <p className="text-xs text-gray-400">{p.totalSold} vendus</p>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{formatPrice(p.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Restaurant stats */}
        <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Performance par restaurant</h2>
          </div>
          <table className="w-full">
            <thead><tr className="bg-gray-50">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Restaurant</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">CA</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Commandes</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Ticket moyen</th>
            </tr></thead>
            <tbody>
              {restaurantStats.map(r => (
                <tr key={r.id} className="border-t border-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{r.name}</td>
                  <td className="px-6 py-4 text-gray-700">{formatPrice(r.revenue)}</td>
                  <td className="px-6 py-4 text-gray-700">{r.orderCount}</td>
                  <td className="px-6 py-4 text-gray-700">{r.orderCount > 0 ? formatPrice(r.revenue / r.orderCount) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
