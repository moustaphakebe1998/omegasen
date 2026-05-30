import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../store/auth'

export default function Login() {
  const nav = useNavigate()
  const setUser = useAuth(s => s.setUser)
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [show, setShow] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const user = await api.post<any>('/api/auth/login', { email, password: pass })
      setUser(user)
      if (user.role === 'CEO') nav('/admin')
      else if (user.role === 'MANAGER') nav('/manager')
      else if (user.role === 'KITCHEN') nav('/kitchen')
      else nav('/')
    } catch (err: any) { setError(err.message ?? 'Erreur de connexion') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal to-teal-light flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 overflow-hidden opacity-10">
        {['🍽️','🔥','🥘','🥤','🍖'].map((e, i) => (
          <div key={i} className="absolute text-8xl" style={{ left: `${i*22}%`, top: `${20 + (i%2)*40}%` }}>{e}</div>
        ))}
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex w-20 h-20 rounded-[24px] bg-coral shadow-2xl shadow-coral/40 items-center justify-center mb-4">
            <span className="text-white font-display font-black text-4xl">O</span>
          </div>
          <h1 className="font-display font-bold text-white text-3xl">Omegasen</h1>
          <p className="text-white/50 mt-1">Connectez-vous à votre espace</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
                placeholder="votre@email.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Mot de passe</label>
              <div className="relative">
                <input type={show ? 'text' : 'password'} value={pass} onChange={e => setPass(e.target.value)} required
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all pr-20" />
                <button type="button" onClick={() => setShow(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-brand font-medium">
                  {show ? 'Masquer' : 'Afficher'}
                </button>
              </div>
            </div>
            {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl">⚠️ {error}</div>}
            <button type="submit" disabled={loading}
              className="w-full bg-brand text-white py-3.5 rounded-xl font-display font-bold hover:bg-brand-600 transition-all disabled:opacity-60 shadow-md shadow-brand/30 mt-2">
              {loading ? <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Connexion...
              </span> : 'Se connecter'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
