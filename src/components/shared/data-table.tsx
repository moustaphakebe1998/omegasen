'use client'

import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  header: string
  sortable?: boolean
  className?: string
  render?: (row: T, index: number) => React.ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  pageSize?: number
  emptyMessage?: string
  className?: string
  onRowClick?: (row: T) => void
}

type SortDir = 'asc' | 'desc' | null

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyExtractor,
  pageSize = 20,
  emptyMessage = 'Aucune donnée',
  className,
  onRowClick,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [page, setPage] = useState(1)

  function handleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortKey(null)
      setSortDir(null)
    }
    setPage(1)
  }

  const sorted = [...data].sort((a, b) => {
    if (!sortKey || !sortDir) return 0
    const va = a[sortKey]
    const vb = b[sortKey]
    const cmp = String(va ?? '').localeCompare(String(vb ?? ''), undefined, { numeric: true })
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="overflow-x-auto rounded-xl border border-surface-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-50 border-b border-surface-200">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left font-semibold text-surface-600 whitespace-nowrap',
                    col.sortable && 'cursor-pointer select-none hover:text-surface-900 transition-colors',
                    col.className
                  )}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <span className="ml-1 text-surface-400">
                        {sortKey === col.key && sortDir === 'asc' ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : sortKey === col.key && sortDir === 'desc' ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronsUpDown className="w-4 h-4" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center text-surface-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginated.map((row, idx) => (
                <tr
                  key={keyExtractor(row)}
                  className={cn(
                    'border-b border-surface-100 last:border-0',
                    onRowClick && 'cursor-pointer hover:bg-surface-50 transition-colors'
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map(col => (
                    <td key={col.key} className={cn('px-4 py-3', col.className)}>
                      {col.render ? col.render(row, idx) : String(row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-surface-500">
          <span>
            {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, data.length)} sur {data.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg hover:bg-surface-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-medium text-surface-700">{currentPage} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg hover:bg-surface-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
