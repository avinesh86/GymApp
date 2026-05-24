import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import StatusBadge from "@/components/ui/StatusBadge";
import { generateInvoicePDF } from "@/components/invoice/InvoicePDFGenerator";
import { Check, X, DollarSign, FileText, Download, Pencil, Printer } from "lucide-react";
import moment from "moment";

export default function InvoiceDetailModal({ 
  invoice, 
  isOpen, 
  onClose, 
  onApprove,
  onReject,
  onMarkPaid,
  onEdit,
  userRole,
  isApprover,
  staffProfile
}) {
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [paymentRef, setPaymentRef] = useState("");
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const isLocked = ['payroll_approved', 'paid', 'manager_approved'].includes(invoice.status);
  const isDraft = invoice.status === 'draft';
  const isSubmitted = invoice.status === 'submitted';

  const canApprove = (
    (['owner', 'admin'].includes(userRole)) ||
    (userRole === 'gym_manager' && isSubmitted) ||
    (userRole === 'payroll' && invoice.status === 'manager_approved')
  );

  const canMarkPaid = (
    (['payroll', 'owner', 'admin'].includes(userRole)) && 
    invoice.status === 'payroll_approved'
  );

  // Instructor can edit only draft invoices
  const canEdit = (userRole === 'instructor' || ['owner', 'admin'].includes(userRole)) && (isDraft || isSubmitted) && !isLocked;

  const handleReject = () => {
    onReject(invoice, rejectReason);
    setShowRejectForm(false);
    setRejectReason("");
  };

  const handleMarkPaid = () => {
    onMarkPaid(invoice, paymentRef);
    setShowPaymentForm(false);
    setPaymentRef("");
  };

  const handleDownloadPDF = () => {
    generateInvoicePDF(invoice, staffProfile);
  };

  const handlePrint = () => {
    generateInvoicePDF(invoice, staffProfile, { print: true });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl">
                {invoice.invoice_number || `INV-${invoice.id?.slice(-6).toUpperCase()}`}
              </DialogTitle>
              <p className="text-sm text-slate-500 mt-1">{invoice.instructor_name}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge status={invoice.status} />
              {invoice.manager_approved_at && (
                <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                  <Check className="w-3 h-3 mr-1" />
                  Manager Approved
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">Period</p>
              <p className="font-medium text-sm mt-1">
                {moment(invoice.period_start).format("MMM D")} – {moment(invoice.period_end).format("MMM D")}
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">Classes</p>
              <p className="font-medium text-sm mt-1">{invoice.line_items?.length || 0}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">Issued</p>
              <p className="font-medium text-sm mt-1">{moment(invoice.created_date).format("MMM D, YYYY")}</p>
            </div>
            <div className="p-3 bg-indigo-50 rounded-lg">
              <p className="text-xs text-indigo-600">Total</p>
              <p className="font-bold text-lg text-indigo-700 mt-1">£{invoice.total_amount?.toFixed(2)}</p>
            </div>
          </div>

          {/* Edited items flag — shown to approvers */}
          {isApprover && invoice.line_items?.some(i => i.edited) && (
            <div className="flex items-start gap-2 p-3 bg-orange-50 rounded-lg border border-orange-200 text-sm text-orange-800">
              <span className="text-lg leading-none">✎</span>
              <span><strong>Instructor made edits</strong> to one or more line items. Edited rows are highlighted in amber below — please review before approving.</span>
            </div>
          )}

          {/* Locked notice */}
          {isLocked && (
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-600">
              <FileText className="w-4 h-4 shrink-0" />
              This invoice is locked and cannot be edited once approved or paid.
            </div>
          )}

          {/* Line Items */}
          <div>
            <h3 className="font-medium mb-3">Line Items</h3>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Att.</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.line_items?.map((item, idx) => (
                    <TableRow key={idx} className={item.edited ? "bg-amber-50" : ""}>
                      <TableCell className="text-sm">{item.date}</TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">{item.class_type_name}</span>
                        {item.is_cover && (
                          <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Cover</span>
                        )}
                        {item.edited && (
                          <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded border border-orange-200">✎ Edited</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">{item.location}</TableCell>
                      <TableCell className="text-right text-sm">{item.attendance_count ?? "-"}</TableCell>
                      <TableCell className="text-right text-sm">£{item.rate?.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium text-sm">
                        £{item.amount?.toFixed(2)}
                        {item.bonus_amount > 0 && (
                          <span className="text-green-600 text-xs ml-1">(+£{Number(item.bonus_amount).toFixed(2)})</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Approval History */}
          {(invoice.manager_approved_at || invoice.payroll_approved_at || invoice.paid_at) && (
            <div>
              <h3 className="font-medium mb-3">Approval History</h3>
              <div className="space-y-2">
                {invoice.manager_approved_at && (
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Manager approved by <strong>{invoice.manager_approver_name}</strong></span>
                    <span className="text-slate-400">{moment(invoice.manager_approved_at).format("MMM D, h:mm A")}</span>
                  </div>
                )}
                {invoice.payroll_approved_at && (
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Payroll approved by <strong>{invoice.payroll_approver_name}</strong></span>
                    <span className="text-slate-400">{moment(invoice.payroll_approved_at).format("MMM D, h:mm A")}</span>
                  </div>
                )}
                {invoice.paid_at && (
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="w-4 h-4 text-green-500" />
                    <span>Paid {invoice.payment_reference && `— Ref: ${invoice.payment_reference}`}</span>
                    <span className="text-slate-400">{moment(invoice.paid_at).format("MMM D, h:mm A")}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rejection Reason */}
          {invoice.status === 'rejected' && invoice.rejection_reason && (
            <div className="p-4 bg-red-50 rounded-lg border border-red-100">
              <p className="text-sm font-medium text-red-800">Rejection Reason:</p>
              <p className="text-sm text-red-600 mt-1">{invoice.rejection_reason}</p>
            </div>
          )}

          {/* Notes */}
          {invoice.notes && (
            <div>
              <h3 className="font-medium mb-2">Notes</h3>
              <p className="text-sm text-slate-600">{invoice.notes}</p>
            </div>
          )}

          {/* Attachment */}
          {invoice.attachment_url && (
            <div>
              <h3 className="font-medium mb-2">Attachment</h3>
              <a href={invoice.attachment_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700">
                <FileText className="w-4 h-4" />
                View Document
                <Download className="w-4 h-4" />
              </a>
            </div>
          )}

          {/* Reject Form */}
          {showRejectForm && (
            <div className="p-4 bg-red-50 rounded-lg border border-red-100 space-y-3">
              <Label>Rejection Reason</Label>
              <Textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Please provide a reason..."
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowRejectForm(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleReject} disabled={!rejectReason}>
                  Confirm Rejection
                </Button>
              </div>
            </div>
          )}

          {/* Payment Form */}
          {showPaymentForm && (
            <div className="p-4 bg-green-50 rounded-lg border border-green-100 space-y-3">
              <Label>Payment Reference (optional)</Label>
              <Input value={paymentRef} onChange={e => setPaymentRef(e.target.value)} placeholder="e.g., Bank transfer ref..." />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowPaymentForm(false)}>Cancel</Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={handleMarkPaid}>
                  Confirm Payment
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <DialogFooter className="flex-col sm:flex-row gap-2 flex-wrap">
          {/* Download PDF — available to all */}
          <Button variant="outline" onClick={handleDownloadPDF} className="gap-2">
            <Download className="w-4 h-4" />
            Download PDF
          </Button>

          {/* Print */}
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <Printer className="w-4 h-4" />
            Print
          </Button>

          {/* Edit — instructor on draft/submitted only */}
          {canEdit && onEdit && (
            <Button variant="outline" onClick={() => { onClose(); onEdit(invoice); }} className="gap-2">
              <Pencil className="w-4 h-4" />
              Edit Invoice
            </Button>
          )}

          {/* Approve / Reject */}
          {canApprove && !showRejectForm && !showPaymentForm && (
            <>
              <Button variant="outline" onClick={() => setShowRejectForm(true)} className="text-red-600 border-red-200 hover:bg-red-50 gap-2">
                <X className="w-4 h-4" /> Reject
              </Button>
              <Button onClick={() => onApprove(invoice)} className="bg-green-600 hover:bg-green-700 gap-2">
                <Check className="w-4 h-4" /> Approve
              </Button>
            </>
          )}

          {/* Mark Paid */}
          {canMarkPaid && !showPaymentForm && !showRejectForm && (
            <Button onClick={() => setShowPaymentForm(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-semibold px-6">
              <DollarSign className="w-4 h-4" /> Mark as PAID
            </Button>
          )}

          {!canApprove && !canMarkPaid && !canEdit && (
            <Button variant="outline" onClick={onClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}