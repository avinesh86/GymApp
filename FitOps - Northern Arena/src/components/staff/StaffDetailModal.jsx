import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import StatusBadge from "@/components/ui/StatusBadge";
import PayRatesTab from "@/components/staff/PayRatesTab";
import BusinessInfoTab from "@/components/staff/BusinessInfoTab";
import { Mail, Phone, Save, Star, Trash2 } from "lucide-react";

const TIME_BANDS = ["morning", "lunch", "afternoon", "evening"];
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export default function StaffDetailModal({ 
  staff, 
  isOpen, 
  onClose, 
  onUpdate,
  onDelete,
  classTypes,
  canEdit,
  canViewRates
}) {
  const [editedStaff, setEditedStaff] = useState(staff);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    setIsSubmitting(true);
    await onUpdate(staff.id, editedStaff);
    setIsSubmitting(false);
  };

  const handleAvailabilityChange = (day, timeBand, checked) => {
    const current = editedStaff.availability_preferences || {};
    const dayPrefs = current[day] || [];
    const newDayPrefs = checked
      ? [...dayPrefs, timeBand]
      : dayPrefs.filter(t => t !== timeBand);
    setEditedStaff(prev => ({
      ...prev,
      availability_preferences: { ...prev.availability_preferences, [day]: newDayPrefs }
    }));
  };

  const handleClassToggle = (classTypeId, checked) => {
    const current = editedStaff.classes_can_teach || [];
    setEditedStaff(prev => ({
      ...prev,
      classes_can_teach: checked ? [...current, classTypeId] : current.filter(c => c !== classTypeId)
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
              {staff.name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl">{staff.name}</DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">{staff.role?.replace(/_/g, ' ')}</Badge>
                <StatusBadge status={staff.status} />
              </div>
            </div>
            {staff.cover_reliability_score !== undefined && (
              <div className="text-right">
                <div className="flex items-center gap-1 text-amber-500">
                  <Star className="w-5 h-5 fill-current" />
                  <span className="font-bold text-lg">{staff.cover_reliability_score}%</span>
                </div>
                <p className="text-xs text-slate-500">Reliability Score</p>
              </div>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="info" className="mt-4">
          <TabsList className="w-full flex-wrap h-auto gap-0.5 p-1">
            <TabsTrigger value="info" className="flex-1 text-xs">Info</TabsTrigger>
            <TabsTrigger value="availability" className="flex-1 text-xs">Availability</TabsTrigger>
            <TabsTrigger value="classes" className="flex-1 text-xs">Classes</TabsTrigger>
            {canViewRates && <TabsTrigger value="pay" className="flex-1 text-xs">Pay Rates</TabsTrigger>}
            {canViewRates && <TabsTrigger value="business" className="flex-1 text-xs">Business & Invoice</TabsTrigger>}
          </TabsList>

          {/* ── INFO TAB ── */}
          <TabsContent value="info" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <div className="flex items-center gap-2 mt-1 p-2 bg-slate-50 rounded-lg">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="text-sm">{staff.email}</span>
                </div>
              </div>
              <div>
                <Label>Phone</Label>
                <div className="flex items-center gap-2 mt-1 p-2 bg-slate-50 rounded-lg">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span className="text-sm">{staff.phone || "Not set"}</span>
                </div>
              </div>
            </div>

            {canEdit && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Role</Label>
                    <Select value={editedStaff.role} onValueChange={v => setEditedStaff(prev => ({ ...prev, role: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="gym_manager">Gym Manager</SelectItem>
                        <SelectItem value="payroll">Payroll</SelectItem>
                        <SelectItem value="team_leader">Team Leader</SelectItem>
                        <SelectItem value="instructor">Instructor</SelectItem>
                        <SelectItem value="class_count_admin">Class Count Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={editedStaff.status} onValueChange={v => setEditedStaff(prev => ({ ...prev, status: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Priority Tier (Hidden from Instructors)</Label>
                  <Select
                    value={String(editedStaff.priority_tier || 2)}
                    onValueChange={v => setEditedStaff(prev => ({ ...prev, priority_tier: parseInt(v) }))}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Tier 1 (First Priority)</SelectItem>
                      <SelectItem value="2">Tier 2 (Second Priority)</SelectItem>
                      <SelectItem value="3">Tier 3 (Third Priority)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div>
              <Label>Qualifications</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {staff.qualifications?.map((q, i) => (
                  <Badge key={i} variant="secondary">{q}</Badge>
                )) || <span className="text-sm text-slate-500">None added</span>}
              </div>
            </div>
          </TabsContent>

          {/* ── AVAILABILITY TAB ── */}
          <TabsContent value="availability" className="pt-4">
            <p className="text-sm text-slate-500 mb-4">Set preferred availability for cover requests</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-4"></th>
                    {TIME_BANDS.map(band => (
                      <th key={band} className="text-center px-2 py-2 capitalize">{band}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map(day => (
                    <tr key={day} className="border-t border-slate-100">
                      <td className="py-3 pr-4 font-medium capitalize">{day}</td>
                      {TIME_BANDS.map(band => (
                        <td key={band} className="text-center px-2 py-3">
                          <Checkbox
                            checked={!!editedStaff.availability_preferences?.[day]?.includes(band)}
                            onCheckedChange={checked => handleAvailabilityChange(day, band, checked)}
                            disabled={!canEdit}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ── CLASSES TAB ── */}
          <TabsContent value="classes" className="pt-4">
            <p className="text-sm text-slate-500 mb-4">Select classes this instructor is qualified to teach</p>
            <div className="grid grid-cols-2 gap-3">
              {[...classTypes].sort((a, b) => a.name.localeCompare(b.name)).map(ct => (
                <div key={ct.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-indigo-200 transition-colors">
                  <Checkbox
                    checked={!!editedStaff.classes_can_teach?.includes(ct.id)}
                    onCheckedChange={checked => handleClassToggle(ct.id, checked)}
                    disabled={!canEdit}
                  />
                  <div>
                    <p className="font-medium text-sm">{ct.name}</p>
                    <p className="text-xs text-slate-500">{ct.duration_minutes} min</p>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── PAY RATES TAB ── */}
          {canViewRates && (
            <TabsContent value="pay">
              <PayRatesTab
                editedStaff={editedStaff}
                setEditedStaff={setEditedStaff}
                classTypes={classTypes}
                canEdit={canEdit}
              />
            </TabsContent>
          )}

          {/* ── BUSINESS & INVOICE TAB ── */}
          {canViewRates && (
            <TabsContent value="business">
              <BusinessInfoTab
                editedStaff={editedStaff}
                setEditedStaff={setEditedStaff}
                canEdit={canEdit}
              />
            </TabsContent>
          )}
        </Tabs>

        {canEdit && (
          <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t">
            {onDelete && (
              <Button
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50 gap-2"
                onClick={() => { if (window.confirm(`Delete ${staff.name}? This cannot be undone.`)) onDelete(staff.id); }}
              >
                <Trash2 className="w-4 h-4" /> Delete
              </Button>
            )}
            <div className="flex gap-3 ml-auto">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSubmitting}>
                <Save className="w-4 h-4 mr-2" />
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}