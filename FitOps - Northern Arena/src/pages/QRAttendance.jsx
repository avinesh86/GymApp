import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { QrCode, Check, Camera, X, RefreshCw, Clock, MapPin, User, CheckCircle2 } from "lucide-react";
import moment from "moment";
import { cn } from "@/lib/utils";

// Simple QR code generator using a free API (no npm needed)
function QRCodeDisplay({ value, size = 200 }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=1e293b&margin=10`;
  return (
    <img src={url} alt="QR Code" className="rounded-xl border border-slate-200" width={size} height={size} />
  );
}

// Viability helper
function computeViability(count, classType) {
  if (!classType) return "pending";
  const n = parseInt(count);
  if (n >= (classType.purple_min || 20)) return "purple";
  if (n >= (classType.green_min || 10)) return "green";
  if (n >= (classType.amber_min || 5)) return "amber";
  return "red";
}

const viabilityStyle = {
  red: "bg-red-50 text-red-700 border-red-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  green: "bg-green-50 text-green-700 border-green-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  pending: "bg-slate-50 text-slate-600 border-slate-200",
};

const viabilityLabel = { red: "Low", amber: "Moderate", green: "Good", purple: "Excellent" };

export default function QRAttendance() {
  const [user, setUser] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [events, setEvents] = useState([]);
  const [classTypes, setClassTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [mode, setMode] = useState("list"); // list | qr | scan | manual
  const [count, setCount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  // For scan mode - parse URL param ?event=ID
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get("event");
    if (eventId) {
      setMode("scan");
      loadScanEvent(eventId);
    } else {
      loadData();
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [userData, eventsData, typesData] = await Promise.all([
        base44.auth.me(),
        base44.entities.TimetableEvent.list("-start_datetime", 200),
        base44.entities.ClassType.list(),
      ]);
      setUser(userData);
      const staffList = await base44.entities.Staff.filter({ email: userData.email });
      if (staffList.length > 0) setStaffProfile(staffList[0]);

      // Show today's upcoming and recently ended classes
      const todayStart = moment().startOf("day").toISOString();
      const todayEnd = moment().endOf("day").toISOString();
      const relevant = eventsData.filter(e =>
        moment(e.start_datetime).isBetween(todayStart, todayEnd) &&
        e.status !== "cancelled"
      );
      setEvents(relevant);
      setClassTypes(typesData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadScanEvent = async (eventId) => {
    setLoading(true);
    try {
      const [eventsData, typesData, userData] = await Promise.all([
        base44.entities.TimetableEvent.list("-start_datetime", 200),
        base44.entities.ClassType.list(),
        base44.auth.me().catch(() => null),
      ]);
      const event = eventsData.find(e => e.id === eventId);
      setSelectedEvent(event || null);
      setClassTypes(typesData);
      setUser(userData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getQRUrl = (event) => {
    const base = window.location.origin + window.location.pathname;
    return `${base}?event=${event.id}`;
  };

  const handleSubmitAttendance = async () => {
    if (!selectedEvent || count === "") return;
    setSubmitting(true);
    try {
      const ct = classTypes.find(c => c.id === selectedEvent.class_type_id || c.name === selectedEvent.class_type_name);
      const viabilityColor = computeViability(count, ct);
      await base44.entities.TimetableEvent.update(selectedEvent.id, {
        attendance_count: parseInt(count),
        attendance_submitted_at: new Date().toISOString(),
        attendance_submitted_by: user?.email || "qr_scan",
        viability_color: viabilityColor,
        status: "completed",
      });
      setSubmitted({ count: parseInt(count), viability: viabilityColor, event: selectedEvent });
      toast.success("Attendance recorded!");
    } catch (e) {
      toast.error("Failed to save attendance");
    } finally {
      setSubmitting(false);
    }
  };

  const isAdmin = ["owner", "admin", "gym_manager", "class_count_admin", "team_leader"].includes(staffProfile?.role);

  // ── Scan / Quick Entry Mode (opened via QR) ─────────────────────────
  if (mode === "scan") {
    if (loading) return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );

    if (submitted) return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className={cn("w-20 h-20 rounded-full flex items-center justify-center mb-4 border-2", viabilityStyle[submitted.viability])}>
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Attendance Saved!</h2>
        <p className="text-slate-500 mb-2">{submitted.event.class_type_name}</p>
        <p className="text-4xl font-black text-slate-900 mb-2">{submitted.count}</p>
        <span className={cn("px-4 py-2 rounded-full text-sm font-semibold border", viabilityStyle[submitted.viability])}>
          {viabilityLabel[submitted.viability] || submitted.viability}
        </span>
      </div>
    );

    if (!selectedEvent) return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <X className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Class not found</h2>
        <p className="text-slate-500 mt-2">This QR code may be expired or invalid.</p>
      </div>
    );

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 w-full max-w-sm">
          <div className="text-center mb-6">
            <QrCode className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
            <h2 className="text-xl font-bold text-slate-900">{selectedEvent.class_type_name}</h2>
            <p className="text-sm text-slate-500 mt-1">
              {moment(selectedEvent.start_datetime).format("ddd, MMM D · h:mm A")}
            </p>
            {selectedEvent.location && (
              <p className="text-sm text-slate-400 flex items-center justify-center gap-1 mt-1">
                <MapPin className="w-3.5 h-3.5" /> {selectedEvent.location}
              </p>
            )}
          </div>

          {selectedEvent.attendance_count != null ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">Already submitted: {selectedEvent.attendance_count} attendees</p>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-700 mb-2 text-center">How many attendees?</p>
              <Input
                type="number"
                min="0"
                max="300"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="0"
                className="text-3xl font-black h-16 text-center text-slate-900 mb-4"
                autoFocus
              />
              <div className="flex flex-wrap gap-2 mb-4 justify-center">
                {[0, 5, 10, 15, 20, 25, 30, 35].map(n => (
                  <button
                    key={n}
                    onClick={() => setCount(String(n))}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                      String(count) === String(n)
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-300"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {count !== "" && (
                <div className={cn("text-center py-2 rounded-xl border mb-4 text-sm font-semibold", viabilityStyle[computeViability(count, classTypes.find(c => c.id === selectedEvent.class_type_id || c.name === selectedEvent.class_type_name))])}>
                  {viabilityLabel[computeViability(count, classTypes.find(c => c.id === selectedEvent.class_type_id || c.name === selectedEvent.class_type_name))] || "—"}
                </div>
              )}
              <Button
                className="w-full h-12 text-base bg-indigo-600 hover:bg-indigo-700"
                onClick={handleSubmitAttendance}
                disabled={count === "" || submitting}
              >
                <Check className="w-5 h-5 mr-2" />
                {submitting ? "Saving..." : "Submit Attendance"}
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Main Admin View ─────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
    </div>
  );

  const todayStr = moment().format("dddd, MMMM D");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">QR Attendance</h1>
        <p className="text-slate-500 text-sm">{todayStr} · {events.length} class{events.length !== 1 ? "es" : ""} today</p>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-sm text-indigo-700">
        <p className="font-semibold mb-1">How it works</p>
        <p>Generate a QR code for any class. Instructors scan it with their phone to quickly enter the head count — no login needed.</p>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
          <QrCode className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No classes scheduled for today</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(event => (
            <div key={event.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900">{event.class_type_name}</p>
                  <div className="flex flex-wrap gap-2 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{moment(event.start_datetime).format("h:mm A")}</span>
                    {event.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{event.location}</span>}
                    {event.assigned_instructor_name && <span className="flex items-center gap-1"><User className="w-3 h-3" />{event.assigned_instructor_name}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {event.attendance_count != null ? (
                    <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {event.attendance_count} submitted
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                      onClick={() => { setSelectedEvent(event); setMode("qr"); setCount(""); }}
                    >
                      <QrCode className="w-4 h-4" />
                      QR Code
                    </Button>
                  )}
                </div>
              </div>

              {/* Inline QR panel */}
              {selectedEvent?.id === event.id && mode === "qr" && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="text-center">
                      <QRCodeDisplay value={getQRUrl(event)} size={160} />
                      <p className="text-xs text-slate-500 mt-2">Scan with phone camera</p>
                    </div>
                    <div className="flex-1 space-y-3">
                      <p className="text-sm font-medium text-slate-700">Or enter manually:</p>
                      <Input
                        type="number"
                        min="0"
                        value={count}
                        onChange={e => setCount(e.target.value)}
                        placeholder="0"
                        className="text-xl font-bold h-12 text-center"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {[0, 5, 10, 15, 20, 25, 30].map(n => (
                          <button
                            key={n}
                            onClick={() => setCount(String(n))}
                            className={cn(
                              "px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors",
                              String(count) === String(n)
                                ? "bg-indigo-600 border-indigo-600 text-white"
                                : "bg-slate-50 border-slate-200 text-slate-600"
                            )}
                          >{n}</button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                          onClick={handleSubmitAttendance}
                          disabled={count === "" || submitting}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          {submitting ? "Saving..." : "Submit"}
                        </Button>
                        <Button variant="outline" onClick={() => { setMode("list"); setSelectedEvent(null); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}