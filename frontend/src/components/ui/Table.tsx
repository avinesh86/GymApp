import React from 'react'

interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  className?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string | number
  onRowClick?: (row: T) => void
  emptyMessage?: string
  /**
   * Keeps the header row pinned to the top of the page while the rows scroll.
   * Drops the horizontal-scroll wrapper, because a scrolling ancestor would
   * become the sticky header's frame and it would never stick to the page.
   */
  stickyHeader?: boolean
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No data available',
  stickyHeader = false,
}: TableProps<T>) {
  return (
    <div className={stickyHeader ? '' : 'overflow-x-auto'}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map((col) => (
              <th
                key={col.key}
                className={[
                  'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide',
                  // A sticky cell loses the row's border, so draw it as a shadow.
                  // -top-6 cancels the page's p-6, which sticky otherwise keeps clear.
                  stickyHeader ? 'sticky -top-6 z-10 bg-white shadow-[inset_0_-1px_0_#e5e7eb]' : '',
                  col.className ?? '',
                ].join(' ')}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-gray-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={keyExtractor(row)}
                onClick={() => onRowClick?.(row)}
                className={[
                  'border-b border-gray-100 hover:bg-gray-50 transition-colors',
                  onRowClick ? 'cursor-pointer' : '',
                ].join(' ')}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
