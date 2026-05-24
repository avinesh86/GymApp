import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

// Multi-select class type dropdown for overrides
function ClassTypeMultiSelect({ value = [], onChange, classTypes, disabled }) {
  const [open, setOpen] = useState(false);
  const selectedNames = classTypes.filter(ct => value.includes(ct.id)).map(ct => ct.name);

  const toggle = (ctId) => {
    if (value.includes(ctId)) onChange(value.filter(id => id !== ctId));
    else onChange([...value, ctId]);
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm min-h-[36px] mt-1",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-slate-50"
        )}
      >
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {selectedNames.length === 0
            ? <span className="text-slate-400">Select class types…</span>
            : selectedNames.map(n => (
              <span key={n} className="inline-block bg-indigo-100 text-indigo-700 text-xs rounded px-1.5 py-0.5">{n}</span>
            ))}
        </div>
        {open ? <ChevronUp className="w-4 h-4 shrink-0 text-slate-400" /> : <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />}
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {[...classTypes].sort((a, b) => a.name.localeCompare(b.name)).map(ct => (
            <label key={ct.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">
              <Checkbox
                checked={value.includes(ct.id)}
                onCheckedChange={() => toggle(ct.id)}
                disabled={disabled}
              />
              <span className="text-sm">{ct.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PayRatesTab({ editedStaff, setEditedStaff, classTypes, canEdit }) {
  // Each override now stores class_type_ids (array) instead of single class_type_id
  const overrides = editedStaff.pay_rate_overrides || [];

  const addOverride = () => {
    setEditedStaff(prev => ({
      ...prev,
      pay_rate_overrides: [
        ...overrides,
        { class_type_ids: [], class_type_id: "", class_type_name: "", rate: 0, rate_type: "per_class", per_head_rate: 0 }
      ]
    }));
  };

  const updateOverride = (idx, changes) => {
    const updated = overrides.map((o, i) => i === idx ? { ...o, ...changes } : o);
    setEditedStaff(prev => ({ ...prev, pay_rate_overrides: updated }));
  };

  const removeOverride = (idx) => {
    setEditedStaff(prev => ({ ...prev, pay_rate_overrides: overrides.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="space-y-4 pt-4">
      {/* Default Rate */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Default Rate</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Rate Type</Label>
            <Select
              value={editedStaff.default_pay_rate_type || "per_class"}
              onValueChange={v => setEditedStaff(prev => ({ ...prev, default_pay_rate_type: v }))}
              disabled={!canEdit}
            >
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="per_class">Per Class</SelectItem>
                <SelectItem value="per_head">Per Head</SelectItem>
                <SelectItem value="blended">Blended (Base + Per Head)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Base Rate</Label>
            <Input
              type="number"
              value={editedStaff.base_rate || ""}
              onChange={e => setEditedStaff(prev => ({ ...prev, base_rate: parseFloat(e.target.value) || 0 }))}
              className="mt-1"
              disabled={!canEdit}
              placeholder="0.00"
            />
          </div>
        </div>
        {(editedStaff.default_pay_rate_type === "per_head" || editedStaff.default_pay_rate_type === "blended") && (
          <div className="mt-3">
            <Label>Per Head Rate</Label>
            <Input
              type="number"
              value={editedStaff.per_head_rate || ""}
              onChange={e => setEditedStaff(prev => ({ ...prev, per_head_rate: parseFloat(e.target.value) || 0 }))}
              className="mt-1"
              disabled={!canEdit}
              placeholder="0.00"
            />
          </div>
        )}
      </div>

      {/* Class-Specific Rate Overrides */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Class-Specific Rate Overrides</p>
            <p className="text-xs text-slate-500">Select one or more class types to apply the same override rate</p>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" className="gap-1" onClick={addOverride}>
              <Plus className="w-3.5 h-3.5" /> Add Override
            </Button>
          )}
        </div>

        {overrides.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-xl">
            No class-specific overrides set
          </p>
        ) : (
          <div className="space-y-3">
            {overrides.map((override, idx) => (
              <div key={idx} className="p-3 bg-white rounded-xl border border-slate-200">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <div>
                      <Label className="text-xs">Class Types (select multiple)</Label>
                      <ClassTypeMultiSelect
                        value={override.class_type_ids || (override.class_type_id ? [override.class_type_id] : [])}
                        onChange={ids => {
                          const names = classTypes.filter(ct => ids.includes(ct.id)).map(ct => ct.name).join(", ");
                          updateOverride(idx, {
                            class_type_ids: ids,
                            // keep legacy single fields for invoice compatibility
                            class_type_id: ids[0] || "",
                            class_type_name: names
                          });
                        }}
                        classTypes={classTypes}
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Rate Type</Label>
                        <Select
                          value={override.rate_type || "per_class"}
                          onValueChange={v => updateOverride(idx, { rate_type: v })}
                          disabled={!canEdit}
                        >
                          <SelectTrigger className="mt-1 text-xs h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="per_class">Per Class</SelectItem>
                            <SelectItem value="per_head">Per Head</SelectItem>
                            <SelectItem value="blended">Blended</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Base Rate</Label>
                        <Input
                          type="number"
                          value={override.rate || ""}
                          onChange={e => updateOverride(idx, { rate: parseFloat(e.target.value) || 0 })}
                          className="mt-1 text-sm h-8"
                          disabled={!canEdit}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    {(override.rate_type === "per_head" || override.rate_type === "blended") && (
                      <div>
                        <Label className="text-xs">Per Head Rate</Label>
                        <Input
                          type="number"
                          value={override.per_head_rate || ""}
                          onChange={e => updateOverride(idx, { per_head_rate: parseFloat(e.target.value) || 0 })}
                          className="mt-1 text-sm h-8"
                          disabled={!canEdit}
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <button
                      className="mt-6 p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      onClick={() => removeOverride(idx)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}