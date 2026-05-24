import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Upload, CheckCircle2, XCircle, FileText, Users, Calendar, AlertCircle, Clock, History, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// ── CSV Helpers ─────────────────────────────────────────────────────
function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = filename;
  a.click();
}

function parseCSVLine(line) {
  const vals = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      vals.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  vals.push(cur.trim());
  return vals;
}

function parseCSV(text) {
  // Normalise line endings and remove BOM
  const normalised = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalised.trim().split("\n").filter(l => l.trim() !== "");
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, "_"));
  const rows = lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
  return { headers, rows };
}

function padTime(t) {
  if (!t) return "00:00";
  // Strip any stray quotes/spaces, handle "9:00 AM" / "9:00am" → 24h
  let s = t.replace(/"/g, "").trim();
  const ampm = s.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm)/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2] ? ampm[2].padStart(2, "0") : "00";
    const meridiem = ampm[3].toLowerCase();
    if (meridiem === "pm" && h < 12) h += 12;
    if (meridiem === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  const parts = s.split(":");
  return `${parts[0].padStart(2, "0")}:${(parts[1] || "00").padStart(2, "0")}`;
}

function normaliseDate(d) {
  if (!d) return "";
  d = d.trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = d.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
  // MM/DD/YYYY (US)
  const mdy = d.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,"0")}-${mdy[2].padStart(2,"0")}`;
  return d; // fall through, let Date() handle it
}

// ── Templates ──────────────────────────────────────────────────────
const TIMETABLE_TEMPLATE = [
  ["class_type_name","date","start_time","end_time","location","site","instructor_name","notes"],
  ["F2 Strength","2026-04-01","09:00","10:00","Studio A","Main Site","Jane Smith",""],
  ["Yoga Flow","2026-04-01","10:30","11:30","Studio B","Main Site","John Doe",""],
];

const STAFF_TEMPLATE = [
  ["name","email","phone","role","status","site","base_rate","default_pay_rate_type"],
  ["Jane Smith","jane@example.com","07700000001","instructor","active","Main Site","35","per_class"],
  ["John Doe","john@example.com","07700000002","instructor","active","Main Site","35","per_class"],
];

// Historic attendance - for importing past data for analytics
const HISTORIC_TEMPLATE = [
  ["date","start_time","end_time","class_type_name","instructor_name","location","site","attendance_count","status","notes"],
  ["2025-01-06","09:00","10:00","F2 Strength","Jane Smith","Studio A","Main Site","18","completed",""],
  ["2025-01-06","10:30","11:30","Yoga Flow","John Doe","Studio B","Main Site","12","completed",""],
];

// ── Result Row ─────────────────────────────────────────────────────
function ResultRow({ row, error }) {
  return (
    <div className={cn("flex items-start gap-2 text-xs py-1.5 border-b border-slate-50", error ? "text-red-600" : "text-green-700")}>
      {error ? <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
      <span>{row}</span>
      {error && <span className="text-red-400 ml-1">— {error}</span>}
    </div>
  );
}

// ── Import Panel ────────────────────────────────────────────────────
function ImportPanel({ title, icon: Icon, templateRows, templateFilename, onImport, hint, accentColor = "indigo" }) {
  const fileRef = useRef();
  const [results, setResults] = useState([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResults([]); setDone(false); setImporting(true);
    const text = await file.text();
    const { rows } = parseCSV(text);
    const res = await onImport(rows);
    setResults(res);
    setDone(true);
    setImporting(false);
    const ok = res.filter(r => !r.error).length;
    toast.success(`${ok} of ${res.length} rows imported`);
    e.target.value = "";
  };

  const bgClass = accentColor === "purple" ? "bg-purple-50" : "bg-indigo-50";
  const textClass = accentColor === "purple" ? "text-purple-600" : "text-indigo-600";
  const btnClass = accentColor === "purple" ? "bg-purple-600 hover:bg-purple-700" : "bg-indigo-600 hover:bg-indigo-700";

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className={cn("p-2.5 rounded-xl", bgClass)}>
          <Icon className={cn("w-5 h-5", textClass)} />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadCSV(templateFilename, templateRows)}>
          <Download className="w-4 h-4" /> Download Template
        </Button>
        <Button size="sm" className={cn("gap-2", btnClass)} onClick={() => fileRef.current?.click()} disabled={importing}>
          <Upload className="w-4 h-4" />
          {importing ? "Importing..." : "Upload CSV"}
        </Button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
      </div>
      {done && results.length > 0 && (
        <div className="bg-slate-50 rounded-xl p-3 max-h-60 overflow-y-auto">
          <p className="text-xs font-semibold text-slate-600 mb-2">
            {results.filter(r => !r.error).length} imported · {results.filter(r => r.error).length} errors
          </p>
          {results.map((r, i) => <ResultRow key={i} row={r.row} error={r.error} />)}
        </div>
      )}
    </div>
  );
}

// ── Format Guide ────────────────────────────────────────────────────
function FormatGuide() {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Info className="w-5 h-5 text-slate-500 shrink-0" />
        <h3 className="font-semibold text-slate-800">CSV Format Reference</h3>
      </div>
      <div className="grid md:grid-cols-2 gap-4 text-sm">
        <div className="space-y-2">
          <p className="font-semibold text-slate-700">📅 Dates</p>
          <p className="text-slate-600">Preferred: <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-xs font-mono">YYYY-MM-DD</code></p>
          <p className="text-slate-500 text-xs">Also accepted: <code className="font-mono">DD/MM/YYYY</code>, <code className="font-mono">DD-MM-YYYY</code></p>
          <p className="text-slate-500 text-xs">Examples: <code className="font-mono">2026-04-01</code>, <code className="font-mono">01/04/2026</code></p>
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-slate-700">⏰ Times</p>
          <p className="text-slate-600">Preferred: <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-xs font-mono">HH:MM</code> (24-hour)</p>
          <p className="text-slate-500 text-xs">Also accepted: <code className="font-mono">9:00 AM</code>, <code className="font-mono">2:30 PM</code>, <code className="font-mono">9:00</code></p>
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-slate-700">📝 Notes</p>
          <p className="text-slate-500 text-xs">Optional free text. Visible to the assigned instructor.</p>
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-slate-700">👤 Instructor names</p>
          <p className="text-slate-500 text-xs">Must match <strong>exactly</strong> as entered in Staff (case-insensitive). Leave blank if unassigned.</p>
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-slate-700">🏋️ Class type names</p>
          <p className="text-slate-500 text-xs">Must match <strong>exactly</strong> as entered in Settings → Class Types (case-insensitive).</p>
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-slate-700">🏢 Site</p>
          <p className="text-slate-500 text-xs">Free text, e.g. <code className="font-mono">Main Site</code>, <code className="font-mono">North Branch</code>. Leave blank if single site.</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────
export default function CSVImport() {

  const importTimetable = async (rows) => {
    const [classTypes, staffList] = await Promise.all([
      base44.entities.ClassType.list(),
      base44.entities.Staff.list(),
    ]);
    const results = [];
    for (const row of rows) {
      const label = `${row.date} ${row.class_type_name}`;
      const ct = classTypes.find(c => c.name?.toLowerCase() === row.class_type_name?.toLowerCase());
      if (!ct) { results.push({ row: label, error: `Class type "${row.class_type_name}" not found in Settings` }); continue; }
      if (!row.date || !row.start_time || !row.end_time) { results.push({ row: label, error: "Missing date, start_time, or end_time" }); continue; }
      const normDate = normaliseDate(row.date);
      const startStr = `${normDate}T${padTime(row.start_time)}:00`;
      const endStr = `${normDate}T${padTime(row.end_time)}:00`;
      const startDt = new Date(startStr);
      const endDt = new Date(endStr);
      if (isNaN(startDt.getTime())) { results.push({ row: label, error: `Invalid date/time: "${row.date}" "${row.start_time}" — use YYYY-MM-DD and HH:MM` }); continue; }
      const instructor = row.instructor_name ? staffList.find(s => s.name?.toLowerCase() === row.instructor_name?.toLowerCase()) : null;
      try {
        await base44.entities.TimetableEvent.create({
          class_type_id: ct.id,
          class_type_name: ct.name,
          start_datetime: startDt.toISOString(),
          end_datetime: endDt.toISOString(),
          location: row.location || ct.location || "",
          site: row.site || "",
          assigned_instructor_id: instructor?.id || null,
          assigned_instructor_name: instructor?.name || row.instructor_name || null,
          instructor_notes: row.notes || "",
          is_recurring: false,
          status: "scheduled",
          viability_color: "pending",
        });
        results.push({ row: label });
      } catch (e) {
        results.push({ row: label, error: e.message || "Failed" });
      }
    }
    return results;
  };

  const importStaff = async (rows) => {
    const results = [];
    for (const row of rows) {
      const label = `${row.name} (${row.email})`;
      if (!row.name || !row.email) { results.push({ row: label, error: "Missing name or email" }); continue; }
      try {
        await base44.entities.Staff.create({
          name: row.name,
          email: row.email,
          phone: row.phone || "",
          role: row.role || "instructor",
          status: row.status || "active",
          site: row.site || "",
          base_rate: row.base_rate ? parseFloat(row.base_rate) : undefined,
          default_pay_rate_type: row.default_pay_rate_type || "per_class",
        });
        results.push({ row: label });
      } catch (e) {
        results.push({ row: label, error: e.message || "Failed" });
      }
    }
    return results;
  };

  const importHistoric = async (rows) => {
    const [classTypes, staffList] = await Promise.all([
      base44.entities.ClassType.list(),
      base44.entities.Staff.list(),
    ]);
    const results = [];
    for (const row of rows) {
      const label = `${row.date} ${row.class_type_name} (${row.start_time})`;
      if (!row.date || !row.start_time || !row.class_type_name) {
        results.push({ row: label, error: "Missing date, start_time, or class_type_name" }); continue;
      }
      const ct = classTypes.find(c => c.name?.toLowerCase() === row.class_type_name?.toLowerCase());
      const normDate = normaliseDate(row.date);
      const startStr = `${normDate}T${padTime(row.start_time)}:00`;
      const endStr = row.end_time ? `${normDate}T${padTime(row.end_time)}:00` : `${normDate}T${padTime(row.start_time)}:00`;
      const startDt = new Date(startStr);
      if (isNaN(startDt.getTime())) {
        results.push({ row: label, error: `Invalid date/time — use YYYY-MM-DD and HH:MM` }); continue;
      }
      const instructor = row.instructor_name ? staffList.find(s => s.name?.toLowerCase() === row.instructor_name?.toLowerCase()) : null;
      const attendance = row.attendance_count ? parseInt(row.attendance_count) : null;
      const viabilityColor = attendance !== null && ct
        ? attendance >= (ct.purple_min || 20) ? 'purple'
          : attendance >= (ct.green_min || 10) ? 'green'
          : attendance >= (ct.amber_min || 5) ? 'amber' : 'red'
        : 'pending';
      try {
        await base44.entities.TimetableEvent.create({
          class_type_id: ct?.id || null,
          class_type_name: row.class_type_name,
          start_datetime: startDt.toISOString(),
          end_datetime: new Date(endStr).toISOString(),
          location: row.location || "",
          site: row.site || "",
          assigned_instructor_id: instructor?.id || null,
          assigned_instructor_name: instructor?.name || row.instructor_name || null,
          attendance_count: attendance,
          viability_color: viabilityColor,
          status: row.status || "completed",
          internal_notes: row.notes || "",
        });
        results.push({ row: label });
      } catch (e) {
        results.push({ row: label, error: e.message || "Failed" });
      }
    }
    return results;
  };

  const exportTimetableForEdit = async () => {
    const events = await base44.entities.TimetableEvent.list("start_datetime", 1000);
    const rows = [TIMETABLE_TEMPLATE[0]];
    events.forEach(e => {
      const s = new Date(e.start_datetime);
      const en = new Date(e.end_datetime);
      rows.push([
        e.class_type_name || "",
        s.toISOString().slice(0, 10),
        s.toTimeString().slice(0, 5),
        en.toTimeString().slice(0, 5),
        e.location || "",
        e.site || "",
        e.assigned_instructor_name || "",
        e.instructor_notes || "",
      ]);
    });
    downloadCSV("timetable-export-reimportable.csv", rows);
    toast.success("Timetable exported (re-importable format)");
  };

  const exportStaffForEdit = async () => {
    const staff = await base44.entities.Staff.list();
    const rows = [STAFF_TEMPLATE[0]];
    staff.forEach(s => rows.push([
      s.name, s.email, s.phone || "", s.role, s.status,
      s.site || "", s.base_rate || "", s.default_pay_rate_type || "per_class"
    ]));
    downloadCSV("staff-export-reimportable.csv", rows);
    toast.success("Staff exported (re-importable format)");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">CSV Import / Export</h1>
        <p className="text-slate-500">Download templates, fill them in, and upload to bulk-populate data.</p>
      </div>

      <FormatGuide />

      {/* Export for editing */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-green-50 rounded-xl">
            <Download className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Export Current Data (Re-importable)</h3>
            <p className="text-xs text-slate-500">Download your live data in the exact format needed to re-upload after editing</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" className="gap-2" onClick={exportTimetableForEdit}>
            <Download className="w-4 h-4" /> Export Timetable
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportStaffForEdit}>
            <Download className="w-4 h-4" /> Export Staff
          </Button>
        </div>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠️ Exporting and re-importing will <strong>create duplicate records</strong>. Only re-import if you've made structural changes and want to add new rows — do not re-upload the whole file unless you clear existing data first.
        </p>
      </div>

      {/* Timetable Import */}
      <ImportPanel
        title="Import Timetable Events"
        icon={Calendar}
        templateRows={TIMETABLE_TEMPLATE}
        templateFilename="timetable-template.csv"
        onImport={importTimetable}
        hint="Add future classes to the timetable. Class types must already exist in Settings."
      />

      {/* Staff Import */}
      <ImportPanel
        title="Import Staff"
        icon={Users}
        templateRows={STAFF_TEMPLATE}
        templateFilename="staff-template.csv"
        onImport={importStaff}
        hint="Bulk add new instructors and staff members."
      />

      {/* Historic Data Import */}
      <div className="border-2 border-dashed border-purple-200 rounded-2xl p-1">
        <ImportPanel
          title="Import Historic Attendance Data"
          icon={History}
          templateRows={HISTORIC_TEMPLATE}
          templateFilename="historic-attendance-template.csv"
          onImport={importHistoric}
          hint="Import past class data for analytics and reporting. These will be created as completed events."
          accentColor="purple"
        />
        <div className="px-6 pb-5 space-y-2">
          <p className="text-xs font-semibold text-purple-700">📋 Historic Import Rules:</p>
          <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
            <li><strong>status</strong> should be <code className="font-mono">completed</code> for past data (or <code className="font-mono">cancelled</code>)</li>
            <li><strong>attendance_count</strong> is the number of people in class — used to calculate viability automatically</li>
            <li><strong>class_type_name</strong> must match a class type in Settings OR can be free text if the class type no longer exists</li>
            <li>Historic records will appear in Reports and analytics but not on the active timetable view</li>
            <li>Avoid importing duplicates — check existing data first using the Export function above</li>
          </ul>
        </div>
      </div>
    </div>
  );
}