import { cn } from "@/lib/utils";

export default function ViabilityHeatmap({ events }) {
  const counts = {
    red: events.filter(e => e.viability_color === 'red').length,
    amber: events.filter(e => e.viability_color === 'amber').length,
    green: events.filter(e => e.viability_color === 'green').length,
    purple: events.filter(e => e.viability_color === 'purple').length,
    pending: events.filter(e => !e.viability_color || e.viability_color === 'pending').length,
  };
  
  const total = events.length || 1;
  
  const segments = [
    { key: 'purple', color: 'bg-purple-500', label: 'Excellent', count: counts.purple },
    { key: 'green', color: 'bg-green-500', label: 'Good', count: counts.green },
    { key: 'amber', color: 'bg-amber-500', label: 'Moderate', count: counts.amber },
    { key: 'red', color: 'bg-red-500', label: 'Low', count: counts.red },
    { key: 'pending', color: 'bg-slate-300', label: 'Pending', count: counts.pending },
  ];

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Class Viability</h3>
      
      {/* Bar */}
      <div className="h-3 rounded-full bg-slate-100 overflow-hidden flex mb-4">
        {segments.map(seg => (
          seg.count > 0 && (
            <div
              key={seg.key}
              className={cn("h-full transition-all", seg.color)}
              style={{ width: `${(seg.count / total) * 100}%` }}
            />
          )
        ))}
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {segments.map(seg => (
          <div key={seg.key} className="flex items-center gap-2">
            <span className={cn("w-2.5 h-2.5 rounded-full", seg.color)} />
            <span className="text-xs text-slate-600">{seg.label}</span>
            <span className="text-xs font-semibold text-slate-900">{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}