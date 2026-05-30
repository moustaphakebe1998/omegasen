import { useState, useEffect, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Sidebar } from '../../components/shared/Sidebar'
import { api, fmtEUR, fmtDateTime } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { toast } from '../../components/shared/Toast'

// ── Helpers ──────────────────────────────────────────────────────────────────

function exportCSV(rows: any[], filename: string) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const ROLES = ['CEO', 'MANAGER', 'KITCHEN', 'KIOSK'] as const
const ROLE_COLOR: Record<string, string> = {
  CEO: 'bg-purple-100 text-purple-700', MANAGER: 'bg-blue-100 text-blue-700',
  KITCHEN: 'bg-orange-100 text-orange-700', KIOSK: 'bg-gray-100 text-gray-600',
}

// ── Sub-pages ─────────────────────────────────────────────────────────────────

function Dashboard({ period, setPeriod }: { period: number; setPeriod: (n: number) => void }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const from = new Date(Date.now() - period * 86400000).toISOString()
    const to = new Date().toISOString()
    api.get<any>(`/api/analytics?from=${from}&to=${to}`)
      .then(d => setData(d)).catch(() => {}).finally(() => setLoading(false))
  }, [period])

  const kpis = data?.kpis ?? {}
  const timeline = (data?.revenueTimeline ?? []).map((d: any) => ({ ...d, revenue: Number(d.revenue) / 100 }))
  const products = data?.topProducts ?? []
  const restaurants = data?.restaurantStats ?? []

  function exportAnalytics() {
    exportCSV(restaurants.map((r: any) => ({
      Restaurant: r.name, CA_EUR: (r.revenue / 100).toFixed(2),
      Commandes: r.orderCount, Ticket_moyen: r.orderCount > 0 ? (r.revenue / r.orderCount / 100).toFixed(2) : 0,
    })), `omegasen-analytics-${period}j-${new Date().toISOString().slice(0,10)}.csv`)
  }

  if (loading) return <div className="flex justify-center py-32"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {[{label:'7j',days:7},{label:'30j',days:30},{label:'90j',days:90}].map(p => (
            <button key={p.days} onClick={() => setPeriod(p.days)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${period===p.days?'bg-white text-gray-900 shadow-sm':'text-gray-500'}`}>{p.label}</button>
          ))}
        </div>
        <button onClick={exportAnalytics} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          📥 Exporter CSV
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label:'CA total',        value:fmtEUR(kpis.revenue??0),                      icon:'💰', color:'bg-brand/10 text-brand' },
          { label:'Commandes',       value:(kpis.orderCount??0).toString(),               icon:'🛒', color:'bg-blue-50 text-blue-600' },
          { label:'Ticket moyen',    value:fmtEUR(kpis.averageBasket??0),                 icon:'🧾', color:'bg-purple-50 text-purple-600' },
          { label:'Taux annulation', value:`${(kpis.cancellationRate??0).toFixed(1)}%`,   icon:'❌', color:'bg-red-50 text-red-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500">{k.label}</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${k.color}`}>{k.icon}</div>
            </div>
            <p className="text-2xl font-display font-bold text-gray-900">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="col-span-2 bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="font-display font-bold text-gray-900 mb-4">Évolution du CA</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5"/>
              <XAxis dataKey="date" tick={{ fontSize:11, fill:'#9ca3af' }}/>
              <YAxis tick={{ fontSize:11, fill:'#9ca3af' }}/>
              <Tooltip formatter={(v: number) => [`${v.toFixed(2)} €`,'CA']} contentStyle={{ borderRadius:12, border:'1px solid #f0f0f0', fontSize:12 }}/>
              <Line type="monotone" dataKey="revenue" stroke="#F25314" strokeWidth={2.5} dot={false} activeDot={{ r:4 }}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="font-display font-bold text-gray-900 mb-4">Top produits</h2>
          <div className="space-y-3">
            {products.slice(0,5).map((p: any, i: number) => (
              <div key={p.productId} className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${i===0?'bg-amber-100 text-amber-700':i===1?'bg-gray-100 text-gray-600':i===2?'bg-orange-100 text-orange-700':'bg-gray-50 text-gray-400'}`}>{i+1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.productName}</p>
                  <p className="text-xs text-gray-400">{p.totalSold} vendus</p>
                </div>
                <span className="text-sm font-bold text-gray-900">{fmtEUR(p.revenue)}</span>
              </div>
            ))}
            {products.length===0&&<p className="text-sm text-gray-400 text-center py-6">Aucune donnée</p>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-display font-bold text-gray-900">Performance par restaurant</h2>
        </div>
        <table className="w-full">
          <thead><tr className="bg-gray-50">
            {['Restaurant','CA','Commandes','Ticket moyen'].map(h=>(
              <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {restaurants.map((r: any) => (
              <tr key={r.restaurantId??r.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4 font-semibold text-gray-900">{r.name}</td>
                <td className="px-6 py-4 text-gray-700">{fmtEUR(r.revenue)}</td>
                <td className="px-6 py-4 text-gray-700">{r.orderCount}</td>
                <td className="px-6 py-4 text-gray-700">{r.orderCount>0?fmtEUR(r.revenue/r.orderCount):'—'}</td>
              </tr>
            ))}
            {restaurants.length===0&&<tr><td colSpan={4} className="px-6 py-12 text-center text-gray-400">Aucune donnée pour cette période</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Restaurants() {
  const [restaurants, setRestaurants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name:'', slug:'', address:'', phone:'', email:'' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api.get<any[]>('/api/users') // reuse users endpoint to get restaurants list
      setRestaurants(data ?? [])
    } catch {}
    // Fallback: get from analytics
    try {
      const from = new Date(Date.now() - 30*86400000).toISOString()
      const to = new Date().toISOString()
      const d = await api.get<any>(`/api/analytics?from=${from}&to=${to}`)
      if (d?.restaurantStats) setRestaurants(d.restaurantStats)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function createRestaurant() {
    if (!form.name || !form.slug) { toast.error('Nom et slug requis'); return }
    setSaving(true)
    try {
      await api.post('/api/restaurants', form)
      toast.success('Restaurant créé')
      setShowForm(false)
      setForm({ name:'', slug:'', address:'', phone:'', email:'' })
      load()
    } catch (e: any) { toast.error('Erreur', e.message) }
    setSaving(false)
  }

  const [confirmDeleteRestaurant, setConfirmDeleteRestaurant] = useState<{id:string;name:string}|null>(null)

  async function toggleMaintenance(id: string, current: boolean) {
    try {
      await api.patch(`/api/restaurants/${id}`, { maintenanceMode: !current })
      toast.success(!current ? 'Mode maintenance activé' : 'Mode maintenance désactivé')
      load()
    } catch (e: any) { toast.error('Erreur', e.message) }
  }

  async function deleteRestaurant(id: string) {
    try {
      await api.delete(`/api/restaurants/${id}`)
      toast.success('Restaurant supprimé')
      setConfirmDeleteRestaurant(null)
      load()
    } catch (e: any) { toast.error('Erreur', e.message) }
  }

  return (
    <div className="p-8">
      {confirmDeleteRestaurant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4"><span className="text-3xl">🗑️</span></div>
              <h3 className="font-display font-bold text-gray-900 text-xl mb-2">Supprimer ce restaurant ?</h3>
              <p className="text-gray-500 text-sm"><strong className="text-gray-900">{confirmDeleteRestaurant.name}</strong> sera supprimé définitivement avec toutes ses données.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteRestaurant(null)} className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50">Annuler</button>
              <button onClick={() => deleteRestaurant(confirmDeleteRestaurant.id)} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700">Supprimer définitivement</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display font-bold text-gray-900 text-xl">Restaurants ({restaurants.length})</h2>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-600 transition-colors shadow-sm shadow-brand/30">
          + Ajouter un restaurant
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <h3 className="font-display font-bold text-gray-900 mb-4">Nouveau restaurant</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[
              { key:'name', label:'Nom', placeholder:'Omegasen Paris' },
              { key:'slug', label:'Slug (URL)', placeholder:'omegasen-paris' },
              { key:'address', label:'Adresse', placeholder:'12 rue de la Paix, Paris' },
              { key:'phone', label:'Téléphone', placeholder:'+33 1 23 45 67 89' },
              { key:'email', label:'Email', placeholder:'contact@restaurant.com' },
            ].map(field => (
              <div key={field.key} className={field.key==='address'?'col-span-2':''}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                <input value={(form as any)[field.key]} onChange={e => setForm(f => ({...f,[field.key]:e.target.value}))}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-brand"/>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={createRestaurant} disabled={saving} className="px-6 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-600 disabled:opacity-60">
              {saving ? 'Création...' : 'Créer'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-6 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">
              Annuler
            </button>
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin"/></div> : (
        <div className="grid grid-cols-2 gap-4">
          {restaurants.map((r: any) => (
            <div key={r.id??r.restaurantId} className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-display font-bold text-gray-900 text-lg">{r.name}</h3>
                  {r.address && <p className="text-sm text-gray-400 mt-0.5">📍 {r.address}</p>}
                  {r.slug && <p className="text-xs text-gray-400 font-mono mt-1">/{r.slug}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {r.isActive !== false ? (
                    <span className="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1 rounded-full font-medium">Actif</span>
                  ) : (
                    <span className="bg-red-50 text-red-700 text-xs px-2.5 py-1 rounded-full font-medium">Inactif</span>
                  )}
                  {r.maintenanceMode && <span className="bg-amber-50 text-amber-700 text-xs px-2.5 py-1 rounded-full font-medium">Maintenance</span>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400">CA (30j)</p>
                  <p className="font-bold text-gray-900">{fmtEUR(r.revenue??0)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400">Commandes</p>
                  <p className="font-bold text-gray-900">{r.orderCount??0}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleMaintenance(r.id??r.restaurantId, r.maintenanceMode)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${r.maintenanceMode?'bg-emerald-50 text-emerald-700 hover:bg-emerald-100':'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
                  {r.maintenanceMode ? '✓ Rouvrir' : '⚙ Maintenance'}
                </button>
                <a href={`/kiosk?restaurant=${r.slug??r.id}`} target="_blank" rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-teal/10 text-teal hover:bg-teal/20 transition-colors">
                  Borne →
                </a>
                <button onClick={() => setConfirmDeleteRestaurant({id:r.id??r.restaurantId,name:r.name})}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                  🗑
                </button>
              </div>
            </div>
          ))}
          {restaurants.length===0&&<div className="col-span-2 bg-white rounded-2xl border border-gray-100 py-16 text-center"><p className="text-4xl mb-3">🏪</p><p className="text-gray-400">Aucun restaurant</p></div>}
        </div>
      )}
    </div>
  )
}

function Users() {
  const [users, setUsers] = useState<any[]>([])
  const [restaurants, setRestaurants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', password:'', role:'MANAGER' as any, restaurantIds:[] as string[] })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [u, a] = await Promise.all([
        api.get<any[]>('/api/users'),
        api.get<any>(`/api/analytics?from=${new Date(Date.now()-30*86400000).toISOString()}&to=${new Date().toISOString()}`),
      ])
      setUsers(Array.isArray(u) ? u : [])
      setRestaurants(a?.restaurantStats ?? [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function createUser() {
    if (!form.firstName || !form.email || !form.password) { toast.error('Champs requis'); return }
    setSaving(true)
    try {
      await api.post('/api/users', form)
      toast.success('Utilisateur créé')
      setShowForm(false)
      setForm({ firstName:'', lastName:'', email:'', password:'', role:'MANAGER', restaurantIds:[] })
      load()
    } catch (e: any) { toast.error('Erreur', e.message) }
    setSaving(false)
  }

  const [confirmDeleteUser, setConfirmDeleteUser] = useState<{id:string;name:string}|null>(null)

  async function deleteUser(id: string) {
    try {
      await api.delete(`/api/users/${id}`)
      toast.success('Utilisateur supprimé')
      setConfirmDeleteUser(null)
      load()
    } catch (e: any) { toast.error('Erreur', e.message) }
  }

  function exportUsers() {
    exportCSV(users.map(u => ({
      Prénom: u.firstName, Nom: u.lastName, Email: u.email, Rôle: u.role,
      Actif: u.isActive ? 'Oui' : 'Non',
      'Dernière connexion': u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'Jamais',
      'Créé le': fmtDateTime(u.createdAt),
    })), `omegasen-users-${new Date().toISOString().slice(0,10)}.csv`)
  }

  const filtered = users.filter(u =>
    (roleFilter === 'ALL' || u.role === roleFilter) &&
    (!search || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase()))
  )

  // Auto-assign role permissions
  const ROLE_PERMISSIONS: Record<string, string[]> = {
    CEO: ['Accès total à toutes les interfaces et tous les restaurants'],
    MANAGER: ['Dashboard gérant', 'Gestion des commandes', 'Gestion du menu'],
    KITCHEN: ['Interface cuisine uniquement'],
    KIOSK: ['Borne client uniquement'],
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display font-bold text-gray-900 text-xl">Utilisateurs ({users.length})</h2>
        <div className="flex items-center gap-3">
          <button onClick={exportUsers} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
            📥 Exporter CSV
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-600 shadow-sm shadow-brand/30">
            + Ajouter un utilisateur
          </button>
        </div>
      </div>

      {/* Role permissions info */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-6">
        <h3 className="font-display font-bold text-blue-900 mb-3">🔐 Droits automatiques par rôle</h3>
        <div className="grid grid-cols-4 gap-3">
          {ROLES.map(role => (
            <div key={role} className="bg-white rounded-xl p-3">
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${ROLE_COLOR[role]}`}>{role}</span>
              <ul className="mt-2 space-y-1">
                {ROLE_PERMISSIONS[role].map(p => <li key={p} className="text-xs text-gray-500">· {p}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <h3 className="font-display font-bold text-gray-900 mb-4">Nouvel utilisateur</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[
              { key:'firstName', label:'Prénom', type:'text', placeholder:'Moustapha' },
              { key:'lastName',  label:'Nom',    type:'text', placeholder:'Kebe' },
              { key:'email',    label:'Email',   type:'email', placeholder:'m.kebe@omegasen.com' },
              { key:'password', label:'Mot de passe', type:'password', placeholder:'••••••••' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                <input type={f.type} value={(form as any)[f.key]} onChange={e => setForm(x => ({...x,[f.key]:e.target.value}))}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-brand"/>
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
              <select value={form.role} onChange={e => setForm(f => ({...f,role:e.target.value as any}))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-brand">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">{ROLE_PERMISSIONS[form.role]?.[0]}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Restaurants (optionnel)</label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {restaurants.map((r: any) => (
                  <label key={r.id??r.restaurantId} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.restaurantIds.includes(r.id??r.restaurantId)}
                      onChange={e => {
                        const id = r.id??r.restaurantId
                        setForm(f => ({ ...f, restaurantIds: e.target.checked ? [...f.restaurantIds,id] : f.restaurantIds.filter(x=>x!==id) }))
                      }} className="rounded"/>
                    <span className="text-sm text-gray-700">{r.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={createUser} disabled={saving} className="px-6 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-600 disabled:opacity-60">
              {saving ? 'Création...' : 'Créer'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-6 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">Annuler</button>
          </div>
        </div>
      )}

      {confirmDeleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4"><span className="text-3xl">👤</span></div>
              <h3 className="font-display font-bold text-gray-900 text-xl mb-2">Supprimer cet utilisateur ?</h3>
              <p className="text-gray-500 text-sm"><strong className="text-gray-900">{confirmDeleteUser.name}</strong> sera supprimé et ne pourra plus se connecter.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteUser(null)} className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50">Annuler</button>
              <button onClick={() => deleteUser(confirmDeleteUser.id)} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700">Supprimer</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-brand w-64"/>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-brand">
          <option value="ALL">Tous les rôles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {loading ? <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead><tr className="bg-gray-50">
              {['Utilisateur','Rôle','Restaurants','Dernière connexion','Statut',''].map(h => (
                <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-brand">{u.firstName?.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{u.firstName} {u.lastName}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ROLE_COLOR[u.role]??'bg-gray-100 text-gray-600'}`}>{u.role}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(u.restaurants??[]).slice(0,2).map((r: any) => (
                        <span key={r.restaurantId} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{r.restaurant?.name??'—'}</span>
                      ))}
                      {(u.restaurants??[]).length > 2 && <span className="text-xs text-gray-400">+{u.restaurants.length-2}</span>}
                      {(u.restaurants??[]).length === 0 && <span className="text-xs text-gray-400">Tous (CEO)</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : <span className="text-gray-300">Jamais</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${u.isActive?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700'}`}>
                      {u.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => setConfirmDeleteUser({id:u.id,name:`${u.firstName} ${u.lastName}`})}
                      className="text-gray-300 hover:text-red-500 transition-colors text-lg font-bold w-8 h-8 flex items-center justify-center hover:bg-red-50 rounded-lg">
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length===0&&<tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">Aucun utilisateur trouvé</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Orders() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const SL: Record<string,string> = { PENDING:'En attente',CONFIRMED:'Confirmée',PREPARING:'En préparation',READY:'Prête',SERVED:'Servie',CANCELLED:'Annulée',ARCHIVED:'Archivée' }
  const SC: Record<string,string> = { PENDING:'bg-amber-100 text-amber-800',CONFIRMED:'bg-blue-100 text-blue-800',PREPARING:'bg-purple-100 text-purple-800',READY:'bg-emerald-100 text-emerald-800',SERVED:'bg-gray-100 text-gray-600',CANCELLED:'bg-red-100 text-red-700',ARCHIVED:'bg-gray-50 text-gray-400' }

  useEffect(() => {
    setLoading(true)
    api.get<any>('/api/orders?pageSize=100')
      .then(d => setOrders(d?.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function exportOrders() {
    exportCSV(orders.map(o => ({
      Numéro: o.orderNumber, Statut: SL[o.status]??o.status,
      Total_EUR: (Number(o.total)/100).toFixed(2),
      Articles: o.items?.length??0,
      Date: fmtDateTime(o.createdAt),
    })), `omegasen-commandes-${new Date().toISOString().slice(0,10)}.csv`)
  }

  const filtered = orders.filter(o =>
    (statusFilter==='ALL'||o.status===statusFilter) &&
    (!search||o.orderNumber.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display font-bold text-gray-900 text-xl">Toutes les commandes</h2>
        <button onClick={exportOrders} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
          📥 Exporter CSV
        </button>
      </div>
      {confirmDeleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4"><span className="text-3xl">👤</span></div>
              <h3 className="font-display font-bold text-gray-900 text-xl mb-2">Supprimer cet utilisateur ?</h3>
              <p className="text-gray-500 text-sm"><strong className="text-gray-900">{confirmDeleteUser.name}</strong> sera supprimé et ne pourra plus se connecter.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteUser(null)} className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50">Annuler</button>
              <button onClick={() => deleteUser(confirmDeleteUser.id)} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700">Supprimer</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="N° commande..." className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-brand w-64"/>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-brand">
          <option value="ALL">Tous</option>
          {Object.entries(SL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {loading?<div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin"/></div>:(
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead><tr className="bg-gray-50">
              {['Numéro','Statut','Total','Articles','Date'].map(h=><th key={h} className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((o:any)=>(
                <tr key={o.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-mono-num font-bold text-gray-900">{o.orderNumber}</td>
                  <td className="px-6 py-4"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${SC[o.status]??''}`}>{SL[o.status]??o.status}</span></td>
                  <td className="px-6 py-4 font-bold text-gray-900">{fmtEUR(Number(o.total))}</td>
                  <td className="px-6 py-4 text-gray-600">{o.items?.length??0} art.</td>
                  <td className="px-6 py-4 text-gray-500 text-sm">{fmtDateTime(o.createdAt)}</td>
                </tr>
              ))}
              {filtered.length===0&&<tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">Aucune commande</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const user = useAuth(s => s.user)
  const [tab, setTab] = useState('dashboard')
  const [period, setPeriod] = useState(30)

  const CONTENT: Record<string, React.ReactNode> = {
    dashboard:   <Dashboard period={period} setPeriod={setPeriod} />,
    restaurants: <Restaurants />,
    users:       <Users />,
    orders:      <Orders />,
  }

  const TAB_LABELS: Record<string, string> = {
    dashboard: 'Dashboard', restaurants: 'Restaurants', users: 'Utilisateurs', orders: 'Commandes',
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar active={tab} onNav={setTab} subtitle="CEO"
        items={[
          { id:'dashboard',   label:'Dashboard',    icon:'📊' },
          { id:'restaurants', label:'Restaurants',  icon:'🏪' },
          { id:'users',       label:'Utilisateurs', icon:'👥' },
          { id:'orders',      label:'Commandes',    icon:'🛒' },
        ]} />
      <main className="ml-60 flex-1">
        <header className="sticky top-0 z-20 bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-display font-bold text-gray-900">{TAB_LABELS[tab]}</h1>
            <p className="text-xs text-gray-400">{user?.firstName} {user?.lastName} · CEO</p>
          </div>
        </header>
        {CONTENT[tab]}
      </main>
    </div>
  )
}
