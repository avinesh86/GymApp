import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import StatCard from "@/components/dashboard/StatCard";
import QuickActions from "@/components/dashboard/QuickActions";
import EventCard from "@/components/timetable/EventCard";
import CoverRequestCard from "@/components/cover/CoverRequestCard";
import InvoiceCard from "@/components/invoice/InvoiceCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Calendar, 
  Users, 
  AlertTriangle, 
  FileText, 
  Clock, 
  ChevronRight
} from "lucide-react";
import moment from "moment";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [events, setEvents] = useState([]);
  const [coverRequests, setCoverRequests] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [missingAttendanceCritical, setMissingAttendanceCritical] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
      
      const staffList = await base44.entities.Staff.filter({ email: userData.email });
      const profile = staffList[0] || null;
      setStaffProfile(profile);
      
      const today = moment().startOf('day').toISOString();
      const weekEnd = moment().endOf('week').toISOString();
      
      const twelveWeeksAgo = moment().subtract(12, 'weeks').toISOString();
      const now = moment().toISOString();

      const [eventsData, coverData, invoicesData, awaitingAttendanceData] = await Promise.all([
        base44.entities.TimetableEvent.filter(
          { start_datetime: { $gte: today, $lte: weekEnd } },
          'start_datetime',
          50
        ),
        base44.entities.CoverRequest.filter({ status: 'open' }, '-created_date', 10),
        base44.entities.Invoice.filter(
          { status: { $in: ['submitted', 'manager_approved'] } },
          '-created_date',
          10
        ),
        base44.entities.TimetableEvent.filter(
          { end_datetime: { $gte: twelveWeeksAgo, $lte: now }, status: { $nin: ['cancelled'] } },
          '-start_datetime',
          200
        )
      ]);
      
      setEvents(eventsData);
      setCoverRequests(coverData);
      setInvoices(invoicesData);
      // Filter for events missing attendance
      const missing = awaitingAttendanceData.filter(e => 
        e.attendance_status !== 'recorded' &&
        e.attendance_status !== 'not_recorded' &&
        e.attendance_count == null &&
        e.status !== 'completed'
      );
      setMissingAttendanceCritical(missing);
    } catch (e) {
      console.error("Error loading dashboard:", e);
    } finally {
      setLoading(false);
    }
  };

  const userRole = staffProfile?.role || 'instructor';
  const isAdmin = ['owner', 'admin', 'gym_manager', 'team_leader'].includes(userRole);
  
  // Stats
  const todayEvents = events.filter(e => moment(e.start_datetime).isSame(moment(), 'day'));
  const unfilledEvents = events.filter(e => e.status === 'unfilled' || !e.assigned_instructor_id);
  const pendingAttendance = events.filter(e => 
    moment(e.end_datetime).isBefore(moment()) && 
    (e.attendance_count === null || e.attendance_count === undefined)
  );
  
  // Instructor-specific: my upcoming classes
  const myUpcomingClasses = staffProfile 
    ? events.filter(e => e.assigned_instructor_id === staffProfile.id && moment(e.start_datetime).isAfter(moment()))
    : [];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Welcome */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back, {user?.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-slate-500 mt-1">
            {moment().format("dddd, MMMM D, YYYY")}
          </p>
        </div>
        <QuickActions userRole={userRole} />
      </div>

      {/* Stats Grid - mobile 2 col, desktop 4 col */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          title="Today's Classes"
          value={todayEvents.length}
          icon={Calendar}
          subtitle={`${todayEvents.filter(e => e.status === 'completed').length} completed`}
        />
        {isAdmin ? (
          <>
            <StatCard
              title="Awaiting Attendance"
              value={missingAttendanceCritical.length}
              icon={Clock}
              className={missingAttendanceCritical.length > 0 ? "border-orange-200 bg-orange-50/30" : ""}
              subtitle={missingAttendanceCritical.length > 0 ? "Need recording" : "All up to date"}
            />
            <StatCard
              title="Open Cover Requests"
              value={coverRequests.length}
              icon={AlertTriangle}
              className={coverRequests.length > 0 ? "border-red-200 bg-red-50/30" : ""}
            />
            <StatCard
              title="Pending Invoices"
              value={invoices.length}
              icon={FileText}
            />
          </>
        ) : (
          <>
            <StatCard
              title="My Upcoming"
              value={myUpcomingClasses.length}
              icon={Clock}
              subtitle="This week"
            />
            <StatCard
              title="Cover Opps"
              value={coverRequests.length}
              icon={AlertTriangle}
            />
            <StatCard
              title="Pending Attendance"
              value={pendingAttendance.filter(e => e.assigned_instructor_id === staffProfile?.id).length}
              icon={Users}
            />
          </>
        )}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Schedule */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Today's Schedule</h3>
            <Link to={createPageUrl("Timetable")}>
              <Button variant="ghost" size="sm" className="text-indigo-600">
                View All <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            {todayEvents.length > 0 ? (
              todayEvents
                .sort((a, b) => moment(a.start_datetime).diff(moment(b.start_datetime)))
                .map(event => (
                  <EventCard key={event.id} event={event} compact />
                ))
            ) : (
              <p className="text-center text-slate-500 py-8">No classes scheduled today</p>
            )}
          </div>
        </div>

        {/* Awaiting Attendance (Admin) / Cover Opportunities (Instructor) */}
        {isAdmin ? (
          <div className="bg-white rounded-2xl border border-orange-100 shadow-sm">
            <div className="p-5 border-b border-orange-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-500" />
                <h3 className="font-semibold text-slate-900">Awaiting Attendance</h3>
                {missingAttendanceCritical.length > 0 && (
                  <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
                    {missingAttendanceCritical.length}
                  </span>
                )}
              </div>
              <Link to={createPageUrl("AttendanceEntry")}>
                <Button variant="ghost" size="sm" className="text-indigo-600">
                  Submit All <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
            <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
              {missingAttendanceCritical.length > 0 ? (
                missingAttendanceCritical.map(e => (
                  <div key={e.id} className="flex items-center justify-between bg-orange-50/50 border border-orange-100 rounded-lg px-3 py-2.5 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{e.class_type_name || 'Unknown Class'}</p>
                      <p className="text-xs text-slate-500">{e.assigned_instructor_name || 'Unassigned'}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-xs font-medium text-slate-600">{moment(e.start_datetime).format('ddd D MMM')}</p>
                      <p className="text-xs text-slate-400">{moment(e.start_datetime).format('HH:mm')}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-slate-500 py-8">All attendance up to date</p>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Cover Opportunities</h3>
              <Link to={createPageUrl("CoverBoard")}>
                <Button variant="ghost" size="sm" className="text-indigo-600">
                  View All <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {coverRequests.length > 0 ? (
                coverRequests.slice(0, 3).map(request => (
                  <CoverRequestCard
                    key={request.id}
                    request={request}
                    userRole={userRole}
                    currentUserId={staffProfile?.id}
                    onViewDetails={() => {}}
                    onAccept={() => {}}
                    onDecline={() => {}}
                  />
                ))
              ) : (
                <p className="text-center text-slate-500 py-8">No open cover requests</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Open Cover Requests (Admin only - moved below) */}
      {isAdmin && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Open Cover Requests</h3>
            <Link to={createPageUrl("CoverBoard")}>
              <Button variant="ghost" size="sm" className="text-indigo-600">
                View All <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {coverRequests.length > 0 ? (
              coverRequests.slice(0, 4).map(request => (
                <CoverRequestCard
                  key={request.id}
                  request={request}
                  userRole={userRole}
                  currentUserId={staffProfile?.id}
                  onViewDetails={() => {}}
                  onAccept={() => {}}
                  onDecline={() => {}}
                />
              ))
            ) : (
              <p className="col-span-2 text-center text-slate-500 py-8">No open cover requests</p>
            )}
          </div>
        </div>
      )}

      {/* Pending Invoices (Admin/Manager only) */}
      {['owner', 'admin', 'gym_manager', 'payroll'].includes(userRole) && invoices.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Pending Invoice Approvals</h3>
            <Link to={createPageUrl("Invoices")}>
              <Button variant="ghost" size="sm" className="text-indigo-600">
                View All <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {invoices.slice(0, 4).map(invoice => (
              <InvoiceCard key={invoice.id} invoice={invoice} showInstructor />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}