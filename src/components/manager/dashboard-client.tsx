'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, UtensilsCrossed, ShoppingBag, Settings,
  LogOut, Plus, Edit2, Eye, EyeOff, AlertTriangle, CheckCircle,
  Clock, TrendingUp, Users, ChevronRight, RefreshCw, Search,
  Filter, MoreVertical, Package, X, Save, Toggle
} from 'lucide-react'
import { formatPrice, formatDateTime, cn } from '@/lib/utils'
import { OrderStatusBadge } from '@/components/shared/order-status-badge'
import { useSSE } from '@/hooks/use-sse'
import { toast } from '@/components/shared/toast'
import type { AuthUser } from '@/types'

type Tab = 'orders' | 'menu' | 'settings'

interface ManagerDashboardClientProps {
  user: AuthUser
  restaurant: {
    id: string
    name: string
    slug: string
    isOpen: boolean
    maintenanceMode: boolean
    address: string | null
    phone: string | null
    openingHours: Array<{ dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }>
  }
  orderStats: Array<{ status: string; _count: { id: number }; _sum: { total: number | null } }>
  recentOrders: Array<{
    id: string
    orderNumber: string
    status: string
    total: number
    createdAt: Date
    notes: string | null
    items: Array<{ id: string; quantity: number; product: { name: string } }>
    statusHistory: Array<{ createdAt: Date }>
  }>
  products: Array<{
    id: string
    name: string
    price: number
    isAvailable: boolean
    isHidden: boolean
    category: { name: string; sortOrder: number }
    description: string | null
    imageUrl: string | null
  }>
}

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente', CONFIRMED: 'Confirmée', PREPARING: 'En préparation',
  READY: 'Prête', SERVED: 'Servie', CANCELLED: 'Annulée',
}

export function ManagerDashboardClient({
  user, restaurant, orderStats, recentOrders, products
}: ManagerDashboardClientProps) {
  const [tab, setTab] = useState<Tab>('orders')
  const [orders, setOrders] = useState(recentOrders)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [selectedOrder, setSelectedOrder] = useState<typeof recentOrders[0] | null>(null)
  const [isOpen, setIsOpen] = useState(restaurant.isOpen)
  const [maintenanceMode, setMaintenanceMode] = useState(restaurant.maintenanceMode)
  const [updatingSettings, setUpdatingSettings] = useState(false)

  useSSE(`/api/sse?restaurantId=${restaurant.id}`, {
    onEvent: useCallback((event: { type: string; data: unknown }) => {
      if (event.type === 'order:new' || event.type === 'order:update') {
        // Refetch orders on SSE event
        fetch(`/api/orders?restaurantId=${restaurant.id}&limit=50`)
          .then(r => r.json())
          .then(data => { if (data.data) setOrders(data.data.items) })
          .catch(() => {})
        if (event.type === 'order:new') {
          toast.info('Nouvelle commande', 'Une nouvelle commande vient d\'arriver')
        }
      }
    }, [restaurant.id]),
  })

  // KPI compute
  const todayTotal = orderStats.reduce((sum, s) =>
    s.status !== 'CANCELLED' && s.status !== 'DRAFT' ? sum + (s._sum.total ?? 0) : sum, 0)
  const todayCount = orderStats.reduce((sum, s) =>
    s.status !== 'CANCELLED' && s.status !== 'DRAFT' ? sum + s._count.id : sum, 0)
  const cancelCount = orderStats.find(s => s.status === 'CANCELLED')?._count.id ?? 0
  const avgTicket = todayCount > 0 ? todayTotal / todayCount : 0
  const activeCount = orders.filter(o => ['PENDING','CONFIRMED','PREPARING','READY'].includes(o.status)).length

  // Filter orders
  const filtered = orders.filter(o => {
    const matchSearch = search === '' ||
      o.orderNumber.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'ALL' || o.status === statusFilter
    return matchSearch && matchStatus
  })

  async function updateOrderStatus(orderId: string, status: string) {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o))
      setSelectedOrder(prev => prev?.id === orderId ? { ...prev, status } : prev)
      toast.success('Statut mis à jour')
    } catch {
      toast.error('Erreur', 'Impossible de mettre à jour le statut')
    }
  }

  async function toggleAvailability(productId: string, current: boolean) {
    try {
      await fetch(`/api/menu/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: !current }),
      })
      toast.success(!current ? 'Produit disponible' : 'Produit indisponible')
    } catch {
      toast.error('Erreur lors de la mise à jour')
    }
  }

  async function saveSettings() {
    setUpdatingSettings(true)
    try {
      await fetch(`/api/restaurants/${restaurant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOpen, maintenanceMode }),
      })
      toast.success('Paramètres sauvegardés')
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setUpdatingSettings(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-surface-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-surface-200 flex flex-col fixed inset-y-0 left-0 z-30">
        <div className="p-6 border-b border-surface-100">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
              <span className="text-white font-bold text-sm">O</span>
            </div>
            <div>
              <p className="font-bold text-surface-900 text-sm leading-tight">Omegasen</p>
              <p className="text-xs text-surface-400">Gérant</p>
            </div>
          </div>
          <p className="text-xs font-medium text-surface-600 mt-3 truncate">{restaurant.name}</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {([
            { id: 'orders', label: 'Commandes', icon: ShoppingBag, badge: activeCount },
            { id: 'menu', label: 'Menu', icon: UtensilsCrossed, badge: null },
            { id: 'settings', label: 'Paramètres', icon: Settings, badge: null },
          ] as const).map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                tab === item.id
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-surface-600 hover:bg-surface-50 hover:text-surface-900'
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
              {item.badge != null && item.badge > 0 && (
                <span className={cn(
                  'ml-auto text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center',
                  tab === item.id ? 'bg-white/20 text-white' : 'bg-brand text-white'
                )}>
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-surface-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-surface-100 flex items-center justify-center">
              <span className="text-xs font-bold text-surface-600">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-surface-900 truncate">{user.name}</p>
              <p className="text-xs text-surface-400">{user.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-surface-500 hover:text-red-600 hover:bg-red-50 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-64 flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-white border-b border-surface-200 px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-surface-900">
                {tab === 'orders' ? 'Commandes' : tab === 'menu' ? 'Menu' : 'Paramètres'}
              </h1>
              <p className="text-sm text-surface-400">{restaurant.name}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn(
                'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border',
                isOpen
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              )}>
                <span className={cn('w-2 h-2 rounded-full', isOpen ? 'bg-emerald-500' : 'bg-red-500')} />
                {isOpen ? 'Ouvert' : 'Fermé'}
              </span>
            </div>
          </div>
        </header>

        <div className="flex-1 p-8">
          {/* KPI Row — always visible */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[
              { label: "CA aujourd'hui", value: formatPrice(todayTotal), icon: TrendingUp, color: 'brand' },
              { label: 'Commandes', value: todayCount.toString(), icon: ShoppingBag, color: 'blue' },
              { label: 'Ticket moyen', value: formatPrice(avgTicket), icon: Package, color: 'purple' },
              { label: 'Annulations', value: cancelCount.toString(), icon: AlertTriangle, color: 'red' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-xl border border-surface-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-surface-500">{kpi.label}</span>
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    kpi.color === 'brand' && 'bg-brand/10',
                    kpi.color === 'blue' && 'bg-blue-50',
                    kpi.color === 'purple' && 'bg-purple-50',
                    kpi.color === 'red' && 'bg-red-50',
                  )}>
                    <kpi.icon className={cn(
                      'w-4 h-4',
                      kpi.color === 'brand' && 'text-brand',
                      kpi.color === 'blue' && 'text-blue-500',
                      kpi.color === 'purple' && 'text-purple-500',
                      kpi.color === 'red' && 'text-red-500',
                    )} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-surface-900">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* ORDERS TAB */}
          {tab === 'orders' && (
            <div className="flex gap-6">
              {/* List */}
              <div className="flex-1 min-w-0">
                {/* Filters */}
                <div className="flex gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                    <input
                      type="text"
                      placeholder="Rechercher une commande..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-2.5 rounded-lg border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-white"
                  >
                    <option value="ALL">Tous les statuts</option>
                    {Object.entries(ORDER_STATUS_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3">
                  {filtered.length === 0 && (
                    <div className="bg-white rounded-xl border border-surface-200 py-16 text-center">
                      <ShoppingBag className="w-10 h-10 text-surface-300 mx-auto mb-3" />
                      <p className="text-surface-400">Aucune commande trouvée</p>
                    </div>
                  )}
                  {filtered.map(order => (
                    <button
                      key={order.id}
                      onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}
                      className={cn(
                        'w-full bg-white rounded-xl border text-left p-4 transition-all hover:shadow-sm',
                        selectedOrder?.id === order.id
                          ? 'border-brand ring-1 ring-brand/30'
                          : 'border-surface-200'
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-sm text-surface-900">{order.orderNumber}</span>
                          <OrderStatusBadge status={order.status as never} size="sm" />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-surface-900">{formatPrice(order.total)}</span>
                          <ChevronRight className={cn(
                            'w-4 h-4 text-surface-400 transition-transform',
                            selectedOrder?.id === order.id && 'rotate-90'
                          )} />
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-surface-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDateTime(order.createdAt)}
                        </span>
                        <span>{order.items.length} article{order.items.length > 1 ? 's' : ''}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Detail panel */}
              {selectedOrder && (
                <div className="w-80 shrink-0">
                  <div className="bg-white rounded-xl border border-surface-200 sticky top-24 overflow-hidden">
                    <div className="p-4 border-b border-surface-100 flex items-center justify-between">
                      <div>
                        <p className="font-mono font-bold text-surface-900">{selectedOrder.orderNumber}</p>
                        <OrderStatusBadge status={selectedOrder.status as never} size="sm" className="mt-1" />
                      </div>
                      <button
                        onClick={() => setSelectedOrder(null)}
                        className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-4">
                      <h3 className="text-xs font-semibold text-surface-400 uppercase mb-3">Articles</h3>
                      <div className="space-y-2 mb-4">
                        {selectedOrder.items.map(item => (
                          <div key={item.id} className="flex justify-between text-sm">
                            <span className="text-surface-700">
                              {item.quantity}× {item.product.name}
                            </span>
                          </div>
                        ))}
                      </div>
                      {selectedOrder.notes && (
                        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4">
                          <p className="text-xs font-semibold text-amber-700 mb-1">Note</p>
                          <p className="text-xs text-amber-700">{selectedOrder.notes}</p>
                        </div>
                      )}
                      <div className="border-t border-surface-100 pt-3 mb-4">
                        <div className="flex justify-between font-bold">
                          <span className="text-surface-700">Total</span>
                          <span className="text-surface-900">{formatPrice(selectedOrder.total)}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <h3 className="text-xs font-semibold text-surface-400 uppercase mb-3">Actions</h3>
                      <div className="space-y-2">
                        {selectedOrder.status === 'PENDING' && (
                          <button
                            onClick={() => updateOrderStatus(selectedOrder.id, 'CONFIRMED')}
                            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors"
                          >
                            Confirmer
                          </button>
                        )}
                        {selectedOrder.status === 'CONFIRMED' && (
                          <button
                            onClick={() => updateOrderStatus(selectedOrder.id, 'PREPARING')}
                            className="w-full bg-purple-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-purple-700 transition-colors"
                          >
                            Démarrer préparation
                          </button>
                        )}
                        {selectedOrder.status === 'READY' && (
                          <button
                            onClick={() => updateOrderStatus(selectedOrder.id, 'SERVED')}
                            className="w-full bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-emerald-700 transition-colors"
                          >
                            Marquer servie
                          </button>
                        )}
                        {!['CANCELLED', 'SERVED', 'ARCHIVED'].includes(selectedOrder.status) && (
                          <button
                            onClick={() => updateOrderStatus(selectedOrder.id, 'CANCELLED')}
                            className="w-full border border-red-200 text-red-600 rounded-lg py-2.5 text-sm font-semibold hover:bg-red-50 transition-colors"
                          >
                            Annuler
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MENU TAB */}
          {tab === 'menu' && (
            <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
              <div className="p-4 border-b border-surface-100 flex items-center justify-between">
                <h2 className="font-semibold text-surface-900">Produits ({products.length})</h2>
                <a
                  href={`/kiosk/${restaurant.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-brand hover:text-brand-600 font-medium"
                >
                  <Eye className="w-4 h-4" />
                  Voir la borne
                </a>
              </div>
              <div className="divide-y divide-surface-100">
                {products.map(product => (
                  <div key={product.id} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-50">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-surface-100 flex items-center justify-center">
                        <UtensilsCrossed className="w-5 h-5 text-surface-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-surface-900 truncate">{product.name}</p>
                        {product.isHidden && (
                          <span className="text-xs bg-surface-100 text-surface-500 px-1.5 py-0.5 rounded">Masqué</span>
                        )}
                        {!product.isAvailable && (
                          <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">Rupture</span>
                        )}
                      </div>
                      <p className="text-sm text-surface-400">{product.category.name}</p>
                    </div>
                    <p className="font-semibold text-surface-900 text-sm">{formatPrice(product.price)}</p>
                    <button
                      onClick={() => toggleAvailability(product.id, product.isAvailable)}
                      className={cn(
                        'p-2 rounded-lg transition-colors',
                        product.isAvailable
                          ? 'text-emerald-600 hover:bg-emerald-50'
                          : 'text-red-500 hover:bg-red-50'
                      )}
                      title={product.isAvailable ? 'Disponible — cliquer pour mettre en rupture' : 'En rupture — cliquer pour remettre disponible'}
                    >
                      {product.isAvailable ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SETTINGS TAB */}
          {tab === 'settings' && (
            <div className="max-w-2xl space-y-6">
              <div className="bg-white rounded-xl border border-surface-200 p-6">
                <h2 className="font-semibold text-surface-900 mb-6">Statut du restaurant</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-surface-100">
                    <div>
                      <p className="font-medium text-surface-900">Restaurant ouvert</p>
                      <p className="text-sm text-surface-400">Les clients peuvent passer des commandes</p>
                    </div>
                    <button
                      onClick={() => setIsOpen(v => !v)}
                      className={cn(
                        'relative w-11 h-6 rounded-full transition-colors',
                        isOpen ? 'bg-emerald-500' : 'bg-surface-300'
                      )}
                    >
                      <span className={cn(
                        'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform',
                        isOpen ? 'translate-x-6' : 'translate-x-1'
                      )} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-surface-900">Mode maintenance</p>
                      <p className="text-sm text-surface-400">Affiche un message de fermeture temporaire</p>
                    </div>
                    <button
                      onClick={() => setMaintenanceMode(v => !v)}
                      className={cn(
                        'relative w-11 h-6 rounded-full transition-colors',
                        maintenanceMode ? 'bg-amber-500' : 'bg-surface-300'
                      )}
                    >
                      <span className={cn(
                        'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform',
                        maintenanceMode ? 'translate-x-6' : 'translate-x-1'
                      )} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-surface-200 p-6">
                <h2 className="font-semibold text-surface-900 mb-4">Horaires d'ouverture</h2>
                <div className="space-y-2">
                  {DAY_NAMES.map((day, idx) => {
                    const hours = restaurant.openingHours.find(h => h.dayOfWeek === idx)
                    return (
                      <div key={day} className="flex items-center justify-between py-2 border-b border-surface-50 last:border-0">
                        <span className="text-sm font-medium text-surface-700 w-28">{day}</span>
                        {hours?.isClosed || !hours ? (
                          <span className="text-sm text-surface-400">Fermé</span>
                        ) : (
                          <span className="text-sm text-surface-700 font-mono">
                            {hours.openTime} – {hours.closeTime}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={saveSettings}
                  disabled={updatingSettings}
                  className="flex items-center gap-2 bg-brand text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-brand-600 transition-colors disabled:opacity-60"
                >
                  {updatingSettings ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Sauvegarder
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
