'use client'

import { useState, useEffect, useCallback } from 'react'
import { useKitchenSSE } from '@/hooks/use-sse'

interface KitchenOrder {
  id: string
  orderNumber: string
  status: string
  tableNumber: string | null
  isTakeaway: boolean
  createdAt: string
  elapsedMinutes: number
  isUrgent: boolean
  items: { id: string; productName: string; quantity: number; notes: string | null; options: string[] }[]
}

function LiveClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="font-mono text-2xl font-bold text-white">{time}</span>
}

const STATUS_COLS = [
  { status: 'CONFIRMED', label: '📋 À préparer', next: 'PREPARING', nextLabel: 'Démarrer' },
  { status: 'PREPARING', label: '👨‍🍳 En cours', next: 'READY', nextLabel: 'Prêt', prev: 'CONFIRMED', prevLabel: 'Retour' },
  { status: 'READY', label: '✅ Prêt', next: 'SERVED', nextLabel: 'Servi', prev: 'PREPARING', prevLabel: 'Retour' },
]

export function KitchenClient({ restaurantId, restaurantName }: { restaurantId: string; restaurantName: string }) {
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [loading, setLoading] = useState(true)

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/kitchen/orders?restaurantId=${restaurantId}`)
      const data = await res.json()
      if (data.data) setOrders(data.data)
    } finally {
      setLoading(false)
    }
  }, [restaurantId])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { const t = setInterval(fetchOrders, 30_000); return () => clearInterval(t) }, [fetchOrders])
  useKitchenSSE(restaurantId, fetchOrders)

  async function updateStatus(orderId: string, status: string) {
    await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await fetchOrders()
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div>
          <span className="text-orange-500 font-black text-lg">OMEGASEN</span>
          <span className="text-gray-400 text-sm ml-3">{restaurantName}</span>
        </div>
        <LiveClock />
        <button onClick={() => { fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login' }}
          className="text-gray-500 hover:text-gray-300 text-sm">Déconnexion</button>
      </header>

      <div className="flex-1 grid grid-cols-3 gap-4 p-4">
        {STATUS_COLS.map(col => (
          <div key={col.status} className="flex flex-col gap-3">
            <div className="text-center py-2">
              <h2 className="text-lg font-bold text-white">{col.label}</h2>
              <span className="text-gray-500 text-sm">{orders.filter(o => o.status === col.status).length} commande(s)</span>
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto">
              {loading && <div className="text-center text-gray-500 py-8">Chargement...</div>}
              {!loading && orders.filter(o => o.status === col.status).map(order => (
                <div key={order.id} className={`bg-gray-900 border rounded-xl p-4 ${order.isUrgent ? 'border-red-500 animate-pulse-urgent' : 'border-gray-800'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono font-bold text-white">{order.orderNumber}</span>
                    <span className={`text-xs px-2 py-1 rounded-full font-bold ${order.isUrgent ? 'bg-red-500/20 text-red-400' : 'bg-gray-800 text-gray-400'}`}>
                      {order.elapsedMinutes}min
                    </span>
                  </div>
                  {order.tableNumber && <p className="text-xs text-gray-400 mb-2">Table {order.tableNumber}</p>}
                  {order.isTakeaway && <p className="text-xs text-orange-400 mb-2">À emporter</p>}
                  <div className="space-y-1 mb-4">
                    {order.items.map(item => (
                      <div key={item.id} className="text-sm">
                        <span className="text-orange-400 font-bold">{item.quantity}×</span>
                        <span className="text-white ml-1">{item.productName}</span>
                        {item.options.length > 0 && <p className="text-xs text-gray-400 ml-4">{item.options.join(', ')}</p>}
                        {item.notes && <p className="text-xs text-yellow-400 ml-4">⚠ {item.notes}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => updateStatus(order.id, col.next)}
                      className="flex-1 bg-orange-500 text-white rounded-lg py-2 text-sm font-bold hover:bg-orange-600 transition-colors">
                      {col.nextLabel}
                    </button>
                    {col.prev && (
                      <button onClick={() => updateStatus(order.id, col.prev!)}
                        className="px-3 border border-gray-700 text-gray-400 rounded-lg text-xs hover:bg-gray-800 transition-colors">
                        {col.prevLabel}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!loading && orders.filter(o => o.status === col.status).length === 0 && (
                <div className="text-center text-gray-700 py-12 text-sm">Aucune commande</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
