import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Bell, X, Check, CheckCheck, AlertTriangle, FileText, Calendar, Clock, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import moment from "moment";

const typeIcon = {
  cover_request: AlertTriangle,
  cover_accepted: Check,
  cover_expired: Clock,
  attendance_reminder: Calendar,
  invoice_submitted: FileText,
  invoice_approved: Check,
  invoice_rejected: X,
  invoice_paid: Check,
  timetable_change: Calendar,
  absence_approved: Check,
};

const typeColor = {
  cover_request: "text-orange-500 bg-orange-50",
  cover_accepted: "text-green-500 bg-green-50",
  cover_expired: "text-slate-400 bg-slate-50",
  attendance_reminder: "text-blue-500 bg-blue-50",
  invoice_submitted: "text-indigo-500 bg-indigo-50",
  invoice_approved: "text-green-500 bg-green-50",
  invoice_rejected: "text-red-500 bg-red-50",
  invoice_paid: "text-emerald-500 bg-emerald-50",
  timetable_change: "text-purple-500 bg-purple-50",
  absence_approved: "text-green-500 bg-green-50",
};

export default function NotificationBell({ staffId }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!staffId) return;
    loadNotifications();

    // Subscribe to real-time updates
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.data?.recipient_id === staffId) {
        loadNotifications();
      }
    });
    return () => unsub();
  }, [staffId]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const loadNotifications = async () => {
    try {
      const notifs = await base44.entities.Notification.filter(
        { recipient_id: staffId },
        '-created_date',
        20
      );
      setNotifications(notifs);
    } catch (e) {
      console.log("Error loading notifications");
    }
  };

  const markRead = async (notif) => {
    if (notif.is_read) return;
    await base44.entities.Notification.update(notif.id, { is_read: true });
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read);
    await Promise.all(unread.map(n => base44.entities.Notification.update(n.id, { is_read: true })));
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen(v => !v)}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-12 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-600" />
              <span className="font-semibold text-slate-900 text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-bold">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs text-indigo-600 h-7 px-2">
                  <CheckCheck className="w-3.5 h-3.5 mr-1" />
                  All read
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="h-7 w-7">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <Bell className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => {
                const Icon = typeIcon[n.type] || Info;
                const colorCls = typeColor[n.type] || "text-slate-500 bg-slate-50";
                return (
                  <div
                    key={n.id}
                    onClick={() => markRead(n)}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-slate-50",
                      !n.is_read && "bg-indigo-50/40"
                    )}
                  >
                    <div className={cn("p-2 rounded-xl shrink-0 mt-0.5", colorCls)}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-medium text-slate-900 leading-tight", !n.is_read && "font-semibold")}>
                        {n.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-xs text-slate-400 mt-1">{moment(n.created_date).fromNow()}</p>
                    </div>
                    {!n.is_read && (
                      <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}