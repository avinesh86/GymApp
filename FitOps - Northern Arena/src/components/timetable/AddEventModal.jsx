import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import moment from "moment";

export default function AddEventModal({ isOpen, onClose, onSubmit, classTypes, staff, locations = [] }) {
  const [formData, setFormData] = useState({
    class_type_id: "",
    date: moment().format("YYYY-MM-DD"),
    start_time: "09:00",
    end_time: "10:00",
    location: "",
    assigned_instructor_id: "",
    instructor_notes: "",
    is_recurring: false,
    amber_min: "",
    green_min: "",
    purple_min: "",
  });
  const [showThresholds, setShowThresholds] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedClassType = classTypes.find(ct => ct.id === formData.class_type_id);

  const handleClassTypeChange = (v) => {
    const ct = classTypes.find(c => c.id === v);
    setFormData(prev => ({
      ...prev,
      class_type_id: v,
      location: ct?.location || prev.location,
      // Pre-fill thresholds from class type defaults
      amber_min: ct?.amber_min != null ? String(ct.amber_min) : "",
      green_min: ct?.green_min != null ? String(ct.green_min) : "",
      purple_min: ct?.purple_min != null ? String(ct.purple_min) : "",
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const startDatetime = moment(`${formData.date} ${formData.start_time}`).toISOString();
    const endDatetime = moment(`${formData.date} ${formData.end_time}`).toISOString();

    const payload = {
      class_type_id: formData.class_type_id,
      start_datetime: startDatetime,
      end_datetime: endDatetime,
      location: formData.location,
      assigned_instructor_id: formData.assigned_instructor_id || null,
      instructor_notes: formData.instructor_notes,
      is_recurring: formData.is_recurring,
    };

    // Attach threshold overrides if provided
    if (formData.amber_min !== "") payload.amber_min = parseInt(formData.amber_min);
    if (formData.green_min !== "") payload.green_min = parseInt(formData.green_min);
    if (formData.purple_min !== "") payload.purple_min = parseInt(formData.purple_min);

    await onSubmit(payload);
    setIsSubmitting(false);
  };

  const set = (key, val) => setFormData(prev => ({ ...prev, [key]: val }));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Class</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Class Type *</Label>
            <Select value={formData.class_type_id} onValueChange={handleClassTypeChange}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select class type" />
              </SelectTrigger>
              <SelectContent>
                {[...classTypes].sort((a, b) => a.name.localeCompare(b.name)).map(ct => (
                  <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date *</Label>
              <Input type="date" value={formData.date} onChange={e => set("date", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Location</Label>
              {locations.length > 0 ? (
                <Select value={formData.location} onValueChange={v => set("location", v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...locations].sort((a, b) => a.localeCompare(b)).map(loc => (
                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={formData.location} onChange={e => set("location", e.target.value)} placeholder="Studio A" className="mt-1" />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Time *</Label>
              <Input type="time" value={formData.start_time} onChange={e => set("start_time", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>End Time *</Label>
              <Input type="time" value={formData.end_time} onChange={e => set("end_time", e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label>Instructor</Label>
            <Select value={formData.assigned_instructor_id} onValueChange={v => set("assigned_instructor_id", v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select instructor (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>Unassigned</SelectItem>
                {[...staff.filter(s => ["instructor", "team_leader"].includes(s.role) && s.status === 'active')].sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Notes for Instructor</Label>
            <Textarea value={formData.instructor_notes} onChange={e => set("instructor_notes", e.target.value)} placeholder="Any special instructions..." className="mt-1" rows={2} />
          </div>

          {/* Attendance Targets – collapsible */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowThresholds(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <span>Attendance Targets (optional)</span>
              <span className="text-xs text-slate-400">
                {selectedClassType
                  ? `Default: ${selectedClassType.amber_min}/${selectedClassType.green_min}/${selectedClassType.purple_min}`
                  : "Override per class"}
              </span>
            </button>
            {showThresholds && (
              <div className="p-4 space-y-3">
                <p className="text-xs text-slate-500">Override the viability thresholds for this specific class. Leave blank to use class type defaults.</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Amber min
                    </Label>
                    <Input type="number" min="0" value={formData.amber_min} onChange={e => set("amber_min", e.target.value)} placeholder={selectedClassType?.amber_min ?? "5"} className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Green min
                    </Label>
                    <Input type="number" min="0" value={formData.green_min} onChange={e => set("green_min", e.target.value)} placeholder={selectedClassType?.green_min ?? "10"} className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> Purple min
                    </Label>
                    <Input type="number" min="0" value={formData.purple_min} onChange={e => set("purple_min", e.target.value)} placeholder={selectedClassType?.purple_min ?? "20"} className="mt-1 h-8 text-sm" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <Label>Recurring Class</Label>
              <p className="text-xs text-slate-500">Repeat weekly</p>
            </div>
            <Switch checked={formData.is_recurring} onCheckedChange={v => set("is_recurring", v)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!formData.class_type_id || isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Class"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}