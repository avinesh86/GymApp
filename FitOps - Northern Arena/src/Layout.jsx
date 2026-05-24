import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Calendar,
  Users,
  AlertTriangle,
  FileText,
  Settings,
  Menu,
  X,
  LogOut,
  User,
  ChevronDown,
  CalendarDays,
  BarChart2,
  Shield,
  ClipboardList,
  CalendarRange,
  QrCode
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AttendanceReminderPopup from "@/components/notifications/AttendanceReminderPopup";
import NotificationBell from "@/components/notifications/NotificationBell";

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
      
      // Find staff profile
      const staffList = await base44.entities.Staff.filter({ email: userData.email });
      if (staffList.length > 0) {
        setStaffProfile(staffList[0]);
      }
    } catch (e) {
      console.log("Not logged in");
    }
  };



  const userRole = staffProfile?.role || 'instructor';
  
  const navItems = [
    { name: "Dashboard", page: "Dashboard", icon: LayoutDashboard, roles: ["owner", "admin", "gym_manager", "payroll", "team_leader", "instructor"] },
    { name: "My Schedule", page: "MySchedule", icon: CalendarDays, roles: ["instructor", "team_leader"] },
    { name: "My Calendar", page: "InstructorCalendar", icon: CalendarRange, roles: ["instructor", "team_leader"] },
    { name: "Timetable", page: "Timetable", icon: Calendar, roles: ["owner", "admin", "gym_manager", "team_leader", "instructor", "class_count_admin"] },
    { name: "Staff", page: "Staff", icon: Users, roles: ["owner", "admin", "gym_manager", "team_leader"] },
    { name: "Cover Board", page: "CoverBoard", icon: AlertTriangle, roles: ["owner", "admin", "gym_manager", "team_leader", "instructor"] },
    { name: "Invoices", page: "Invoices", icon: FileText, roles: ["owner", "admin", "gym_manager", "payroll", "instructor"] },
    { name: "Attendance", page: "AttendanceEntry", icon: ClipboardList, roles: ["owner", "admin", "gym_manager", "class_count_admin"] },
    { name: "QR Attendance", page: "QRAttendance", icon: QrCode, roles: ["owner", "admin", "gym_manager", "class_count_admin", "team_leader", "instructor"] },
    { name: "Reports", page: "Reports", icon: BarChart2, roles: ["owner", "admin", "gym_manager", "payroll"] },
    { name: "CSV Import", page: "CSVImport", icon: FileText, roles: ["owner", "admin"] },
    { name: "Settings", page: "Settings", icon: Settings, roles: ["owner", "admin"] },
  ];

  const visibleNavItems = navItems.filter(item => item.roles.includes(userRole));
  const isOwner = userRole === 'owner';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-40 px-4 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
          <Menu className="w-5 h-5" />
        </Button>
        <span className="font-bold text-slate-900">FitOps</span>
        <div className="flex items-center gap-2">
          <NotificationBell staffId={staffProfile?.id} />
        </div>
      </header>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="h-16 px-6 flex items-center justify-between border-b border-slate-100">
            <Link to={createPageUrl("Dashboard")} className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">F</span>
              </div>
              <span className="font-bold text-lg text-slate-900">FitOps</span>
            </Link>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {visibleNavItems.map((item) => {
              const isActive = currentPageName === item.page;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <item.icon className={cn("w-5 h-5 shrink-0", isActive && "text-indigo-600")} />
                  <span className="truncate">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* User */}
          {user && (
            <div className="p-3 border-t border-slate-100">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                      <span className="text-white font-medium text-sm">
                        {user.full_name?.charAt(0) || user.email?.charAt(0) || "?"}
                      </span>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {user.full_name || user.email}
                      </p>
                      <p className={`text-xs capitalize font-medium ${isOwner ? 'text-indigo-600' : 'text-slate-500'}`}>
                        {isOwner && <Shield className="w-3 h-3 inline mr-1" />}
                        {userRole?.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild>
                    <Link to={createPageUrl("Profile")} className="cursor-pointer">
                      <User className="w-4 h-4 mr-2" />
                      My Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => base44.auth.logout()}
                    className="text-red-600 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen">
        <div className="hidden lg:flex h-16 px-6 items-center justify-between border-b border-slate-200 bg-white">
          <h1 className="text-lg font-semibold text-slate-900">{currentPageName}</h1>
          <div className="flex items-center gap-3">
            <NotificationBell staffId={staffProfile?.id} />
          </div>
        </div>
        <div className="p-4 lg:p-6">
          {children}
        </div>
      </main>

      {/* Attendance reminder popup for instructors */}
      {staffProfile && ['instructor', 'team_leader'].includes(userRole) && (
        <AttendanceReminderPopup staffProfile={staffProfile} />
      )}
    </div>
  );
}