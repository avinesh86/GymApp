import EventCard from "./EventCard";
import moment from "moment";
import { cn } from "@/lib/utils";

export default function ListView({ events, onEventClick, classTypes = [] }) {
  const getClassColor = (event) => classTypes.find(ct => ct.id === event.class_type_id)?.color || '#6366f1';
  // Group events by date
  const groupedEvents = events.reduce((acc, event) => {
    const date = moment(event.start_datetime).format("YYYY-MM-DD");
    if (!acc[date]) acc[date] = [];
    acc[date].push(event);
    return acc;
  }, {});
  
  // Sort dates
  const sortedDates = Object.keys(groupedEvents).sort();
  
  return (
    <div className="space-y-6">
      {sortedDates.map(date => {
        const day = moment(date);
        const isToday = day.isSame(moment(), 'day');
        const isPast = day.isBefore(moment(), 'day');
        
        return (
          <div key={date}>
            <div className={cn(
              "flex items-center gap-3 mb-3 px-1",
              isPast && "opacity-60"
            )}>
              <div className={cn(
                "w-12 h-12 rounded-xl flex flex-col items-center justify-center",
                isToday ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
              )}>
                <span className="text-xs font-medium uppercase">{day.format("ddd")}</span>
                <span className="text-lg font-bold">{day.format("D")}</span>
              </div>
              <div>
                <p className={cn(
                  "font-semibold",
                  isToday ? "text-indigo-600" : "text-slate-900"
                )}>
                  {isToday ? "Today" : day.format("dddd")}
                </p>
                <p className="text-sm text-slate-500">{day.format("MMMM D, YYYY")}</p>
              </div>
            </div>
            
            <div className="space-y-2 pl-[60px]">
              {groupedEvents[date]
                .sort((a, b) => moment(a.start_datetime).diff(moment(b.start_datetime)))
                .map(event => (
                  <EventCard key={event.id} event={event} onClick={onEventClick} classColor={getClassColor(event)} />
                ))
              }
            </div>
          </div>
        );
      })}
      
      {sortedDates.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-500">No classes scheduled for this period</p>
        </div>
      )}
    </div>
  );
}