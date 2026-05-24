import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import InvoiceCard from "@/components/invoice/InvoiceCard";
import InvoiceDetailModal from "@/components/invoice/InvoiceDetailModal";
import GenerateInvoiceModal from "@/components/invoice/GenerateInvoiceModal";
import { Plus, Search, FileText } from "lucide-react";
import moment from "moment";

export default function Invoices() {
  const [user, setUser] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [allStaff, setAllStaff] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [editingDraft, setEditingDraft] = useState(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [userData, staffData, invoicesData] = await Promise.all([
        base44.auth.me(),
        base44.entities.Staff.filter({ status: 'active' }),
        base44.entities.Invoice.list('-created_date', 200)
      ]);
      setUser(userData);
      setAllStaff(staffData);
      const myProfile = staffData.find(s => s.email === userData.email);
      setStaffProfile(myProfile);

      // Load completed events for invoice generation (instructors)
      if (myProfile?.role === 'instructor' || myProfile?.role === 'team_leader') {
        const threeMonthsAgo = moment().subtract(3, 'months').toISOString();
        const myEvents = await base44.entities.TimetableEvent.filter({
          assigned_instructor_id: myProfile.id,
          status: 'completed',
          start_datetime: { $gte: threeMonthsAgo }
        });
        setEvents(myEvents);
      }

      const isApprover = ['admin', 'owner', 'gym_manager', 'payroll'].includes(myProfile?.role);
      setInvoices(isApprover ? invoicesData : invoicesData.filter(inv => inv.instructor_id === myProfile?.id));
    } catch (e) {
      console.error("Error loading data:", e);
    } finally {
      setLoading(false);
    }
  };

  const userRole = staffProfile?.role || 'instructor';
  const isApprover = ['owner', 'admin', 'gym_manager', 'payroll'].includes(userRole);

  const filteredInvoices = invoices.filter(inv => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!inv.instructor_name?.toLowerCase().includes(q) && !inv.invoice_number?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const pendingApproval = filteredInvoices.filter(inv =>
    (userRole === 'gym_manager' && inv.status === 'submitted') ||
    (['owner', 'admin'].includes(userRole) && inv.status === 'submitted') ||
    (userRole === 'payroll' && inv.status === 'manager_approved')
  );
  const readyToPay = filteredInvoices.filter(inv =>
    ['payroll', 'owner', 'admin'].includes(userRole) && inv.status === 'payroll_approved'
  );
  const otherInvoices = filteredInvoices.filter(inv => !pendingApproval.includes(inv) && !readyToPay.includes(inv));

  // Find all managers/admins to notify
  const findApprovers = () => allStaff.filter(s => ['admin', 'owner', 'gym_manager'].includes(s.role));
  const findPayroll = () => allStaff.filter(s => ['payroll', 'owner', 'admin'].includes(s.role));

  const handleApprove = async (invoice) => {
    let updates = {};
    let notifyInstructor = false;
    let notifyPayroll = false;

    if ((userRole === 'gym_manager' || ['owner', 'admin'].includes(userRole)) && invoice.status === 'submitted') {
      updates = { status: 'manager_approved', manager_approver_id: staffProfile.id, manager_approver_name: staffProfile.name, manager_approved_at: new Date().toISOString() };
      notifyInstructor = true;
      notifyPayroll = true;
    } else if ((userRole === 'payroll' || ['owner', 'admin'].includes(userRole)) && invoice.status === 'manager_approved') {
      updates = { status: 'payroll_approved', payroll_approver_id: staffProfile.id, payroll_approver_name: staffProfile.name, payroll_approved_at: new Date().toISOString() };
      notifyInstructor = true;
    }

    if (Object.keys(updates).length > 0) {
      await base44.entities.Invoice.update(invoice.id, updates);

      if (notifyInstructor) {
        await base44.entities.Notification.create({
          recipient_id: invoice.instructor_id, type: 'invoice_approved',
          title: 'Invoice Approved ✓',
          message: `Your invoice ${invoice.invoice_number} (£${invoice.total_amount?.toFixed(2)}) has been approved by ${staffProfile.name}.`,
          related_entity_type: 'Invoice', related_entity_id: invoice.id
        });
      }

      // Notify payroll team when manager approves
      if (notifyPayroll) {
        const payrollTeam = findPayroll();
        await Promise.all(payrollTeam.map(p =>
          base44.entities.Notification.create({
            recipient_id: p.id, type: 'invoice_approved',
            title: `Invoice Ready for Payment — ${invoice.instructor_name}`,
            message: `Invoice ${invoice.invoice_number} for ${invoice.instructor_name} (£${invoice.total_amount?.toFixed(2)}) has been manager-approved and is ready for payroll processing.`,
            related_entity_type: 'Invoice', related_entity_id: invoice.id
          })
        ));
      }

      loadData();
      setSelectedInvoice(null);
    }
  };

  const handleReject = async (invoice, reason) => {
    await base44.entities.Invoice.update(invoice.id, { status: 'rejected', rejection_reason: reason });
    await base44.entities.Notification.create({
      recipient_id: invoice.instructor_id, type: 'invoice_rejected',
      title: 'Invoice Rejected',
      message: `Your invoice ${invoice.invoice_number} was rejected by ${staffProfile.name}. Reason: ${reason}`,
      related_entity_type: 'Invoice', related_entity_id: invoice.id
    });
    loadData();
    setSelectedInvoice(null);
  };

  const handleMarkPaid = async (invoice, paymentRef) => {
    const paidAt = new Date().toISOString();
    await base44.entities.Invoice.update(invoice.id, { status: 'paid', paid_at: paidAt, payment_reference: paymentRef });

    // Notify instructor with receipt details
    const linesSummary = invoice.line_items?.slice(0, 5).map(l =>
      `${l.date} — ${l.class_type_name} — £${((l.amount||0)+(l.bonus_amount||0)).toFixed(2)}`
    ).join('\n') || '';
    await base44.entities.Notification.create({
      recipient_id: invoice.instructor_id, type: 'invoice_paid',
      title: `Payment Received — ${invoice.invoice_number} 💰`,
      message: `Your invoice ${invoice.invoice_number} for £${invoice.total_amount?.toFixed(2)} has been paid${paymentRef ? ` (Ref: ${paymentRef})` : ''}. Period: ${moment(invoice.period_start).format('DD MMM')}–${moment(invoice.period_end).format('DD MMM YYYY')}.\n\n${linesSummary}`,
      related_entity_type: 'Invoice', related_entity_id: invoice.id,
      is_urgent: false
    });

    loadData();
    setSelectedInvoice(null);
  };

  // Handle save/submit from generate modal — supports create & update (drafts)
  const handleSaveOrSubmitInvoice = async (invoiceData, existingId) => {
    if (existingId) {
      await base44.entities.Invoice.delete(existingId);
    }
    const saved = await base44.entities.Invoice.create(invoiceData);

    // If submitted, notify all managers/admins
    if (invoiceData.status === 'submitted') {
      const approvers = findApprovers();
      const linesSummary = invoiceData.line_items?.map(l =>
        `${l.date} — ${l.class_type_name}${l.is_cover ? ' (Cover)' : ''} — £${((l.amount||0)+(l.bonus_amount||0)).toFixed(2)}`
      ).join('\n') || '';
      await Promise.all(approvers.map(a =>
        base44.entities.Notification.create({
          recipient_id: a.id, type: 'invoice_submitted',
          title: `Invoice Submitted — ${invoiceData.instructor_name}`,
          message: `${invoiceData.instructor_name} submitted invoice ${invoiceData.invoice_number} for £${invoiceData.total_amount?.toFixed(2)}.\nPeriod: ${moment(invoiceData.period_start).format('DD MMM')}–${moment(invoiceData.period_end).format('DD MMM YYYY')}.\n\n${linesSummary}`,
          related_entity_type: 'Invoice', related_entity_id: saved.id
        })
      ));
    }

    setShowGenerateModal(false);
    setEditingDraft(null);
    loadData();
  };

  const handleEditDraft = (invoice) => {
    setEditingDraft(invoice);
    setShowGenerateModal(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-slate-500">
            {isApprover ? `${pendingApproval.length} pending approval` : `${invoices.length} total invoices`}
          </p>
        </div>
        {(userRole === 'instructor' || userRole === 'team_leader') && (
          <Button onClick={() => { setEditingDraft(null); setShowGenerateModal(true); }} className="gap-2">
            <Plus className="w-4 h-4" />
            Generate Invoice
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {isApprover && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search by instructor or invoice #..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="manager_approved">Manager Approved</SelectItem>
              <SelectItem value="payroll_approved">Payroll Approved</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Pending Approval */}
      {isApprover && pendingApproval.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Pending Your Approval</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingApproval.map(invoice => (
              <InvoiceCard key={invoice.id} invoice={invoice} onClick={setSelectedInvoice} showInstructor />
            ))}
          </div>
        </div>
      )}

      {/* Ready to Pay */}
      {readyToPay.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-emerald-700 mb-4 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            Ready to Pay ({readyToPay.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {readyToPay.map(invoice => (
              <InvoiceCard key={invoice.id} invoice={invoice} onClick={setSelectedInvoice} showInstructor />
            ))}
          </div>
        </div>
      )}

      {/* All Invoices */}
      <div>
        {isApprover && pendingApproval.length > 0 && (
          <h2 className="text-lg font-semibold text-slate-900 mb-4">All Invoices</h2>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(isApprover ? otherInvoices : filteredInvoices).map(invoice => (
            <InvoiceCard key={invoice.id} invoice={invoice} onClick={setSelectedInvoice} showInstructor={isApprover} />
          ))}
        </div>
      </div>

      {filteredInvoices.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No invoices found</p>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          isOpen={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onMarkPaid={handleMarkPaid}
          onEdit={handleEditDraft}
          userRole={userRole}
          isApprover={isApprover}
          staffProfile={staffProfile}
        />
      )}

      {/* Generate / Edit Invoice Modal */}
      {showGenerateModal && (
        <GenerateInvoiceModal
          isOpen={showGenerateModal}
          onClose={() => { setShowGenerateModal(false); setEditingDraft(null); }}
          onSubmit={handleSaveOrSubmitInvoice}
          events={events}
          staffProfile={staffProfile}
          existingInvoices={invoices}
          draftInvoice={editingDraft}
        />
      )}
    </div>
  );
}