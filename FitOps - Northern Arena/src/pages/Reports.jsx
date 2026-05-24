import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { TrendingUp, TrendingDown, Users, DollarSign, Activity, Award, BarChart2, Sparkles, Download, BookOpen, ArrowUpDown, ArrowUp, ArrowDown, LayoutList } from "lucide-react";
import AIInsights from "@/components/reports/AIInsights";
import moment from "moment";
import { cn } from "@/lib/utils";

function SortableHeader({ label, field, sortField, sortDir, onSort }) {
  const active = sortField === field;
  return (
    <th
      className="text-center py-3 px-2 text-slate-500 font-medium cursor-pointer select-none hover:text-slate-700 whitespace-nowrap"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center justify-center gap-1">
        {label}
        {active
          ? sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-indigo-500" /> : <ArrowDown className="w-3 h-3 text-indigo-500" />
          : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
      </span>
    </th>
  );
}

const VIABILITY_COLORS = { red: "#ef4444", amber: "#f59e0b", green: "#22c55e", purple: "#a855f7", pending: "#94a3b8" };
const FALLBACK_COLORS = ["#6366f1","#06b6d4","#f97316","#22c55e","#a855f7","#ec4899","#14b8a6","#f43f5e","#84cc16","#fb923c","#0ea5e9","#8b5cf6"];
const viabilityLabel = { red: "Low", amber: "Moderate", green: "Good", purple: "Excellent", pending: "Pending" };

const PERIOD_OPTIONS = [
  { value: "this_week",    label: "This Week" },
  { value: "last_week",    label: "Last Week" },
  { value: "this_month",  label: "This Month" },
  { value: "last_month",  label: "Last Month" },
  { value: "this_quarter",label: "This Quarter" },
  { value: "last_quarter",label: "Last Quarter" },
  { value: "this_year",   label: "This Year" },
  { value: "last_year",   label: "Last Year" },
];

function getPeriodRange(period) {
  const now = moment();
  switch (period) {
    case "this_week":    return { start: now.clone().startOf("isoWeek"),    end: now.clone().endOf("isoWeek") };
    case "last_week":    return { start: now.clone().subtract(1,"week").startOf("isoWeek"), end: now.clone().subtract(1,"week").endOf("isoWeek") };
    case "this_month":   return { start: now.clone().startOf("month"),      end: now.clone().endOf("month") };
    case "last_month":   return { start: now.clone().subtract(1,"month").startOf("month"), end: now.clone().subtract(1,"month").endOf("month") };
    case "this_quarter": return { start: now.clone().startOf("quarter"),    end: now.clone().endOf("quarter") };
    case "last_quarter": return { start: now.clone().subtract(1,"quarter").startOf("quarter"), end: now.clone().subtract(1,"quarter").endOf("quarter") };
    case "this_year":    return { start: now.clone().startOf("year"),       end: now.clone().endOf("year") };
    case "last_year":    return { start: now.clone().subtract(1,"year").startOf("year"), end: now.clone().subtract(1,"year").endOf("year") };
    default:             return { start: now.clone().startOf("isoWeek"),    end: now.clone().endOf("isoWeek") };
  }
}

function getPeriodLabel(period) {
  return PERIOD_OPTIONS.find(o => o.value === period)?.label || period;
}

function SectionCard({ title, children, action }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function ViabilityDot({ color }) {
  const cls = { red:"bg-red-500", amber:"bg-amber-400", green:"bg-green-500", purple:"bg-purple-500", pending:"bg-slate-400" };
  return <span className={cn("inline-block w-2.5 h-2.5 rounded-full shrink-0", cls[color] || "bg-slate-300")} />;
}

// Week grid display with left/right navigation
function WeekGridView({ events }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const allWeeks = useMemo(() => {
    if (!events.length) return [moment().startOf("isoWeek")];
    const dates = events.map(e => moment(e.start_datetime));
    const earliest = moment.min(dates).startOf("isoWeek");
    const latest = moment.max(dates).startOf("isoWeek");
    const weeks = [];
    let cur = earliest.clone();
    while (cur.isSameOrBefore(latest, "week")) {
      weeks.push(cur.clone());
      cur.add(1, "week");
    }
    return weeks;
  }, [events]);

  // Clamp offset
  const safeOffset = Math.min(Math.max(weekOffset, 0), Math.max(allWeeks.length - 1, 0));
  const weekStart = allWeeks[safeOffset] || moment().startOf("isoWeek");

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = weekStart.clone().add(i, "days");
      const dayEvents = events.filter(e => moment(e.start_datetime).isSame(day, "day"))
        .sort((a, b) => moment(a.start_datetime).diff(moment(b.start_datetime)));
      days.push({ day, events: dayEvents });
    }
    return days;
  }, [events, weekStart]);

  const bgMap = { red:"bg-red-100 border-red-200", amber:"bg-amber-100 border-amber-200", green:"bg-green-100 border-green-200", purple:"bg-purple-100 border-purple-200", pending:"bg-slate-100 border-slate-200" };
  const textMap = { red:"text-red-800", amber:"text-amber-800", green:"text-green-800", purple:"text-purple-800", pending:"text-slate-600" };

  return (
    <div>
      {/* Navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setWeekOffset(o => Math.max(0, o - 1))}
          disabled={safeOffset === 0}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ← Prev
        </button>
        <span className="text-sm font-medium text-slate-700">
          {weekDays[0]?.day.format("MMM D")} – {weekDays[6]?.day.format("MMM D, YYYY")}
          <span className="text-xs text-slate-400 ml-2">({safeOffset + 1} / {allWeeks.length})</span>
        </span>
        <button
          onClick={() => setWeekOffset(o => Math.min(allWeeks.length - 1, o + 1))}
          disabled={safeOffset >= allWeeks.length - 1}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Next →
        </button>
      </div>

      {/* Week grid */}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-1 min-w-[560px]">
          {weekDays.map(({ day, events: dayEvents }) => {
            const isToday = day.isSame(moment(), "day");
            return (
              <div key={day.format()} className={cn("rounded-xl p-2 min-h-[120px]", isToday ? "bg-indigo-50 border border-indigo-200" : "bg-slate-50 border border-slate-100")}>
                <div className={cn("text-xs font-semibold mb-2 text-center", isToday ? "text-indigo-700" : "text-slate-500")}>
                  <div>{day.format("ddd")}</div>
                  <div className={cn("text-base font-bold", isToday && "text-indigo-600")}>{day.format("D")}</div>
                </div>
                <div className="space-y-1">
                  {dayEvents.length === 0 && <p className="text-[10px] text-slate-300 text-center mt-2">—</p>}
                  {dayEvents.map(ev => {
                    const vc = ev.viability_color || (ev.attendance_count != null ? "pending" : null);
                    return (
                      <div key={ev.id} className={cn("rounded-lg border p-1.5 text-[10px]", vc ? bgMap[vc] : "bg-white border-slate-200")}>
                        <div className={cn("font-semibold truncate", vc ? textMap[vc] : "text-slate-700")}>{ev.class_type_name}</div>
                        <div className={cn("mt-0.5 flex items-center justify-between", vc ? textMap[vc] : "text-slate-500")}>
                          <span>{moment(ev.start_datetime).format("h:mm")}</span>
                          {ev.attendance_count != null ? <span className="font-bold">{ev.attendance_count}</span>
                            : moment(ev.end_datetime).isBefore(moment()) ? <span className="opacity-60">?</span> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-500">
        {["red","amber","green","purple"].map(c => (
          <div key={c} className="flex items-center gap-1.5"><ViabilityDot color={c} /><span className="capitalize">{viabilityLabel[c]}</span></div>
        ))}
        <div className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-200" /><span>No attendance yet</span></div>
      </div>
    </div>
  );
}

// Filters bar
function FiltersBar({ period, onPeriod, classTypeFilter, onClassType, classTypeOptions, classTypeColorMap }) {
  return (
    <div className="flex items-center flex-wrap gap-3">
      <Select value={period} onValueChange={onPeriod}>
        <SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {classTypeOptions && (
        <Select value={classTypeFilter} onValueChange={onClassType}>
          <SelectTrigger className="w-48 bg-white"><SelectValue placeholder="All Class Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Class Types</SelectItem>
            {classTypeOptions.map(ct => (
              <SelectItem key={ct} value={ct}>
                <span className="flex items-center gap-2">
                  {classTypeColorMap?.[ct] && <span className="w-2 h-2 rounded-full inline-block" style={{ background: classTypeColorMap[ct] }} />}
                  {ct}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export default function Reports() {
  const [events, setEvents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [classTypes, setClassTypes] = useState([]);
  const [coverRequests, setCoverRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("attendance");
  const [currencySymbol, setCurrencySymbol] = useState("$");

  // Per-tab filters
  const [attendancePeriod, setAttendancePeriod] = useState("this_month");
  const [attendanceCTFilter, setAttendanceCTFilter] = useState("all");
  const [instructorPeriod, setInstructorPeriod] = useState("this_month");
  const [classPeriod, setClassPeriod] = useState("this_month");
  const [classCTFilter, setClassCTFilter] = useState("all");
  const [financialDays, setFinancialDays] = useState("30");

  // Sort state — instructors table
  const [insSortField, setInsSortField] = useState("classes");
  const [insSortDir, setInsSortDir] = useState("desc");
  const [insShowChart, setInsShowChart] = useState(false);
  const [insNameFilter, setInsNameFilter] = useState("all");

  // Sort state — class type summary table
  const [ctSortField, setCtSortField] = useState("total");
  const [ctSortDir, setCtSortDir] = useState("desc");
  const [ctShowChart, setCtShowChart] = useState(false);

  // Instructor trend — consolidated
  const [trendInsFilter, setTrendInsFilter] = useState("all");

  // Reliability sort
  const [reliabilitySortMode, setReliabilitySortMode] = useState("pct"); // "pct" | "az"

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [eventsData, staffData, invoicesData, classTypesData, coverData, currencySettings] = await Promise.all([
        base44.entities.TimetableEvent.list("-start_datetime", 2000),
        base44.entities.Staff.filter({ status: "active" }),
        base44.entities.Invoice.list("-created_date", 200),
        base44.entities.ClassType.filter({ status: "active" }),
        base44.entities.CoverRequest.list("-created_date", 500),
        base44.entities.AppSettings.filter({ setting_key: "currency_symbol" }),
      ]);
      setEvents(eventsData);
      setStaff(staffData);
      setInvoices(invoicesData);
      setClassTypes(classTypesData);
      setCoverRequests(coverData);
      if (currencySettings.length > 0) setCurrencySymbol(currencySettings[0].setting_value || "$");
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Build a colour map from ClassType settings, fallback to FALLBACK_COLORS
  const classTypeColorMap = useMemo(() => {
    const map = {};
    classTypes.forEach((ct, i) => {
      map[ct.name] = ct.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
    });
    return map;
  }, [classTypes]);

  // Helper: get color for a class type name (uses settings color first)
  const ctColor = (name, index = 0) => classTypeColorMap[name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];

  // ── Period helpers ─────────────────────────────────────────────────
  const filterByPeriod = (evts, period) => {
    const { start, end } = getPeriodRange(period);
    return evts.filter(e => {
      const m = moment(e.start_datetime);
      return m.isSameOrAfter(start) && m.isSameOrBefore(end);
    });
  };

  // ── Instructor lookup map (id → name) ─────────────────────────────
  // Use assigned_instructor_name from events (denormalised) as primary source
  // Fall back to staff lookup by id only if name is missing
  const staffMap = useMemo(() => {
    const m = {};
    staff.forEach(s => { m[s.id] = s; });
    return m;
  }, [staff]);

  // Resolve instructor name from event (prefer denormalised field)
  const resolveInstructor = (event) => {
    if (event.assigned_instructor_name) return event.assigned_instructor_name;
    if (event.assigned_instructor_id && staffMap[event.assigned_instructor_id]) {
      return staffMap[event.assigned_instructor_id].name;
    }
    return "Unassigned";
  };

  // ── All completed events ───────────────────────────────────────────
  const allCompleted = useMemo(() =>
    events.filter(e => e.attendance_count != null && e.status !== "cancelled"),
    [events]);

  // ── Attendance Tab ─────────────────────────────────────────────────
  const attPeriodEvents = useMemo(() => filterByPeriod(events, attendancePeriod), [events, attendancePeriod]);
  const attCompleted = useMemo(() =>
    attPeriodEvents.filter(e => e.attendance_count != null && e.status !== "cancelled"),
    [attPeriodEvents]);
  const attFiltered = useMemo(() =>
    attendanceCTFilter === "all" ? attCompleted : attCompleted.filter(e => e.class_type_name === attendanceCTFilter),
    [attCompleted, attendanceCTFilter]);

  const attCTOptions = useMemo(() => [...new Set(attCompleted.map(e => e.class_type_name).filter(Boolean))].sort(), [attCompleted]);

  const attAvg = attFiltered.length ? Math.round(attFiltered.reduce((s, e) => s + (e.attendance_count || 0), 0) / attFiltered.length) : 0;

  const attendanceTrendByWeek = useMemo(() => {
    const byWeek = {};
    attFiltered.forEach(e => {
      const wk = moment(e.start_datetime).startOf("isoWeek").format("MMM D");
      if (!byWeek[wk]) byWeek[wk] = { week: wk, total: 0, count: 0 };
      byWeek[wk].total += e.attendance_count || 0;
      byWeek[wk].count += 1;
    });
    return Object.values(byWeek).sort((a,b) => moment(a.week,"MMM D").diff(moment(b.week,"MMM D")))
      .map(w => ({ ...w, avg: w.count ? Math.round(w.total / w.count) : 0 }));
  }, [attFiltered]);

  const attendanceTrendByClassType = useMemo(() => {
    // Respect the CT filter: if a type is selected, only show that line
    const source = attendanceCTFilter === "all" ? attCompleted : attCompleted.filter(e => e.class_type_name === attendanceCTFilter);
    const weeks = {};
    const ctSet = new Set();
    source.forEach(e => {
      const wk = moment(e.start_datetime).startOf("isoWeek").format("MMM D");
      const ct = e.class_type_name || "Unknown";
      ctSet.add(ct);
      if (!weeks[wk]) weeks[wk] = { week: wk };
      if (!weeks[wk][ct]) weeks[wk][ct] = { total: 0, count: 0 };
      weeks[wk][ct].total += e.attendance_count || 0;
      weeks[wk][ct].count += 1;
    });
    const ctList = [...ctSet].sort();
    const rows = Object.values(weeks).sort((a,b) => moment(a.week,"MMM D").diff(moment(b.week,"MMM D"))).map(row => {
      const out = { week: row.week };
      ctList.forEach(ct => { const d = row[ct]; out[ct] = d ? Math.round(d.total / d.count) : null; });
      return out;
    });
    return { rows, classTypes: ctList };
  }, [attCompleted, attendanceCTFilter]);

  const attendanceByDay = useMemo(() => {
    const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    const dayData = {};
    days.forEach(d => { dayData[d] = { day: d, total: 0, count: 0 }; });
    attFiltered.forEach(e => {
      const d = moment(e.start_datetime).format("ddd");
      if (dayData[d]) { dayData[d].total += e.attendance_count || 0; dayData[d].count += 1; }
    });
    return days.map(d => ({ ...dayData[d], avg: dayData[d].count ? Math.round(dayData[d].total / dayData[d].count) : 0 }));
  }, [attFiltered]);

  const attendanceByClassType = useMemo(() => {
    const byType = {};
    attFiltered.forEach(e => {
      const n = e.class_type_name || "Unknown";
      if (!byType[n]) byType[n] = { name: n, total: 0, count: 0 };
      byType[n].total += e.attendance_count || 0;
      byType[n].count += 1;
    });
    return Object.values(byType).map(t => ({ ...t, avg: t.count ? Math.round(t.total / t.count) : 0 })).sort((a,b) => b.avg - a.avg);
  }, [attFiltered]);

  const attendanceBySlot = useMemo(() => {
    const slots = { "Early (6-9am)": [], "Morning (9-12pm)": [], "Lunch (12-2pm)": [], "Afternoon (2-5pm)": [], "Evening (5-9pm)": [] };
    attFiltered.forEach(e => {
      const h = moment(e.start_datetime).hour();
      const key = h < 9 ? "Early (6-9am)" : h < 12 ? "Morning (9-12pm)" : h < 14 ? "Lunch (12-2pm)" : h < 17 ? "Afternoon (2-5pm)" : "Evening (5-9pm)";
      slots[key].push(e.attendance_count || 0);
    });
    return Object.entries(slots).map(([slot, vals]) => ({
      slot, avg: vals.length ? Math.round(vals.reduce((a,b) => a+b, 0) / vals.length) : 0, count: vals.length
    }));
  }, [attFiltered]);

  // ── Class Tab ─────────────────────────────────────────────────────
  const classPeriodEvents = useMemo(() => filterByPeriod(events, classPeriod), [events, classPeriod]);
  const classCompleted = useMemo(() =>
    classPeriodEvents.filter(e => e.attendance_count != null && e.status !== "cancelled"),
    [classPeriodEvents]);
  const classFiltered = useMemo(() =>
    classCTFilter === "all" ? classCompleted : classCompleted.filter(e => e.class_type_name === classCTFilter),
    [classCompleted, classCTFilter]);
  const classCTOptions = useMemo(() => [...new Set(classCompleted.map(e => e.class_type_name).filter(Boolean))].sort(), [classCompleted]);

  // Capacity data
  const capacityData = useMemo(() => {
    const byType = {};
    classFiltered.forEach(e => {
      const ct = classTypes.find(c => c.id === e.class_type_id || c.name === e.class_type_name);
      if (!ct) return;
      const n = e.class_type_name || "Unknown";
      if (!byType[n]) byType[n] = { name: n, totalAtt: 0, count: 0, purple_min: ct.purple_min || 20, green_min: ct.green_min || 10, amber_min: ct.amber_min || 5 };
      byType[n].totalAtt += e.attendance_count || 0;
      byType[n].count += 1;
    });
    return Object.values(byType).map(t => ({
      name: t.name,
      avg: t.count ? Math.round(t.totalAtt / t.count) : 0,
      target: t.purple_min,
      green_min: t.green_min,
      amber_min: t.amber_min,
      fillPct: t.purple_min > 0 ? Math.min(100, Math.round((t.totalAtt / t.count / t.purple_min) * 100)) : 0,
    })).sort((a,b) => b.avg - a.avg);
  }, [classFiltered, classTypes]);

  // Class type summary — subject to CT filter
  const classTypeSummary = useMemo(() => {
    const byType = {};
    const source = classCTFilter === "all"
      ? classPeriodEvents.filter(e => e.status !== "cancelled")
      : classPeriodEvents.filter(e => e.status !== "cancelled" && e.class_type_name === classCTFilter);
    source.forEach(e => {
      const n = e.class_type_name || "Unknown";
      if (!byType[n]) byType[n] = { name: n, total: 0, completed: 0, totalAtt: 0, attCount: 0 };
      byType[n].total += 1;
      if (e.status === "completed" || e.attendance_count != null) byType[n].completed += 1;
      if (e.attendance_count != null) { byType[n].totalAtt += e.attendance_count; byType[n].attCount += 1; }
    });
    return Object.values(byType).map(t => ({
      ...t, avg: t.attCount ? Math.round(t.totalAtt / t.attCount) : 0
    })).sort((a,b) => b.total - a.total);
  }, [classPeriodEvents, classCTFilter]);

  // Trend by class type over weeks (for class tab)
  const classTrendByWeek = useMemo(() => {
    const byWeek = {};
    classFiltered.forEach(e => {
      const wk = moment(e.start_datetime).startOf("isoWeek").format("MMM D");
      if (!byWeek[wk]) byWeek[wk] = { week: wk, total: 0, count: 0 };
      byWeek[wk].total += e.attendance_count || 0;
      byWeek[wk].count += 1;
    });
    return Object.values(byWeek).sort((a,b) => moment(a.week,"MMM D").diff(moment(b.week,"MMM D")))
      .map(w => ({ ...w, avg: w.count ? Math.round(w.total / w.count) : 0 }));
  }, [classFiltered]);

  // Day-of-week breakdown per class type
  const classByDay = useMemo(() => {
    const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    const dayData = {};
    days.forEach(d => { dayData[d] = { day: d, total: 0, count: 0 }; });
    classFiltered.forEach(e => {
      const d = moment(e.start_datetime).format("ddd");
      if (dayData[d]) { dayData[d].total += e.attendance_count || 0; dayData[d].count += 1; }
    });
    return days.map(d => ({ ...dayData[d], avg: dayData[d].count ? Math.round(dayData[d].total / dayData[d].count) : 0 }));
  }, [classFiltered]);

  // ── Instructor Tab ─────────────────────────────────────────────────
  const insPeriodEvents = useMemo(() => filterByPeriod(events, instructorPeriod), [events, instructorPeriod]);
  const insCompleted = useMemo(() =>
    insPeriodEvents.filter(e => e.status !== "cancelled"),
    [insPeriodEvents]);

  const instructorPerformance = useMemo(() => {
    // Use staff list but ALSO collect any instructors found in events that might not be in the staff list
    const insMap = {};

    // Seed from staff
    staff.filter(s => ["instructor","team_leader"].includes(s.role)).forEach(s => {
      insMap[s.id] = { id: s.id, name: s.name, role: s.role, coverReliability: s.cover_reliability_score };
    });

    // Group events by assigned_instructor_id, using denormalised name for display
    const eventsByIns = {};
    insCompleted.forEach(e => {
      const insId = e.assigned_instructor_id;
      const insName = resolveInstructor(e);
      if (!insId && insName === "Unassigned") return;
      const key = insId || insName;
      if (!eventsByIns[key]) eventsByIns[key] = { id: insId, name: insName, events: [] };
      eventsByIns[key].events.push(e);
    });

    return Object.values(eventsByIns).map(({ id, name, events: insEvents }) => {
      const staffRec = id ? staffMap[id] : null;
      const withAtt = insEvents.filter(e => e.attendance_count != null);
      const avgAtt = withAtt.length ? Math.round(withAtt.reduce((s,e) => s+e.attendance_count, 0) / withAtt.length) : 0;

      const coversTaken = insPeriodEvents.filter(e =>
        e.assigned_instructor_id === id && e.original_instructor_id && e.original_instructor_id !== id
      ).length;
      const coverRequested = coverRequests.filter(r => r.original_instructor_id === id).length;
      const rawReliability = staffRec?.cover_reliability_score != null
        ? staffRec.cover_reliability_score
        : Math.max(0, 100 - coverRequested * 5);

      const weeklyTrend = {};
      withAtt.forEach(e => {
        const wk = moment(e.start_datetime).startOf("isoWeek").format("MMM D");
        if (!weeklyTrend[wk]) weeklyTrend[wk] = { total: 0, count: 0 };
        weeklyTrend[wk].total += e.attendance_count;
        weeklyTrend[wk].count += 1;
      });
      const trend = Object.entries(weeklyTrend)
        .sort(([a],[b]) => moment(a,"MMM D").diff(moment(b,"MMM D")))
        .map(([wk,d]) => ({ week: wk, avg: Math.round(d.total / d.count) }));

      const byClassType = {};
      insEvents.forEach(e => {
        const n = e.class_type_name || "Unknown";
        if (!byClassType[n]) byClassType[n] = { name: n, count: 0, totalAtt: 0 };
        byClassType[n].count++;
        if (e.attendance_count != null) byClassType[n].totalAtt += e.attendance_count;
      });

      return {
        id, name, role: staffRec?.role || "instructor",
        classes: insEvents.length, avgAttendance: avgAtt,
        reliability: rawReliability, coversTaken, coverRequested,
        trend, byClassType: Object.values(byClassType),
      };
    }).sort((a,b) => b.classes - a.classes);
  }, [staff, insCompleted, insPeriodEvents, coverRequests, staffMap]);

  // ── Viability Data ─────────────────────────────────────────────────
  const viabilityData = useMemo(() => {
    const counts = { red:0, amber:0, green:0, purple:0, pending:0 };
    allCompleted.forEach(e => { counts[e.viability_color || "pending"]++; });
    return Object.entries(counts).filter(([,v]) => v > 0).map(([color, count]) => ({
      color, count, label: viabilityLabel[color], fill: VIABILITY_COLORS[color],
      pct: allCompleted.length ? Math.round(count / allCompleted.length * 100) : 0,
    }));
  }, [allCompleted]);

  const viabilityByClassType = useMemo(() => {
    const byType = {};
    allCompleted.forEach(e => {
      const n = e.class_type_name || "Unknown";
      if (!byType[n]) byType[n] = { name: n, red:0, amber:0, green:0, purple:0 };
      const v = e.viability_color || "pending";
      if (byType[n][v] !== undefined) byType[n][v]++;
    });
    return Object.values(byType);
  }, [allCompleted]);

  const viabilityCounts = useMemo(() => {
    const counts = { red:0, amber:0, green:0, purple:0, pending:0 };
    allCompleted.forEach(e => { counts[e.viability_color || "pending"]++; });
    return counts;
  }, [allCompleted]);
  const viabilityTotal = allCompleted.length || 1;

  // Viability trend by class type — compute slope over recent weeks to flag trending up/down
  const viabilityTrends = useMemo(() => {
    // For each class type, look at last 8 weeks, compute avg viability score per week
    // Score: red=1, amber=2, green=3, purple=4
    const scoreMap = { red:1, amber:2, green:3, purple:4, pending:2 };
    const byType = {};
    allCompleted.forEach(e => {
      const n = e.class_type_name || "Unknown";
      const wk = moment(e.start_datetime).startOf("isoWeek").format("YYYY-MM-DD");
      if (!byType[n]) byType[n] = {};
      if (!byType[n][wk]) byType[n][wk] = { total:0, count:0 };
      byType[n][wk].total += scoreMap[e.viability_color || "pending"] || 2;
      byType[n][wk].count += 1;
    });

    return Object.entries(byType).map(([name, weeks]) => {
      const sorted = Object.entries(weeks)
        .sort(([a],[b]) => a.localeCompare(b))
        .slice(-8)
        .map(([wk, d]) => ({ week: moment(wk).format("MMM D"), score: d.count ? Math.round((d.total/d.count)*10)/10 : 0 }));
      if (sorted.length < 2) return null;
      const first = sorted.slice(0, Math.ceil(sorted.length/2)).reduce((s,r) => s+r.score,0) / Math.ceil(sorted.length/2);
      const last = sorted.slice(Math.floor(sorted.length/2)).reduce((s,r) => s+r.score,0) / Math.ceil(sorted.length/2);
      const slope = last - first;
      return { name, trend: sorted, slope, latestScore: sorted[sorted.length-1]?.score || 0 };
    }).filter(Boolean).sort((a,b) => b.slope - a.slope);
  }, [allCompleted]);

  const trendingUp = viabilityTrends.filter(t => t.slope > 0.1).slice(0, 6);
  const trendingDown = viabilityTrends.filter(t => t.slope < -0.1).slice(0, 6);

  // ── Financial ──────────────────────────────────────────────────────
  const financialCutoff = useMemo(() => moment().subtract(parseInt(financialDays),"days"), [financialDays]);
  const financialCompleted = useMemo(() =>
    events.filter(e => moment(e.start_datetime).isAfter(financialCutoff) && e.status !== "cancelled" && e.attendance_count != null),
    [events, financialCutoff]);

  const financialData = useMemo(() => {
    const filtered = invoices.filter(inv => moment(inv.created_date).isAfter(financialCutoff));
    const byStatus = {
      draft: filtered.filter(i => i.status==="draft").reduce((s,i) => s+(i.total_amount||0),0),
      submitted: filtered.filter(i => i.status==="submitted").reduce((s,i) => s+(i.total_amount||0),0),
      approved: filtered.filter(i => ["manager_approved","payroll_approved"].includes(i.status)).reduce((s,i) => s+(i.total_amount||0),0),
      paid: filtered.filter(i => i.status==="paid").reduce((s,i) => s+(i.total_amount||0),0),
    };
    const byInstructor = {};
    filtered.forEach(inv => {
      if (!byInstructor[inv.instructor_name]) byInstructor[inv.instructor_name] = { name: inv.instructor_name, total:0, paid:0 };
      byInstructor[inv.instructor_name].total += inv.total_amount || 0;
      if (inv.status==="paid") byInstructor[inv.instructor_name].paid += inv.total_amount || 0;
    });
    const costPerClass = financialCompleted.length > 0 ? Math.round(byStatus.paid/financialCompleted.length*100)/100 : 0;
    return { byStatus, byInstructor: Object.values(byInstructor), costPerClass, total: byStatus.draft+byStatus.submitted+byStatus.approved+byStatus.paid };
  }, [invoices, financialCutoff, financialCompleted]);

  // ── KPIs ───────────────────────────────────────────────────────────
  const goodViability = viabilityData.filter(v => ["green","purple"].includes(v.color)).reduce((s,v) => s+v.count, 0);

  // ── Sorted instructor list ─────────────────────────────────────────
  const sortedInstructors = useMemo(() => {
    const sorted = [...instructorPerformance].sort((a, b) => {
      const va = a[insSortField] ?? 0;
      const vb = b[insSortField] ?? 0;
      return insSortDir === "asc" ? va - vb : vb - va;
    });
    return sorted;
  }, [instructorPerformance, insSortField, insSortDir]);

  const handleInsSort = (field) => {
    if (insSortField === field) setInsSortDir(d => d === "asc" ? "desc" : "asc");
    else { setInsSortField(field); setInsSortDir("desc"); }
  };

  // ── Sorted class type summary ──────────────────────────────────────
  const sortedClassTypeSummary = useMemo(() => {
    return [...classTypeSummary].sort((a, b) => {
      const va = a[ctSortField] ?? 0;
      const vb = b[ctSortField] ?? 0;
      return ctSortDir === "asc" ? va - vb : vb - va;
    });
  }, [classTypeSummary, ctSortField, ctSortDir]);

  const handleCtSort = (field) => {
    if (ctSortField === field) setCtSortDir(d => d === "asc" ? "desc" : "asc");
    else { setCtSortField(field); setCtSortDir("desc"); }
  };

  // ── Filtered instructor list for Key Metrics ───────────────────────
  const filteredInstructors = useMemo(() => {
    if (insNameFilter === "all") return sortedInstructors;
    return sortedInstructors.filter(i => (i.id || i.name) === insNameFilter);
  }, [sortedInstructors, insNameFilter]);

  // ── Consolidated instructor trend (one graph, filterable by instructor) ──
  const consolidatedTrendData = useMemo(() => {
    const selected = trendInsFilter === "all"
      ? instructorPerformance.filter(i => i.trend.length > 0)
      : instructorPerformance.filter(i => (i.id || i.name) === trendInsFilter && i.trend.length > 0);

    // Merge all weeks across selected instructors
    const weekSet = new Set();
    selected.forEach(ins => ins.trend.forEach(t => weekSet.add(t.week)));
    const weeks = [...weekSet].sort((a, b) => moment(a, "MMM D").diff(moment(b, "MMM D")));

    return weeks.map(wk => {
      const row = { week: wk };
      selected.forEach(ins => {
        const point = ins.trend.find(t => t.week === wk);
        row[ins.name] = point ? point.avg : null;
      });
      return row;
    });
  }, [instructorPerformance, trendInsFilter]);

  const trendInsNames = useMemo(() =>
    instructorPerformance.filter(i => i.trend.length > 0).map(i => i.name),
    [instructorPerformance]);

  // ── Per-instructor class-type breakdown (for detail cards) ─────────
  const selectedInstructorDetail = useMemo(() => {
    if (trendInsFilter === "all") return null;
    return instructorPerformance.find(i => (i.id || i.name) === trendInsFilter) || null;
  }, [instructorPerformance, trendInsFilter]);

  // ── Per-instructor class-type trend lines (when one instructor selected) ─
  const instructorClassTypeTrend = useMemo(() => {
    if (!selectedInstructorDetail) return { rows: [], classTypes: [] };
    const withAtt = insCompleted.filter(e =>
      (e.assigned_instructor_id === selectedInstructorDetail.id || resolveInstructor(e) === selectedInstructorDetail.name)
      && e.attendance_count != null
    );
    const ctSet = new Set();
    const byWeek = {};
    withAtt.forEach(e => {
      const wk = moment(e.start_datetime).startOf("isoWeek").format("MMM D");
      const ct = e.class_type_name || "Unknown";
      ctSet.add(ct);
      if (!byWeek[wk]) byWeek[wk] = { week: wk };
      if (!byWeek[wk][ct]) byWeek[wk][ct] = { total: 0, count: 0 };
      byWeek[wk][ct].total += e.attendance_count;
      byWeek[wk][ct].count += 1;
    });
    const ctList = [...ctSet].sort();
    const rows = Object.values(byWeek)
      .sort((a, b) => moment(a.week, "MMM D").diff(moment(b.week, "MMM D")))
      .map(row => {
        const out = { week: row.week };
        ctList.forEach(ct => { const d = row[ct]; out[ct] = d ? Math.round(d.total / d.count) : null; });
        return out;
      });
    return { rows, classTypes: ctList };
  }, [selectedInstructorDetail, insCompleted]);

  // ── Sorted reliability list ────────────────────────────────────────
  const sortedReliability = useMemo(() => {
    return [...instructorPerformance].sort((a, b) => {
      if (reliabilitySortMode === "az") return a.name.localeCompare(b.name);
      return b.reliability - a.reliability;
    });
  }, [instructorPerformance, reliabilitySortMode]);

  if (loading) return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1>
        <p className="text-slate-500">Operational insights across the studio</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Classes Completed", value: attFiltered.length, icon: Activity, bg: "bg-indigo-50", ic: "text-indigo-600" },
          { label: "Avg Attendance", value: attAvg, icon: Users, bg: "bg-cyan-50", ic: "text-cyan-600" },
          { label: "Total Payroll", value: `${currencySymbol}${financialData.total.toFixed(0)}`, icon: DollarSign, bg: "bg-green-50", ic: "text-green-600" },
          { label: "Good Viability", value: `${goodViability}/${allCompleted.length}`, icon: TrendingUp, bg: "bg-purple-50", ic: "text-purple-600" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500">{kpi.label}</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{kpi.value}</p>
              </div>
              <div className={`p-2.5 rounded-xl ${kpi.bg}`}><kpi.icon className={`w-5 h-5 ${kpi.ic}`} /></div>
            </div>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border shadow-sm flex-wrap h-auto gap-1 p-1 w-full">
          <TabsTrigger value="attendance" className="gap-1.5 text-xs sm:text-sm"><BarChart2 className="w-4 h-4" /><span className="hidden sm:inline">Attendance</span></TabsTrigger>
          <TabsTrigger value="classes" className="gap-1.5 text-xs sm:text-sm"><BookOpen className="w-4 h-4" /><span className="hidden sm:inline">Classes</span></TabsTrigger>
          <TabsTrigger value="instructors" className="gap-1.5 text-xs sm:text-sm"><Award className="w-4 h-4" /><span className="hidden sm:inline">Instructors</span></TabsTrigger>
          <TabsTrigger value="financial" className="gap-1.5 text-xs sm:text-sm"><DollarSign className="w-4 h-4" /><span className="hidden sm:inline">Financial</span></TabsTrigger>
          <TabsTrigger value="viability" className="gap-1.5 text-xs sm:text-sm"><Activity className="w-4 h-4" /><span className="hidden sm:inline">Viability</span></TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5 text-xs sm:text-sm text-indigo-600"><Sparkles className="w-4 h-4" /><span className="hidden sm:inline">AI Insights</span></TabsTrigger>
        </TabsList>

        {/* ════ ATTENDANCE TAB ════ */}
        <TabsContent value="attendance" className="mt-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold text-slate-700">Attendance Analytics — {getPeriodLabel(attendancePeriod)}</h2>
            <FiltersBar
              period={attendancePeriod} onPeriod={setAttendancePeriod}
              classTypeFilter={attendanceCTFilter} onClassType={setAttendanceCTFilter}
              classTypeOptions={attCTOptions} classTypeColorMap={classTypeColorMap}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Classes (period)", value: attendanceCTFilter === "all" ? attPeriodEvents.length : attPeriodEvents.filter(e => e.class_type_name === attendanceCTFilter).length },
              { label: "With Attendance", value: attFiltered.length },
              { label: "Avg Attendance", value: attAvg },
              { label: "Total Attendees", value: attFiltered.reduce((s,e) => s+(e.attendance_count||0),0) },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <p className="text-xs text-slate-500">{k.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{k.value}</p>
              </div>
            ))}
          </div>

          {/* Week Grid — follows period + CT filter */}
          <SectionCard title={`Schedule — ${getPeriodLabel(attendancePeriod)}${attendanceCTFilter !== "all" ? ` — ${attendanceCTFilter}` : ""}`}>
            <WeekGridView events={attendanceCTFilter === "all" ? attPeriodEvents : attPeriodEvents.filter(e => e.class_type_name === attendanceCTFilter)} periodLabel={getPeriodLabel(attendancePeriod)} />
          </SectionCard>

          {/* Weekly Trend */}
          <SectionCard title="Weekly Attendance Trend">
            {attendanceTrendByWeek.length === 0 ? <p className="text-slate-400 text-sm text-center py-8">No data for this period</p> : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={attendanceTrendByWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="avg" name="Avg Attendance" stroke="#6366f1" strokeWidth={2} dot={{ fill: "#6366f1" }} />
                  <Line type="monotone" dataKey="count" name="Classes" stroke="#22c55e" strokeWidth={2} dot={{ fill: "#22c55e" }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          {/* Trend by Class Type (uses class setting colors) */}
          <SectionCard title="Attendance Trend by Class Type">
            {attendanceTrendByClassType.rows.length === 0 ? <p className="text-slate-400 text-sm text-center py-8">No data for this period</p> : (
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={attendanceTrendByClassType.rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  {attendanceTrendByClassType.classTypes.map(ct => (
                    <Line key={ct} type="monotone" dataKey={ct} name={ct} stroke={ctColor(ct)} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          {/* By Day of Week */}
          <SectionCard title="Average Attendance by Day of Week">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={attendanceByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v,n,p) => [v, `Avg Attendance (${p.payload.count} classes)`]} />
                <Bar dataKey="avg" name="Avg Attendance" radius={[6,6,0,0]}>
                  {attendanceByDay.map((entry, i) => (
                    <Cell key={i} fill="#6366f1" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Avg Attendance by Class Type">
              {attendanceByClassType.length === 0 ? <p className="text-slate-400 text-sm text-center py-8">No data</p> : (
                <ResponsiveContainer width="100%" height={Math.max(280, attendanceByClassType.length * 38)}>
                  <BarChart data={attendanceByClassType} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                    <Tooltip />
                    <Bar dataKey="avg" name="Avg Attendance" radius={[0,4,4,0]}>
                      {attendanceByClassType.map((entry) => (
                        <Cell key={entry.name} fill={ctColor(entry.name)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            <SectionCard title="Avg Attendance by Time Slot">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={attendanceBySlot}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="slot" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="avg" name="Avg Attendance" fill="#06b6d4" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          </div>

          {/* Class Log */}
          <SectionCard title="Class Log" action={
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => {
              const rows = [["Date","Day","Time","Class","Instructor","Location","Attendance","Viability"]];
              attFiltered.forEach(e => rows.push([
                moment(e.start_datetime).format("YYYY-MM-DD"), moment(e.start_datetime).format("dddd"),
                moment(e.start_datetime).format("HH:mm"), e.class_type_name||"",
                resolveInstructor(e), e.location||"", e.attendance_count??"", viabilityLabel[e.viability_color]||""
              ]));
              const csv = rows.map(r => r.join(",")).join("\n");
              const a = document.createElement("a"); a.href = "data:text/csv,"+encodeURIComponent(csv); a.download = "class-log.csv"; a.click();
            }}>
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
          }>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {attFiltered.length === 0 ? <p className="text-center text-slate-400 py-8 text-sm">No completed classes for this period</p> : (
                attFiltered.map(e => {
                  const vc = e.viability_color || "pending";
                  const bgMap = { red:"bg-red-50 border-red-200", amber:"bg-amber-50 border-amber-200", green:"bg-green-50 border-green-200", purple:"bg-purple-50 border-purple-200", pending:"bg-slate-50 border-slate-200" };
                  const dotMap = { red:"bg-red-500", amber:"bg-amber-400", green:"bg-green-500", purple:"bg-purple-500", pending:"bg-slate-400" };
                  return (
                    <div key={e.id} className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", bgMap[vc])}>
                      <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", dotMap[vc])} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{e.class_type_name}</p>
                        <p className="text-xs text-slate-500">{resolveInstructor(e)} · {e.location||""}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium text-slate-600">{moment(e.start_datetime).format("ddd D MMM")}</p>
                        <p className="text-xs text-slate-400">{moment(e.start_datetime).format("HH:mm")}</p>
                      </div>
                      <div className="text-right shrink-0 w-10">
                        <p className="text-lg font-bold text-slate-900">{e.attendance_count??"-"}</p>
                        <p className="text-[10px] text-slate-400">pax</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </SectionCard>
        </TabsContent>

        {/* ════ CLASSES TAB ════ */}
        <TabsContent value="classes" className="mt-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold text-slate-700">Class Type Analytics — {getPeriodLabel(classPeriod)}</h2>
            <FiltersBar
              period={classPeriod} onPeriod={setClassPeriod}
              classTypeFilter={classCTFilter} onClassType={setClassCTFilter}
              classTypeOptions={classCTOptions} classTypeColorMap={classTypeColorMap}
            />
          </div>

          {/* Summary table */}
          <SectionCard title="Class Type Summary" action={
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setCtShowChart(v => !v)}>
              {ctShowChart ? <LayoutList className="w-3.5 h-3.5" /> : <BarChart2 className="w-3.5 h-3.5" />}
              {ctShowChart ? "Table" : "Chart"}
            </Button>
          }>
            {classTypeSummary.length === 0 ? <p className="text-slate-400 text-sm text-center py-8">No data for this period</p> : ctShowChart ? (
              <ResponsiveContainer width="100%" height={Math.max(280, sortedClassTypeSummary.length * 42)}>
                <BarChart data={sortedClassTypeSummary} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total" name="Total Sessions" radius={[0,4,4,0]}>
                    {sortedClassTypeSummary.map(d => <Cell key={d.name} fill={ctColor(d.name)} />)}
                  </Bar>
                  <Bar dataKey="avg" name="Avg Attendance" fill="#06b6d4" radius={[0,4,4,0]} />
                  <Bar dataKey="totalAtt" name="Total Attendees" fill="#a855f7" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-3 pr-4 text-slate-500 font-medium">Class Type</th>
                      <SortableHeader label="Total Sessions" field="total" sortField={ctSortField} sortDir={ctSortDir} onSort={handleCtSort} />
                      <SortableHeader label="Completed" field="completed" sortField={ctSortField} sortDir={ctSortDir} onSort={handleCtSort} />
                      <SortableHeader label="Avg Attendance" field="avg" sortField={ctSortField} sortDir={ctSortDir} onSort={handleCtSort} />
                      <SortableHeader label="Total Attendees" field="totalAtt" sortField={ctSortField} sortDir={ctSortDir} onSort={handleCtSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedClassTypeSummary.map(ct => (
                      <tr key={ct.name} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: ctColor(ct.name) }} />
                            <span className="font-medium text-slate-800">{ct.name}</span>
                          </div>
                        </td>
                        <td className="text-center py-3 px-2 font-semibold text-indigo-600">{ct.total}</td>
                        <td className="text-center py-3 px-2">{ct.completed}</td>
                        <td className="text-center py-3 px-2 font-semibold">{ct.avg || "—"}</td>
                        <td className="text-center py-3 px-2">{ct.totalAtt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Attendance trend for selected class type */}
          <SectionCard title={`Attendance Trend${classCTFilter !== "all" ? ` — ${classCTFilter}` : " — All Class Types"}`}>
            {classTrendByWeek.length === 0 ? <p className="text-slate-400 text-sm text-center py-8">No data for this period</p> : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={classTrendByWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="avg" name="Avg Attendance"
                    stroke={classCTFilter !== "all" ? ctColor(classCTFilter) : "#6366f1"}
                    strokeWidth={2.5} dot={{ fill: classCTFilter !== "all" ? ctColor(classCTFilter) : "#6366f1", r: 4 }} />
                  <Line type="monotone" dataKey="count" name="Sessions" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          {/* Avg attendance per class type (coloured bars) */}
          <SectionCard title="Average Attendance per Class Type">
            {classFiltered.length === 0 ? <p className="text-slate-400 text-sm text-center py-8">No data</p> : (() => {
              const byType = {};
              classFiltered.forEach(e => {
                const n = e.class_type_name||"Unknown";
                if (!byType[n]) byType[n] = { name:n, total:0, count:0 };
                byType[n].total += e.attendance_count||0; byType[n].count++;
              });
              const data = Object.values(byType).map(t => ({ name:t.name, avg: Math.round(t.total/t.count) })).sort((a,b) => b.avg-a.avg);
              return (
                <ResponsiveContainer width="100%" height={Math.max(280, data.length * 40)}>
                  <BarChart data={data} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                    <Tooltip />
                    <Bar dataKey="avg" name="Avg Attendance" radius={[0,4,4,0]}>
                      {data.map(d => <Cell key={d.name} fill={ctColor(d.name)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </SectionCard>

          {/* Attendance by Day */}
          <SectionCard title="Average Attendance by Day of Week">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={classByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v,n,p) => [v, `Avg (${p.payload.count} classes)`]} />
                <Bar dataKey="avg" name="Avg Attendance" fill={classCTFilter !== "all" ? ctColor(classCTFilter) : "#6366f1"} radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>

          {/* Classes vs Capacity */}
          <SectionCard title="Classes vs Capacity (Excellent Threshold)">
            {capacityData.length === 0 ? <p className="text-slate-400 text-sm text-center py-8">No capacity data — ensure class types have thresholds set in Settings</p> : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(300, capacityData.length * 42)}>
                  <BarChart data={capacityData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                    <Tooltip formatter={(v,n) => [v, n==="avg" ? "Avg Attendance" : "Excellent Target"]} />
                    <Legend />
                    <Bar dataKey="avg" name="Avg Attendance" radius={[0,4,4,0]}>
                      {capacityData.map(d => <Cell key={d.name} fill={ctColor(d.name)} />)}
                    </Bar>
                    <Bar dataKey="target" name="Excellent Target" fill="#a855f7" opacity={0.25} radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-5 space-y-2">
                  {capacityData.map(c => (
                    <div key={c.name} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: ctColor(c.name) }} />
                      <span className="text-xs text-slate-600 w-36 shrink-0 truncate">{c.name}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(c.fillPct,100)}%`, background: c.fillPct>=100?"#a855f7":c.fillPct>=75?"#22c55e":c.fillPct>=50?"#f59e0b":"#ef4444" }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-slate-700 w-24 text-right">{c.avg} / {c.target} ({c.fillPct}%)</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </SectionCard>
        </TabsContent>

        {/* ════ INSTRUCTORS TAB ════ */}
        <TabsContent value="instructors" className="mt-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold text-slate-700">Instructor Performance — {getPeriodLabel(instructorPeriod)}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={insNameFilter} onValueChange={v => { setInsNameFilter(v); setTrendInsFilter(v); }}>
                <SelectTrigger className="w-44 bg-white"><SelectValue placeholder="All Instructors" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Instructors</SelectItem>
                  {instructorPerformance.map(i => (
                    <SelectItem key={i.id || i.name} value={i.id || i.name}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={instructorPeriod} onValueChange={setInstructorPeriod}>
                <SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <SectionCard title="All Instructors — Key Metrics" action={
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={() => setInsShowChart(v => !v)}>
              {insShowChart ? <LayoutList className="w-3.5 h-3.5" /> : <BarChart2 className="w-3.5 h-3.5" />}
              {insShowChart ? "Table" : "Chart"}
            </Button>
          }>
            {filteredInstructors.length === 0 ? <p className="text-slate-400 text-sm text-center py-8">No instructor data for this period</p> : insShowChart ? (
              <ResponsiveContainer width="100%" height={Math.max(280, filteredInstructors.length * 42)}>
                <BarChart data={filteredInstructors} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="classes" name="Classes Taught" fill="#6366f1" radius={[0,4,4,0]} />
                  <Bar dataKey="avgAttendance" name="Avg Attendance" fill="#06b6d4" radius={[0,4,4,0]} />
                  <Bar dataKey="coversTaken" name="Covers Taken" fill="#22c55e" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-3 pr-4 text-slate-500 font-medium">Instructor</th>
                      <SortableHeader label="Classes" field="classes" sortField={insSortField} sortDir={insSortDir} onSort={handleInsSort} />
                      <SortableHeader label="Avg Att." field="avgAttendance" sortField={insSortField} sortDir={insSortDir} onSort={handleInsSort} />
                      <SortableHeader label="Covers Taken" field="coversTaken" sortField={insSortField} sortDir={insSortDir} onSort={handleInsSort} />
                      <SortableHeader label="Requests Made" field="coverRequested" sortField={insSortField} sortDir={insSortDir} onSort={handleInsSort} />
                      <SortableHeader label="Reliability" field="reliability" sortField={insSortField} sortDir={insSortDir} onSort={handleInsSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInstructors.map((ins, i) => (
                      <tr key={ins.id || ins.name} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: FALLBACK_COLORS[i % FALLBACK_COLORS.length] }}>
                              {ins.name.charAt(0)}
                            </div>
                            <div>
                              <span className="font-medium text-slate-800">{ins.name}</span>
                              <span className="ml-1.5 text-xs text-slate-400 capitalize">({ins.role?.replace(/_/g," ")})</span>
                            </div>
                          </div>
                        </td>
                        <td className="text-center py-3 px-2 font-semibold text-indigo-600">{ins.classes}</td>
                        <td className="text-center py-3 px-2 font-semibold text-slate-800">{ins.avgAttendance||"—"}</td>
                        <td className="text-center py-3 px-2 text-slate-600">{ins.coversTaken}</td>
                        <td className="text-center py-3 px-2 text-slate-600">{ins.coverRequested}</td>
                        <td className="text-center py-3 px-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ins.reliability>=90?"bg-green-100 text-green-700":ins.reliability>=70?"bg-amber-100 text-amber-700":"bg-red-100 text-red-700"}`}>
                            {Math.round(ins.reliability)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Average Attendance per Class — by Instructor">
            {filteredInstructors.filter(i => i.classes>0).length === 0 ? <p className="text-slate-400 text-sm text-center py-8">No data</p> : (
              <ResponsiveContainer width="100%" height={Math.max(280, filteredInstructors.length * 38)}>
                <BarChart data={filteredInstructors.filter(i => i.classes>0)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="avgAttendance" name="Avg Attendance" fill="#6366f1" radius={[0,4,4,0]} />
                  <Bar dataKey="classes" name="Classes Taught" fill="#06b6d4" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard title="Reliability Score by Instructor" action={
            <div className="flex gap-1">
              <button onClick={() => setReliabilitySortMode("pct")} className={cn("px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors", reliabilitySortMode==="pct" ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300")}>% Score</button>
              <button onClick={() => setReliabilitySortMode("az")} className={cn("px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors", reliabilitySortMode==="az" ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300")}>A–Z</button>
            </div>
          }>
            <div className="space-y-3">
              {sortedReliability.filter(ins => insNameFilter === "all" || (ins.id || ins.name) === insNameFilter).map((ins, i) => (
                <div key={ins.id||ins.name} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: FALLBACK_COLORS[i % FALLBACK_COLORS.length] }}>
                    {ins.name.charAt(0)}
                  </div>
                  <span className="text-xs text-slate-600 w-32 shrink-0 truncate">{ins.name}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div className={cn("h-full rounded-full", ins.reliability>=90?"bg-green-500":ins.reliability>=70?"bg-amber-400":"bg-red-400")}
                      style={{ width: `${Math.min(ins.reliability,100)}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-10 text-right">{Math.round(ins.reliability)}%</span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Consolidated Attendance Trend — driven by top instructor filter */}
          <SectionCard title={`Attendance Trend${insNameFilter !== "all" && selectedInstructorDetail ? ` — ${selectedInstructorDetail.name}` : ""}`}>
            {/* When a single instructor is selected, show their stats + per-class-type trend */}
            {selectedInstructorDetail && (
              <div className="mb-4 flex flex-wrap gap-4 text-sm">
                <span className="text-slate-500">Classes: <strong className="text-slate-800">{selectedInstructorDetail.classes}</strong></span>
                <span className="text-slate-500">Avg Attendance: <strong className="text-slate-800">{selectedInstructorDetail.avgAttendance}</strong></span>
                <span className="text-slate-500">Reliability: <strong className={selectedInstructorDetail.reliability>=90?"text-green-600":selectedInstructorDetail.reliability>=70?"text-amber-600":"text-red-600"}>{Math.round(selectedInstructorDetail.reliability)}%</strong></span>
                {selectedInstructorDetail.byClassType.length > 0 && (
                  <div className="w-full flex flex-wrap gap-2 mt-1">
                    {selectedInstructorDetail.byClassType.sort((a,b)=>b.count-a.count).map(ct => (
                      <span key={ct.name} className="text-xs rounded-full px-2.5 py-1 font-medium" style={{ background: ctColor(ct.name)+"22", color: ctColor(ct.name) }}>
                        {ct.name} — {ct.count} classes
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Per-class-type trend lines when one instructor selected */}
            {selectedInstructorDetail && instructorClassTypeTrend.rows.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={instructorClassTypeTrend.rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  {instructorClassTypeTrend.classTypes.map(ct => (
                    <Line key={ct} type="monotone" dataKey={ct} name={ct} stroke={ctColor(ct)} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : consolidatedTrendData.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">No trend data for this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={consolidatedTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  {trendInsNames.map((name, i) => (
                    <Line key={name} type="monotone" dataKey={name} name={name} stroke={FALLBACK_COLORS[i % FALLBACK_COLORS.length]} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </TabsContent>

        {/* ════ FINANCIAL TAB ════ */}
        <TabsContent value="financial" className="mt-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold text-slate-700">Financial Overview</h2>
            <Select value={financialDays} onValueChange={setFinancialDays}>
              <SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="60">Last 60 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label:"Total Invoiced", value:`${currencySymbol}${financialData.total.toFixed(2)}`, sub:"All statuses" },
              { label:"Total Paid", value:`${currencySymbol}${financialData.byStatus.paid.toFixed(2)}`, sub:"Completed payments" },
              { label:"Cost per Class", value:`${currencySymbol}${financialData.costPerClass.toFixed(2)}`, sub:"Avg based on paid" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <p className="text-sm text-slate-500">{s.label}</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{s.value}</p>
                <p className="text-xs text-slate-400 mt-1">{s.sub}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Invoice Status Breakdown">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={[
                  { status:"Draft", amount: financialData.byStatus.draft },
                  { status:"Submitted", amount: financialData.byStatus.submitted },
                  { status:"Approved", amount: financialData.byStatus.approved },
                  { status:"Paid", amount: financialData.byStatus.paid },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="status" tick={{ fontSize:12 }} />
                  <YAxis tick={{ fontSize:12 }} tickFormatter={v => `${currencySymbol}${v}`} />
                  <Tooltip formatter={v => `${currencySymbol}${v.toFixed(2)}`} />
                  <Bar dataKey="amount" name="Amount" fill="#22c55e" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
            <SectionCard title="Payroll by Instructor">
              {financialData.byInstructor.length === 0 ? <p className="text-slate-400 text-sm text-center py-8">No invoice data</p> : (
                <div className="space-y-3">
                  {financialData.byInstructor.sort((a,b) => b.total-a.total).map((ins,i) => (
                    <div key={ins.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: FALLBACK_COLORS[i%FALLBACK_COLORS.length] }} />
                        <span className="text-sm font-medium text-slate-700">{ins.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-slate-900">{currencySymbol}{ins.total.toFixed(2)}</span>
                        {ins.paid>0&&<span className="text-xs text-green-600 ml-2">{currencySymbol}{ins.paid.toFixed(2)} paid</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        {/* ════ VIABILITY TAB ════ */}
        <TabsContent value="viability" className="mt-6 space-y-6">
          {/* Snapshot bar */}
          <SectionCard title="Overall Class Viability Snapshot">
            <div className="h-4 rounded-full bg-slate-100 overflow-hidden flex mb-5">
              {[
                { key:"purple", color:"bg-purple-500", count: viabilityCounts.purple },
                { key:"green",  color:"bg-green-500",  count: viabilityCounts.green },
                { key:"amber",  color:"bg-amber-400",  count: viabilityCounts.amber },
                { key:"red",    color:"bg-red-500",    count: viabilityCounts.red },
                { key:"pending",color:"bg-slate-300",  count: viabilityCounts.pending },
              ].filter(s => s.count>0).map(s => (
                <div key={s.key} className={cn("h-full transition-all", s.color)} style={{ width:`${(s.count/viabilityTotal)*100}%` }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-4">
              {[
                { key:"purple", color:"bg-purple-500", label:"Excellent", count: viabilityCounts.purple },
                { key:"green",  color:"bg-green-500",  label:"Good",      count: viabilityCounts.green },
                { key:"amber",  color:"bg-amber-400",  label:"Moderate",  count: viabilityCounts.amber },
                { key:"red",    color:"bg-red-500",    label:"Low",       count: viabilityCounts.red },
                { key:"pending",color:"bg-slate-300",  label:"Pending",   count: viabilityCounts.pending },
              ].map(s => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className={cn("w-2.5 h-2.5 rounded-full", s.color)} />
                  <span className="text-xs text-slate-600">{s.label}</span>
                  <span className="text-xs font-semibold text-slate-900">{s.count}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Viability Distribution">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={viabilityData} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={90} label={({ label, pct }) => `${label} ${pct}%`}>
                    {viabilityData.map(entry => <Cell key={entry.color} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v,n) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {viabilityData.map(v => (
                  <div key={v.color} className="flex items-center gap-2 p-2 rounded-lg" style={{ background:v.fill+"18" }}>
                    <div className="w-3 h-3 rounded-full" style={{ background:v.fill }} />
                    <span className="text-sm font-medium" style={{ color:v.fill }}>{v.label}</span>
                    <span className="text-sm text-slate-600 ml-auto">{v.count} ({v.pct}%)</span>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Viability by Class Type">
              <ResponsiveContainer width="100%" height={Math.max(300, viabilityByClassType.length * 38)}>
                <BarChart data={viabilityByClassType} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize:12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize:11 }} width={120} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="red"    name="Low"       stackId="a" fill={VIABILITY_COLORS.red} />
                  <Bar dataKey="amber"  name="Moderate"  stackId="a" fill={VIABILITY_COLORS.amber} />
                  <Bar dataKey="green"  name="Good"      stackId="a" fill={VIABILITY_COLORS.green} />
                  <Bar dataKey="purple" name="Excellent" stackId="a" fill={VIABILITY_COLORS.purple} radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          </div>

          {/* Trending UP */}
          <SectionCard title={<span className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-500" /> Classes Trending Up</span>}>
            {trendingUp.length === 0 ? <p className="text-slate-400 text-sm text-center py-6">No upward trends detected yet — more data needed</p> : (
              <div className="space-y-6">
                {trendingUp.map(t => (
                  <div key={t.name}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: ctColor(t.name) }} />
                      <span className="font-medium text-slate-800 text-sm">{t.name}</span>
                      <span className="text-xs text-green-600 font-semibold ml-auto">↑ +{t.slope.toFixed(2)} pts</span>
                    </div>
                    <ResponsiveContainer width="100%" height={100}>
                      <LineChart data={t.trend}>
                        <XAxis dataKey="week" tick={{ fontSize:10 }} />
                        <YAxis domain={[1,4]} ticks={[1,2,3,4]} tickFormatter={v=>["","Low","Mod","Good","Exc"][v]||""} tick={{ fontSize:9 }} width={30} />
                        <Tooltip formatter={v=>["","Low","Moderate","Good","Excellent"][Math.round(v)]||v} />
                        <Line type="monotone" dataKey="score" stroke={ctColor(t.name)} strokeWidth={2} dot={{ fill:ctColor(t.name), r:3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Trending DOWN */}
          <SectionCard title={<span className="flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-500" /> Classes Trending Down</span>}>
            {trendingDown.length === 0 ? <p className="text-slate-400 text-sm text-center py-6">No downward trends detected — looking good!</p> : (
              <div className="space-y-6">
                {trendingDown.map(t => (
                  <div key={t.name}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: ctColor(t.name) }} />
                      <span className="font-medium text-slate-800 text-sm">{t.name}</span>
                      <span className="text-xs text-red-600 font-semibold ml-auto">↓ {t.slope.toFixed(2)} pts</span>
                    </div>
                    <ResponsiveContainer width="100%" height={100}>
                      <LineChart data={t.trend}>
                        <XAxis dataKey="week" tick={{ fontSize:10 }} />
                        <YAxis domain={[1,4]} ticks={[1,2,3,4]} tickFormatter={v=>["","Low","Mod","Good","Exc"][v]||""} tick={{ fontSize:9 }} width={30} />
                        <Tooltip formatter={v=>["","Low","Moderate","Good","Excellent"][Math.round(v)]||v} />
                        <Line type="monotone" dataKey="score" stroke="#ef4444" strokeWidth={2} dot={{ fill:"#ef4444", r:3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ════ AI INSIGHTS TAB ════ */}
        <TabsContent value="ai" className="mt-6">
          <AIInsights events={allCompleted} staff={staff} classTypes={classTypes} periodFilter="30" />
        </TabsContent>
      </Tabs>
    </div>
  );
}