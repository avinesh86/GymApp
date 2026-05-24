import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, MapPin } from "lucide-react";

const SETTING_KEY = "locations";

export default function LocationSettings() {
  const [locations, setLocations] = useState([]);
  const [newLocation, setNewLocation] = useState("");
  const [settingId, setSettingId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const results = await base44.entities.AppSettings.filter({ setting_key: SETTING_KEY });
    if (results.length > 0) {
      setSettingId(results[0].id);
      try {
        setLocations(JSON.parse(results[0].setting_value) || []);
      } catch {
        setLocations([]);
      }
    }
  };

  const save = async (updated) => {
    setSaving(true);
    const value = JSON.stringify(updated.sort((a, b) => a.localeCompare(b)));
    if (settingId) {
      await base44.entities.AppSettings.update(settingId, { setting_value: value });
    } else {
      const created = await base44.entities.AppSettings.create({
        setting_key: SETTING_KEY,
        setting_value: value,
        description: "List of gym locations/studios"
      });
      setSettingId(created.id);
    }
    setSaving(false);
    toast.success("Locations saved");
  };

  const handleAdd = async () => {
    const trimmed = newLocation.trim();
    if (!trimmed || locations.includes(trimmed)) return;
    const updated = [...locations, trimmed];
    setLocations(updated);
    setNewLocation("");
    await save(updated);
  };

  const handleDelete = async (loc) => {
    const updated = locations.filter(l => l !== loc);
    setLocations(updated);
    await save(updated);
  };

  const sorted = [...locations].sort((a, b) => a.localeCompare(b));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="w-5 h-5 text-indigo-600" />
          Locations / Studios
        </CardTitle>
        <CardDescription>Manage the list of locations used in class scheduling dropdowns</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={newLocation}
            onChange={e => setNewLocation(e.target.value)}
            placeholder="e.g., Studio A, Main Hall..."
            onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleAdd())}
          />
          <Button onClick={handleAdd} disabled={!newLocation.trim() || saving} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>

        {sorted.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">
            No locations added yet. Add locations above to use them in class scheduling.
          </p>
        ) : (
          <div className="space-y-2">
            {sorted.map(loc => (
              <div key={loc} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-800">{loc}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                  onClick={() => handleDelete(loc)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}