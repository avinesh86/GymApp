import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StatusBadge from "@/components/ui/StatusBadge";
import ViabilityBadge from "@/components/ui/ViabilityBadge";
import { Clock, MapPin, User, Users, AlertTriangle, Check, X, Trash2, Copy, Save, RefreshCw, MinusCircle } from "lucide-react";
import moment from "moment";

export default function EventDetailModal({
  event,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
  onDuplicate,
  onCreateCoverRequest,
  onSubmitAttendance,
  onDeleteSeries,
  onCancelSeries,
  staff,
  userRole,
  currentUserId,
  locations = [],
  classTypes = []
}) {
  const [attendanceCount, setAttendanceCount] = useState("");
  const [selectedInstructor, setSelectedInstructor] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit state
  const [editData, setEditData] = useState({});

  // Series confirmation: { action: 'delete'|'cancel', visible: bool }
  const [seriesConfirm, setSeriesConfirm] = useState(null);
  const [makingRecurring, setMakingRecurring] = useState(false);

  useEffect(() => {
    if (event) {
      setAttendanceCount(event.attendance_count || "");
      setSelectedInstructor(event.assigned_instructor_id || "");
      setEditData({
        date: moment(event.start_datetime).format("YYYY-MM-DD"),
        start_time: moment(event.start_datetime).format("HH:mm"),
        end_time: moment(event.end_datetime).format("HH:mm"),
        location: event.location || "",
        site: event.site || "",
        instructor_notes: event.instructor_notes || "",
        internal_notes: event.internal_notes || "",
      });
      setSeriesConfirm(null);
    }
  }, [event?.id]);

  if (!event) return null;

  const isPast = moment(event.end_datetime).isBefore(moment());
  const canEdit = ["owner", "admin", "team_leader"].includes(userRole);
  const canSubmitAttendance = isPast && (
    canEdit ||
    (userRole === "instructor" && event.assigned_instructor_id === currentUserId)
  );

  const computeViability = (count) => {
    const n = parseInt(count);
    const ct = classTypes.find(c => c.id === event.class_type_id);
    const purple = event.purple_min ?? ct?.purple_min ?? 20;
    const green  = event.green_min  ?? ct?.green_min  ?? 10;
    const amber  = event.amber_min  ?? ct?.amber_min  ?? 5;
    if (n >= purple) return "purple";
    if (n >= green)  return "green";
    if (n >= amber)  return "amber";
    return "red";
  };

  const handleSubmitAttendance = async () => {
    if (attendanceCount === "" || attendanceCount === null) return;
    setIsSubmitting(true);
    const count = parseInt(attendanceCount);
    const viabilityColor = computeViability(count);
    await onSubmitAttendance(event.id, count, viabilityColor);
    setIsSubmitting(false);
  };

  const handleNoAttendanceRecorded = async () => {
    setIsSubmitting(true);
    await onSubmitAttendance(event.id, null, "pending", true);
    setIsSubmitting(false);
  };

  const handleAssignInstructor = async () => {
    setIsSubmitting(true);
    const instructor = staff.find(s => s.id === selectedInstructor);
    await onUpdate(event.id, {
      assigned_instructor_id: selectedInstructor || null,
      assigned_instructor_name: instructor?.name || "",
      status: selectedInstructor ? "scheduled" : "unfilled"
    });
    setIsSubmitting(false);
  };

  const handleSaveEdit = async () => {
    setIsSubmitting(true);
    const startDt = moment(`${editData.date} ${editData.start_time}`).toISOString();
    const endDt = moment(`${editData.date} ${editData.end_time}`).toISOString();
    await onUpdate(event.id, {
      start_datetime: startDt,
      end_datetime: endDt,
      location: editData.location,
      site: editData.site,
      instructor_notes: editData.instructor_notes,
      internal_notes: editData.internal_notes,
    });
    setIsSubmitting(false);
  };

  const handleDeleteClick = () => {
    if (event.recurring_pattern_id) {
      setSeriesConfirm({ action: "delete" });
    } else {
      onDelete?.(event.id);
    }
  };

  const handleCancelClick = () => {
    if (event.recurring_pattern_id) {
      setSeriesConfirm({ action: "cancel" });
    } else {
      onUpdate(event.id, { status: "cancelled" });
    }
  };

  const handleSeriesConfirm = async (scope) => {
    setIsSubmitting(true);
    if (seriesConfirm.action === "delete") {
      if (scope === "series") {
        await onDeleteSeries?.(event.recurring_pattern_id);
      } else {
        await onDelete?.(event.id);
      }
    } else {
      if (scope === "series") {
        await onCancelSeries?.(event.recurring_pattern_id);
      } else {
        await onUpdate(event.id, { status: "cancelled" });
      }
    }
    setSeriesConfirm(null);
    setIsSubmitting(false);
  };

  const set = (k, v) => setEditData(prev => ({ ...prev, [k]: v }));

  const handleMakeRecurring = async () => {
    setMakingRecurring(true);
    const patternId = `pattern_${Date.now()}`;
    await onUpdate(event.id, { is_recurring: true, recurring_pattern_id: patternId });
    for (let w = 1; w <= 3; w++) {
      const newStart = moment(event.start_datetime).add(w, 'weeks').toISOString();
      const newEnd = moment(event.end_datetime).add(w, 'weeks').toISOString();
      await base44.entities.TimetableEvent.create({
        class_type_id: event.class_type_id,
        class_type_name: event.class_type_name,
        start_datetime: newStart,
        end_datetime: newEnd,
        location: event.location || "",
        site: event.site || "",
        assigned_instructor_id: event.assigned_instructor_id || null,
        assigned_instructor_name: event.assigned_instructor_name || null,
        instructor_notes: event.instructor_notes || "",
        internal_notes: event.internal_notes || "",
        is_recurring: true,
        recurring_pattern_id: patternId,
        status: 'scheduled',
        viability_color: 'pending',
      });
    }
    setMakingRecurring(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl">{event.class_type_name}</DialogTitle>
              <p className="text-sm text-slate-500 mt-1">
                {moment(event.start_datetime).format("dddd, MMMM D, YYYY")}
                {event.is_recurring && (
                  <span className="ml-2 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">Recurring</span>
                )}
              </p>
            </div>
            <StatusBadge status={event.status} />
          </div>
        </DialogHeader>

        {/* Series confirmation overlay */}
        {seriesConfirm && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <p className="font-semibold text-amber-800 text-sm">
              {seriesConfirm.action === "delete" ? "Delete" : "Cancel"} recurring class
            </p>
            <p className="text-sm text-amber-700">
              This is a recurring class. Do you want to {seriesConfirm.action} just this one, or all future classes in the series?
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => handleSeriesConfirm("one")} disabled={isSubmitting}>
                Just this class
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleSeriesConfirm("series")} disabled={isSubmitting}>
                {seriesConfirm.action === "delete" ? "Delete" : "Cancel"} all in series
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSeriesConfirm(null)} disabled={isSubmitting}>
                Go back
              </Button>
            </div>
          </div>
        )}

        {!seriesConfirm && (
          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-sm">
                  {moment(event.start_datetime).format("h:mm A")} – {moment(event.end_datetime).format("h:mm A")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span className="text-sm">{event.location || "TBD"}</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" />
                <span className="text-sm">{event.assigned_instructor_name || "Unassigned"}</span>
              </div>
              {event.attendance_count != null && (
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400" />
                  <span className="text-sm">{event.attendance_count} attendees</span>
                  <ViabilityBadge color={event.viability_color} />
                </div>
              )}
            </div>

            <Tabs defaultValue="details" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                {canSubmitAttendance && <TabsTrigger value="attendance" className="flex-1">Attendance</TabsTrigger>}
                {canEdit && <TabsTrigger value="edit" className="flex-1">Edit</TabsTrigger>}
                {canEdit && <TabsTrigger value="manage" className="flex-1">Manage</TabsTrigger>}
              </TabsList>

              <TabsContent value="details" className="space-y-4 pt-4">
                {event.instructor_notes && (
                  <div>
                    <Label className="text-xs text-slate-500">Instructor Notes</Label>
                    <p className="text-sm mt-1">{event.instructor_notes}</p>
                  </div>
                )}
                {event.internal_notes && canEdit && (
                  <div>
                    <Label className="text-xs text-slate-500">Internal Notes</Label>
                    <p className="text-sm mt-1">{event.internal_notes}</p>
                  </div>
                )}
                {event.status === "covered" && (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-sm text-amber-800">This class was covered.</p>
                  </div>
                )}
              </TabsContent>

              {canSubmitAttendance && (
                <TabsContent value="attendance" className="space-y-4 pt-4">
                  {event.attendance_status === 'not_recorded' && (
                    <div className="p-3 bg-slate-100 rounded-lg border border-slate-200 text-sm text-slate-600 flex items-center gap-2">
                      <MinusCircle className="w-4 h-4 shrink-0 text-slate-400" />
                      Attendance was marked as not recorded. You can still submit a count below to override this.
                    </div>
                  )}
                  {event.attendance_status === 'recorded' && (
                    <div className="p-3 bg-green-50 rounded-lg border border-green-100 text-sm text-green-700 flex items-center gap-2">
                      <Check className="w-4 h-4 shrink-0" />
                      Attendance already recorded: <strong>{event.attendance_count}</strong>. Submit below to update.
                    </div>
                  )}
                  <div>
                    <Label>Attendance Count</Label>
                    <Input
                      type="number" min="0"
                      value={attendanceCount}
                      onChange={e => setAttendanceCount(e.target.value)}
                      placeholder="Enter number of attendees"
                      className="mt-1"
                    />
                  </div>
                  {/* Quick number buttons */}
                  <div className="flex flex-wrap gap-2">
                    {[0, 5, 10, 15, 20, 25, 30].map((n) => (
                      <button
                        key={n}
                        onClick={() => setAttendanceCount(String(n))}
                        className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                          String(attendanceCount) === String(n)
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-300"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <Button
                    onClick={handleSubmitAttendance}
                    disabled={attendanceCount === "" || isSubmitting}
                    className="w-full"
                  >
                    <Check className="w-4 h-4 mr-2" /> Submit Attendance
                  </Button>
                  <Button
                    onClick={handleNoAttendanceRecorded}
                    disabled={isSubmitting}
                    variant="outline"
                    className="w-full text-slate-600 border-slate-300 hover:bg-slate-50"
                  >
                    <MinusCircle className="w-4 h-4 mr-2" /> No Attendance Recorded
                  </Button>
                </TabsContent>
              )}

              {canEdit && (
                <TabsContent value="edit" className="space-y-3 pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Date</Label>
                      <Input type="date" value={editData.date} onChange={e => set("date", e.target.value)} className="mt-1 h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Location</Label>
                      {locations.length > 0 ? (
                        <Select value={editData.location} onValueChange={v => set("location", v)}>
                          <SelectTrigger className="mt-1 h-8 text-sm">
                            <SelectValue placeholder="Select location" />
                          </SelectTrigger>
                          <SelectContent>
                            {[...locations].sort((a, b) => a.localeCompare(b)).map(loc => (
                              <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={editData.location} onChange={e => set("location", e.target.value)} className="mt-1 h-8 text-sm" placeholder="Studio A" />
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">Start Time</Label>
                      <Input type="time" value={editData.start_time} onChange={e => set("start_time", e.target.value)} className="mt-1 h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">End Time</Label>
                      <Input type="time" value={editData.end_time} onChange={e => set("end_time", e.target.value)} className="mt-1 h-8 text-sm" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Site</Label>
                      <Input value={editData.site} onChange={e => set("site", e.target.value)} className="mt-1 h-8 text-sm" placeholder="Main Site" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Instructor Notes (visible to instructor)</Label>
                    <Textarea value={editData.instructor_notes} onChange={e => set("instructor_notes", e.target.value)} rows={2} className="mt-1 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Internal Notes (admin only)</Label>
                    <Textarea value={editData.internal_notes} onChange={e => set("internal_notes", e.target.value)} rows={2} className="mt-1 text-sm" />
                  </div>
                  <Button onClick={handleSaveEdit} disabled={isSubmitting} className="w-full gap-2">
                    <Save className="w-4 h-4" /> Save Changes
                  </Button>

                  {!event.is_recurring && (
                    <div className="pt-3 border-t">
                      <p className="text-xs text-slate-500 mb-2">This is a one-off class. Convert to a recurring series (generates this class + 3 more weekly instances = 4 weeks total).</p>
                      <Button
                        variant="outline"
                        className="w-full gap-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                        onClick={handleMakeRecurring}
                        disabled={makingRecurring || isSubmitting}
                      >
                        <RefreshCw className="w-4 h-4" />
                        {makingRecurring ? "Generating..." : "Make Recurring (4 weeks)"}
                      </Button>
                    </div>
                  )}
                </TabsContent>
              )}

              {canEdit && (
                <TabsContent value="manage" className="space-y-4 pt-4">
                  <div>
                    <Label>Assign Instructor</Label>
                    <Select value={selectedInstructor} onValueChange={setSelectedInstructor}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select instructor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>Unassigned</SelectItem>
                        {[...staff.filter(s => s.role === "instructor" && s.status === "active")].sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleAssignInstructor} disabled={isSubmitting} className="w-full mt-2" variant="outline">
                      Update Assignment
                    </Button>
                  </div>

                  <div className="pt-2 border-t">
                    <Button
                      variant="outline"
                      className="w-full text-orange-600 border-orange-200 hover:bg-orange-50"
                      onClick={() => onCreateCoverRequest(event)}
                    >
                      <AlertTriangle className="w-4 h-4 mr-2" /> Create Cover Request
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50" onClick={() => onDuplicate?.(event)}>
                      <Copy className="w-4 h-4 mr-2" /> Duplicate
                    </Button>
                    <Button variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50" onClick={handleCancelClick}>
                      <X className="w-4 h-4 mr-2" /> Cancel Class
                    </Button>
                  </div>

                  <Button variant="outline" className="w-full text-red-700 border-red-300 hover:bg-red-50" onClick={handleDeleteClick}>
                    <Trash2 className="w-4 h-4 mr-2" /> Delete Permanently
                  </Button>
                </TabsContent>
              )}
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}