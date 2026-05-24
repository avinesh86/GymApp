import { cn } from "@/lib/utils";
import { Clock, MapPin, User, MinusCircle } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import ViabilityBadge from "@/components/ui/ViabilityBadge";
import moment from "moment";

export default function EventCard({ event, onClick, compact = false, classColor }) {
  const startTime = moment(event.start_datetime).format("h:mm A");
  const endTime = moment(event.end_datetime).format("h:mm A");
  const isPast = moment(event.end_datetime).isBefore(moment());
  const color = classColor || "#6366f1";

  // Attendance state — support both new attendance_status field and legacy completed/count records
  const attendanceRecorded = event.attendance_status === 'recorded' || 
    (event.attendance_status == null && (event.status === 'completed' || event.attendance_count != null));
  const attendanceNotRecorded = event.attendance_status === 'not_recorded';
  // Past, non-cancelled, attendance not yet addressed at all
  const needsAttendance = isPast && event.status !== 'cancelled' && !attendanceRecorded && !attendanceNotRecorded;

  // Derive a more descriptive display status
  const displayStatus = event.status === 'scheduled'
    ? (event.is_recurring ? 'ongoing' : 'one_off')
    : event.status;

  return (
    <div
      onClick={() => onClick?.(event)}
      className={cn(
        "group rounded-xl border transition-all cursor-pointer hover:shadow-md overflow-hidden",
        compact ? "text-xs" : "text-sm",
        // Red tile for missing attendance
        needsAttendance ? "bg-red-50 border-red-300" : "bg-white border-slate-200",
        // Muted grey for explicitly not-recorded
        attendanceNotRecorded && "bg-slate-100 border-slate-300",
        isPast && !needsAttendance && !attendanceNotRecorded && "opacity-70",
        event.status === 'cancelled' && "opacity-50"
      )}
      style={{ borderLeft: `4px solid ${needsAttendance ? '#ef4444' : attendanceNotRecorded ? '#94a3b8' : color}` }}
    >
      <div className={cn("p-2.5", compact ? "space-y-1" : "space-y-1.5")}>
        {/* Tags row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={displayStatus} className="text-[10px] px-1.5 py-0" />
          {attendanceRecorded && event.attendance_count != null && (
            <ViabilityBadge 
              color={event.viability_color && event.viability_color !== 'pending' ? event.viability_color : 'pending'} 
              count={event.attendance_count} 
            />
          )}
          {attendanceNotRecorded && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 bg-slate-200 rounded-full px-1.5 py-0">
              <MinusCircle className="w-2.5 h-2.5" /> Not recorded
            </span>
          )}
          {needsAttendance && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600 bg-red-100 rounded-full px-1.5 py-0">
              Awaiting attendance
            </span>
          )}
        </div>
        {/* Class name */}
        <p className={cn("font-semibold text-slate-900 leading-tight", compact ? "text-xs" : "text-sm")}>
          {event.class_type_name || "Unnamed Class"}
        </p>
        {/* Time + location */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-500" style={{ fontSize: '11px' }}>
          <span className="flex items-center gap-0.5">
            <Clock className="w-3 h-3 shrink-0" />
            {startTime}–{endTime}
          </span>
          {event.location && (
            <span className="flex items-center gap-0.5">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[90px]">{event.location}</span>
            </span>
          )}
        </div>
        {/* Instructor (non-compact only) */}
        {!compact && (
          <div className="flex items-center gap-1 text-slate-500" style={{ fontSize: '11px' }}>
            <User className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {event.assigned_instructor_name || <span className="text-amber-600 font-medium">Unassigned</span>}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}