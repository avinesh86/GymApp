import React from 'react'
import { Button } from './Button'

interface PaginationProps {
  page: number
  totalPages: number
  onChange: (page: number) => void
  /** Total row count, so the user can see how much there is. */
  totalCount?: number
  /** What is being counted, e.g. "record". Pluralised with a trailing s. */
  noun?: string
}

/**
 * Page controls for a server-paginated list.
 *
 * Renders nothing for a single page — a lone "Page 1 of 1" is noise. The API
 * paginates every list at 50 by default, so a page without controls is not an
 * unpaginated page, it is one silently showing the first 50 rows.
 */
export function Pagination({ page, totalPages, onChange, totalCount, noun }: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between border-t border-gray-100 pt-4 mt-4">
      <p className="text-sm text-gray-500">
        Page {page} of {totalPages}
        {totalCount !== undefined && noun && (
          <span className="text-gray-400">
            {' · '}
            {totalCount} {noun}
            {totalCount === 1 ? '' : 's'}
          </span>
        )}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
