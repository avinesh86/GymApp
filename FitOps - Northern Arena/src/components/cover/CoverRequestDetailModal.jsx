import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import StatusBadge from "@/components/ui/StatusBadge";
import { Clock, MapPin, User, AlertTriangle, Check, X, DollarSign } from "lucide-react";
import moment from "moment";

export default function CoverRequestDetailModal({ 
  request, 
  isOpen, 
  onClose, 
  onAssign,
  staff,
  isAdmin
}) {
  const [selectedInstructor, setSelectedInstructor] = useState("");
  
  const eventDetails = request.event_details || {};
  const eligibleStaff = staff.filter(s => 
    s.role === 'instructor' && 
    s.status === 'active' &&
    s.id !== request.original_instructor_id
  );

  const sortedOffers = [...(request.offers_sent || [])].sort((a, b) => 
    new Date(b.sent_at) - new Date(a.sent_at)
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>{eventDetails.class_type_name || "Cover Request"}</DialogTitle>
              <p className="text-sm text-slate-500 mt-1">
                {moment(eventDetails.start_datetime).format("dddd, MMMM D, YYYY")}
              </p>
            </div>
            <StatusBadge status={request.status} />
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Event Details */}
          <div className="p-4 bg-slate-50 rounded-xl space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-sm">
                {moment(eventDetails.start_datetime).format("h:mm A")} - {moment(eventDetails.end_datetime).format("h:mm A")}
              </span>
            </div>
            {eventDetails.location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span className="text-sm">{eventDetails.location}</span>
              </div>
            )}
            {request.original_instructor_name && (
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" />
                <span className="text-sm">Originally: {request.original_instructor_name}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-slate-400" />
              <StatusBadge status={request.urgency} />
            </div>
            {request.bonus_amount > 0 && (
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600 font-medium">
                  +${request.bonus_amount} bonus for this shift
                </span>
              </div>
            )}
          </div>

          {/* Accepted By */}
          {request.accepted_by_instructor_name && (
            <div className="p-4 bg-green-50 rounded-xl border border-green-100">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-800">
                    Accepted by {request.accepted_by_instructor_name}
                  </p>
                  <p className="text-sm text-green-600">
                    {moment(request.accepted_at).format("MMM D, h:mm A")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Offer History */}
          {sortedOffers.length > 0 && isAdmin && (
            <div>
              <Label className="text-xs text-slate-500 uppercase tracking-wider">Offer History</Label>
              <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                {sortedOffers.map((offer, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                        offer.response === 'accepted' ? 'bg-green-100 text-green-600' :
                        offer.response === 'declined' ? 'bg-red-100 text-red-600' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        T{offer.tier}
                      </div>
                      <span className="text-sm">{offer.instructor_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {offer.response === 'accepted' && <Check className="w-4 h-4 text-green-500" />}
                      {offer.response === 'declined' && <X className="w-4 h-4 text-red-500" />}
                      {!offer.response && <span className="text-xs text-slate-400">Pending</span>}
                      {offer.decline_reason && (
                        <span className="text-xs text-slate-500">({offer.decline_reason})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admin Assignment */}
          {isAdmin && request.status === 'open' && (
            <div className="pt-4 border-t">
              <Label>Manually Assign Instructor</Label>
              <div className="flex gap-2 mt-2">
                <Select value={selectedInstructor} onValueChange={setSelectedInstructor}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select instructor" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleStaff.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} (Tier {s.priority_tier || 2})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  onClick={() => onAssign(request, selectedInstructor)}
                  disabled={!selectedInstructor}
                >
                  Assign
                </Button>
              </div>
            </div>
          )}

          {request.notes && (
            <div>
              <Label className="text-xs text-slate-500">Notes</Label>
              <p className="text-sm mt-1">{request.notes}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}