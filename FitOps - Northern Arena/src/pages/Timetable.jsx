import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import WeekView from "@/components/timetable/WeekView";
import ListView from "@/components/timetable/ListView";
import EventDetailModal from "@/components/timetable/EventDetailModal";
import AddEventModal from "@/components/timetable/AddEventModal";
import { Plus, Search, Calendar, List, ClipboardX } from "lucide-react";
import moment from "moment";
import { generateRecurringInstances } from "@/lib/recurringEvents";

export default function Timetable() {
  const [user, setUser] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [events, setEvents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [classTypes, setClassTypes] = useState([]);
  const [locationsList, setLocationsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("week");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [weeksAhead, setWeeksAhead] = useState(12);
  const [recurringWeeksAhead, setRecurringWeeksAhead] = useState(4);
  const [currentWeekStart, setCurrentWeekStart] = useState(moment().startOf('isoWeek'));

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [instructorFilter, setInstructorFilter] = useState("all");
  const [classTypeFilter, setClassTypeFilter] = useState("all");
  const [awaitingAttendanceOnly, setAwaitingAttendanceOnly] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [userData, staffData, classTypesData, settingsList, recurringSettingsList, locSettings] = await Promise.all([
        base44.auth.me(),
        base44.entities.Staff.filter({ status: 'active' }),
        base44.entities.ClassType.filter({ status: 'active' }),
        base44.entities.AppSettings.filter({ setting_key: 'timetable_weeks_ahead' }),
        base44.entities.AppSettings.filter({ setting_key: 'timetable_recurring_weeks_ahead' }),
        base44.entities.AppSettings.filter({ setting_key: 'locations' })
      ]);
      if (locSettings.length > 0) {
        try { setLocationsList(JSON.parse(locSettings[0].setting_value) || []); } catch {}
      }
      
      setStaff(staffData);
      setClassTypes(classTypesData);
      
      const wa = settingsList.length > 0 ? (parseInt(settingsList[0].setting_value) || 12) : 12;
      setWeeksAhead(wa);
      const rwa = recurringSettingsList.length > 0 ? (parseInt(recurringSettingsList[0].setting_value) || 4) : 4;
      setRecurringWeeksAhead(rwa);

      const staffList = await base44.entities.Staff.filter({ email: userData.email });
      if (staffList.length > 0) {
        setStaffProfile(staffList[0]);
      }

      setUser(userData);
      loadEvents(moment().startOf('isoWeek'), wa);
    } catch (e) {
      console.error("Error loading data:", e);
    }
  };

  const loadEvents = async (weekStart, weeks) => {
    const ws = weekStart || currentWeekStart;
    const w = weeks !== undefined ? weeks : weeksAhead;
    setLoading(true);
    try {
      // Fetch a window: 4 weeks back from the viewed week + forward window
      const rangeStart = moment(ws).subtract(4, 'weeks').startOf('isoWeek').toISOString();
      const rangeEnd = moment(ws).add(w, 'weeks').endOf('isoWeek').toISOString();
      const eventsData = await base44.entities.TimetableEvent.filter(
        { start_datetime: { $gte: rangeStart, $lte: rangeEnd } },
        'start_datetime',
        2000
      );
      setEvents(eventsData);
    } catch (e) {
      console.error("Error loading events:", e);
    } finally {
      setLoading(false);
    }
  };

  // Backfill viability_color for legacy events that have a count but no colour set
  useEffect(() => {
    if (!events.length || !classTypes.length) return;
    const toFix = events.filter(e => 
      e.attendance_count != null && 
      (!e.viability_color || e.viability_color === 'pending')
    );
    if (!toFix.length) return;
    const computeViability = (count, event) => {
      const ct = classTypes.find(c => c.id === event.class_type_id || c.name === event.class_type_name);
      const purple = event.purple_min ?? ct?.purple_min ?? 20;
      const green  = event.green_min  ?? ct?.green_min  ?? 10;
      const amber  = event.amber_min  ?? ct?.amber_min  ?? 5;
      if (count >= purple) return "purple";
      if (count >= green)  return "green";
      if (count >= amber)  return "amber";
      return "red";
    };
    Promise.all(toFix.map(e => 
      base44.entities.TimetableEvent.update(e.id, { 
        viability_color: computeViability(e.attendance_count, e),
        attendance_status: e.attendance_status || 'recorded'
      })
    )).then(() => loadEvents(currentWeekStart));
  }, [events, classTypes]);

  const userRole = staffProfile?.role || 'instructor';
  const canEdit = ['owner', 'admin', 'team_leader'].includes(userRole);

  // Apply filters
  const filteredEvents = events.filter(event => {
    if (searchQuery && !event.class_type_name?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (locationFilter !== 'all' && event.location !== locationFilter) {
      return false;
    }
    if (statusFilter !== 'all' && event.status !== statusFilter) {
      return false;
    }
    if (instructorFilter !== 'all' && event.assigned_instructor_id !== instructorFilter) {
      return false;
    }
    if (classTypeFilter !== 'all' && event.class_type_id !== classTypeFilter) {
      return false;
    }
    if (awaitingAttendanceOnly) {
      const isPast = moment(event.end_datetime).isBefore(moment());
      if (!isPast) return false;
      if (event.status === 'cancelled') return false;
      // Treat legacy completed/counted events as already recorded
      if (event.attendance_status === 'recorded' || event.attendance_status === 'not_recorded') return false;
      if (event.attendance_status == null && (event.status === 'completed' || event.attendance_count != null)) return false;
    }
    return true;
  });

  // Merge settings locations with any locations found on events (for backwards compat)
  const locationsForFilter = [...new Set([...locationsList, ...events.map(e => e.location).filter(Boolean)])].sort((a, b) => a.localeCompare(b));

  const handleWeekChange = (newWeekStart) => {
    setCurrentWeekStart(newWeekStart);
    // Re-fetch if the new week is outside our current loaded window
    const rangeStart = moment(currentWeekStart).subtract(4, 'weeks').startOf('isoWeek');
    const rangeEnd = moment(currentWeekStart).add(weeksAhead, 'weeks').endOf('isoWeek');
    if (newWeekStart.isBefore(rangeStart) || newWeekStart.isAfter(rangeEnd)) {
      loadEvents(newWeekStart);
    }
  };

  const handleEventUpdate = async (eventId, updates) => {
    await base44.entities.TimetableEvent.update(eventId, updates);
    loadEvents(currentWeekStart);
    setSelectedEvent(null);
  };

  const handleDeleteEvent = async (eventId) => {
    await base44.entities.TimetableEvent.delete(eventId);
    loadEvents(currentWeekStart);
    setSelectedEvent(null);
  };

  const handleDeleteSeries = async (patternId) => {
    const seriesEvents = events.filter(e => e.recurring_pattern_id === patternId);
    for (const e of seriesEvents) {
      await base44.entities.TimetableEvent.delete(e.id);
    }
    loadEvents(currentWeekStart);
    setSelectedEvent(null);
  };

  const handleCancelSeries = async (patternId) => {
    const seriesEvents = events.filter(e => e.recurring_pattern_id === patternId && e.status !== 'completed' && e.status !== 'cancelled');
    for (const e of seriesEvents) {
      await base44.entities.TimetableEvent.update(e.id, { status: 'cancelled' });
    }
    loadEvents(currentWeekStart);
    setSelectedEvent(null);
  };

  const handleDuplicateEvent = async (event) => {
    const { id, created_date, updated_date, created_by, attendance_count, attendance_submitted_by, attendance_submitted_at, viability_color, recurring_pattern_id, ...rest } = event;
    await base44.entities.TimetableEvent.create({ ...rest, status: 'scheduled', viability_color: 'pending', is_recurring: false });
    loadEvents(currentWeekStart);
    setSelectedEvent(null);
  };

  const handleAddEvent = async (eventData) => {
    const classType = classTypes.find(ct => ct.id === eventData.class_type_id);
    const instructor = staff.find(s => s.id === eventData.assigned_instructor_id);
    
    const basePayload = {
      ...eventData,
      class_type_name: classType?.name || '',
      assigned_instructor_name: instructor?.name || '',
      status: eventData.assigned_instructor_id ? 'scheduled' : 'unfilled',
      viability_color: 'pending'
    };

    if (eventData.is_recurring) {
      const instances = generateRecurringInstances(basePayload, recurringWeeksAhead);
      for (const instance of instances) {
        await base44.entities.TimetableEvent.create(instance);
      }
    } else {
      await base44.entities.TimetableEvent.create(basePayload);
    }

    setShowAddModal(false);
    loadEvents(currentWeekStart);
  };

  const handleCreateCoverRequest = async (event) => {
    const eventId = typeof event === 'string' ? event : event.id;
    await base44.entities.CoverRequest.create({ event_id: eventId, status: 'open' });
    await base44.entities.TimetableEvent.update(eventId, { status: 'needs_cover' });
    loadEvents(currentWeekStart);
    setSelectedEvent(null);
  };

  const handleSubmitAttendance = async (eventId, count, viabilityColor, noAttendance = false) => {
    if (noAttendance) {
      await base44.entities.TimetableEvent.update(eventId, {
        attendance_status: 'not_recorded',
        viability_color: 'pending',
        attendance_submitted_by: staffProfile?.name,
        attendance_submitted_at: new Date().toISOString()
      });
    } else {
      await base44.entities.TimetableEvent.update(eventId, {
        attendance_count: count,
        attendance_status: 'recorded',
        viability_color: viabilityColor,
        status: 'completed',
        attendance_submitted_by: staffProfile?.name,
        attendance_submitted_at: new Date().toISOString()
      });
    }
    loadEvents(currentWeekStart);
    setSelectedEvent(null);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Timetable</h1>
          <p className="text-slate-500">Manage class schedule and assignments</p>
        </div>
        {canEdit && (
          <Button onClick={() => setShowAddModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Class
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search classes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locationsForFilter.map(loc => (
                <SelectItem key={loc} value={loc}>{loc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="unfilled">Unfilled</SelectItem>
              <SelectItem value="needs_cover">Needs Cover</SelectItem>
              <SelectItem value="covered">Covered</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={classTypeFilter} onValueChange={setClassTypeFilter}>
            <SelectTrigger className="w-full md:w-44">
              <SelectValue placeholder="Class Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {[...classTypes].sort((a, b) => a.name.localeCompare(b.name)).map(ct => (
                <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {canEdit && (
            <Select value={instructorFilter} onValueChange={setInstructorFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Instructor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Instructors</SelectItem>
                {[...staff.filter(s => s.role === 'instructor')].sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          <button
            onClick={() => setAwaitingAttendanceOnly(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${
              awaitingAttendanceOnly
                ? "bg-orange-600 border-orange-600 text-white"
                : "bg-white border-slate-200 text-slate-600 hover:border-orange-300 hover:text-orange-600"
            }`}
            title="Show only past events awaiting attendance"
          >
            <ClipboardX className="w-4 h-4" />
            <span className="hidden sm:inline">Awaiting Attendance</span>
          </button>

          <Tabs value={viewMode} onValueChange={setViewMode}>
            <TabsList>
              <TabsTrigger value="week" className="gap-2">
                <Calendar className="w-4 h-4" />
                Week
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-2">
                <List className="w-4 h-4" />
                List
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Calendar/List View */}
      {loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : viewMode === 'week' ? (
        <WeekView 
          events={filteredEvents}
          onEventClick={setSelectedEvent}
          classTypes={classTypes}
          currentWeekStart={currentWeekStart}
          onWeekChange={handleWeekChange}
        />
      ) : (
        <ListView 
          events={filteredEvents}
          onEventClick={setSelectedEvent}
          classTypes={classTypes}
        />
      )}

      {/* Event Detail Modal */}
      <EventDetailModal
        event={selectedEvent}
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onUpdate={handleEventUpdate}
        onDelete={handleDeleteEvent}
        onDeleteSeries={handleDeleteSeries}
        onCancelSeries={handleCancelSeries}
        onDuplicate={handleDuplicateEvent}
        onCreateCoverRequest={handleCreateCoverRequest}
        onSubmitAttendance={handleSubmitAttendance}
        staff={staff}
        classTypes={classTypes}
        userRole={userRole}
        currentUserId={staffProfile?.id}
        locations={locationsList}
      />

      {/* Add Event Modal */}
      {showAddModal && (
        <AddEventModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddEvent}
          classTypes={classTypes}
          staff={staff}
          locations={locationsList}
        />
      )}
    </div>
  );
}