import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import StatusBadge from "@/components/ui/StatusBadge";
import { FileText, Calendar, ChevronRight, Check } from "lucide-react";
import moment from "moment";

export default function InvoiceCard({ invoice, onClick, showInstructor = false }) {
  const invNum = invoice.invoice_number || `INV-${invoice.id?.slice(-6).toUpperCase()}`;
  const period = `${moment(invoice.period_start).format("MMM D")} - ${moment(invoice.period_end).format("MMM D, YYYY")}`;
  const classes = invoice.line_items?.length || 0;

  return (
    <div
      onClick={() => onClick?.(invoice)}
      className={cn(
        "bg-white rounded-xl border transition-all cursor-pointer hover:shadow-md hover:border-indigo-200"
      )}
    >
      {/* ── MOBILE layout ── */}
      <div className="sm:hidden p-4">
        {/* Row 1: icon top-left, status top-right */}
        <div className="flex items-start justify-between mb-2">
          <div className="p-2 rounded-xl bg-slate-50">
            <FileText className="w-5 h-5 text-slate-600" />
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={invoice.status} />
            {invoice.manager_approved_at && (
              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1">
                <Check className="w-3 h-3" /> Manager Approved
              </Badge>
            )}
          </div>
        </div>

        {/* Row 2: amount + classes on right, period on left */}
        <div className="flex items-end justify-between mb-1">
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {period}
          </p>
          <div className="text-right">
            <p className="text-xl font-bold text-slate-900">${invoice.total_amount?.toFixed(2) || "0.00"}</p>
            <p className="text-xs text-slate-500">{classes} classes</p>
          </div>
        </div>

        {/* Row 3: Name full width */}
        <p className="font-semibold text-slate-900 text-sm mb-0.5">{invNum}</p>

        {/* Row 4: instructor if shown */}
        {showInstructor && (
          <p className="text-xs text-slate-500 mb-1">{invoice.instructor_name}</p>
        )}

        {/* Row 5: View Details bottom right */}
        <div className="flex justify-end mt-2 pt-2 border-t border-slate-100">
          <Button variant="ghost" size="sm" className="text-indigo-600 h-7 px-2 text-xs">
            View Details
            <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </div>

      {/* ── DESKTOP layout (original) ── */}
      <div className="hidden sm:block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-slate-50">
              <FileText className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h4 className="font-semibold text-slate-900">{invNum}</h4>
                <StatusBadge status={invoice.status} />
                {invoice.manager_approved_at && (
                  <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1">
                    <Check className="w-3 h-3" /> Manager Approved
                  </Badge>
                )}
              </div>
              {showInstructor && (
                <p className="text-sm text-slate-600 mb-1">{invoice.instructor_name}</p>
              )}
              <p className="text-sm text-slate-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {period}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900">${invoice.total_amount?.toFixed(2) || "0.00"}</p>
            <p className="text-xs text-slate-500">{classes} classes</p>
          </div>
        </div>
        <div className="flex items-center justify-end mt-4 pt-4 border-t border-slate-100">
          <Button variant="ghost" size="sm" className="text-indigo-600">
            View Details
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}