'use client'

import { OrderStatus } from '@prisma/client'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; dot: string }> = {
  DRAFT:     { label: 'Brouillon',    color: 'bg-gray-100 text-gray-600 border-gray-200',       dot: 'bg-gray-400' },
  PENDING:   { label: 'En attente',   color: 'bg-amber-50 text-amber-700 border-amber-200',      dot: 'bg-amber-500' },
  CONFIRMED: { label: 'Confirmée',    color: 'bg-blue-50 text-blue-700 border-blue-200',         dot: 'bg-blue-500' },
  PREPARING: { label: 'En préparation', color: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  READY:     { label: 'Prête',        color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  SERVED:    { label: 'Servie',       color: 'bg-gray-50 text-gray-600 border-gray-200',         dot: 'bg-gray-400' },
  CANCELLED: { label: 'Annulée',      color: 'bg-red-50 text-red-700 border-red-200',            dot: 'bg-red-500' },
  ARCHIVED:  { label: 'Archivée',     color: 'bg-gray-50 text-gray-500 border-gray-200',         dot: 'bg-gray-300' },
}

interface OrderStatusBadgeProps {
  status: OrderStatus
  size?: 'sm' | 'md' | 'lg'
  showDot?: boolean
  className?: string
}

export function OrderStatusBadge({
  status,
  size = 'md',
  showDot = true,
  className,
}: OrderStatusBadgeProps) {
  const config = STATUS_CONFIG[status]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' && 'px-2 py-0.5 text-xs',
        size === 'md' && 'px-2.5 py-1 text-sm',
        size === 'lg' && 'px-3 py-1.5 text-base',
        config.color,
        className
      )}
    >
      {showDot && (
        <span className={cn('rounded-full shrink-0', config.dot,
          size === 'sm' && 'w-1.5 h-1.5',
          size === 'md' && 'w-2 h-2',
          size === 'lg' && 'w-2.5 h-2.5',
        )} />
      )}
      {config.label}
    </span>
  )
}
