import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { base44 } from "@/api/base44Client";
import { Calendar, DollarSign, Upload, Plus, Trash2, Save, Send, AlertCircle, Zap } from "lucide-react";
import moment from "moment";

export default function GenerateInvoiceModal({ 
  isOpen, 
  onClose, 
  onSubmit,
  events, 
  staffProfile,
  existingInvoices,
  draftInvoice = null  // pass an existing draft to edit
}) {
  const [periodStart, setPeriodStart] = useState(
    draftInvoice?.period_start || moment().subtract(1, 'month').startOf('month').format("YYYY-MM-DD")
  );
  const [periodEnd, setPeriodEnd] = useState(
    draftInvoice?.period_end || moment().subtract(1, 'month').endOf('month').format("YYYY-MM-DD")
  );
  const [selectedEventIds, setSelectedEventIds] = useState([]);
  const [lineItems, setLineItems] = useState(draftInvoice?.line_items || []);
  const [notes, setNotes] = useState(draftInvoice?.notes || "");
  const [attachment, setAttachment] = useState(draftInvoice?.attachment_url || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [mode, setMode] = useState("select"); // "select" | "edit"
  const [classTypes, setClassTypes] = useState([]);

  // Load class types for bonus rules
  useEffect(() => {
    base44.entities.ClassType.filter({ status: "active" }).then(setClassTypes).catch(() => {});
  }, []);

  // Rebuild mode: if editing a draft, go straight to edit mode
  useEffect(() => {
    if (draftInvoice?.line_items?.length > 0) {
      setLineItems(draftInvoice.line_items);
      setMode("edit");
    }
  }, [draftInvoice]);

  // Already-invoiced event IDs (excluding the current draft if editing)
  const invoicedEventIds = useMemo(() => {
    const ids = new Set();
    existingInvoices.forEach(inv => {
      if (draftInvoice && inv.id === draftInvoice.id) return;
      inv.line_items?.forEach(item => { if (item.event_id) ids.add(item.event_id); });
    });
    return ids;
  }, [existingInvoices, draftInvoice]);

  const eligibleEvents = useMemo(() => {
    return events.filter(event => {
      const d = moment(event.start_datetime);
      return (
        d.isBetween(periodStart, periodEnd, 'day', '[]') &&
        !invoicedEventIds.has(event.id) &&
        event.status === 'completed'
      );
    }).sort((a, b) => moment(a.start_datetime).diff(moment(b.start_datetime)));
  }, [events, periodStart, periodEnd, invoicedEventIds]);

  // Auto-select all when eligible changes
  useEffect(() => {
    setSelectedEventIds(eligibleEvents.map(e => e.id));
  }, [eligibleEvents.length]);

  const calcAmount = (event) => {
    // Check for class-specific pay override — supports multi-class_type_ids
    const overrides = staffProfile?.pay_rate_overrides || [];
    const override = overrides.find(o => {
      if (o.class_type_ids?.length) return o.class_type_ids.includes(event.class_type_id);
      return o.class_type_id === event.class_type_id;
    });
    const rateType = override?.rate_type || staffProfile?.default_pay_rate_type || 'per_class';
    const baseRate = override?.rate ?? staffProfile?.base_rate ?? 50;
    const perHead = override?.per_head_rate ?? staffProfile?.per_head_rate ?? 5;
    const att = event.attendance_count || 0;

    let amount;
    if (rateType === 'per_head') amount = perHead * att;
    else if (rateType === 'blended') amount = baseRate + perHead * att;
    else amount = baseRate;

    // Auto-calculate bonuses from class type bonus_rules
    const ct = classTypes.find(c => c.id === event.class_type_id || c.name === event.class_type_name);
    const bonusRules = ct?.bonus_rules || [];
    let autoBonus = 0;
    const appliedBonuses = [];
    bonusRules.forEach(rule => {
      if (rule.type === "flat_bonus") {
        autoBonus += rule.amount || 0;
        appliedBonuses.push({ name: rule.name || "Bonus", amount: rule.amount });
      } else if (rule.type === "attendance_threshold" && att >= (rule.threshold || 0)) {
        autoBonus += rule.amount || 0;
        appliedBonuses.push({ name: rule.name || "Attendance Bonus", amount: rule.amount });
      } else if (rule.type === "per_head_above" && att > (rule.threshold || 0)) {
        const extra = (att - rule.threshold) * (rule.amount || 0);
        autoBonus += extra;
        appliedBonuses.push({ name: rule.name || "Per Head Bonus", amount: extra });
      }
    });

    return { rate: rateType === "per_head" ? perHead : baseRate, amount, autoBonus, appliedBonuses };
  };

  const buildLineItems = () => {
    return eligibleEvents
      .filter(e => selectedEventIds.includes(e.id))
      .map(event => {
        const { rate, amount, autoBonus, appliedBonuses } = calcAmount(event);
        const isCover = event.original_instructor_id && event.original_instructor_id !== event.assigned_instructor_id;
        return {
          event_id: event.id,
          class_type_name: event.class_type_name || "",
          date: moment(event.start_datetime).format("DD MMM YYYY"),
          time: moment(event.start_datetime).format("h:mm A"),
          location: event.location || "",
          attendance_count: event.attendance_count ?? null,
          rate,
          quantity: 1,
          amount,
          bonus_amount: autoBonus,
          applied_bonuses: appliedBonuses,
          is_cover: isCover
        };
      });
  };

  const handleProceedToEdit = () => {
    setLineItems(buildLineItems());
    setMode("edit");
  };

  const updateLineItem = (idx, field, value) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: parseFloat(value) || value, edited: true };
      if (field === 'rate') {
        updated[idx].amount = parseFloat(value) || 0;
      }
      return updated;
    });
  };

  const removeLineItem = (idx) => {
    setLineItems(prev => prev.filter((_, i) => i !== idx));
  };

  const addManualLine = () => {
    setLineItems(prev => [...prev, {
      event_id: null,
      class_type_name: "",
      date: moment().format("DD MMM YYYY"),
      time: "",
      location: "",
      attendance_count: null,
      rate: staffProfile?.base_rate || 0,
      quantity: 1,
      amount: staffProfile?.base_rate || 0,
      bonus_amount: 0,
      is_cover: false
    }]);
  };

  const totalAmount = lineItems.reduce((sum, item) => sum + (item.amount || 0) + (item.bonus_amount || 0), 0);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setAttachment(file_url);
    }
  };

  const buildInvoicePayload = (status) => {
    const invoiceNumber = draftInvoice?.invoice_number ||
      `INV-${moment().format("YYYYMMDD")}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    return {
      instructor_id: staffProfile.id,
      instructor_name: staffProfile.name,
      invoice_number: invoiceNumber,
      period_start: periodStart,
      period_end: periodEnd,
      line_items: lineItems,
      total_amount: totalAmount,
      status,
      notes,
      attachment_url: attachment
    };
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    await onSubmit(buildInvoicePayload("draft"), draftInvoice?.id);
    setIsSaving(false);
  };

  const handleSubmitForApproval = async () => {
    setIsSubmitting(true);
    await onSubmit(buildInvoicePayload("submitted"), draftInvoice?.id);
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {draftInvoice ? `Edit Invoice — ${draftInvoice.invoice_number}` : "Generate Invoice"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Period */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Period Start</Label>
              <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Period End</Label>
              <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="mt-1" />
            </div>
          </div>

          {/* Business info banner */}
          {!staffProfile?.business_name && !staffProfile?.payment_info && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Your profile doesn't have business or payment info set up. <a href="/Profile" className="underline font-medium">Add it in your Profile</a> so it appears on the PDF invoice.</span>
            </div>
          )}

          {/* ── SELECT MODE ── */}
          {mode === "select" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label>Completed Classes in Period ({eligibleEvents.length})</Label>
                <Button variant="ghost" size="sm" onClick={() => {
                  if (selectedEventIds.length === eligibleEvents.length) setSelectedEventIds([]);
                  else setSelectedEventIds(eligibleEvents.map(e => e.id));
                }}>
                  {selectedEventIds.length === eligibleEvents.length ? "Deselect All" : "Select All"}
                </Button>
              </div>

              {eligibleEvents.length > 0 ? (
                <div className="border rounded-lg max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead className="text-right">Att.</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {eligibleEvents.map(event => {
                      const { amount, autoBonus } = calcAmount(event);
                      const isCover = event.original_instructor_id && event.original_instructor_id !== event.assigned_instructor_id;
                      const isSelected = selectedEventIds.includes(event.id);
                      return (
                        <TableRow key={event.id} className={!isSelected ? "opacity-50" : ""}>
                          <TableCell>
                            <Checkbox checked={isSelected} onCheckedChange={() =>
                              setSelectedEventIds(prev =>
                                prev.includes(event.id) ? prev.filter(id => id !== event.id) : [...prev, event.id]
                              )
                            } />
                          </TableCell>
                          <TableCell className="text-sm">{moment(event.start_datetime).format("DD MMM")}</TableCell>
                          <TableCell>
                            <span className="font-medium text-sm">{event.class_type_name}</span>
                            {isCover && <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Cover</span>}
                          </TableCell>
                          <TableCell className="text-sm">{moment(event.start_datetime).format("h:mm A")}</TableCell>
                          <TableCell className="text-right text-sm">{event.attendance_count ?? "-"}</TableCell>
                          <TableCell className="text-right font-medium text-sm">
                            £{amount.toFixed(2)}
                            {autoBonus > 0 && <span className="ml-1 text-xs text-amber-600 font-semibold">+£{autoBonus.toFixed(2)}</span>}
                          </TableCell>
                        </TableRow>
                      );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 bg-slate-50 rounded-lg">
                  <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">No completed, uninvoiced classes in this period</p>
                </div>
              )}

              <div className="flex justify-end mt-4">
                <Button onClick={handleProceedToEdit} disabled={selectedEventIds.length === 0}>
                  Review & Edit Line Items →
                </Button>
              </div>
            </div>
          )}

          {/* ── EDIT MODE ── */}
          {mode === "edit" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label>Line Items (editable)</Label>
                <Button variant="outline" size="sm" onClick={() => setMode("select")} className="text-xs">
                  ← Back to Class Selection
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right w-16">Att.</TableHead>
                      <TableHead className="text-right w-24">Rate (£)</TableHead>
                      <TableHead className="text-right w-24">Bonus (£)</TableHead>
                      <TableHead className="text-right w-24">Amount</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-sm">
                          <Input
                            value={item.date}
                            onChange={e => updateLineItem(idx, 'date', e.target.value)}
                            className="h-7 text-xs w-28"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input
                              value={item.class_type_name}
                              onChange={e => updateLineItem(idx, 'class_type_name', e.target.value)}
                              className="h-7 text-xs"
                            />
                            {item.is_cover && <span className="shrink-0 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Cover</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.location || ""}
                            onChange={e => updateLineItem(idx, 'location', e.target.value)}
                            className="h-7 text-xs"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={item.attendance_count ?? ""}
                            onChange={e => updateLineItem(idx, 'attendance_count', e.target.value)}
                            className="h-7 text-xs w-16 text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={item.rate ?? ""}
                            onChange={e => updateLineItem(idx, 'rate', e.target.value)}
                            className="h-7 text-xs w-20 text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                           <Input
                             type="number"
                             value={item.bonus_amount ?? ""}
                             onChange={e => updateLineItem(idx, 'bonus_amount', e.target.value)}
                             className="h-7 text-xs w-20 text-right"
                           />
                           {item.applied_bonuses?.length > 0 && (
                             <div className="mt-0.5 space-y-0.5">
                               {item.applied_bonuses.map((b, bi) => (
                                 <div key={bi} className="text-[9px] text-amber-600 flex items-center gap-0.5 justify-end">
                                   <Zap className="w-2.5 h-2.5" />{b.name}
                                 </div>
                               ))}
                             </div>
                           )}
                         </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          £{((item.amount || 0) + (item.bonus_amount || 0)).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => removeLineItem(idx)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Button variant="outline" size="sm" className="mt-2 gap-1 text-xs" onClick={addManualLine}>
                <Plus className="w-3.5 h-3.5" /> Add Manual Line
              </Button>

              {/* Total */}
              <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-lg mt-4">
                <span className="font-medium text-indigo-900">Total Amount</span>
                <span className="text-2xl font-bold text-indigo-700">£{totalAmount.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes..." className="mt-1" rows={2} />
          </div>

          {/* Attachment */}
          <div>
            <Label>Attach Supporting Document (optional)</Label>
            <label className="mt-1 flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:border-indigo-300 transition-colors">
              <Upload className="w-5 h-5 text-slate-400" />
              <span className="text-sm text-slate-500">{attachment ? "File uploaded ✓" : "Click to upload PDF"}</span>
              <input type="file" accept=".pdf,.jpg,.png" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={handleSaveDraft} disabled={lineItems.length === 0 || isSaving} className="gap-1">
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save as Draft"}
          </Button>
          <Button onClick={handleSubmitForApproval} disabled={lineItems.length === 0 || isSubmitting} className="gap-1">
            <Send className="w-4 h-4" />
            {isSubmitting ? "Submitting..." : "Submit for Approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}