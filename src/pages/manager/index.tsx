import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '../../components/shared/Sidebar'
import { api, fmtEUR, fmtDateTime } from '../../lib/api'
import { toast } from '../../components/shared/Toast'
import { useAuth } from '../../store/auth'

const SL: Record<string,string> = { PENDING:'En attente',CONFIRMED:'Confirmée',PREPARING:'En préparation',READY:'Prête',SERVED:'Servie',CANCELLED:'Annulée' }
const SC: Record<string,string> = { PENDING:'bg-amber-100 text-amber-800',CONFIRMED:'bg-blue-100 text-blue-800',PREPARING:'bg-purple-100 text-purple-800',READY:'bg-emerald-100 text-emerald-800',SERVED:'bg-gray-100 text-gray-600',CANCELLED:'bg-red-100 text-red-700' }

function exportCSV(rows: any[], filename: string) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => JSON.stringify(r[c]??'')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click()
  URL.revokeObjectURL(url)
}

// ── ORDERS TAB ───────────────────────────────────────────────────────────────
function OrdersTab({ rid }: { rid: string }) {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selected, setSelected] = useState<any>(null)

  const load = useCallback(async () => {
    try { const d = await api.get<any>(`/api/orders?restaurantId=${rid}&pageSize=50`); setOrders(d?.items??[]) } catch {}
    setLoading(false)
  }, [rid])

  useEffect(() => { load(); const t=setInterval(load,15000); return()=>clearInterval(t) }, [load])

  async function updateStatus(id: string, status: string) {
    try { await api.patch(`/api/orders/${id}/status`,{status}); await load(); toast.success('Statut mis à jour') }
    catch (e:any) { toast.error('Erreur',e.message) }
    if (selected?.id===id) setSelected((o:any)=>o?{...o,status}:null)
  }

  function exportOrders() {
    exportCSV(orders.map(o=>({ Numéro:o.orderNumber, Statut:SL[o.status]??o.status, Total_EUR:(Number(o.total)/100).toFixed(2), Articles:o.items?.length??0, Date:fmtDateTime(o.createdAt) })),
      `commandes-${new Date().toISOString().slice(0,10)}.csv`)
  }

  const filtered = orders.filter(o=>
    (statusFilter==='ALL'||o.status===statusFilter) &&
    (!search||o.orderNumber.toLowerCase().includes(search.toLowerCase()))
  )
  const activeCount = orders.filter(o=>['PENDING','CONFIRMED','PREPARING','READY'].includes(o.status)).length
  const todayCA = orders.filter(o=>o.status!=='CANCELLED').reduce((s,o)=>s+Number(o.total),0)

  return (
    <div className="p-8">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[{label:"CA aujourd'hui",value:fmtEUR(todayCA),icon:'💰'},{label:'Total commandes',value:orders.filter(o=>o.status!=='CANCELLED').length.toString(),icon:'🛒'},{label:'En cours',value:activeCount.toString(),icon:'⏳'}].map(k=>(
          <div key={k.label} className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-2"><p className="text-sm text-gray-500">{k.label}</p><span className="text-xl">{k.icon}</span></div>
            <p className="text-2xl font-display font-bold text-gray-900">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-4">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="N° commande..." className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-brand w-64"/>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-brand">
          <option value="ALL">Tous</option>
          {Object.entries(SL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        <button onClick={exportOrders} className="ml-auto flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
          📥 Exporter
        </button>
      </div>

      <div className="flex gap-6">
        {/* List */}
        <div className="flex-1 space-y-3">
          {loading?<div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin"/></div>:(
            <>
              {filtered.map(o=>(
                <button key={o.id} onClick={()=>setSelected(selected?.id===o.id?null:o)}
                  className={`w-full bg-white rounded-2xl border text-left p-5 transition-all hover:shadow-sm ${selected?.id===o.id?'border-brand ring-1 ring-brand/20':'border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono-num font-bold text-gray-900">{o.orderNumber}</span>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${SC[o.status]??'bg-gray-100 text-gray-600'}`}>{SL[o.status]??o.status}</span>
                    </div>
                    <span className="font-bold text-gray-900">{fmtEUR(Number(o.total))}</span>
                  </div>
                  <p className="text-xs text-gray-400">{fmtDateTime(o.createdAt)} · {o.items?.length??0} article(s)</p>
                  {o.notes&&<p className="text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg mt-2">📝 {o.notes}</p>}
                </button>
              ))}
              {filtered.length===0&&<div className="bg-white rounded-2xl border border-gray-100 py-16 text-center"><p className="text-4xl mb-3">📭</p><p className="text-gray-400">Aucune commande</p></div>}
            </>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-80 shrink-0">
            <div className="bg-white rounded-2xl border border-gray-100 sticky top-24 overflow-hidden">
              <div className="p-5 border-b border-gray-50 flex items-center justify-between">
                <div>
                  <p className="font-mono-num font-bold text-gray-900">{selected.orderNumber}</p>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium mt-1 inline-block ${SC[selected.status]??''}`}>{SL[selected.status]??selected.status}</span>
                </div>
                <button onClick={()=>setSelected(null)} className="text-gray-400 hover:text-gray-700 text-xl w-8 h-8 flex items-center justify-center">×</button>
              </div>
              <div className="p-5">
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Articles</h3>
                <div className="space-y-2 mb-4">
                  {(selected.items??[]).map((item:any)=>(
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-gray-700">{item.quantity}× {item.product?.name??item.productName}</span>
                      <span className="font-semibold">{fmtEUR(Number(item.subtotal??item.unitPrice)*item.quantity)}</span>
                    </div>
                  ))}
                </div>
                {selected.notes&&<div className="bg-amber-50 rounded-xl p-3 mb-4"><p className="text-xs font-semibold text-amber-700 mb-1">Note</p><p className="text-xs text-amber-700">{selected.notes}</p></div>}
                <div className="border-t border-gray-100 pt-3 mb-5">
                  <div className="flex justify-between font-bold"><span>Total</span><span>{fmtEUR(Number(selected.total))}</span></div>
                </div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Actions</h3>
                <div className="space-y-2">
                  {selected.status==='PENDING'&&<button onClick={()=>updateStatus(selected.id,'CONFIRMED')} className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-bold hover:bg-blue-700">Confirmer</button>}
                  {selected.status==='CONFIRMED'&&<button onClick={()=>updateStatus(selected.id,'PREPARING')} className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-bold hover:bg-purple-700">Démarrer préparation</button>}
                  {selected.status==='READY'&&<button onClick={()=>updateStatus(selected.id,'SERVED')} className="w-full bg-emerald-600 text-white rounded-xl py-3 text-sm font-bold hover:bg-emerald-700">Marquer servie</button>}
                  {!['CANCELLED','SERVED','ARCHIVED'].includes(selected.status)&&<button onClick={()=>updateStatus(selected.id,'CANCELLED')} className="w-full border border-red-200 text-red-600 rounded-xl py-3 text-sm font-bold hover:bg-red-50">Annuler</button>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── MENU TAB ─────────────────────────────────────────────────────────────────
function MenuTab({ rid }: { rid: string }) {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<any[]>(`/api/menu/products?restaurantId=${rid}`).then(p=>setProducts(Array.isArray(p)?p:[])).catch(()=>{}).finally(()=>setLoading(false))
  }, [rid])

  async function toggleAvail(id: string, cur: boolean) {
    try { await api.patch(`/api/menu/products/${id}`,{isAvailable:!cur}); setProducts(p=>p.map(x=>x.id===id?{...x,isAvailable:!cur}:x)); toast.success(!cur?'Disponible':'En rupture') }
    catch { toast.error('Erreur') }
  }

  function exportMenu() {
    exportCSV(products.map(p=>({ Nom:p.name, Catégorie:p.category?.name, Prix_EUR:(Number(p.price)/100).toFixed(2), Disponible:p.isAvailable?'Oui':'Non' })), `menu-${new Date().toISOString().slice(0,10)}.csv`)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display font-bold text-gray-900 text-xl">Produits ({products.length})</h2>
        <button onClick={exportMenu} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">📥 Exporter</button>
      </div>
      {loading?<div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin"/></div>:(
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {products.map(p=>(
            <div key={p.id} className="flex items-center gap-4 px-6 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-400">{p.category?.name}</p>
              </div>
              <p className="font-bold text-gray-900">{fmtEUR(Number(p.price))}</p>
              <button onClick={()=>toggleAvail(p.id,p.isAvailable)} className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${p.isAvailable?'bg-emerald-50 text-emerald-700 hover:bg-emerald-100':'bg-red-50 text-red-700 hover:bg-red-100'}`}>
                {p.isAvailable?'✓ Disponible':'✗ Rupture'}
              </button>
            </div>
          ))}
          {products.length===0&&<div className="py-16 text-center text-gray-400"><p className="text-4xl mb-3">🍽️</p><p>Aucun produit</p></div>}
        </div>
      )}
    </div>
  )
}

// ── SETTINGS TAB ─────────────────────────────────────────────────────────────
function SettingsTab({ rid }: { rid: string }) {
  const [maintenance, setMaintenance] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try { await api.patch(`/api/restaurants/${rid}`,{maintenanceMode:maintenance}); toast.success('Sauvegardé') }
    catch { toast.error('Erreur') }
    setSaving(false)
  }

  return (
    <div className="p-8 max-w-lg">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <h2 className="font-display font-bold text-gray-900 mb-4">Statut du restaurant</h2>
        <div className="flex items-center justify-between py-3 border-b border-gray-50">
          <div><p className="font-medium text-gray-900">Mode maintenance</p><p className="text-sm text-gray-400">Les clients ne peuvent plus commander</p></div>
          <button onClick={()=>setMaintenance(v=>!v)} className={`relative w-12 h-6 rounded-full transition-colors ${maintenance?'bg-brand':'bg-gray-200'}`}>
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${maintenance?'translate-x-7':'translate-x-1'}`}/>
          </button>
        </div>
      </div>
      <button onClick={save} disabled={saving} className="bg-brand text-white px-8 py-3 rounded-xl font-semibold hover:bg-brand-600 disabled:opacity-60">
        {saving?'Sauvegarde...':'Sauvegarder'}
      </button>
    </div>
  )
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
export default function ManagerPage() {
  const user = useAuth(s => s.user)
  const [tab, setTab] = useState('orders')
  const rid = user?.restaurants?.[0] ?? ''

  const LABELS: Record<string,string> = { orders:'Commandes', menu:'Menu', settings:'Paramètres' }

  const activeOrders = tab  // placeholder — badge computed in OrdersTab

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar active={tab} onNav={setTab} subtitle="Gérant"
        items={[
          {id:'orders',  label:'Commandes',  icon:'🛒'},
          {id:'menu',    label:'Menu',       icon:'🍽️'},
          {id:'settings',label:'Paramètres', icon:'⚙️'},
        ]} />
      <main className="ml-60 flex-1">
        <header className="sticky top-0 z-20 bg-white border-b border-gray-100 px-8 py-4">
          <h1 className="text-xl font-display font-bold text-gray-900">{LABELS[tab]}</h1>
        </header>
        {tab==='orders'   && rid && <OrdersTab   rid={rid}/>}
        {tab==='menu'     && rid && <MenuTab      rid={rid}/>}
        {tab==='settings' && rid && <SettingsTab  rid={rid}/>}
        {!rid && <div className="p-8 text-gray-400">Aucun restaurant associé à ce compte.</div>}
      </main>
    </div>
  )
}
