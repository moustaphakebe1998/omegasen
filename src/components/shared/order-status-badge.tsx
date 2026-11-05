'use client'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  DRAFT:     { label: 'Brouillon',       color: 'bg-gray-100 text-gray-600 border-gray-200' },
  PENDING:   { label: 'En attente',      color: 'bg-amber-50 text-amber-700 border-amber-200' },
  CONFIRMED: { label: 'Confirmée',       color: 'bg-blue-50 text-blue-700 border-blue-200' },
  PREPARING: { label: 'En préparation',  color: 'bg-purple-50 text-purple-700 border-purple-200' },
  READY:     { label: 'Prête',           color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  SERVED:    { label: 'Servie',          color: 'bg-gray-50 text-gray-600 border-gray-200' },
  CANCELLED: { label: 'Annulée',         color: 'bg-red-50 text-red-700 border-red-200' },
  ARCHIVED:  { label: 'Archivée',        color: 'bg-gray-50 text-gray-500 border-gray-200' },
}

export function OrderStatusBadge({ status, size = 'md' }: { status: string; size?: 'sm'|'md'|'lg' }) {
  const config = STATUS_CONFIG[status] ?? { label: status, color: 'bg-gray-100 text-gray-600 border-gray-200' }
  const sizes = { sm: 'px-2 py-0.5 text-xs', md: 'px-2.5 py-1 text-sm', lg: 'px-3 py-1.5 text-base' }
  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${sizes[size]} ${config.color}`}>
      {config.label}
    </span>
  )
}
