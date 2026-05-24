import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Calendar, Clock, MapPin, Users, Zap, Check } from "lucide-react";
import moment from "moment";
import StatusBadge from "@/components/ui/StatusBadge";

const STATUS_COLORS = {
  scheduled: "bg-indigo-100 border-indigo-300 text-indigo-800",
  completed: "bg-green-100 border-green-300 text-green-800",
  needs_cover: "bg-red-100 border-red-300 text-red-800",
  covered: "bg-cyan-100 border-cyan-300 text-cyan-800",
  cancelled: "bg-slate-100 border-slate-300 text-slate-500 line-through",
  cover_opportunity: "bg-amber-100 border-amber-300 text-amber-800",
};

export default function InstructorCalendar() {
  const [staffProfile, setStaffProfile] = useState(null);
  const [myEvents, setMyEvents] = useState([]);
  const [coverRequests, setCoverRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedType, setSelectedType] = useState(null); // 'event' | 'cover'
  const [acceptModal, setAcceptModal] = useState(null);
  const [attendanceModal, setAttendanceModal] = useState(null);
  const [attendanceCount, setAttendanceCount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const userData = await base44.auth.me();
      const staffList = await base44.entities.Staff.filter({ email: userData.email });
      if (!staffList.length) return;
      const profile = staffList[0];
      setStaffProfile(profile);

      const start = moment().subtract(7, "days").toISOString();
      const end = moment().add(28, "days").toISOString();

      const [eventsData, coverData] = await Promise.all([
        base44.entities.TimetableEvent.filter(
          { assigned_instructor_id: profile.id, start_datetime: { $gte: start, $lte: end } },
          "start_datetime",
          200
        ),
        base44.entities.CoverRequest.filter({ status: "open" }, "-created_date", 50),
      ]);

      setMyEvents(eventsData);
      setCoverRequests(coverData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const weekStart = moment().add(weekOffset, "weeks").startOf("isoWeek");
  const days = Array.from({ length: 7 }, (_, i) => moment(weekStart).add(i, "days"));

  const getEventsForDay = (day) => {
    const my = myEvents
      .filter((e) => moment(e.start_datetime).isSame(day, "day"))
      .map((e) => ({ ...e, _type: "event" }));
    const covers = coverRequests
      .filter((r) => moment(r.event_details?.start_datetime).isSame(day, "day"))
      .map((r) => ({
        id: r.id,
        _type: "cover",
        _request: r,
        class_type_name: r.event_details?.class_type_name,
        start_datetime: r.event_details?.start_datetime,
        end_datetime: r.event_details?.end_datetime,
        location: r.event_details?.location,
        status: "cover_opportunity",
        urgency: r.urgency,
      }));
    return [...my, ...covers].sort((a, b) =>
      moment(a.start_datetime).diff(moment(b.start_datetime))
    );
  };

  const hasConflict = (coverItem) => {
    const cs = moment(coverItem.start_datetime);
    const ce = moment(coverItem.end_datetime);
    return myEvents.some((e) => {
      const es = moment(e.start_datetime);
      const ee = moment(e.end_datetime);
      return cs.isBefore(ee) && ce.isAfter(es);
    });
  };

  const handleAcceptCover = async () => {
    if (!acceptModal || !staffProfile) return;
    setSubmitting(true);
    try {
      const req = acceptModal._request;
      await base44.entities.CoverRequest.update(req.id, {
        status: "accepted",
        accepted_by_instructor_id: staffProfile.id,
        accepted_by_instructor_name: staffProfile.name,
        accepted_at: new Date().toISOString(),
      });
      await base44.entities.TimetableEvent.update(req.event_id, {
        assigned_instructor_id: staffProfile.id,
        assigned_instructor_name: staffProfile.name,
        status: "covered",
      });
      toast.success("Cover accepted!");
      setAcceptModal(null);
      setSelectedItem(null);
      await loadData();
    } catch (e) {
      toast.error("Failed to accept cover");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitAttendance = async () => {
    if (!attendanceModal || !attendanceCount) return;
    setSubmitting(true);
    try {
      const classTypes = await base44.entities.ClassType.filter({ name: attendanceModal.class_type_name });
      let viabilityColor = "pending";
      if (classTypes.length > 0) {
        const ct = classTypes[0];
        const n = parseInt(attendanceCount);
        if (n >= (ct.purple_min || 20)) viabilityColor = "purple";
        else if (n >= (ct.green_min || 10)) viabilityColor = "green";
        else if (n >= (ct.amber_min || 5)) viabilityColor = "amber";
        else viabilityColor = "red";
      }
      await base44.entities.TimetableEvent.update(attendanceModal.id, {
        attendance_count: parseInt(attendanceCount),
        attendance_submitted_at: new Date().toISOString(),
        viability_color: viabilityColor,
        status: "completed",
      });
      toast.success("Attendance submitted");
      setAttendanceModal(null);
      setAttendanceCount("");
      setSelectedItem(null);
      await loadData();
    } catch (e) {
      toast.error("Failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-[500px] rounded-2xl" />
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Calendar</h1>
          <p className="text-slate-500 text-sm">{staffProfile?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Week label */}
      <p className="text-sm font-medium text-slate-600">
        {weekStart.format("MMMM D")} – {moment(weekStart).add(6, "days").format("MMMM D, YYYY")}
      </p>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {[
          { label: "My Shift", cls: "bg-indigo-100 border-indigo-300 text-indigo-800" },
          { label: "Completed", cls: "bg-green-100 border-green-300 text-green-800" },
          { label: "Cover Opportunity", cls: "bg-amber-100 border-amber-300 text-amber-800" },
          { label: "Conflict", cls: "bg-red-100 border-red-300 text-red-700" },
        ].map((l) => (
          <span key={l.label} className={`px-2 py-1 rounded-full border font-medium ${l.cls}`}>
            {l.label}
          </span>
        ))}
      </div>

      {/* Mobile: stacked day-by-day */}
      <div className="md:hidden space-y-4">
        {days.map((day) => {
          const dayItems = getEventsForDay(day);
          const isToday = day.isSame(moment(), "day");
          return (
            <div key={day.format()} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isToday ? "border-indigo-300" : "border-slate-100"}`}>
              <div className={`px-4 py-3 flex items-center gap-3 ${isToday ? "bg-indigo-50" : "bg-slate-50"} border-b border-slate-100`}>
                <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center text-sm font-bold ${isToday ? "bg-indigo-600 text-white" : "bg-white text-slate-700 border border-slate-200"}`}>
                  <span className="text-xs leading-none">{day.format("ddd").toUpperCase()}</span>
                  <span className="text-lg leading-none">{day.format("D")}</span>
                </div>
                <span className="font-semibold text-slate-800">{day.format("MMMM D")}</span>
                {dayItems.length > 0 && (
                  <Badge variant="secondary" className="ml-auto">{dayItems.length}</Badge>
                )}
              </div>
              <div className="p-3 space-y-2">
                {dayItems.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-3">No classes</p>
                ) : (
                  dayItems.map((item) => {
                    const conflict = item._type === "cover" && hasConflict(item);
                    return (
                      <button
                        key={item.id}
                        className={`w-full text-left rounded-xl border px-3 py-2.5 text-sm transition-all hover:shadow-sm ${
                          conflict
                            ? "bg-red-50 border-red-200"
                            : STATUS_COLORS[item.status] || "bg-slate-50 border-slate-200"
                        }`}
                        onClick={() => { setSelectedItem(item); setSelectedType(item._type); }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold truncate">{item.class_type_name}</span>
                          {item._type === "cover" && !conflict && (
                            <Badge className="bg-amber-500 text-white text-xs shrink-0">Cover</Badge>
                          )}
                          {conflict && <Badge className="bg-red-500 text-white text-xs shrink-0">Conflict</Badge>}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs opacity-75">
                          <Clock className="w-3 h-3" />
                          {moment(item.start_datetime).format("h:mm A")}
                          {item.location && <><MapPin className="w-3 h-3 ml-1" />{item.location}</>}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: 7-col grid */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 divide-x divide-slate-100">
          {days.map((day) => {
            const dayItems = getEventsForDay(day);
            const isToday = day.isSame(moment(), "day");
            return (
              <div key={day.format()} className="min-h-[360px] flex flex-col">
                <div className={`px-2 py-3 text-center border-b border-slate-100 ${isToday ? "bg-indigo-50" : ""}`}>
                  <p className="text-xs font-medium text-slate-500 uppercase">{day.format("ddd")}</p>
                  <p className={`text-xl font-bold ${isToday ? "text-indigo-600" : "text-slate-800"}`}>{day.format("D")}</p>
                </div>
                <div className="p-2 space-y-1.5 flex-1">
                  {dayItems.map((item) => {
                    const conflict = item._type === "cover" && hasConflict(item);
                    return (
                      <button
                        key={item.id}
                        className={`w-full text-left rounded-lg border px-2 py-1.5 text-xs transition-all hover:shadow-sm ${
                          conflict ? "bg-red-50 border-red-200" : STATUS_COLORS[item.status] || "bg-slate-50 border-slate-200"
                        }`}
                        onClick={() => { setSelectedItem(item); setSelectedType(item._type); }}
                      >
                        <p className="font-semibold truncate">{item.class_type_name}</p>
                        <p className="opacity-70">{moment(item.start_datetime).format("h:mm A")}</p>
                        {item._type === "cover" && !conflict && (
                          <span className="text-amber-700 font-medium">Cover avail.</span>
                        )}
                        {conflict && <span className="text-red-700 font-medium">Conflict!</span>}
                      </button>
                    );
                  })}
                  {dayItems.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">–</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail drawer */}
      {selectedItem && (
        <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedItem._type === "cover" ? (
                  <><Zap className="w-5 h-5 text-amber-500" /> Cover Opportunity</>
                ) : (
                  <><Calendar className="w-5 h-5 text-indigo-500" /> My Shift</>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-xl font-bold text-slate-900">{selectedItem.class_type_name}</p>
              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  {moment(selectedItem.start_datetime).format("ddd, MMM D · h:mm A")} –{" "}
                  {moment(selectedItem.end_datetime).format("h:mm A")}
                </div>
                {selectedItem.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    {selectedItem.location}
                  </div>
                )}
                {selectedItem.attendance_count != null && (
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    {selectedItem.attendance_count} attendees
                  </div>
                )}
              </div>
              {selectedItem._type === "event" && (
                <StatusBadge status={selectedItem.status} />
              )}
              {selectedItem._type === "cover" && hasConflict(selectedItem) && (
                <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                  <p className="text-sm text-red-700 font-medium">
                    ⚠ You have a scheduling conflict at this time
                  </p>
                </div>
              )}
              {selectedItem._type === "cover" && selectedItem._request?.bonus_amount > 0 && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-sm text-amber-700 font-medium">
                    Bonus: ${selectedItem._request.bonus_amount}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="flex gap-2">
              {selectedItem._type === "cover" && !hasConflict(selectedItem) && (
                <Button
                  className="flex-1 bg-amber-500 hover:bg-amber-600"
                  onClick={() => { setAcceptModal(selectedItem); }}
                >
                  <Zap className="w-4 h-4 mr-1" /> Accept Cover
                </Button>
              )}
              {selectedItem._type === "event" &&
                moment(selectedItem.end_datetime).isBefore(moment()) &&
                selectedItem.attendance_count == null && (
                  <Button
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                    onClick={() => { setAttendanceModal(selectedItem); setAttendanceCount(""); }}
                  >
                    <Check className="w-4 h-4 mr-1" /> Enter Attendance
                  </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Accept cover confirm */}
      {acceptModal && (
        <Dialog open={!!acceptModal} onOpenChange={() => setAcceptModal(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Accept Cover?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">
              You're accepting cover for <strong>{acceptModal.class_type_name}</strong> on{" "}
              {moment(acceptModal.start_datetime).format("ddd, MMM D")} at{" "}
              {moment(acceptModal.start_datetime).format("h:mm A")}.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAcceptModal(null)}>Cancel</Button>
              <Button onClick={handleAcceptCover} disabled={submitting} className="bg-amber-500 hover:bg-amber-600">
                {submitting ? "Accepting..." : "Confirm Accept"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Attendance modal */}
      {attendanceModal && (
        <Dialog open={!!attendanceModal} onOpenChange={() => setAttendanceModal(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Submit Attendance</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                <strong>{attendanceModal.class_type_name}</strong> –{" "}
                {moment(attendanceModal.start_datetime).format("ddd, MMM D · h:mm A")}
              </p>
              <Label>Number of attendees</Label>
              <Input
                type="number" min="0"
                value={attendanceCount}
                onChange={(e) => setAttendanceCount(e.target.value)}
                className="text-xl h-12 text-center font-bold"
                placeholder="0"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAttendanceModal(null)}>Cancel</Button>
              <Button onClick={handleSubmitAttendance} disabled={!attendanceCount || submitting}>
                {submitting ? "Saving..." : "Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}