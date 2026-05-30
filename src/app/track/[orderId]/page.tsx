'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const STEPS = [
  { status: 'PENDING', label: 'Commande reçue' },
  { status: 'CONFIRMED', label: 'Confirmée' },
  { status: 'PREPARING', label: 'En préparation' },
  { status: 'READY', label: '🎉 Prête !' },
  { status: 'SERVED', label: 'Servie' },
]

const STATUS_IDX: Record<string,number> = { PENDING:0, CONFIRMED:1, PREPARING:2, READY:3, SERVED:4 }

export default function TrackPage() {
  const { orderId } = useParams() as { orderId: string }
  const [status, setStatus] = useState('PENDING')
  const [orderNumber, setOrderNumber] = useState('')

  useEffect(()=>{
    async function fetch_() {
      const res = await fetch(`/api/orders/${orderId}/track`)
      const d = await res.json()
      if(d.data){ setStatus(d.data.status); setOrderNumber(d.data.orderNumber) }
    }
    fetch_()
    const t = setInterval(fetch_, 10_000)
    return ()=>clearInterval(t)
  },[orderId])

  const current = STATUS_IDX[status]??0

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8">
      <p className="text-gray-400 mb-2 text-sm">Numéro de commande</p>
      <p className="text-6xl font-black font-mono text-white mb-12">{orderNumber||'...'}</p>
      {status==='READY'&&<div className="bg-green-500 text-white px-8 py-3 rounded-2xl text-xl font-bold mb-12 animate-bounce">🎉 Votre commande est prête !</div>}
      <div className="w-full max-w-md space-y-4">
        {STEPS.map((step,i)=>(
          <div key={step.status} className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${i<current?'bg-green-500':i===current?'bg-orange-500':'bg-gray-800'}`}>
              {i<current?'✓':i+1}
            </div>
            <p className={`font-semibold ${i===current?'text-white':i<current?'text-green-400':'text-gray-600'}`}>{step.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
