import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, Download, CheckCircle, XCircle, Send, DollarSign, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import {
  getInvoice, approveInvoice, rejectInvoice, downloadInvoicePdf,
  submitInvoice, markInvoicePaid,
} from '../../api/invoices'
import type { InvoiceStatus } from '../../types'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PageSpinner } from '../../components/ui/Spinner'
import { Modal } from '../../components/ui/Modal'
import { usePermission } from '../../hooks/usePermission'
import { useAuth } from '../../hooks/useAuth'

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; variant: 'blue' | 'green' | 'grey' | 'red' | 'orange' | 'purple' }> = {
  draft:            { label: 'Draft',             variant: 'grey' },
  submitted:        { label: 'Submitted',          variant: 'blue' },
  manager_approved: { label: 'Manager Approved',   variant: 'green' },
  payroll_approved: { label: 'Payroll Approved',   variant: 'purple' },
  paid:             { label: 'Paid',               variant: 'green' },
  rejected:         { label: 'Rejected',           variant: 'red' },
  cancelled:        { label: 'Cancelled',          variant: 'grey' },
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { can } = usePermission()
  const { user } = useAuth()
  const role = user?.role

  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')
  const [showPaidModal, setShowPaidModal] = useState(false)
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [paymentReference, setPaymentReference] = useState('')

  const invoiceId = Number(id)

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoices', invoiceId],
    queryFn: () => getInvoice(invoiceId),
  })

  const { mutate: approve, isPending: isApproving } = useMutation({
    mutationFn: () => approveInvoice(invoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Invoice approved')
    },
    onError: () => toast.error('Failed to approve invoice'),
  })

  const { mutate: reject, isPending: isRejecting } = useMutation({
    mutationFn: () => rejectInvoice(invoiceId, rejectNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Invoice rejected')
      setShowRejectModal(false)
      setRejectNotes('')
    },
    onError: () => toast.error('Failed to reject invoice'),
  })

  const { mutate: submit, isPending: isSubmitting } = useMutation({
    mutationFn: () => submitInvoice(invoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Invoice submitted')
    },
    onError: () => toast.error('Failed to submit invoice'),
  })

  const { mutate: markPaid, isPending: isMarkingPaid } = useMutation({
    mutationFn: () => markInvoicePaid(invoiceId, { payment_date: paymentDate, payment_reference: paymentReference }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Invoice marked as paid')
      setShowPaidModal(false)
    },
    onError: () => toast.error('Failed to mark invoice paid'),
  })

  async function handleDownload() {
    try {
      const blob = await downloadInvoicePdf(invoiceId)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `invoice-${invoice?.invoice_number ?? invoiceId}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download PDF')
    }
  }

  if (isLoading) return <PageSpinner />
  if (!invoice) return <p className="text-gray-500">Invoice not found</p>

  const statusConfig = STATUS_CONFIG[invoice.status]
  const canApprove = can('invoices') && ['submitted', 'manager_approved'].includes(invoice.status)
  const canSubmit = role === 'instructor' && ['draft', 'rejected'].includes(invoice.status)
  const canMarkPaid = role === 'payroll' && ['manager_approved', 'payroll_approved'].includes(invoice.status)

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => navigate('/invoices')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Invoices
      </button>

      {/* Header */}
      <Card className="mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{invoice.invoice_number}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{invoice.instructor_name}</p>
            <p className="text-xs text-gray-400 mt-1">
              {format(new Date(invoice.period_start), 'd MMM')} –{' '}
              {format(new Date(invoice.period_end), 'd MMM yyyy')}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
            <p className="text-2xl font-bold text-gray-900">${invoice.total_amount}</p>
            <p className="text-xs text-gray-400">{invoice.class_count} classes</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
          <Button variant="secondary" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={handleDownload}>
            Download PDF
          </Button>
          {canSubmit && (
            <Button
              size="sm"
              leftIcon={<Send className="h-4 w-4" />}
              onClick={() => submit()}
              isLoading={isSubmitting}
            >
              Submit
            </Button>
          )}
          {canApprove && (
            <>
              <Button
                size="sm"
                leftIcon={<CheckCircle className="h-4 w-4" />}
                onClick={() => approve()}
                isLoading={isApproving}
              >
                Approve
              </Button>
              <Button
                variant="danger"
                size="sm"
                leftIcon={<XCircle className="h-4 w-4" />}
                onClick={() => setShowRejectModal(true)}
              >
                Reject
              </Button>
            </>
          )}
          {canMarkPaid && (
            <Button
              size="sm"
              leftIcon={<DollarSign className="h-4 w-4" />}
              onClick={() => setShowPaidModal(true)}
            >
              Mark Paid
            </Button>
          )}
        </div>
      </Card>

      {/* Rejection banner — shown to the instructor so they can amend + resubmit */}
      {invoice.status === 'rejected' && invoice.rejection_reason && (
        <div className="mb-4 flex gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span><strong>Rejected:</strong> {invoice.rejection_reason}. Amend the line items and resubmit.</span>
        </div>
      )}

      {/* Flagged-edits warning — prompts managers to review instructor edits */}
      {invoice.has_flagged_items && ['submitted', 'manager_approved'].includes(invoice.status) && (
        <div className="mb-4 flex gap-2 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800" data-testid="flagged-warning">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>This invoice has line items edited by the instructor — please review the flagged items carefully.</span>
        </div>
      )}

      {/* Line items */}
      <Card className="mb-4" padding={false}>
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Line Items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Class</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Duration</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Rate/hr</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.line_items ?? []).map((item) => (
                <tr key={item.id} className="border-b border-gray-50">
                  <td className="px-4 py-2 text-gray-600">{item.event_date ? format(new Date(item.event_date), 'd MMM') : '—'}</td>
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {item.class_name}
                    {item.has_bonus && <span className="ml-1.5 text-xs text-green-600">+bonus</span>}
                    {item.has_adjustment && <span className="ml-1.5 text-xs text-orange-600">adj.</span>}
                    {item.is_flagged && <span className="ml-1.5 text-xs font-medium text-amber-600">edited</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{item.duration_minutes}min</td>
                  <td className="px-4 py-2 text-gray-600">${item.rate_per_hour}/hr</td>
                  <td className="px-4 py-2 text-right font-medium text-gray-900">${item.amount}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">Total</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">${invoice.total_amount}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Approval history */}
      {(invoice.approval_history ?? []).length > 0 && (
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Approval History</h2>
          </div>
          <ul className="divide-y divide-gray-50">
            {(invoice.approval_history ?? []).map((event) => (
              <li key={event.id} className="px-4 py-3 flex items-start gap-3">
                <div className="h-2 w-2 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {event.action} by {event.actor_name}
                  </p>
                  {event.notes && (
                    <p className="text-xs text-gray-500 mt-0.5">{event.notes}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {format(new Date(event.timestamp), 'd MMM yyyy, h:mma')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Reject modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Reject Invoice"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowRejectModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => reject()} isLoading={isRejecting}>
              Reject
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-600">Please provide a reason for rejection:</p>
          <textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            rows={3}
            required
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
            placeholder="Reason for rejection..."
          />
        </div>
      </Modal>

      {/* Mark paid modal (payroll) */}
      <Modal
        isOpen={showPaidModal}
        onClose={() => setShowPaidModal(false)}
        title="Mark Invoice Paid"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowPaidModal(false)}>Cancel</Button>
            <Button onClick={() => markPaid()} isLoading={isMarkingPaid}>Mark Paid</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="text-sm text-gray-600">
            Payment date
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </label>
          <label className="text-sm text-gray-600">
            Payment reference
            <input
              type="text"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="e.g. bank transfer ref"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}
