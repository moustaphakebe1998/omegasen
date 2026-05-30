'use client'

import { useState, useCallback } from 'react'
import { useSSE } from '@/hooks/use-sse'
import type { AuthUser } from '@/types'

const DAY_NAMES = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']

function formatPrice(n: number) {
  return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n/100)
}

function formatDateTime(d: Date | string) {
  return new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(d))
}

export function ManagerDashboardClient({ user, restaurant, recentOrders, products, todayOrders }: {
  user: AuthUser
  restaurant: { id: string; name: string; slug: string; maintenanceMode: boolean; openingHours: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[] }
  recentOrders: { id: string; orderNumber: string; status: string; total: number; createdAt: Date; notes: string | null; items: { quantity: number; product: { name: string } }[] }[]
  products: { id: string; name: string; price: number; isAvailable: boolean; isVisible: boolean; category: { name: string } }[]
  todayOrders: { total: number; status: string }[]
}) {
  const [tab, setTab] = useState<'orders'|'menu'|'settings'>('orders')
  const [orders, setOrders] = useState(recentOrders)
  const [maintenance, setMaintenance] = useState(restaurant.maintenanceMode)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useSSE({
    'order:new': useCallback(() => {
      fetch(`/api/orders?restaurantId=${restaurant.id}&limit=50`)
        .then(r=>r.json()).then(d=>{ if(d.data) setOrders(d.data.items) }).catch(()=>{})
    }, [restaurant.id]),
    'order:update': useCallback(() => {
      fetch(`/api/orders?restaurantId=${restaurant.id}&limit=50`)
        .then(r=>r.json()).then(d=>{ if(d.data) setOrders(d.data.items) }).catch(()=>{})
    }, [restaurant.id]),
  }, { restaurantId: restaurant.id })

  const revenue = todayOrders.filter(o=>o.status!=='CANCELLED').reduce((s,o)=>s+Number(o.total),0)
  const count = todayOrders.filter(o=>o.status!=='CANCELLED').length
  const activeCount = orders.filter(o=>['PENDING','CONFIRMED','PREPARING','READY'].includes(o.status)).length

  async function updateStatus(orderId: string, status: string) {
    await fetch(`/api/orders/${orderId}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})})
    const res = await fetch(`/api/orders?restaurantId=${restaurant.id}&limit=50`)
    const data = await res.json()
    if(data.data) setOrders(data.data.items)
  }

  async function toggleAvailability(productId: string, current: boolean) {
    await fetch(`/api/menu/products/${productId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({isAvailable:!current})})
  }

  async function saveSettings() {
    setSaving(true)
    await fetch(`/api/restaurants/${restaurant.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({maintenanceMode:maintenance})})
    setSaving(false)
  }

  const STATUS_COLORS: Record<string,string> = {
    PENDING:'bg-yellow-100 text-yellow-800', CONFIRMED:'bg-blue-100 text-blue-800',
    PREPARING:'bg-purple-100 text-purple-800', READY:'bg-green-100 text-green-800',
    SERVED:'bg-gray-100 text-gray-600', CANCELLED:'bg-red-100 text-red-700',
  }

  const filtered = orders.filter(o=>search===''||o.orderNumber.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 fixed inset-y-0 flex flex-col">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center"><span className="text-white font-bold text-sm">O</span></div>
            <div><p className="font-bold text-gray-900 text-sm">Omegasen</p><p className="text-xs text-gray-400">Gérant</p></div>
          </div>
          <p className="text-xs text-gray-500 mt-2 font-medium">{restaurant.name}</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {(['orders','menu','settings'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)} className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-between ${tab===t?'bg-orange-500 text-white':'text-gray-600 hover:bg-gray-50'}`}>
              <span>{t==='orders'?'Commandes':t==='menu'?'Menu':'Paramètres'}</span>
              {t==='orders'&&activeCount>0&&<span className={`text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center ${tab==='orders'?'bg-white/20 text-white':'bg-orange-500 text-white'}`}>{activeCount}</span>}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-100">
          <p className="text-sm font-semibold text-gray-900">{user.firstName} {user.lastName}</p>
          <button onClick={()=>{fetch('/api/auth/logout',{method:'POST'});window.location.href='/login'}} className="text-xs text-gray-400 hover:text-red-600 mt-1">Déconnexion</button>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-56 flex-1 flex flex-col">
        <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-8 py-4">
          <h1 className="text-xl font-bold text-gray-900">{tab==='orders'?'Commandes':tab==='menu'?'Menu':'Paramètres'}</h1>
        </header>

        <div className="flex-1 p-8">
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[
              {label:"CA aujourd'hui",value:formatPrice(revenue)},
              {label:'Commandes',value:count.toString()},
              {label:'Ticket moyen',value:count>0?formatPrice(revenue/count):'—'},
              {label:'Actives',value:activeCount.toString()},
            ].map(k=>(
              <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">{k.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{k.value}</p>
              </div>
            ))}
          </div>

          {/* ORDERS */}
          {tab==='orders'&&(
            <div className="space-y-3">
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher..." className="w-full max-w-xs px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-orange-500"/>
              {filtered.map(order=>(
                <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-gray-900">{order.orderNumber}</span>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[order.status]??'bg-gray-100 text-gray-600'}`}>{order.status}</span>
                    </div>
                    <span className="font-bold text-gray-900">{formatPrice(Number(order.total))}</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">{formatDateTime(order.createdAt)} · {order.items.length} article(s)</p>
                  <div className="flex gap-2">
                    {order.status==='PENDING'&&<button onClick={()=>updateStatus(order.id,'CONFIRMED')} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">Confirmer</button>}
                    {order.status==='CONFIRMED'&&<button onClick={()=>updateStatus(order.id,'PREPARING')} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700">En préparation</button>}
                    {order.status==='READY'&&<button onClick={()=>updateStatus(order.id,'SERVED')} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700">Servi</button>}
                    {!['CANCELLED','SERVED','ARCHIVED'].includes(order.status)&&<button onClick={()=>updateStatus(order.id,'CANCELLED')} className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-50">Annuler</button>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* MENU */}
          {tab==='menu'&&(
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {products.map(p=>(
                  <div key={p.id} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.category.name}</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{formatPrice(Number(p.price))}</p>
                    <button onClick={()=>toggleAvailability(p.id,p.isAvailable)} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${p.isAvailable?'bg-green-50 text-green-700 hover:bg-green-100':'bg-red-50 text-red-700 hover:bg-red-100'}`}>
                      {p.isAvailable?'Disponible':'Rupture'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {tab==='settings'&&(
            <div className="max-w-xl space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="font-semibold text-gray-900 mb-4">Mode maintenance</h2>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-700">Mode maintenance actif</p>
                    <p className="text-xs text-gray-400">Les clients ne peuvent pas commander</p>
                  </div>
                  <button onClick={()=>setMaintenance(v=>!v)} className={`relative w-11 h-6 rounded-full transition-colors ${maintenance?'bg-orange-500':'bg-gray-300'}`}>
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${maintenance?'translate-x-6':'translate-x-1'}`}/>
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="font-semibold text-gray-900 mb-4">Horaires</h2>
                {DAY_NAMES.map((day,idx)=>{
                  const h = restaurant.openingHours.find(h=>h.dayOfWeek===idx)
                  return (
                    <div key={day} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm font-medium text-gray-700 w-28">{day}</span>
                      {h?.isClosed||!h?<span className="text-sm text-gray-400">Fermé</span>:<span className="text-sm font-mono text-gray-700">{h.openTime}–{h.closeTime}</span>}
                    </div>
                  )
                })}
              </div>

              <button onClick={saveSettings} disabled={saving} className="bg-orange-500 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition-colors disabled:opacity-60">
                {saving?'Sauvegarde...':'Sauvegarder'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
