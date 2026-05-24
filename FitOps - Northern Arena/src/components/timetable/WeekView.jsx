import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import moment from "moment";
import EventCard from "./EventCard";

export default function WeekView({ events, onEventClick, onDateChange, classTypes = [], currentWeekStart: controlledWeekStart, onWeekChange }) {
  const getClassColor = (event) => classTypes.find(ct => ct.id === event.class_type_id)?.color || '#6366f1';
  const [internalWeekStart, setInternalWeekStart] = useState(moment().startOf('isoWeek'));
  
  const currentWeekStart = controlledWeekStart || internalWeekStart;

  const days = Array.from({ length: 7 }, (_, i) => 
    moment(currentWeekStart).add(i, 'days')
  );
  
  const navigateWeek = (direction) => {
    const newStart = moment(currentWeekStart).add(direction, 'week');
    if (onWeekChange) {
      onWeekChange(newStart);
    } else {
      setInternalWeekStart(newStart);
    }
    onDateChange?.(newStart.toDate(), moment(newStart).endOf('isoWeek').toDate());
  };

  const goToToday = () => {
    const today = moment().startOf('isoWeek');
    if (onWeekChange) {
      onWeekChange(today);
    } else {
      setInternalWeekStart(today);
    }
    onDateChange?.(today.toDate(), moment(today).endOf('isoWeek').toDate());
  };
  
  const getEventsForDay = (day) => {
    return events.filter(e => 
      moment(e.start_datetime).isSame(day, 'day')
    ).sort((a, b) => moment(a.start_datetime).diff(moment(b.start_datetime)));
  };
  
  const isToday = (day) => moment().isSame(day, 'day');
  const isPastWeek = currentWeekStart.isBefore(moment().startOf('isoWeek'));

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2 md:gap-4">
          <h3 className="text-base md:text-lg font-semibold text-slate-900">
            {currentWeekStart.format("MMM YYYY")}
          </h3>
          <span className="text-xs md:text-sm text-slate-500 hidden sm:inline">
            {moment(currentWeekStart).format("D MMM")} – {moment(currentWeekStart).endOf('isoWeek').format("D MMM")}
          </span>
          {isPastWeek && (
            <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              Past week
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigateWeek(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigateWeek(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Mobile: stacked day-by-day */}
      <div className="md:hidden divide-y divide-slate-100">
        {days.map((day, idx) => {
          const dayEvents = getEventsForDay(day);
          return (
            <div key={idx}>
              <div className={cn(
                "flex items-center gap-3 px-4 py-3",
                isToday(day) ? "bg-indigo-50" : "bg-slate-50"
              )}>
                <div className={cn(
                  "w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0",
                  isToday(day) ? "bg-indigo-600 text-white" : "bg-white text-slate-700 border border-slate-200"
                )}>
                  <span className="text-xs leading-none font-medium">{day.format("ddd").toUpperCase()}</span>
                  <span className="text-lg leading-none font-bold">{day.format("D")}</span>
                </div>
                <span className={cn("text-sm font-semibold", isToday(day) ? "text-indigo-700" : "text-slate-700")}>
                  {day.format("MMMM D")}
                </span>
                {dayEvents.length > 0 && (
                  <span className="ml-auto text-xs font-medium text-slate-500 bg-white rounded-full px-2 py-0.5 border border-slate-200">
                    {dayEvents.length}
                  </span>
                )}
              </div>
              {dayEvents.length > 0 ? (
                <div className="p-3 space-y-2">
                  {dayEvents.map(event => (
                    <EventCard key={event.id} event={event} onClick={onEventClick} compact classColor={getClassColor(event)} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-3">No classes</p>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Desktop/Tablet: 7-col grid */}
      <div className="hidden md:grid grid-cols-7 divide-x divide-slate-100">
        {days.map((day, idx) => (
          <div key={idx} className="min-h-[400px]">
            <div className={cn(
              "px-3 py-3 text-center border-b border-slate-100 sticky top-0 bg-white",
              isToday(day) && "bg-indigo-50"
            )}>
              <p className="text-xs font-medium text-slate-500 uppercase">
                {day.format("ddd")}
              </p>
              <p className={cn(
                "text-xl font-semibold mt-0.5",
                isToday(day) ? "text-indigo-600" : "text-slate-900"
              )}>
                {day.format("D")}
              </p>
            </div>
            <div className="p-2 space-y-2">
              {getEventsForDay(day).map(event => (
                <EventCard key={event.id} event={event} onClick={onEventClick} compact classColor={getClassColor(event)} />
              ))}
              {getEventsForDay(day).length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No classes</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}