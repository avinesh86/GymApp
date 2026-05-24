import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Clock, X } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

/**
 * Floating popup that prompts instructors to enter attendance
 * for recently completed classes that have no count yet.
 */
export default function AttendanceReminderPopup({ staffProfile }) {
  const [pendingEvent, setPendingEvent] = useState(null);
  const [count, setCount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!staffProfile?.id) return;
    checkForPendingAttendance();
    // Check every 5 minutes
    const interval = setInterval(checkForPendingAttendance, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [staffProfile]);

  const checkForPendingAttendance = async () => {
    if (dismissed) return;
    try {
      const thirtyMinsAgo = moment().subtract(30, "minutes").toISOString();
      const now = moment().toISOString();
      const events = await base44.entities.TimetableEvent.filter(
        {
          assigned_instructor_id: staffProfile.id,
          end_datetime: { $gte: thirtyMinsAgo, $lte: now },
        },
        "-end_datetime",
        5
      );
      const pending = events.find(
        (e) =>
          e.status !== "cancelled" &&
          (e.attendance_count == null || e.attendance_count === undefined)
      );
      if (pending) {
        setPendingEvent(pending);
        setCount("");
      }
    } catch (e) {
      // silent fail
    }
  };

  const handleSubmit = async () => {
    if (!pendingEvent || !count) return;
    setSubmitting(true);
    try {
      const classTypes = await base44.entities.ClassType.filter({
        name: pendingEvent.class_type_name,
      });
      let viabilityColor = "pending";
      if (classTypes.length > 0) {
        const ct = classTypes[0];
        const n = parseInt(count);
        if (n >= (ct.purple_min || 20)) viabilityColor = "purple";
        else if (n >= (ct.green_min || 10)) viabilityColor = "green";
        else if (n >= (ct.amber_min || 5)) viabilityColor = "amber";
        else viabilityColor = "red";
      }
      await base44.entities.TimetableEvent.update(pendingEvent.id, {
        attendance_count: parseInt(count),
        attendance_submitted_by: staffProfile.email,
        attendance_submitted_at: new Date().toISOString(),
        viability_color: viabilityColor,
        status: "completed",
      });
      toast.success("Attendance submitted — thanks!");
      setPendingEvent(null);
    } catch (e) {
      toast.error("Failed to submit attendance");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = () => {
    setPendingEvent(null);
    setDismissed(true);
    // Un-dismiss after 30 minutes so it can re-check
    setTimeout(() => setDismissed(false), 30 * 60 * 1000);
  };

  if (!pendingEvent) return null;

  return (
    <Dialog open={true} onOpenChange={handleDismiss}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            Class just finished!
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
            <p className="font-semibold text-slate-900">{pendingEvent.class_type_name}</p>
            <p className="text-sm text-slate-500 mt-0.5">
              Ended at {moment(pendingEvent.end_datetime).format("h:mm A")}
              {pendingEvent.location ? ` · ${pendingEvent.location}` : ""}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              How many people attended?
            </p>
            <Input
              type="number"
              min="0"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              placeholder="0"
              className="text-2xl font-bold h-14 text-center"
              autoFocus
            />
          </div>
          {/* Quick tap numbers */}
          <div className="flex flex-wrap gap-2">
            {[0, 5, 8, 10, 12, 15, 20, 25].map((n) => (
              <button
                key={n}
                onClick={() => setCount(String(n))}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                  String(count) === String(n)
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-300"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={handleDismiss} className="text-slate-500">
            <X className="w-4 h-4 mr-1" /> Skip
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!count || submitting}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700"
          >
            <Check className="w-4 h-4 mr-2" />
            {submitting ? "Saving..." : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}