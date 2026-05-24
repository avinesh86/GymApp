import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export default function AddStaffModal({ isOpen, onClose, onSubmit, classTypes }) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    role: "instructor",
    status: "active",
    qualifications: [],
    classes_can_teach: [],
    default_pay_rate_type: "per_class",
    base_rate: 50,
    priority_tier: 2,
    cover_reliability_score: 100
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [qualificationInput, setQualificationInput] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onSubmit(formData);
    setIsSubmitting(false);
  };

  const addQualification = () => {
    if (qualificationInput.trim()) {
      setFormData(prev => ({
        ...prev,
        qualifications: [...prev.qualifications, qualificationInput.trim()]
      }));
      setQualificationInput("");
    }
  };

  const removeQualification = (index) => {
    setFormData(prev => ({
      ...prev,
      qualifications: prev.qualifications.filter((_, i) => i !== index)
    }));
  };

  const handleClassToggle = (classTypeId, checked) => {
    setFormData(prev => ({
      ...prev,
      classes_can_teach: checked 
        ? [...prev.classes_can_teach, classTypeId]
        : prev.classes_can_teach.filter(c => c !== classTypeId)
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Staff Member</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Full Name *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="John Doe"
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label>Email *</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="john@example.com"
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label>Phone</Label>
            <Input
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="+1 (555) 000-0000"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Role *</Label>
              <Select 
                value={formData.role} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, role: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="gym_manager">Gym Manager</SelectItem>
                  <SelectItem value="payroll">Payroll</SelectItem>
                  <SelectItem value="team_leader">Team Leader</SelectItem>
                  <SelectItem value="instructor">Instructor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select 
                value={formData.status} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, status: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {formData.role === 'instructor' && (
            <>
              <div>
                <Label>Qualifications</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={qualificationInput}
                    onChange={(e) => setQualificationInput(e.target.value)}
                    placeholder="e.g., Yoga Certified"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addQualification())}
                  />
                  <Button type="button" variant="outline" onClick={addQualification}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.qualifications.map((q, i) => (
                    <span 
                      key={i} 
                      className="px-2 py-1 bg-slate-100 rounded text-sm cursor-pointer hover:bg-red-100"
                      onClick={() => removeQualification(i)}
                    >
                      {q} ×
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <Label>Classes Can Teach</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[...classTypes].sort((a, b) => a.name.localeCompare(b.name)).map(ct => (
                    <div key={ct.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={formData.classes_can_teach.includes(ct.id)}
                        onCheckedChange={(checked) => handleClassToggle(ct.id, checked)}
                      />
                      <span className="text-sm">{ct.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Pay Rate Type</Label>
                  <Select 
                    value={formData.default_pay_rate_type} 
                    onValueChange={(v) => setFormData(prev => ({ ...prev, default_pay_rate_type: v }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_class">Per Class</SelectItem>
                      <SelectItem value="per_head">Per Head</SelectItem>
                      <SelectItem value="blended">Blended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Base Rate ($)</Label>
                  <Input
                    type="number"
                    value={formData.base_rate}
                    onChange={(e) => setFormData(prev => ({ ...prev, base_rate: parseFloat(e.target.value) || 0 }))}
                    className="mt-1"
                  />
                </div>
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!formData.name || !formData.email || isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Staff"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}