'use client'

import { useState } from 'react'

export interface Column<T> {
  key: string; header: string; sortable?: boolean; className?: string
  render?: (row: T, index: number) => React.ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]; data: T[]; keyExtractor: (row: T) => string
  pageSize?: number; emptyMessage?: string; className?: string; onRowClick?: (row: T) => void
}

export function DataTable<T extends Record<string, unknown>>({ columns, data, keyExtractor, pageSize = 20, emptyMessage = 'Aucune donnée', className, onRowClick }: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string|null>(null)
  const [sortDir, setSortDir] = useState<'asc'|'desc'|null>(null)
  const [page, setPage] = useState(1)

  function handleSort(key: string) {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc') }
    else if (sortDir === 'asc') setSortDir('desc')
    else { setSortKey(null); setSortDir(null) }
    setPage(1)
  }

  const sorted = [...data].sort((a, b) => {
    if (!sortKey || !sortDir) return 0
    const cmp = String(a[sortKey]??'').localeCompare(String(b[sortKey]??''), undefined, { numeric: true })
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paginated = sorted.slice((Math.min(page,totalPages)-1)*pageSize, Math.min(page,totalPages)*pageSize)

  return (
    <div className={`flex flex-col gap-4 ${className??''}`}>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map(col => (
                <th key={col.key} onClick={col.sortable?()=>handleSort(col.key):undefined}
                  className={`px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap ${col.sortable?'cursor-pointer hover:text-gray-900':''} ${col.className??''}`}>
                  {col.header} {col.sortable && sortKey===col.key && (sortDir==='asc'?'↑':'↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0
              ? <tr><td colSpan={columns.length} className="py-16 text-center text-gray-400">{emptyMessage}</td></tr>
              : paginated.map((row, idx) => (
                <tr key={keyExtractor(row)} onClick={onRowClick?()=>onRowClick(row):undefined}
                  className={`border-b border-gray-100 last:border-0 ${onRowClick?'cursor-pointer hover:bg-gray-50':''}`}>
                  {columns.map(col => (
                    <td key={col.key} className={`px-4 py-3 ${col.className??''}`}>
                      {col.render ? col.render(row, idx) : String(row[col.key]??'—')}
                    </td>
                  ))}
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{(Math.min(page,totalPages)-1)*pageSize+1}–{Math.min(Math.min(page,totalPages)*pageSize,data.length)} sur {data.length}</span>
          <div className="flex items-center gap-2">
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="px-3 py-1 rounded border disabled:opacity-40">←</button>
            <span>{Math.min(page,totalPages)}/{totalPages}</span>
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages} className="px-3 py-1 rounded border disabled:opacity-40">→</button>
          </div>
        </div>
      )}
    </div>
  )
}
