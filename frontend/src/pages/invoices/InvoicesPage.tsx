import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, FileText } from 'lucide-react'
import { listInvoices } from '../../api/invoices'
import type { Invoice } from '../../types'
import { InvoiceCard } from './InvoiceCard'
import { PageHeader } from '../../components/shared/PageHeader'
import { PageSpinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { usePermission } from '../../hooks/usePermission'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

const STATUS_OPTIONS = [
  { value: '',                 label: 'All Status' },
  { value: 'draft',            label: 'Draft' },
  { value: 'submitted',        label: 'Submitted' },
  { value: 'manager_approved', label: 'Manager Approved' },
  { value: 'payroll_approved', label: 'Payroll Approved' },
  { value: 'paid',             label: 'Paid' },
  { value: 'rejected',         label: 'Rejected' },
]

export function InvoicesPage() {
  const navigate = useNavigate()
  const { can } = usePermission()

  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  const search = useDebounce(searchInput, 300)

  const { data: invoicesPage, isLoading: allLoading } = useQuery({
    queryKey: ['invoices', { search, status: statusFilter, page }],
    queryFn: () => listInvoices({ search: search || undefined, status: statusFilter || undefined, page, page_size: 20 }),
  })

  // Invoices pending manager approval (only for relevant roles)
  const showPendingApproval = can('invoices') && (can('settings') || can('reports'))
  const { data: pendingPage, isLoading: pendingLoading } = useQuery({
    queryKey: ['invoices', { status: 'submitted' }],
    queryFn: () => listInvoices({ status: 'submitted', page_size: 10 }),
    enabled: showPendingApproval,
  })

  const allInvoices = invoicesPage?.results ?? []
  const pendingInvoices = pendingPage?.results ?? []
  const totalPages = Math.ceil((invoicesPage?.count ?? 0) / 20)

  return (
    <div>
      <PageHeader title="Invoices" />

      {/* Pending approval section */}
      {showPendingApproval && pendingInvoices.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-orange-600 mb-3 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
            Pending Your Approval ({pendingInvoices.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingInvoices.map((invoice) => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                onClick={() => navigate(`/invoices/${invoice.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search invoices..."
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1) }}
            className="pl-9 pr-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent w-48"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* All invoices */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">All Invoices</h2>
        {allLoading ? (
          <PageSpinner />
        ) : allInvoices.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-12 w-12" />}
            title="No invoices found"
            description="Invoices will appear here once instructors submit them"
          />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {allInvoices.map((invoice) => (
                <InvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  onClick={() => navigate(`/invoices/${invoice.id}`)}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                    Previous
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
