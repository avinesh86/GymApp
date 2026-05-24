import { cn } from "@/lib/utils";

export default function StatCard({ title, value, subtitle, icon: Icon, trend, trendUp, className, onClick }) {
  return (
    <div
      className={cn(
        "bg-white rounded-2xl p-4 md:p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {/* Mobile: icon top, value below */}
      <div className="flex flex-col gap-2 sm:hidden">
        {Icon && (
          <div className="p-2 rounded-xl bg-slate-50 w-fit">
            <Icon className="w-5 h-5 text-slate-600" />
          </div>
        )}
        <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
        <p className="text-xs font-medium text-slate-500 leading-tight">{title}</p>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        {trend && (
          <p className={cn("text-xs font-medium", trendUp ? "text-green-600" : "text-red-600")}>
            {trendUp ? "+" : ""}{trend}
          </p>
        )}
      </div>

      {/* Desktop: side by side */}
      <div className="hidden sm:flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-3xl font-bold text-slate-900 tracking-tight">{value}</p>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          {trend && (
            <p className={cn("text-sm font-medium", trendUp ? "text-green-600" : "text-red-600")}>
              {trendUp ? "+" : ""}{trend}
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-3 rounded-xl bg-slate-50 shrink-0">
            <Icon className="w-6 h-6 text-slate-600" />
          </div>
        )}
      </div>
    </div>
  );
}