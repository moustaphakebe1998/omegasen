import { useAuth } from '../../store/auth'
import { api } from '../../lib/api'

interface NavItem { id: string; label: string; icon: string; badge?: number }
interface Props { active: string; onNav: (id: string) => void; items: NavItem[]; subtitle?: string }

export function Sidebar({ active, onNav, items, subtitle }: Props) {
  const { user, logout } = useAuth()

  async function handleLogout() {
    try { await api.post('/api/auth/logout', {}) } catch {}
    logout(); window.location.href = '/login'
  }

  return (
    <aside className="w-60 bg-white border-r border-gray-100 fixed inset-y-0 left-0 flex flex-col z-30">
      <div className="p-5 border-b border-gray-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-lg font-display">O</span>
          </div>
          <div>
            <p className="font-display font-bold text-gray-900 text-sm">Omegasen</p>
            {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
          </div>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {items.map(item => (
          <button key={item.id} onClick={() => onNav(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              active === item.id ? 'bg-brand text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
            }`}>
            <span className="text-base">{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.badge != null && item.badge > 0 && (
              <span className={`text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center ${active === item.id ? 'bg-white/20 text-white' : 'bg-brand text-white'}`}>
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-50">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center">
            <span className="text-xs font-bold text-brand">{user?.firstName?.charAt(0)}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-gray-400">{user?.role}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all">
          🚪 Déconnexion
        </button>
      </div>
    </aside>
  )
}
