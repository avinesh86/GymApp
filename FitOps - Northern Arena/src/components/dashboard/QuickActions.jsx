import { Button } from "@/components/ui/button";
import { Plus, UserPlus, Calendar, FileText, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function QuickActions({ userRole }) {
  const actions = [
    { label: "Add Class", icon: Plus, page: "Timetable", roles: ["admin", "team_leader"] },
    { label: "Add Staff", icon: UserPlus, page: "Staff", roles: ["admin"] },
    { label: "Cover Board", icon: AlertCircle, page: "CoverBoard", roles: ["admin", "team_leader", "gym_manager"] },
    { label: "View Invoices", icon: FileText, page: "Invoices", roles: ["admin", "gym_manager", "payroll"] },
  ];

  const visibleActions = actions.filter(a => a.roles.includes(userRole));

  return (
    <div className="flex flex-wrap gap-3">
      {visibleActions.map(action => (
        <Link key={action.label} to={createPageUrl(action.page)}>
          <Button variant="outline" className="gap-2 bg-white hover:bg-slate-50">
            <action.icon className="w-4 h-4" />
            {action.label}
          </Button>
        </Link>
      ))}
    </div>
  );
}