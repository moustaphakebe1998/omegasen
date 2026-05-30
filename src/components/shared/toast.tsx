'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

export type ToastType = 'success' | 'error' | 'info' | 'warning'
export interface Toast { id: string; type: ToastType; title: string; message?: string; duration?: number }

type ToastListener = (toast: Toast) => void
const listeners: ToastListener[] = []

function emit(toast: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36).slice(2)
  listeners.forEach(l => l({ ...toast, id }))
}

export const toast = {
  success: (title: string, message?: string) => emit({ type: 'success', title, message, duration: 4000 }),
  error:   (title: string, message?: string) => emit({ type: 'error',   title, message, duration: 6000 }),
  info:    (title: string, message?: string) => emit({ type: 'info',    title, message, duration: 4000 }),
  warning: (title: string, message?: string) => emit({ type: 'warning', title, message, duration: 5000 }),
}

const COLORS: Record<ToastType,string> = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error:   'bg-red-50 border-red-200 text-red-800',
  info:    'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
}

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(t.id), t.duration ?? 4000)
    return () => clearTimeout(timer)
  }, [t.id, t.duration, onDismiss])

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border shadow-lg max-w-sm w-full ${COLORS[t.type]}`} role="alert">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{t.title}</p>
        {t.message && <p className="text-xs mt-1 opacity-80">{t.message}</p>}
      </div>
      <button onClick={() => onDismiss(t.id)} className="opacity-60 hover:opacity-100 text-lg leading-none">×</button>
    </div>
  )
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), [])

  useEffect(() => {
    const handler: ToastListener = (t) => setToasts(prev => [...prev.slice(-4), t])
    listeners.push(handler)
    return () => { const i = listeners.indexOf(handler); if (i > -1) listeners.splice(i, 1) }
  }, [])

  if (typeof window === 'undefined') return null

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 items-end pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto animate-slide-up">
          <ToastItem t={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>,
    document.body
  )
}
