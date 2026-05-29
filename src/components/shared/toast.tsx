'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

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

const ICONS: Record<ToastType, React.ElementType> = {
  success: CheckCircle,
  error:   AlertCircle,
  info:    Info,
  warning: AlertTriangle,
}

const STYLES: Record<ToastType, string> = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error:   'bg-red-50 border-red-200 text-red-800',
  info:    'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
}

const ICON_STYLES: Record<ToastType, string> = {
  success: 'text-emerald-500',
  error:   'text-red-500',
  info:    'text-blue-500',
  warning: 'text-amber-500',
}

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const Icon = ICONS[t.type]

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(t.id), t.duration ?? 4000)
    return () => clearTimeout(timer)
  }, [t.id, t.duration, onDismiss])

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border shadow-lg max-w-sm w-full animate-slide-up',
        STYLES[t.type]
      )}
      role="alert"
    >
      <Icon className={cn('w-5 h-5 shrink-0 mt-0.5', ICON_STYLES[t.type])} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-tight">{t.title}</p>
        {t.message && <p className="text-xs mt-1 opacity-80">{t.message}</p>}
      </div>
      <button
        onClick={() => onDismiss(t.id)}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Fermer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    const handler: ToastListener = (t) => {
      setToasts(prev => [...prev.slice(-4), t]) // max 5 toasts
    }
    listeners.push(handler)
    return () => {
      const idx = listeners.indexOf(handler)
      if (idx > -1) listeners.splice(idx, 1)
    }
  }, [])

  if (typeof window === 'undefined') return null

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 items-end pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>,
    document.body
  )
}
