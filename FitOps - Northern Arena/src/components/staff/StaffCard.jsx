import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import StatusBadge from "@/components/ui/StatusBadge";
import { Mail, Phone, Star, Shield } from "lucide-react";

const roleColors = {
  owner: "bg-gradient-to-r from-indigo-500 to-purple-600 text-white",
  admin: "bg-purple-100 text-purple-700",
  gym_manager: "bg-blue-100 text-blue-700",
  payroll: "bg-green-100 text-green-700",
  team_leader: "bg-indigo-100 text-indigo-700",
  instructor: "bg-slate-100 text-slate-700",
  class_count_admin: "bg-teal-100 text-teal-700"
};

export default function StaffCard({ staff, onClick, classTypes = [], showClassDetail = false }) {
  const taughtClasses = classTypes.filter(ct => staff.classes_can_teach?.includes(ct.id));
  const roleBadge = (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
      roleColors[staff.role] || roleColors.instructor
    )}>
      {staff.role === 'owner' && <Shield className="w-3 h-3" />}
      {staff.role?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
    </span>
  );

  const avatar = (size) => (
    <div className={cn(
      "rounded-full flex items-center justify-center text-white font-semibold shrink-0",
      size,
      staff.status === 'active' ? "bg-gradient-to-br from-indigo-500 to-purple-600" : "bg-slate-300"
    )}>
      {staff.name?.charAt(0)?.toUpperCase() || "?"}
    </div>
  );

  return (
    <div
      onClick={() => onClick?.(staff)}
      className={cn(
        "bg-white rounded-xl border transition-all cursor-pointer hover:shadow-md hover:border-indigo-200"
      )}
    >
      {/* ── MOBILE layout ── */}
      <div className="sm:hidden p-4">
        {/* Tags row: role + status */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {roleBadge}
          <StatusBadge status={staff.status} />
          {staff.cover_reliability_score !== undefined && (
            <span className="inline-flex items-center gap-1 text-amber-500 text-xs font-semibold">
              <Star className="w-3 h-3 fill-current" />
              {staff.cover_reliability_score}%
            </span>
          )}
        </div>

        {/* Name + avatar row */}
        <div className="flex items-center gap-3 mb-2">
          {avatar("w-9 h-9 text-base")}
          <h4 className="font-semibold text-slate-900 text-sm leading-tight">{staff.name}</h4>
        </div>

        {/* Details */}
        <div className="space-y-0.5 text-xs text-slate-500">
          {staff.email && (
            <p className="flex items-center gap-1 truncate">
              <Mail className="w-3 h-3 shrink-0" />
              {staff.email}
            </p>
          )}
          {staff.phone && (
            <p className="flex items-center gap-1">
              <Phone className="w-3 h-3 shrink-0" />
              {staff.phone}
            </p>
          )}
        </div>

        {staff.qualifications?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {staff.qualifications.slice(0, 3).map((q, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{q}</Badge>
            ))}
            {staff.qualifications.length > 3 && (
              <Badge variant="secondary" className="text-xs">+{staff.qualifications.length - 3}</Badge>
            )}
          </div>
        )}

        {showClassDetail && (
          <div className="mt-2 pt-2 border-t border-slate-100">
            {taughtClasses.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {taughtClasses.map(ct => (
                  <span key={ct.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: ct.color || '#6366f1' }}>
                    {ct.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No classes assigned</p>
            )}
          </div>
        )}
      </div>

      {/* ── DESKTOP layout (original) ── */}
      <div className="hidden sm:flex items-start gap-4 p-5">
        {avatar("w-12 h-12 text-lg")}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-slate-900 truncate">{staff.name}</h4>
            <StatusBadge status={staff.status} />
          </div>
          {roleBadge}
          <div className="flex flex-wrap gap-3 text-sm text-slate-500 mt-2">
            {staff.email && (
              <span className="flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" />{staff.email}
              </span>
            )}
            {staff.phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />{staff.phone}
              </span>
            )}
          </div>
          {staff.qualifications?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {staff.qualifications.slice(0, 3).map((q, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{q}</Badge>
              ))}
              {staff.qualifications.length > 3 && (
                <Badge variant="secondary" className="text-xs">+{staff.qualifications.length - 3}</Badge>
              )}
            </div>
          )}

          {showClassDetail && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              {taughtClasses.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {taughtClasses.map(ct => (
                    <span key={ct.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: ct.color || '#6366f1' }}>
                      {ct.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No classes assigned</p>
              )}
            </div>
          )}
        </div>
        {staff.cover_reliability_score !== undefined && (
          <div className="text-right">
            <div className="flex items-center gap-1 text-amber-500">
              <Star className="w-4 h-4 fill-current" />
              <span className="font-semibold">{staff.cover_reliability_score}%</span>
            </div>
            <p className="text-xs text-slate-500">Reliability</p>
          </div>
        )}
      </div>
    </div>
  );
}