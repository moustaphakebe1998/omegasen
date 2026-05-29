'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle, Clock, ChefHat, Bell, Package } from 'lucide-react'
import { cn } from '@/lib/utils'

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'SERVED'

const STEPS: Array<{ status: OrderStatus; label: string; icon: React.ElementType; desc: string }> = [
  { status: 'PENDING',   label: 'Commande reçue',      icon: Clock,        desc: 'Votre commande est en attente de confirmation' },
  { status: 'CONFIRMED', label: 'Confirmée',            icon: CheckCircle,  desc: 'Votre commande a été prise en compte' },
  { status: 'PREPARING', label: 'En préparation',       icon: ChefHat,      desc: 'Nos cuisiniers préparent votre commande' },
  { status: 'READY',     label: 'Prête à récupérer',   icon: Bell,         desc: 'Votre commande est prête !' },
  { status: 'SERVED',    label: 'Servie',               icon: Package,      desc: 'Bon appétit !' },
]

const STATUS_INDEX: Record<OrderStatus, number> = {
  PENDING: 0, CONFIRMED: 1, PREPARING: 2, READY: 3, SERVED: 4,
}

export default function OrderTrackingPage() {
  const params = useParams()
  const orderId = params.orderId as string
  const [status, setStatus] = useState<OrderStatus>('PENDING')
  const [orderNumber, setOrderNumber] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch order status
    async function fetchOrder() {
      try {
        const res = await fetch(`/api/orders/${orderId}/track`)
        if (res.ok) {
          const data = await res.json()
          setStatus(data.data.status)
          setOrderNumber(data.data.orderNumber)
        }
      } finally {
        setLoading(false)
      }
    }
    fetchOrder()

    // Poll every 10 seconds for status updates (fallback if SSE unavailable)
    const interval = setInterval(fetchOrder, 10_000)
    return () => clearInterval(interval)
  }, [orderId])

  const currentStep = STATUS_INDEX[status] ?? 0
  const isReady = status === 'READY'

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-white flex flex-col items-center justify-center p-8">
      {/* Order number */}
      <div className={cn(
        'text-center mb-12 transition-all',
        isReady && 'animate-pulse-urgent'
      )}>
        <p className="text-surface-400 text-sm mb-2">Numéro de commande</p>
        <p className="text-5xl font-black text-white font-mono tracking-wider">
          {orderNumber || '—'}
        </p>
        {isReady && (
          <div className="mt-4 bg-emerald-500 text-white px-8 py-3 rounded-2xl text-xl font-bold animate-bounce">
            🎉 Votre commande est prête !
          </div>
        )}
      </div>

      {/* Progress steps */}
      <div className="w-full max-w-lg">
        {STEPS.map((step, idx) => {
          const isActive = idx === currentStep
          const isDone = idx < currentStep
          const Icon = step.icon

          return (
            <div key={step.status} className="flex items-start gap-4 mb-6">
              {/* Icon */}
              <div className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all',
                isDone && 'bg-emerald-500/20 border border-emerald-500',
                isActive && 'bg-brand/20 border border-brand',
                !isDone && !isActive && 'bg-white/5 border border-white/10',
              )}>
                <Icon className={cn(
                  'w-5 h-5',
                  isDone && 'text-emerald-400',
                  isActive && 'text-brand',
                  !isDone && !isActive && 'text-white/30',
                )} />
              </div>

              {/* Text */}
              <div className="pt-2 flex-1">
                <p className={cn(
                  'font-semibold text-lg',
                  isDone && 'text-emerald-400',
                  isActive && 'text-white',
                  !isDone && !isActive && 'text-white/30',
                )}>
                  {step.label}
                </p>
                {isActive && (
                  <p className="text-sm text-surface-400 mt-0.5">{step.desc}</p>
                )}
              </div>

              {/* Connector */}
              {idx < STEPS.length - 1 && (
                <div className={cn(
                  'absolute left-[calc(50%-1px)] w-0.5 h-6 mt-12 ml-[22px]',
                  idx < currentStep ? 'bg-emerald-500' : 'bg-white/10'
                )} style={{ position: 'relative', left: 'unset', width: '2px', height: '20px', marginLeft: '-49px', marginTop: '4px', alignSelf: 'stretch' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Back to start */}
      {status === 'SERVED' && (
        <button
          onClick={() => window.history.back()}
          className="mt-8 bg-brand text-white px-8 py-3 rounded-xl font-semibold hover:bg-brand-600 transition-colors"
        >
          Nouvelle commande
        </button>
      )}
    </div>
  )
}
