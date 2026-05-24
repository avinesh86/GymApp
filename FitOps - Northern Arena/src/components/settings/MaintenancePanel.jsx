import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Archive, CalendarPlus, CheckCircle2, AlertCircle, Loader2, Clock } from "lucide-react";
import moment from "moment";

function RunAgentButton({ agentName, label, icon: Icon, description, statsLabel, statsValue, statsColor, onComplete }) {
  const [status, setStatus] = useState("idle"); // idle | running | done | error
  const [log, setLog] = useState("");

  const run = async () => {
    setStatus("running");
    setLog("");
    try {
      const conv = await base44.agents.createConversation({
        agent_name: agentName,
        metadata: { name: `${label} - ${moment().format("D MMM YYYY HH:mm")}` }
      });

      await base44.agents.addMessage(conv, {
        role: "user",
        content: "Run now. Process all applicable records and report back a full summary of actions taken."
      });

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 40;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const updated = await base44.agents.getConversation(conv.id);
          const lastMsg = updated.messages?.[updated.messages.length - 1];
          if (lastMsg?.role === "assistant" && lastMsg.content) {
            clearInterval(poll);
            setLog(lastMsg.content);
            setStatus("done");
            if (onComplete) onComplete();
          }
        } catch (pollErr) {
          // Transient network error — keep polling
          console.warn("Poll attempt failed, retrying...", pollErr.message);
        }
        if (attempts >= maxAttempts) {
          clearInterval(poll);
          setStatus("error");
          setLog("Timed out waiting for agent response. The task may still be running in the background.");
        }
      }, 3000);
    } catch (e) {
      setStatus("error");
      setLog(e.message || "Unknown error");
    }
  };

  return (
    <Card className={`border-2 ${status === "done" ? "border-green-200" : status === "error" ? "border-red-200" : "border-slate-100"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${status === "done" ? "bg-green-100" : status === "error" ? "bg-red-100" : "bg-indigo-50"}`}>
              <Icon className={`w-5 h-5 ${status === "done" ? "text-green-600" : status === "error" ? "text-red-600" : "text-indigo-600"}`} />
            </div>
            <div>
              <CardTitle className="text-base">{label}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
            </div>
          </div>
          {statsValue !== undefined && (
            <Badge className={`shrink-0 ${statsColor}`}>{statsValue} {statsLabel}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          onClick={run}
          disabled={status === "running"}
          size="sm"
          className="gap-2 w-full"
          variant={status === "done" ? "outline" : "default"}
        >
          {status === "running" ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Running...</>
          ) : status === "done" ? (
            <><CheckCircle2 className="w-4 h-4 text-green-600" /> Run Again</>
          ) : (
            <><RefreshCw className="w-4 h-4" /> Run Now</>
          )}
        </Button>

        {log && (
          <div className={`text-xs rounded-lg p-3 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto ${
            status === "done" ? "bg-green-50 text-green-800 border border-green-100" :
            status === "error" ? "bg-red-50 text-red-800 border border-red-100" :
            "bg-slate-50 text-slate-700"
          }`}>
            {log}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MaintenancePanel() {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const now = moment();
      const fourWeeksAgo = now.clone().subtract(4, 'weeks').toISOString();
      const twelveWeeksAgo = now.clone().subtract(12, 'weeks').toISOString();
      const twoWeeksFromNow = now.clone().add(2, 'weeks').toISOString();

      const [activeRecurring, needsClosed, needsArchived, missingAttendance] = await Promise.all([
        base44.entities.TimetableEvent.filter({ is_recurring: true, archive_status: { $in: ['active', null] }, start_datetime: { $gte: now.toISOString(), $lte: twoWeeksFromNow } }, 'start_datetime', 1),
        base44.entities.TimetableEvent.filter({ start_datetime: { $gte: fourWeeksAgo, $lte: now.toISOString() }, archive_status: { $in: ['active', null] } }, 'start_datetime', 200),
        base44.entities.TimetableEvent.filter({ start_datetime: { $lte: twelveWeeksAgo }, archive_status: { $in: ['active', 'closed'] } }, 'start_datetime', 200),
        base44.entities.TimetableEvent.filter({ start_datetime: { $gte: fourWeeksAgo, $lte: now.toISOString() }, archive_status: { $in: ['active', null] }, status: { $in: ['scheduled', 'completed', 'covered'] } }, 'start_datetime', 200)
      ]);

      const missingCount = missingAttendance.filter(e => e.attendance_count === null || e.attendance_count === undefined).length;

      setStats({
        toClose: needsClosed.length,
        toArchive: needsArchived.length,
        missingAttendance: missingCount,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-800">
        <div className="flex items-start gap-2">
          <Clock className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Recommended: Run these tasks regularly</strong> — ideally weekly. They keep your timetable accurate, the database lean, and ensure no attendance data is lost before archival.
            Each run takes 1–2 minutes and reports a full summary.
          </div>
        </div>
      </div>

      {/* Live Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Events to Close", value: stats?.toClose, color: "bg-amber-100 text-amber-700" },
          { label: "Events to Archive", value: stats?.toArchive, color: "bg-slate-100 text-slate-700" },
          { label: "Missing Attendance", value: stats?.missingAttendance, color: stats?.missingAttendance > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-100 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-slate-800">
              {loadingStats ? <span className="text-slate-300">…</span> : (s.value ?? 0)}
            </p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Agent Run Cards */}
      <div className="space-y-4">
        <RunAgentButton
          agentName="rolling_events_generator"
          label="Rolling Events Generator"
          icon={CalendarPlus}
          description="Extends recurring class series to maintain the configured weeks-ahead window. Automatically flags absence conflicts."
          statsLabel="events to close"
          statsValue={loadingStats ? "…" : stats?.toClose}
          statsColor="bg-amber-100 text-amber-700"
          onComplete={loadStats}
        />
        <RunAgentButton
          agentName="data_archiver"
          label="Data Archiver & Optimiser"
          icon={Archive}
          description="Marks past events as Closed (4–12 weeks old) and Archived (12+ weeks old). Sends attendance reminders for records at risk."
          statsLabel="to archive"
          statsValue={loadingStats ? "…" : stats?.toArchive}
          statsColor="bg-slate-100 text-slate-700"
          onComplete={loadStats}
        />
      </div>

      <p className="text-xs text-slate-400 text-center">
        These tasks use AI agents to process your data. Each run consumes integration credits.
        Upgrade to Builder+ to schedule these to run automatically on a timer.
      </p>
    </div>
  );
}