import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import CoverRequestCard from "@/components/cover/CoverRequestCard";
import CoverRequestDetailModal from "@/components/cover/CoverRequestDetailModal";
import { dispatchCoverOffers, escalateCoverRequest } from "@/lib/coverMatchingService";
import { Search, Filter, AlertTriangle, Check, X, Zap } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

export default function CoverBoard() {
  const [user, setUser] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [allStaff, setAllStaff] = useState([]);
  const [coverRequests, setCoverRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [declineModal, setDeclineModal] = useState(null);
  const [declineReason, setDeclineReason] = useState("");
  const [classTypes, setClassTypes] = useState([]);
  const [dispatching, setDispatching] = useState(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [userData, staffData, requestsData, classTypesData] = await Promise.all([
        base44.auth.me(),
        base44.entities.Staff.filter({ status: 'active' }),
        base44.entities.CoverRequest.list('-created_date', 100),
        base44.entities.ClassType.filter({ status: 'active' })
      ]);
      setClassTypes(classTypesData);
      
      setUser(userData);
      setAllStaff(staffData);
      setCoverRequests(requestsData);
      
      const myProfile = staffData.find(s => s.email === userData.email);
      setStaffProfile(myProfile);
    } catch (e) {
      console.error("Error loading data:", e);
    } finally {
      setLoading(false);
    }
  };

  const userRole = staffProfile?.role || 'instructor';
  const isAdmin = ['owner', 'admin', 'gym_manager', 'team_leader'].includes(userRole);

  // Check if instructor is eligible for a request
  const isEligibleForRequest = (request) => {
    if (!staffProfile || userRole !== 'instructor') return false;
    if (request.status !== 'open') return false;
    
    // Check if already offered and declined
    const offer = request.offers_sent?.find(o => o.instructor_id === staffProfile.id);
    if (offer?.response === 'declined') return false;
    
    // Check eligible_instructor_ids if set
    if (request.eligible_instructor_ids?.length > 0) {
      return request.eligible_instructor_ids.includes(staffProfile.id);
    }
    
    return true;
  };

  // Filter requests
  const filteredRequests = coverRequests.filter(req => {
    if (statusFilter !== 'all' && req.status !== statusFilter) return false;
    if (urgencyFilter !== 'all' && req.urgency !== urgencyFilter) return false;
    return true;
  });

  // Separate open requests (opportunities)
  const openRequests = filteredRequests.filter(r => r.status === 'open');
  const otherRequests = filteredRequests.filter(r => r.status !== 'open');

  const handleAcceptCover = async (request) => {
    // Re-check the request is still open (real-time guard)
    const latest = await base44.entities.CoverRequest.filter({ id: request.id });
    if (latest.length > 0 && latest[0].status !== 'open') {
      toast.error("This cover has already been filled by someone else.");
      loadData();
      return;
    }

    await base44.entities.CoverRequest.update(request.id, {
      status: 'accepted',
      accepted_by_instructor_id: staffProfile.id,
      accepted_by_instructor_name: staffProfile.name,
      accepted_at: new Date().toISOString(),
      offers_sent: [
        ...(request.offers_sent || []),
        {
          instructor_id: staffProfile.id,
          instructor_name: staffProfile.name,
          sent_at: new Date().toISOString(),
          tier: staffProfile.priority_tier || 2,
          response: 'accepted',
          response_at: new Date().toISOString()
        }
      ]
    });
    
    await base44.entities.TimetableEvent.update(request.event_id, {
      assigned_instructor_id: staffProfile.id,
      assigned_instructor_name: staffProfile.name,
      status: 'covered'
    });

    const originalInstructor = allStaff.find(s => s.id === request.original_instructor_id);
    
    // In-app notification
    await base44.entities.Notification.create({
      recipient_id: request.original_instructor_id,
      recipient_email: originalInstructor?.email,
      type: 'cover_accepted',
      title: 'Cover Request Filled',
      message: `${staffProfile.name} has accepted to cover your ${request.event_details?.class_type_name} class on ${moment(request.event_details?.start_datetime).format("ddd, MMM D")}.`,
      related_entity_type: 'CoverRequest',
      related_entity_id: request.id
    });

    // Email notification to original instructor
    if (originalInstructor?.email) {
      base44.integrations.Core.SendEmail({
        to: originalInstructor.email,
        subject: `Cover Filled: ${request.event_details?.class_type_name}`,
        body: `Hi ${originalInstructor.name},\n\nGreat news! ${staffProfile.name} has agreed to cover your ${request.event_details?.class_type_name} class on ${moment(request.event_details?.start_datetime).format("dddd, MMMM D")} at ${moment(request.event_details?.start_datetime).format("h:mm A")}.\n\nNo further action needed from you.\n\nFitOps`
      }).catch(() => {});
    }

    // Email to the covering instructor confirming
    if (staffProfile?.email) {
      base44.integrations.Core.SendEmail({
        to: staffProfile.email,
        subject: `Cover Confirmed: ${request.event_details?.class_type_name}`,
        body: `Hi ${staffProfile.name},\n\nYou have confirmed cover for:\n\nClass: ${request.event_details?.class_type_name}\nDate: ${moment(request.event_details?.start_datetime).format("dddd, MMMM D")}\nTime: ${moment(request.event_details?.start_datetime).format("h:mm A")} - ${moment(request.event_details?.end_datetime).format("h:mm A")}\nLocation: ${request.event_details?.location || "TBC"}\n\nThank you!\nFitOps`
      }).catch(() => {});
    }
    
    toast.success("Cover accepted! Confirmation emails sent.");
    loadData();
  };

  const handleDeclineCover = async () => {
    if (!declineModal) return;
    
    await base44.entities.CoverRequest.update(declineModal.id, {
      offers_sent: [
        ...(declineModal.offers_sent || []),
        {
          instructor_id: staffProfile.id,
          instructor_name: staffProfile.name,
          sent_at: new Date().toISOString(),
          tier: staffProfile.priority_tier || 2,
          response: 'declined',
          response_at: new Date().toISOString(),
          decline_reason: declineReason
        }
      ]
    });
    
    setDeclineModal(null);
    setDeclineReason("");
    loadData();
  };

  const handleAutoDispatch = async (request) => {
    setDispatching(request.id);
    try {
      const classType = classTypes.find(ct => ct.name === request.event_details?.class_type_name);
      const result = await dispatchCoverOffers(request, allStaff, classType, request.id);
      toast.success(`Offers sent to ${result.offersSent.length} Tier ${result.tierNum} instructor(s)`);
      loadData();
    } catch (e) {
      toast.error("Failed to dispatch offers");
    } finally {
      setDispatching(null);
    }
  };

  const handleEscalate = async (request) => {
    setDispatching(request.id);
    try {
      const classType = classTypes.find(ct => ct.name === request.event_details?.class_type_name);
      const result = await escalateCoverRequest(request, request.id, allStaff, classType);
      if (result.escalated) {
        toast.success(`Escalated to Tier ${result.nextTier} - ${result.count} instructor(s) notified`);
      } else {
        toast.warning("No more tiers available - admins have been notified");
      }
      loadData();
    } catch (e) {
      toast.error("Escalation failed");
    } finally {
      setDispatching(null);
    }
  };

  const handleAdminAssign = async (request, instructorId) => {
    const instructor = allStaff.find(s => s.id === instructorId);
    
    await base44.entities.CoverRequest.update(request.id, {
      status: 'filled_by_admin',
      accepted_by_instructor_id: instructorId,
      accepted_by_instructor_name: instructor?.name
    });
    
    await base44.entities.TimetableEvent.update(request.event_id, {
      assigned_instructor_id: instructorId,
      assigned_instructor_name: instructor?.name,
      status: 'covered'
    });
    
    setSelectedRequest(null);
    loadData();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cover Board</h1>
          <p className="text-slate-500">
            {openRequests.length} open request{openRequests.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="filled_by_admin">Filled by Admin</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Urgency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Urgency</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Open Requests */}
      {openRequests.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Open Cover Requests
            </h2>
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2 text-indigo-600 border-indigo-200"
                onClick={() => openRequests.forEach(r => handleAutoDispatch(r))}
                disabled={!!dispatching}
              >
                <Zap className="w-4 h-4" />
                Auto-Dispatch All
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {openRequests.map(request => (
              <div key={request.id} className="space-y-2">
                <CoverRequestCard
                  request={request}
                  userRole={userRole}
                  currentUserId={staffProfile?.id}
                  isEligible={isEligibleForRequest(request)}
                  onAccept={handleAcceptCover}
                  onDecline={(req) => setDeclineModal(req)}
                  onViewDetails={setSelectedRequest}
                />
                {isAdmin && (
                  <div className="flex gap-2 px-1">
                    <Button size="sm" variant="outline" className="flex-1 text-xs gap-1 text-indigo-600 border-indigo-200"
                      onClick={() => handleAutoDispatch(request)} disabled={dispatching === request.id}>
                      <Zap className="w-3 h-3" />{dispatching === request.id ? "Dispatching..." : "Auto-Dispatch"}
                    </Button>
                    {request.status === "offered" && (
                      <Button size="sm" variant="outline" className="flex-1 text-xs gap-1 text-amber-600 border-amber-200"
                        onClick={() => handleEscalate(request)} disabled={dispatching === request.id}>
                        <AlertTriangle className="w-3 h-3" /> Escalate
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other Requests */}
      {otherRequests.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            {statusFilter === 'all' ? 'Resolved Requests' : 'Results'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {otherRequests.map(request => (
              <CoverRequestCard
                key={request.id}
                request={request}
                userRole={userRole}
                currentUserId={staffProfile?.id}
                isEligible={false}
                onAccept={() => {}}
                onDecline={() => {}}
                onViewDetails={setSelectedRequest}
              />
            ))}
          </div>
        </div>
      )}

      {filteredRequests.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
          <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No cover requests found</p>
        </div>
      )}

      {/* Decline Modal */}
      <Dialog open={!!declineModal} onOpenChange={() => setDeclineModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Cover Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Please let us know why you can't take this cover (optional)
            </p>
            <div className="space-y-2">
              {["I'm busy at this time", "Not qualified for this class", "Too short notice", "Other"].map(reason => (
                <Button
                  key={reason}
                  variant={declineReason === reason ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => setDeclineReason(reason)}
                >
                  {reason}
                </Button>
              ))}
            </div>
            <Textarea
              placeholder="Additional details (optional)"
              value={declineReason.startsWith("Other") ? "" : ""}
              onChange={(e) => setDeclineReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineModal(null)}>Cancel</Button>
            <Button onClick={handleDeclineCover}>Decline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Modal for Admins */}
      {selectedRequest && (
        <CoverRequestDetailModal
          request={selectedRequest}
          isOpen={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onAssign={handleAdminAssign}
          staff={allStaff}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}