import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Check, Clock, MapPin, User, CheckCircle2, AlertCircle } from "lucide-react";
import moment from "moment";

const DATE_FILTERS = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This Week" },
  { key: "last_week", label: "Last Week" },
  { key: "older", label: "Older" },
];

function getFilterRange(key) {
  const now = moment();
  switch (key) {
    case "today":
      return { start: now.clone().startOf("day"), end: now.clone() };
    case "this_week":
      return { start: now.clone().startOf("isoWeek"), end: now.clone() };
    case "last_week":
      return {
        start: now.clone().subtract(1, "week").startOf("isoWeek"),
        end: now.clone().subtract(1, "week").endOf("isoWeek"),
      };
    case "older":
      return {
        start: moment("2000-01-01"),
        end: now.clone().subtract(1, "week").startOf("isoWeek"),
      };
    default:
      return null;
  }
}

export default function AttendanceEntry() {
  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState({});
  const [counts, setCounts] = useState({});
  const [classTypes, setClassTypes] = useState([]);
  const [dateFilter, setDateFilter] = useState("today");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch all past events going back up to 12 weeks
      const rangeStart = moment().subtract(12, "weeks").startOf("isoWeek").toISOString();
      const now = moment().toISOString();
      const [eventsData, typesData] = await Promise.all([
        base44.entities.TimetableEvent.filter(
          { start_datetime: { $gte: rangeStart, $lte: now } },
          "start_datetime",
          2000
        ),
        base44.entities.ClassType.list(),
      ]);

      // Keep only past, non-cancelled events without attendance recorded
      const pending = eventsData.filter(
        (e) =>
          moment(e.end_datetime).isBefore(moment()) &&
          e.status !== "cancelled" &&
          e.attendance_status !== "recorded" &&
          e.attendance_status !== "not_recorded" &&
          e.attendance_count == null
      );

      // Sort newest first
      pending.sort((a, b) => moment(b.start_datetime).valueOf() - moment(a.start_datetime).valueOf());

      setAllEvents(pending);
      setClassTypes(typesData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const computeViability = (count, event) => {
    const n = parseInt(count);
    const ct = classTypes.find(c => c.name === event.class_type_name);
    const purple = event.purple_min ?? ct?.purple_min ?? 20;
    const green  = event.green_min  ?? ct?.green_min  ?? 10;
    const amber  = event.amber_min  ?? ct?.amber_min  ?? 5;
    if (n >= purple) return "purple";
    if (n >= green)  return "green";
    if (n >= amber)  return "amber";
    return "red";
  };

  const handleSubmit = async (event) => {
    const count = counts[event.id];
    if (count === "" || count == null) return;
    setSubmitting((prev) => ({ ...prev, [event.id]: true }));
    try {
      const viabilityColor = computeViability(count, event);
      await base44.entities.TimetableEvent.update(event.id, {
        attendance_count: parseInt(count),
        attendance_status: "recorded",
        attendance_submitted_at: new Date().toISOString(),
        viability_color: viabilityColor,
        status: "completed",
      });
      toast.success(`Attendance saved for ${event.class_type_name}`);
      setAllEvents((prev) => prev.filter((e) => e.id !== event.id));
    } catch (e) {
      toast.error("Failed to save attendance");
    } finally {
      setSubmitting((prev) => ({ ...prev, [event.id]: false }));
    }
  };

  const viabilityStyle = {
    red: "bg-red-100 text-red-700 border-red-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200",
    green: "bg-green-100 text-green-700 border-green-200",
    purple: "bg-purple-100 text-purple-700 border-purple-200",
  };

  const viabilityLabel = { red: "Low", amber: "Moderate", green: "Good", purple: "Excellent" };

  // Apply date filter
  const filteredEvents = (() => {
    const range = getFilterRange(dateFilter);
    if (!range) return allEvents;
    return allEvents.filter(e => {
      const t = moment(e.start_datetime);
      return t.isSameOrAfter(range.start) && t.isSameOrBefore(range.end);
    });
  })();

  // Count per filter bucket for badges
  const countFor = (key) => {
    const range = getFilterRange(key);
    if (!range) return allEvents.length;
    return allEvents.filter(e => {
      const t = moment(e.start_datetime);
      return t.isSameOrAfter(range.start) && t.isSameOrBefore(range.end);
    }).length;
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Attendance Entry</h1>
        <p className="text-slate-500 mt-1">
          {allEvents.length} class{allEvents.length !== 1 ? "es" : ""} awaiting attendance
        </p>
      </div>

      {/* Date filter buttons */}
      <div className="flex gap-2 flex-wrap">
        {DATE_FILTERS.map(({ key, label }) => {
          const c = countFor(key);
          const active = dateFilter === key;
          return (
            <button
              key={key}
              onClick={() => setDateFilter(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
              }`}
            >
              {label}
              {c > 0 && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                  active ? "bg-white/20 text-white" : "bg-red-100 text-red-600"
                }`}>
                  {c}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Event list */}
      {filteredEvents.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-800 mb-1">All caught up!</h2>
          <p className="text-slate-500">No pending attendance for this period.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEvents.map((event) => {
            const count = counts[event.id] ?? "";
            const preview = count !== "" ? computeViability(count, event) : null;

            return (
              <div
                key={event.id}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4"
              >
                {/* Event info */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-slate-900">{event.class_type_name}</h3>
                    <div className="flex flex-wrap gap-3 mt-1 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {moment(event.start_datetime).format("ddd, MMM D · h:mm A")}
                      </span>
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {event.location}
                        </span>
                      )}
                      {event.assigned_instructor_name && (
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {event.assigned_instructor_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 shrink-0">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Pending
                  </Badge>
                </div>

                {/* Number entry */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700 mb-1">How many attendees?</p>
                    <Input
                      type="number"
                      min="0"
                      max="200"
                      value={count}
                      onChange={(e) => setCounts((prev) => ({ ...prev, [event.id]: e.target.value }))}
                      placeholder="0"
                      className="text-2xl font-bold h-14 text-center text-slate-900"
                    />
                  </div>
                  {preview && (
                    <div className={`mt-5 rounded-xl border px-3 py-2 text-center min-w-[80px] ${viabilityStyle[preview]}`}>
                      <p className="text-xs font-medium uppercase tracking-wide">{viabilityLabel[preview]}</p>
                    </div>
                  )}
                </div>

                {/* Quick number buttons */}
                <div className="flex flex-wrap gap-2">
                  {[0, 5, 10, 15, 20, 25, 30].map((n) => (
                    <button
                      key={n}
                      onClick={() => setCounts((prev) => ({ ...prev, [event.id]: String(n) }))}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                        String(count) === String(n)
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-300"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                <Button
                  className="w-full h-12 text-base bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => handleSubmit(event)}
                  disabled={count === "" || submitting[event.id]}
                >
                  <Check className="w-5 h-5 mr-2" />
                  {submitting[event.id] ? "Saving..." : "Save Attendance"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}