import React from 'react'
import { FileText, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import type { Invoice, InvoiceStatus } from '../../types'
import { Badge } from '../../components/ui/Badge'

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; variant: 'blue' | 'green' | 'grey' | 'red' | 'orange' | 'purple' }> = {
  draft:            { label: 'Draft',             variant: 'grey' },
  submitted:        { label: 'Submitted',          variant: 'blue' },
  manager_approved: { label: 'Manager Approved',   variant: 'green' },
  payroll_approved: { label: 'Payroll Approved',   variant: 'purple' },
  paid:             { label: 'Paid',               variant: 'green' },
  rejected:         { label: 'Rejected',           variant: 'red' },
  cancelled:        { label: 'Cancelled',          variant: 'grey' },
}

interface InvoiceCardProps {
  invoice: Invoice
  onClick: () => void
}

export function InvoiceCard({ invoice, onClick }: InvoiceCardProps) {
  const statusConfig = STATUS_CONFIG[invoice.status]

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow duration-150"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-gray-500" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">{invoice.invoice_number}</p>
              <p className="text-xs text-gray-500 mt-0.5">{invoice.instructor_name}</p>
            </div>
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
          </div>

          <p className="text-xs text-gray-400 mt-2">
            {format(new Date(invoice.period_start), 'd MMM')} –{' '}
            {format(new Date(invoice.period_end), 'd MMM yyyy')}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
        <div>
          <p className="text-xs text-gray-400">{invoice.class_count} classes</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-lg font-bold text-gray-900">${invoice.total_amount}</span>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </div>
      </div>
    </div>
  )
}
