import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from "@/components/ui/StatusBadge";
import ViabilityBadge from "@/components/ui/ViabilityBadge";
import { toast } from "sonner";
import { 
  Calendar, Clock, MapPin, Users, AlertTriangle, 
  Check, ChevronLeft, ChevronRight, UserX, Save, Bell
} from "lucide-react";
import moment from "moment";

const TIME_BANDS = ["morning", "lunch", "afternoon", "evening"];
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const BAND_TIMES = {
  morning: "6am-12pm",
  lunch: "12pm-2pm",
  afternoon: "2pm-5pm",
  evening: "5pm-10pm",
};

export default function MySchedule() {
  const [staffProfile, setStaffProfile] = useState(null);
  const [myEvents, setMyEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState("upcoming");

  // Mark absent modal
  const [absentModal, setAbsentModal] = useState(null);
  const [absentReason, setAbsentReason] = useState("");
  const [absentNote, setAbsentNote] = useState("");
  const [submittingAbsent, setSubmittingAbsent] = useState(false);

  // Attendance modal
  const [attendanceModal, setAttendanceModal] = useState(null);
  const [attendanceCount, setAttendanceCount] = useState("");
  const [submittingAttendance, setSubmittingAttendance] = useState(false);

  // Availability modal
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [availability, setAvailability] = useState({});
  const [savingAvailability, setSavingAvailability] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const userData = await base44.auth.me();
      const staffList = await base44.entities.Staff.filter({ email: userData.email });
      if (staffList.length > 0) {
        const profile = staffList[0];
        setStaffProfile(profile);
        setAvailability(profile.availability_preferences || {});
        await loadEvents(profile.id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async (instructorId) => {
    const start = moment().subtract(30, "days").toISOString();
    const end = moment().add(60, "days").toISOString();
    const events = await base44.entities.TimetableEvent.filter(
      { assigned_instructor_id: instructorId, start_datetime: { $gte: start, $lte: end } },
      "start_datetime",
      200
    );
    setMyEvents(events);
  };

  const weekStart = moment().add(weekOffset, "weeks").startOf("isoWeek");
  const weekEnd = moment().add(weekOffset, "weeks").endOf("isoWeek");

  const weekEvents = myEvents.filter(e =>
    moment(e.start_datetime).isBetween(weekStart, weekEnd, null, "[]")
  );

  const upcomingEvents = myEvents
    .filter(e => moment(e.start_datetime).isAfter(moment()))
    .slice(0, 20);

  const pastEvents = myEvents
    .filter(e => moment(e.start_datetime).isBefore(moment()))
    .sort((a, b) => moment(b.start_datetime).diff(moment(a.start_datetime)))
    .slice(0, 20);

  const displayEvents = viewMode === "week" ? weekEvents
    : viewMode === "past" ? pastEvents
    : upcomingEvents;

  // Group by date
  const grouped = displayEvents.reduce((acc, event) => {
    const key = moment(event.start_datetime).format("YYYY-MM-DD");
    if (!acc[key]) acc[key] = [];
    acc[key].push(event);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort();

  const handleMarkAbsent = async () => {
    if (!absentModal || !staffProfile) return;
    setSubmittingAbsent(true);
    try {
      // Create absence record
      await base44.entities.Absence.create({
        instructor_id: staffProfile.id,
        instructor_name: staffProfile.name,
        start_datetime: absentModal.start_datetime,
        end_datetime: absentModal.end_datetime,
        reason: `${absentReason}${absentNote ? " - " + absentNote : ""}`,
        status: "pending",
        affected_event_ids: [absentModal.id],
      });

      // Update the event to needs_cover
      await base44.entities.TimetableEvent.update(absentModal.id, {
        status: "needs_cover",
        original_instructor_id: staffProfile.id,
      });

      const urgency = moment(absentModal.start_datetime).diff(moment(), "hours") < 24 ? "critical"
        : moment(absentModal.start_datetime).diff(moment(), "hours") < 48 ? "high" : "medium";

      // Auto-create cover request
      await base44.entities.CoverRequest.create({
        event_id: absentModal.id,
        event_details: {
          class_type_name: absentModal.class_type_name,
          start_datetime: absentModal.start_datetime,
          end_datetime: absentModal.end_datetime,
          location: absentModal.location,
        },
        original_instructor_id: staffProfile.id,
        original_instructor_name: staffProfile.name,
        status: "open",
        urgency,
        notes: `Instructor self-reported absence: ${absentReason}`,
      });

      // Email eligible instructors about the new cover request
      try {
        const allStaff = await base44.entities.Staff.filter({ status: "active" });
        const eligible = allStaff.filter(
          s => s.role === "instructor" && s.id !== staffProfile.id && s.email
        );
        for (const ins of eligible.slice(0, 10)) {
          base44.integrations.Core.SendEmail({
            to: ins.email,
            subject: `Cover Needed: ${absentModal.class_type_name} - ${moment(absentModal.start_datetime).format("ddd, MMM D")}`,
            body: `Hi ${ins.name},\n\nA cover is needed for:\n\nClass: ${absentModal.class_type_name}\nDate: ${moment(absentModal.start_datetime).format("dddd, MMMM D")}\nTime: ${moment(absentModal.start_datetime).format("h:mm A")} - ${moment(absentModal.end_datetime).format("h:mm A")}\nLocation: ${absentModal.location || "TBC"}\nUrgency: ${urgency.toUpperCase()}\n\nReply YES to accept or NO to decline, or log in to the app to respond.\n\nFitOps`
          }).catch(() => {});
        }
      } catch (e) {
        // non-blocking
      }

      toast.success("Absence recorded, cover request created, and instructors notified by email");
      setAbsentModal(null);
      setAbsentReason("");
      setAbsentNote("");
      await loadEvents(staffProfile.id);
    } catch (e) {
      toast.error("Failed to record absence");
    } finally {
      setSubmittingAbsent(false);
    }
  };

  const handleSubmitAttendance = async () => {
    if (!attendanceModal || !attendanceCount) return;
    setSubmittingAttendance(true);
    try {
      // Compute viability
      const classTypes = await base44.entities.ClassType.filter({ name: attendanceModal.class_type_name });
      let viabilityColor = "pending";
      if (classTypes.length > 0) {
        const ct = classTypes[0];
        const n = parseInt(attendanceCount);
        if (n >= ct.purple_min) viabilityColor = "purple";
        else if (n >= ct.green_min) viabilityColor = "green";
        else if (n >= ct.amber_min) viabilityColor = "amber";
        else viabilityColor = "red";
      }

      await base44.entities.TimetableEvent.update(attendanceModal.id, {
        attendance_count: parseInt(attendanceCount),
        attendance_submitted_by: staffProfile.email,
        attendance_submitted_at: new Date().toISOString(),
        viability_color: viabilityColor,
        status: "completed",
      });

      toast.success("Attendance submitted");
      setAttendanceModal(null);
      setAttendanceCount("");
      await loadEvents(staffProfile.id);
    } catch (e) {
      toast.error("Failed to submit attendance");
    } finally {
      setSubmittingAttendance(false);
    }
  };

  const handleSaveAvailability = async () => {
    setSavingAvailability(true);
    try {
      await base44.entities.Staff.update(staffProfile.id, { availability_preferences: availability });
      setStaffProfile(prev => ({ ...prev, availability_preferences: availability }));
      toast.success("Availability saved");
      setShowAvailabilityModal(false);
    } catch (e) {
      toast.error("Failed to save availability");
    } finally {
      setSavingAvailability(false);
    }
  };

  const toggleBand = (day, band) => {
    setAvailability(prev => {
      const curr = prev[day] || [];
      return {
        ...prev,
        [day]: curr.includes(band) ? curr.filter(b => b !== band) : [...curr, band],
      };
    });
  };

  const toggleFullDay = (day) => {
    setAvailability(prev => {
      const curr = prev[day] || [];
      return { ...prev, [day]: curr.length === TIME_BANDS.length ? [] : [...TIME_BANDS] };
    });
  };

  const stats = {
    thisMonth: myEvents.filter(e => moment(e.start_datetime).isSame(moment(), "month") && e.status === "completed").length,
    upcoming: myEvents.filter(e => moment(e.start_datetime).isAfter(moment())).length,
    avgAttendance: (() => {
      const with_att = myEvents.filter(e => e.attendance_count != null);
      return with_att.length ? Math.round(with_att.reduce((s, e) => s + e.attendance_count, 0) / with_att.length) : 0;
    })(),
    needsAttendance: myEvents.filter(e =>
      moment(e.end_datetime).isBefore(moment()) &&
      e.status !== "completed" &&
      e.status !== "cancelled" &&
      (e.attendance_count === null || e.attendance_count === undefined)
    ).length,
  };

  if (loading) return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {[1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Schedule</h1>
          <p className="text-slate-500">Hi {staffProfile?.name?.split(" ")[0]} 👋</p>
        </div>
        <Button variant="outline" onClick={() => setShowAvailabilityModal(true)} className="gap-2">
          <Bell className="w-4 h-4" />
          Availability
        </Button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "This Month", value: stats.thisMonth, sub: "completed" },
          { label: "Upcoming", value: stats.upcoming, sub: "classes" },
          { label: "Avg Attendance", value: stats.avgAttendance, sub: "per class" },
          { label: "Needs Attendance", value: stats.needsAttendance, sub: "pending", alert: stats.needsAttendance > 0 },
        ].map(s => (
          <div key={s.label} className={`bg-white rounded-xl p-4 border shadow-sm ${s.alert ? "border-amber-300 bg-amber-50" : "border-slate-100"}`}>
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.alert ? "text-amber-700" : "text-slate-900"}`}>{s.value}</p>
            <p className="text-xs text-slate-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* View Tabs */}
      <div className="flex items-center justify-between gap-4">
        <Tabs value={viewMode} onValueChange={setViewMode}>
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="week">This Week</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>
        </Tabs>

        {viewMode === "week" && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setWeekOffset(w => w - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium text-slate-700 min-w-28 text-center">
              {weekOffset === 0 ? "This Week" : weekStart.format("MMM D") + " - " + weekEnd.format("MMM D")}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setWeekOffset(w => w + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Events */}
      {sortedDates.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
          <Calendar className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500">No classes to display</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map(dateKey => {
            const isToday = moment(dateKey).isSame(moment(), "day");
            const isPast = moment(dateKey).isBefore(moment(), "day");
            return (
              <div key={dateKey}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`text-center min-w-14 py-1 px-2 rounded-lg ${isToday ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                    <p className="text-xs font-medium">{moment(dateKey).format("ddd").toUpperCase()}</p>
                    <p className="text-xl font-bold leading-none mt-0.5">{moment(dateKey).format("D")}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{moment(dateKey).format("MMMM D, YYYY")}</p>
                    {isToday && <p className="text-xs text-indigo-600">Today</p>}
                  </div>
                </div>

                <div className="space-y-3 ml-2">
                  {grouped[dateKey]
                    .sort((a, b) => moment(a.start_datetime).diff(moment(b.start_datetime)))
                    .map(event => {
                      const isPastEvent = moment(event.end_datetime).isBefore(moment());
                      const needsAttendance = isPastEvent && event.status !== "completed" && event.status !== "cancelled" && (event.attendance_count == null);
                      const canMarkAbsent = moment(event.start_datetime).isAfter(moment()) && event.status !== "cancelled";

                      return (
                        <div key={event.id} className={`bg-white border rounded-xl p-4 shadow-sm transition-all ${needsAttendance ? "border-amber-300" : "border-slate-100"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-slate-900">{event.class_type_name}</p>
                                <StatusBadge status={event.status} />
                                {event.viability_color && event.viability_color !== "pending" && (
                                  <ViabilityBadge color={event.viability_color} count={event.attendance_count} showLabel />
                                )}
                              </div>
                              <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5" />
                                  {moment(event.start_datetime).format("h:mm A")} – {moment(event.end_datetime).format("h:mm A")}
                                </span>
                                {event.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5" />
                                    {event.location}
                                  </span>
                                )}
                                {event.attendance_count != null && (
                                  <span className="flex items-center gap-1">
                                    <Users className="w-3.5 h-3.5" />
                                    {event.attendance_count} attendees
                                  </span>
                                )}
                              </div>
                              {needsAttendance && (
                                <p className="text-xs text-amber-600 font-medium mt-2 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Attendance not yet submitted
                                </p>
                              )}
                              {event.instructor_notes && (
                                <p className="text-xs text-slate-400 mt-1 italic">{event.instructor_notes}</p>
                              )}
                            </div>

                            <div className="flex flex-col gap-2 shrink-0">
                              {needsAttendance && (
                                <Button
                                  size="sm"
                                  className="bg-indigo-600 hover:bg-indigo-700 text-xs"
                                  onClick={() => { setAttendanceModal(event); setAttendanceCount(event.attendance_count || ""); }}
                                >
                                  <Check className="w-3 h-3 mr-1" /> Attendance
                                </Button>
                              )}
                              {canMarkAbsent && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 border-red-200 hover:bg-red-50 text-xs"
                                  onClick={() => { setAbsentModal(event); setAbsentReason(""); setAbsentNote(""); }}
                                >
                                  <UserX className="w-3 h-3 mr-1" /> Mark Absent
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mark Absent Modal */}
      <Dialog open={!!absentModal} onOpenChange={() => setAbsentModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report Absence</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {absentModal && (
              <div className="p-3 bg-slate-50 rounded-lg text-sm">
                <p className="font-medium">{absentModal.class_type_name}</p>
                <p className="text-slate-500">{moment(absentModal.start_datetime).format("ddd, MMM D")} at {moment(absentModal.start_datetime).format("h:mm A")}</p>
              </div>
            )}
            <div>
              <Label>Reason *</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {["Illness", "Family emergency", "Transport issue", "Personal reason", "Injury", "Other"].map(r => (
                  <Button
                    key={r}
                    variant={absentReason === r ? "default" : "outline"}
                    size="sm"
                    className="justify-start"
                    onClick={() => setAbsentReason(r)}
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Additional notes (optional)</Label>
              <Textarea
                value={absentNote}
                onChange={e => setAbsentNote(e.target.value)}
                placeholder="Any further details..."
                className="mt-1"
                rows={2}
              />
            </div>
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-xs text-amber-700 font-medium">⚠ A cover request will be created automatically</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbsentModal(null)}>Cancel</Button>
            <Button
              onClick={handleMarkAbsent}
              disabled={!absentReason || submittingAbsent}
              className="bg-red-600 hover:bg-red-700"
            >
              <UserX className="w-4 h-4 mr-2" />
              {submittingAbsent ? "Submitting..." : "Confirm Absence"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attendance Modal */}
      <Dialog open={!!attendanceModal} onOpenChange={() => setAttendanceModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Submit Attendance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {attendanceModal && (
              <div className="p-3 bg-slate-50 rounded-lg text-sm">
                <p className="font-medium">{attendanceModal.class_type_name}</p>
                <p className="text-slate-500">{moment(attendanceModal.start_datetime).format("ddd, MMM D · h:mm A")}</p>
              </div>
            )}
            <div>
              <Label>Number of Attendees *</Label>
              <Input
                type="number"
                min="0"
                value={attendanceCount}
                onChange={e => setAttendanceCount(e.target.value)}
                placeholder="e.g. 12"
                className="mt-1 text-lg h-12"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttendanceModal(null)}>Cancel</Button>
            <Button onClick={handleSubmitAttendance} disabled={!attendanceCount || submittingAttendance}>
              <Check className="w-4 h-4 mr-2" />
              {submittingAttendance ? "Saving..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Availability Modal */}
      <Dialog open={showAvailabilityModal} onOpenChange={setShowAvailabilityModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Set Availability Preferences</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            Tick the time slots you're generally available. This guides automated cover matching.
          </p>

          <div className="space-y-3 mt-2">
            {DAYS.map(day => {
              const dayBands = availability[day] || [];
              const allSelected = dayBands.length === TIME_BANDS.length;
              return (
                <div key={day} className="border border-slate-100 rounded-xl p-4 bg-slate-50">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-medium capitalize text-slate-800">{day}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-indigo-600"
                      onClick={() => toggleFullDay(day)}
                    >
                      {allSelected ? "Clear all" : "Select all"}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {TIME_BANDS.map(band => {
                      const checked = dayBands.includes(band);
                      return (
                        <button
                          key={band}
                          onClick={() => toggleBand(day, band)}
                          className={`rounded-lg border p-2 text-left transition-colors ${
                            checked
                              ? "bg-indigo-600 border-indigo-600 text-white"
                              : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300"
                          }`}
                        >
                          <p className="text-xs font-semibold capitalize">{band}</p>
                          <p className={`text-xs mt-0.5 ${checked ? "text-indigo-100" : "text-slate-400"}`}>{BAND_TIMES[band]}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAvailabilityModal(false)}>Cancel</Button>
            <Button onClick={handleSaveAvailability} disabled={savingAvailability}>
              <Save className="w-4 h-4 mr-2" />
              {savingAvailability ? "Saving..." : "Save Availability"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}