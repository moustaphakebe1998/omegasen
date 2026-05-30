import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

type TType = 'success' | 'error' | 'info' | 'warning'
interface T { id: string; type: TType; title: string; msg?: string }
const ls: ((t: T) => void)[] = []

export const toast = {
  success: (title: string, msg?: string) => ls.forEach(l => l({ id: Math.random().toString(36).slice(2), type: 'success', title, msg })),
  error:   (title: string, msg?: string) => ls.forEach(l => l({ id: Math.random().toString(36).slice(2), type: 'error',   title, msg })),
  info:    (title: string, msg?: string) => ls.forEach(l => l({ id: Math.random().toString(36).slice(2), type: 'info',    title, msg })),
  warning: (title: string, msg?: string) => ls.forEach(l => l({ id: Math.random().toString(36).slice(2), type: 'warning', title, msg })),
}

const C: Record<TType, string> = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error:   'bg-red-50 border-red-200 text-red-800',
  info:    'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<T[]>([])
  const rm = useCallback((id: string) => setToasts(p => p.filter(t => t.id !== id)), [])
  useEffect(() => {
    const h = (t: T) => setToasts(p => [...p.slice(-3), t])
    ls.push(h); return () => { const i = ls.indexOf(h); if (i > -1) ls.splice(i, 1) }
  }, [])
  if (typeof window === 'undefined') return null
  return createPortal(
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 items-end">
      {toasts.map(t => {
        setTimeout(() => rm(t.id), 4000)
        return (
          <div key={t.id} className={`animate-slide-up flex gap-3 p-4 rounded-xl border shadow-lg max-w-xs w-full ${C[t.type]}`}>
            <div className="flex-1"><p className="font-semibold text-sm">{t.title}</p>{t.msg && <p className="text-xs opacity-75 mt-0.5">{t.msg}</p>}</div>
            <button onClick={() => rm(t.id)} className="opacity-50 hover:opacity-100 text-lg">×</button>
          </div>
        )
      })}
    </div>,
    document.body
  )
}
