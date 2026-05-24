import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/ui/StatusBadge";
import { Clock, MapPin, User, AlertTriangle, Check, DollarSign } from "lucide-react";
import moment from "moment";

export default function CoverRequestCard({
  request,
  onAccept,
  onDecline,
  onViewDetails,
  userRole,
  currentUserId,
  isEligible = false
}) {
  const eventDetails = request.event_details || {};
  const isUrgent = request.urgency === 'critical' || request.urgency === 'high';
  const canAccept = isEligible && request.status === 'open';
  const hoursUntil = moment(eventDetails.start_datetime).diff(moment(), 'hours');

  const tags = (
    <div className="flex items-center gap-2 flex-wrap">
      <StatusBadge status={request.urgency} />
      <StatusBadge status={request.status} />
      {request.bonus_amount > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
          <DollarSign className="w-3 h-3" />
          +${request.bonus_amount} bonus
        </span>
      )}
    </div>
  );

  const details = (
    <div className="space-y-0.5 text-xs text-slate-500">
      <p className="flex items-center gap-1">
        <Clock className="w-3 h-3 shrink-0" />
        {moment(eventDetails.start_datetime).format("ddd, MMM D")} at {moment(eventDetails.start_datetime).format("h:mm A")}
      </p>
      {eventDetails.location && (
        <p className="flex items-center gap-1">
          <MapPin className="w-3 h-3 shrink-0" />
          {eventDetails.location}
        </p>
      )}
      {request.original_instructor_name && (
        <p className="flex items-center gap-1">
          <User className="w-3 h-3 shrink-0" />
          Originally: {request.original_instructor_name}
        </p>
      )}
      {hoursUntil < 24 && hoursUntil > 0 && (
        <p className="flex items-center gap-1 text-amber-600 font-medium">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {hoursUntil}h until class
        </p>
      )}
    </div>
  );

  const actions = (
    <div className="flex items-center gap-2 pt-3 border-t border-slate-100 mt-3">
      {canAccept ? (
        <>
          <Button onClick={() => onAccept(request)} className="flex-1 bg-green-600 hover:bg-green-700 h-8 text-xs sm:h-9 sm:text-sm">
            <Check className="w-3.5 h-3.5 mr-1" />
            Accept Cover
          </Button>
          <Button variant="outline" onClick={() => onDecline(request)} className="text-slate-600 h-8 text-xs sm:h-9 sm:text-sm">
            Decline
          </Button>
        </>
      ) : (
        <Button variant="outline" onClick={() => onViewDetails(request)} className="flex-1 h-8 text-xs sm:h-9 sm:text-sm">
          View Details
        </Button>
      )}
      {request.status === 'accepted' && request.accepted_by_instructor_name && (
        <p className="text-sm text-green-600 font-medium">
          <Check className="w-4 h-4 inline mr-1" />
          Accepted by {request.accepted_by_instructor_name}
        </p>
      )}
    </div>
  );

  return (
    <div className={cn(
      "bg-white rounded-xl border transition-all",
      isUrgent && "border-red-200 bg-red-50/30",
      "hover:shadow-md"
    )}>
      {/* ── MOBILE layout ── */}
      <div className="sm:hidden p-4">
        {/* Tags above name */}
        <div className="mb-2">{tags}</div>
        {/* Name */}
        <h4 className="font-semibold text-slate-900 text-sm mb-2">
          {eventDetails.class_type_name || "Class"}
        </h4>
        {/* Details */}
        {details}
        {actions}
      </div>

      {/* ── DESKTOP layout (original) ── */}
      <div className="hidden sm:block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h4 className="font-semibold text-slate-900">{eventDetails.class_type_name || "Class"}</h4>
              <StatusBadge status={request.urgency} />
              {request.bonus_amount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                  <DollarSign className="w-3 h-3" />
                  +${request.bonus_amount} bonus
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mb-3">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {moment(eventDetails.start_datetime).format("ddd, MMM D")} at {moment(eventDetails.start_datetime).format("h:mm A")}
              </span>
              {eventDetails.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {eventDetails.location}
                </span>
              )}
            </div>
            {request.original_instructor_name && (
              <p className="text-sm text-slate-500">
                <User className="w-3.5 h-3.5 inline mr-1" />
                Originally: {request.original_instructor_name}
              </p>
            )}
            {hoursUntil < 24 && hoursUntil > 0 && (
              <p className="text-sm text-amber-600 font-medium mt-2">
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                {hoursUntil} hours until class
              </p>
            )}
          </div>
          <StatusBadge status={request.status} />
        </div>
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
          {canAccept ? (
            <>
              <Button onClick={() => onAccept(request)} className="flex-1 bg-green-600 hover:bg-green-700">
                <Check className="w-4 h-4 mr-2" />
                Accept Cover
              </Button>
              <Button variant="outline" onClick={() => onDecline(request)} className="text-slate-600">
                Decline
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onViewDetails(request)} className="flex-1">
              View Details
            </Button>
          )}
          {request.status === 'accepted' && request.accepted_by_instructor_name && (
            <p className="text-sm text-green-600 font-medium">
              <Check className="w-4 h-4 inline mr-1" />
              Accepted by {request.accepted_by_instructor_name}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}