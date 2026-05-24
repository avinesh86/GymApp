import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { TrendingUp, Users, Calendar, DollarSign, BarChart2, Activity } from "lucide-react";
import moment from "moment";
import { cn } from "@/lib/utils";

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function MetricCard({ label, value, sub, icon: Icon, color = "indigo" }) {
  const colors = {
    indigo: "from-indigo-500 to-purple-600",
    green: "from-emerald-500 to-green-600",
    amber: "from-amber-400 to-orange-500",
    red: "from-red-400 to-rose-600",
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
      <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0", colors[color])}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm font-medium text-slate-600">{label}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [range, setRange] = useState("90");

  useEffect(() => {
    Promise.all([
      base44.entities.TimetableEvent.list('-start_datetime', 500),
      base44.entities.Staff.list('name'),
      base44.entities.Invoice.list('-created_date', 200),
    ]).then(([ev, st, inv]) => {
      setEvents(ev);
      setStaff(st);
      setInvoices(inv);
    }).finally(() => setLoading(false));
  }, []);

  const cutoff = useMemo(() => moment().subtract(parseInt(range), 'days'), [range]);

  const filteredEvents = useMemo(() =>
    events.filter(e => moment(e.start_datetime).isAfter(cutoff) && moment(e.start_datetime).isBefore(moment())),
    [events, cutoff]
  );

  // Weekly attendance trend
  const weeklyTrend = useMemo(() => {
    const weeks = {};
    filteredEvents.filter(e => e.attendance_count != null).forEach(e => {
      const w = moment(e.start_datetime).startOf('isoWeek').format("MMM D");
      if (!weeks[w]) weeks[w] = { week: w, attendance: 0, classes: 0 };
      weeks[w].attendance += e.attendance_count;
      weeks[w].classes += 1;
    });
    return Object.values(weeks).slice(-12);
  }, [filteredEvents]);

  // Class type distribution
  const classTypeDist = useMemo(() => {
    const counts = {};
    filteredEvents.forEach(e => {
      const name = e.class_type_name || "Unknown";
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [filteredEvents]);

  // Viability distribution
  const viabilityDist = useMemo(() => {
    const counts = { red: 0, amber: 0, green: 0, purple: 0, pending: 0 };
    filteredEvents.forEach(e => {
      if (e.viability_color) counts[e.viability_color] = (counts[e.viability_color] || 0) + 1;
    });
    const colorMap = { red: "#ef4444", amber: "#f59e0b", green: "#22c55e", purple: "#8b5cf6", pending: "#94a3b8" };
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, fill: colorMap[name] }));
  }, [filteredEvents]);

  // Instructor performance
  const instructorPerf = useMemo(() => {
    const perf = {};
    filteredEvents.filter(e => e.assigned_instructor_name && e.attendance_count != null).forEach(e => {
      const name = e.assigned_instructor_name;
      if (!perf[name]) perf[name] = { name, classes: 0, totalAttendance: 0 };
      perf[name].classes += 1;
      perf[name].totalAttendance += e.attendance_count;
    });
    return Object.values(perf)
      .map(p => ({ ...p, avgAttendance: Math.round(p.totalAttendance / p.classes) }))
      .sort((a, b) => b.avgAttendance - a.avgAttendance)
      .slice(0, 8);
  }, [filteredEvents]);

  // Invoice financials by month
  const invoiceFinancials = useMemo(() => {
    const months = {};
    invoices.filter(inv => moment(inv.period_start).isAfter(cutoff)).forEach(inv => {
      const m = moment(inv.period_start).format("MMM YY");
      if (!months[m]) months[m] = { month: m, total: 0, paid: 0 };
      months[m].total += inv.total_amount || 0;
      if (inv.status === 'paid') months[m].paid += inv.total_amount || 0;
    });
    return Object.values(months).slice(-6);
  }, [invoices, cutoff]);

  // Summary metrics
  const totalClasses = filteredEvents.length;
  const avgAttendance = filteredEvents.filter(e => e.attendance_count != null).length
    ? Math.round(filteredEvents.filter(e => e.attendance_count != null).reduce((s, e) => s + e.attendance_count, 0) / filteredEvents.filter(e => e.attendance_count != null).length)
    : 0;
  const fillRate = totalClasses
    ? Math.round((filteredEvents.filter(e => e.status !== 'unfilled' && e.status !== 'cancelled').length / totalClasses) * 100)
    : 0;
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total_amount || 0), 0);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-slate-500 text-sm">Performance overview and trends</p>
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-40 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 6 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard label="Total Classes" value={totalClasses} icon={Calendar} color="indigo" sub={`Last ${range} days`} />
        <MetricCard label="Avg Attendance" value={avgAttendance} icon={Users} color="green" sub="Per class" />
        <MetricCard label="Fill Rate" value={`${fillRate}%`} icon={Activity} color="amber" sub="Scheduled vs filled" />
        <MetricCard label="Total Paid" value={`$${totalPaid.toFixed(0)}`} icon={DollarSign} color="red" sub="Invoices paid" />
      </div>

      {/* Charts tabs */}
      <Tabs defaultValue="attendance">
        <TabsList className="bg-white border w-full overflow-x-auto flex">
          <TabsTrigger value="attendance" className="flex-1 text-xs sm:text-sm gap-1 min-w-0">
            <TrendingUp className="w-3.5 h-3.5 shrink-0" /><span className="truncate">Attendance</span>
          </TabsTrigger>
          <TabsTrigger value="classes" className="flex-1 text-xs sm:text-sm gap-1 min-w-0">
            <Calendar className="w-3.5 h-3.5 shrink-0" /><span className="truncate">Classes</span>
          </TabsTrigger>
          <TabsTrigger value="instructors" className="flex-1 text-xs sm:text-sm gap-1 min-w-0">
            <Users className="w-3.5 h-3.5 shrink-0" /><span className="truncate">Instructors</span>
          </TabsTrigger>
          <TabsTrigger value="financials" className="flex-1 text-xs sm:text-sm gap-1 min-w-0">
            <DollarSign className="w-3.5 h-3.5 shrink-0" /><span className="truncate">Financials</span>
          </TabsTrigger>
        </TabsList>

        {/* Attendance trend */}
        <TabsContent value="attendance" className="mt-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Weekly Attendance Trend</h3>
            {weeklyTrend.length === 0 ? (
              <p className="text-center text-slate-400 py-16">No data for this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={weeklyTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="attendance" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Total Attendance" />
                  <Line type="monotone" dataKey="classes" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Classes Held" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mt-4">
            <h3 className="font-semibold text-slate-900 mb-4">Viability Distribution</h3>
            {viabilityDist.length === 0 ? (
              <p className="text-center text-slate-400 py-10">No viability data yet</p>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={viabilityDist} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                      {viabilityDist.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [v, "Classes"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 justify-center">
                  {viabilityDist.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.fill }} />
                      <span className="capitalize text-slate-600">{d.name}</span>
                      <span className="font-semibold text-slate-900">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Classes by type */}
        <TabsContent value="classes" className="mt-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Classes by Type</h3>
            {classTypeDist.length === 0 ? (
              <p className="text-center text-slate-400 py-16">No data for this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={classTypeDist} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Classes" radius={[6, 6, 0, 0]}>
                    {classTypeDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </TabsContent>

        {/* Instructor performance */}
        <TabsContent value="instructors" className="mt-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Avg Attendance per Instructor</h3>
            {instructorPerf.length === 0 ? (
              <p className="text-center text-slate-400 py-16">No instructor data for this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={instructorPerf} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="avgAttendance" name="Avg Attendance" fill="#6366f1" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Instructor table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mt-4 overflow-x-auto">
            <h3 className="font-semibold text-slate-900 mb-3">Instructor Summary</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="pb-2 font-medium">Instructor</th>
                  <th className="pb-2 font-medium text-right">Classes</th>
                  <th className="pb-2 font-medium text-right">Avg Attendance</th>
                  <th className="pb-2 font-medium text-right">Total Attendance</th>
                </tr>
              </thead>
              <tbody>
                {instructorPerf.map((p, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 font-medium text-slate-900">{p.name}</td>
                    <td className="py-2 text-right text-slate-600">{p.classes}</td>
                    <td className="py-2 text-right text-slate-600">{p.avgAttendance}</td>
                    <td className="py-2 text-right text-slate-600">{p.totalAttendance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Financials */}
        <TabsContent value="financials" className="mt-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Invoice Totals by Month</h3>
            {invoiceFinancials.length === 0 ? (
              <p className="text-center text-slate-400 py-16">No invoice data for this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={invoiceFinancials} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={v => [`$${v.toFixed(2)}`, ""]} />
                  <Legend />
                  <Bar dataKey="total" name="Total Invoiced" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="paid" name="Paid" fill="#22c55e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Invoice status breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
            {["draft","submitted","manager_approved","payroll_approved","paid","rejected"].map(status => {
              const count = invoices.filter(i => i.status === status).length;
              const total = invoices.filter(i => i.status === status).reduce((s, i) => s + (i.total_amount || 0), 0);
              return (
                <div key={status} className="bg-white rounded-xl border border-slate-100 p-4">
                  <p className="text-xs text-slate-500 capitalize mb-1">{status.replace(/_/g, ' ')}</p>
                  <p className="text-xl font-bold text-slate-900">{count}</p>
                  <p className="text-xs text-slate-400">${total.toFixed(0)}</p>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}