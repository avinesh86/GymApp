import { cn } from "@/lib/utils";

const viabilityConfig = {
  red: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200", label: "Low" },
  amber: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200", label: "Moderate" },
  green: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200", label: "Good" },
  purple: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200", label: "Excellent" },
  pending: { bg: "bg-slate-100", text: "text-slate-500", border: "border-slate-200", label: "Pending" }
};

export default function ViabilityBadge({ color, count, showLabel = false, size = "sm" }) {
  const config = viabilityConfig[color] || viabilityConfig.pending;
  
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border font-medium",
      config.bg, config.text, config.border,
      size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
    )}>
      {count !== undefined && <span>{count}</span>}
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}