import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import { toast } from '../../components/shared/Toast'
import { useAuth } from '../../store/auth'

const COLS = [
  { status: 'CONFIRMED', label: '📋 À préparer', next: 'PREPARING', nextLabel: 'Démarrer', color: 'border-blue-500/30 bg-blue-500/5' },
  { status: 'PREPARING', label: '👨‍🍳 En cours',   next: 'READY',    nextLabel: '✓ Prêt',  color: 'border-purple-500/30 bg-purple-500/5', prev: 'CONFIRMED', prevLabel: '↩' },
  { status: 'READY',     label: '✅ Prêt',        next: 'SERVED',   nextLabel: 'Servi',    color: 'border-emerald-500/30 bg-emerald-500/5', prev: 'PREPARING', prevLabel: '↩' },
]

function Clock() {
  const [t, setT] = useState(new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}))
  useEffect(()=>{ const i=setInterval(()=>setT(new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})),1000); return()=>clearInterval(i) },[])
  return <span className="font-mono-num text-2xl font-bold tabular-nums tracking-widest">{t}</span>
}

export default function KitchenPage() {
  const user = useAuth(s => s.user)
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const rid = user?.restaurants?.[0]

  const load = useCallback(async()=>{
    if(!rid) return
    try { const d=await api.get<any[]>(`/api/kitchen/orders?restaurantId=${rid}`); setOrders(Array.isArray(d)?d:[]) }
    catch {} finally { setLoading(false) }
  },[rid])

  useEffect(()=>{ load(); const t=setInterval(load,15000); return()=>clearInterval(t) },[load])

  async function update(id: string, status: string) {
    try { await api.patch(`/api/orders/${id}/status`,{status}); await load() }
    catch(e:any) { toast.error('Erreur',e.message) }
  }

  async function logout() {
    try { await api.post('/api/auth/logout',{}) } catch {}
    useAuth.getState().logout(); window.location.href='/login'
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col font-body">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center"><span className="font-display font-black text-white text-sm">O</span></div>
          <span className="font-display font-bold">Cuisine</span>
          <span className="text-gray-600">·</span>
          <span className="text-gray-400 text-sm">{orders.length} active(s)</span>
        </div>
        <Clock />
        <button onClick={logout} className="text-gray-500 hover:text-gray-300 text-sm transition-colors">Déconnexion</button>
      </header>

      <div className="flex-1 grid grid-cols-3 gap-4 p-4 min-h-0">
        {COLS.map(col=>{
          const colOrders = orders.filter(o=>o.status===col.status)
          return (
            <div key={col.status} className="flex flex-col gap-3 overflow-y-auto">
              <div className={`rounded-xl px-4 py-3 border ${col.color} flex items-center justify-between shrink-0`}>
                <h2 className="font-display font-bold text-white">{col.label}</h2>
                <span className="bg-gray-800 text-gray-300 text-xs font-bold px-2 py-1 rounded-lg">{colOrders.length}</span>
              </div>
              {loading&&<div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin"/></div>}
              {!loading&&colOrders.length===0&&<div className="text-center py-12 text-gray-700 text-sm">Aucune commande</div>}
              {colOrders.map(o=>(
                <div key={o.id} className={`bg-gray-900 rounded-xl border p-4 transition-all ${o.isUrgent?'border-red-500 animate-urgent':'border-gray-800'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono-num font-bold text-white tracking-wide">{o.orderNumber}</span>
                    <div className="flex items-center gap-2">
                      {o.isTakeaway&&<span className="text-xs bg-brand/20 text-brand px-2 py-0.5 rounded-full font-medium">Emporter</span>}
                      {o.tableNumber&&<span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">T{o.tableNumber}</span>}
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${o.isUrgent?'bg-red-500/20 text-red-400':'bg-gray-800 text-gray-400'}`}>{o.elapsedMinutes}min{o.isUrgent?' ⚠️':''}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 mb-4">
                    {(o.items??[]).map((item: any)=>(
                      <div key={item.id}>
                        <div className="flex items-center gap-2">
                          <span className="text-brand font-bold text-sm">{item.quantity}×</span>
                          <span className="text-white text-sm font-medium">{item.productName}</span>
                        </div>
                        {item.options?.length>0&&<p className="text-xs text-gray-500 ml-5">{item.options.join(', ')}</p>}
                        {item.notes&&<p className="text-xs text-amber-400 ml-5">⚠ {item.notes}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={()=>update(o.id,col.next)} className="flex-1 bg-brand text-white rounded-lg py-2.5 text-sm font-bold hover:bg-brand-600 active:scale-[0.98] transition-all">{col.nextLabel}</button>
                    {col.prev&&<button onClick={()=>update(o.id,col.prev!)} className="px-3 border border-gray-700 text-gray-400 rounded-lg text-xs hover:bg-gray-800 transition-all">{col.prevLabel}</button>}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
