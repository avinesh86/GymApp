import { cn } from "@/lib/utils";

const statusConfigs = {
  // Event statuses
  scheduled: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  one_off: { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-400" },
  ongoing: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  unfilled: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  needs_cover: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  covered: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  cancelled: { bg: "bg-slate-50", text: "text-slate-500", dot: "bg-slate-400" },
  completed: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  
  // Cover request statuses
  open: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  offered: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  accepted: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  expired: { bg: "bg-slate-50", text: "text-slate-500", dot: "bg-slate-400" },
  filled_by_admin: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  
  // Invoice statuses
  draft: { bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400" },
  submitted: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  manager_approved: { bg: "bg-cyan-50", text: "text-cyan-700", dot: "bg-cyan-500" },
  payroll_approved: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  paid: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  rejected: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  
  // Staff statuses
  active: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  inactive: { bg: "bg-slate-50", text: "text-slate-500", dot: "bg-slate-400" },
  
  // Urgency
  low: { bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400" },
  medium: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  high: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  critical: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
};

export default function StatusBadge({ status, className }) {
  const config = statusConfigs[status] || statusConfigs.draft;
  const label = status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
      config.bg, config.text, className
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
      {label}
    </span>
  );
}