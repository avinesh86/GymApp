import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Search, FileText, Plus } from 'lucide-react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { listInvoices, generateInvoice } from '../../api/invoices'
import type { Invoice } from '../../types'
import { InvoiceCard } from './InvoiceCard'
import { PageHeader } from '../../components/shared/PageHeader'
import { PageSpinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { usePermission } from '../../hooks/usePermission'
import { useAuth } from '../../hooks/useAuth'

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
  const queryClient = useQueryClient()
  const { can } = usePermission()
  const { user } = useAuth()
  const role = user?.role

  const isInstructor = role === 'instructor'
  const isPayroll = role === 'payroll'

  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showGenerate, setShowGenerate] = useState(false)
  const [genStart, setGenStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [genEnd, setGenEnd] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))

  const search = useDebounce(searchInput, 300)

  const { mutate: generate, isPending: isGenerating } = useMutation({
    mutationFn: () => generateInvoice({ period_start: genStart, period_end: genEnd }),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Draft invoice generated')
      setShowGenerate(false)
      navigate(`/invoices/${invoice.id}`)
    },
    onError: () => toast.error('Failed to generate invoice'),
  })

  // Payroll: invoices ready to pay (manager-approved).
  const { data: readyPage } = useQuery({
    queryKey: ['invoices', { status: 'manager_approved' }],
    queryFn: () => listInvoices({ status: 'manager_approved', page_size: 20 }),
    enabled: isPayroll,
  })
  const readyToPay = readyPage?.results ?? []

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
      <PageHeader
        title="Invoices"
        actions={
          isInstructor ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowGenerate(true)}>
              Generate Invoice
            </Button>
          ) : undefined
        }
      />

      {/* Payroll: Ready to Pay */}
      {isPayroll && readyToPay.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-green-700 mb-3">Ready to Pay ({readyToPay.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {readyToPay.map((invoice) => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                onClick={() => navigate(`/invoices/${invoice.id}`)}
              />
            ))}
          </div>
        </section>
      )}

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

      {/* Instructor: generate a draft for a period */}
      <Modal
        isOpen={showGenerate}
        onClose={() => setShowGenerate(false)}
        title="Generate Invoice"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowGenerate(false)}>Cancel</Button>
            <Button onClick={() => generate()} isLoading={isGenerating}>Generate</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-600">Pick the pay period to generate a draft invoice for.</p>
          <label className="text-sm text-gray-600">
            Period start
            <input
              type="date" value={genStart} onChange={(e) => setGenStart(e.target.value)} aria-label="Period start"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </label>
          <label className="text-sm text-gray-600">
            Period end
            <input
              type="date" value={genEnd} onChange={(e) => setGenEnd(e.target.value)} aria-label="Period end"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}
