import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const ROLES = [
  { key: "owner", label: "Owner" },
  { key: "admin", label: "Admin" },
  { key: "gym_manager", label: "Gym Mgr" },
  { key: "payroll", label: "Payroll" },
  { key: "team_leader", label: "Team Leader" },
  { key: "instructor", label: "Instructor" },
  { key: "class_count_admin", label: "Class Count" },
];

// Roles that cannot be edited (locked)
const LOCKED_ROLES = ["owner", "admin"];

const DEFAULT_MATRIX = {
  "Dashboard":           { owner:true, admin:true, gym_manager:true, payroll:true, team_leader:true, instructor:true, class_count_admin:true },
  "Timetable (view)":   { owner:true, admin:true, gym_manager:true, payroll:false, team_leader:true, instructor:true, class_count_admin:true },
  "Timetable (edit)":   { owner:true, admin:true, gym_manager:true, payroll:false, team_leader:true, instructor:false, class_count_admin:false },
  "Staff Management":   { owner:true, admin:true, gym_manager:true, payroll:false, team_leader:true, instructor:false, class_count_admin:false },
  "Cover Board":        { owner:true, admin:true, gym_manager:true, payroll:false, team_leader:true, instructor:true, class_count_admin:false },
  "Invoices":           { owner:true, admin:true, gym_manager:true, payroll:true, team_leader:false, instructor:true, class_count_admin:false },
  "Attendance Entry":   { owner:true, admin:true, gym_manager:true, payroll:false, team_leader:false, instructor:false, class_count_admin:true },
  "QR Attendance":      { owner:true, admin:true, gym_manager:true, payroll:true, team_leader:true, instructor:true, class_count_admin:true },
  "Reports":            { owner:true, admin:true, gym_manager:true, payroll:true, team_leader:false, instructor:false, class_count_admin:false },
  "Settings":           { owner:true, admin:true, gym_manager:false, payroll:false, team_leader:false, instructor:false, class_count_admin:false },
  "CSV Import":         { owner:true, admin:true, gym_manager:false, payroll:false, team_leader:false, instructor:false, class_count_admin:false },
  "My Schedule":        { owner:false, admin:false, gym_manager:false, payroll:false, team_leader:true, instructor:true, class_count_admin:false },
};

export default function RoleAccessControl({ canEdit = false }) {
  const [matrix, setMatrix] = useState(DEFAULT_MATRIX);
  const [dirty, setDirty] = useState(false);
  const [settingId, setSettingId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.AppSettings.filter({ setting_key: 'role_access_control' }).then(results => {
      if (results.length > 0) {
        setSettingId(results[0].id);
        try {
          const saved = JSON.parse(results[0].setting_value);
          setMatrix({ ...DEFAULT_MATRIX, ...saved });
        } catch {}
      }
    });
  }, []);

  const toggle = (feature, roleKey) => {
    if (!canEdit || LOCKED_ROLES.includes(roleKey)) return;
    setMatrix(prev => ({
      ...prev,
      [feature]: { ...prev[feature], [roleKey]: !prev[feature][roleKey] }
    }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const value = JSON.stringify(matrix);
    if (settingId) {
      await base44.entities.AppSettings.update(settingId, { setting_value: value });
    } else {
      const created = await base44.entities.AppSettings.create({
        setting_key: 'role_access_control',
        setting_value: value,
        description: 'Role access control matrix'
      });
      setSettingId(created.id);
    }
    toast.success("Access control preferences saved");
    setDirty(false);
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Role Access Control</CardTitle>
        <CardDescription>
          What each role can see and do in the system.
          {canEdit ? " Click a cell to toggle access." : " Only owners and admins can edit this."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-slate-700 w-36">Feature</th>
                {ROLES.map(r => (
                  <th key={r.key} className="text-center py-2 px-1 font-medium text-slate-700 text-xs min-w-[52px]">
                    <span className={LOCKED_ROLES.includes(r.key) ? "text-slate-400" : ""}>{r.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {Object.entries(matrix).map(([feature, access]) => (
                <tr key={feature} className="hover:bg-slate-50/50">
                  <td className="py-2 pr-4 text-slate-700 font-medium text-xs whitespace-nowrap">{feature}</td>
                  {ROLES.map(r => {
                    const has = access[r.key];
                    const editable = canEdit && !LOCKED_ROLES.includes(r.key);
                    return (
                      <td key={r.key} className="text-center py-2 px-1">
                        <button
                          onClick={() => toggle(feature, r.key)}
                          disabled={!editable}
                          className={`w-7 h-7 rounded-md flex items-center justify-center mx-auto transition-colors
                            ${editable ? "cursor-pointer hover:ring-2 hover:ring-indigo-300" : "cursor-default"}
                            ${has ? "bg-green-100" : "bg-slate-100"}
                          `}
                          title={editable ? (has ? "Click to revoke" : "Click to grant") : ""}
                        >
                          {has
                            ? <Check className="w-3.5 h-3.5 text-green-600" />
                            : <X className="w-3.5 h-3.5 text-slate-300" />
                          }
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-400">
            🔒 Owner and Admin columns are locked. Access is enforced via role-based navigation.
          </p>
          {canEdit && (
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
              Save Changes
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}