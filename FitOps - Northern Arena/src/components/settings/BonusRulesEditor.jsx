import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

const BONUS_TYPE_LABELS = {
  attendance_threshold: "Flat bonus when attendance ≥ threshold",
  flat_bonus: "Always add (flat fee per class)",
  per_head_above: "Per head for each attendee above threshold",
};

export default function BonusRulesEditor({ rules = [], onChange, disabled }) {
  const add = () => {
    onChange([...rules, {
      id: `br_${Date.now()}`,
      name: "",
      type: "attendance_threshold",
      threshold: 0,
      amount: 0
    }]);
  };

  const update = (idx, changes) => {
    onChange(rules.map((r, i) => i === idx ? { ...r, ...changes } : r));
  };

  const remove = (idx) => {
    onChange(rules.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-semibold text-slate-600">Bonus Rules</Label>
          <p className="text-xs text-slate-400">Auto-applied during invoice generation based on attendance</p>
        </div>
        {!disabled && (
          <Button type="button" size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={add}>
            <Plus className="w-3 h-3" /> Add Rule
          </Button>
        )}
      </div>

      {rules.length === 0 ? (
        <p className="text-xs text-slate-400 py-2 text-center border border-dashed border-slate-200 rounded-lg">No bonus rules configured</p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule, idx) => (
            <div key={rule.id || idx} className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <div>
                    <Label className="text-xs">Bonus Label (shown on invoice)</Label>
                    <Input
                      value={rule.name}
                      onChange={e => update(idx, { name: e.target.value })}
                      placeholder="e.g. Full House Bonus"
                      className="mt-1 h-7 text-xs"
                      disabled={disabled}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-3 sm:col-span-1">
                      <Label className="text-xs">Type</Label>
                      <Select value={rule.type} onValueChange={v => update(idx, { type: v })} disabled={disabled}>
                        <SelectTrigger className="mt-1 h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(BONUS_TYPE_LABELS).map(([v, l]) => (
                            <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {rule.type !== "flat_bonus" && (
                      <div>
                        <Label className="text-xs">Threshold (pax)</Label>
                        <Input
                          type="number"
                          value={rule.threshold || ""}
                          onChange={e => update(idx, { threshold: parseFloat(e.target.value) || 0 })}
                          className="mt-1 h-7 text-xs"
                          disabled={disabled}
                          placeholder="0"
                        />
                      </div>
                    )}
                    <div>
                      <Label className="text-xs">Amount</Label>
                      <Input
                        type="number"
                        value={rule.amount || ""}
                        onChange={e => update(idx, { amount: parseFloat(e.target.value) || 0 })}
                        className="mt-1 h-7 text-xs"
                        disabled={disabled}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
                {!disabled && (
                  <button
                    type="button"
                    className="mt-5 p-1 rounded text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                    onClick={() => remove(idx)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}