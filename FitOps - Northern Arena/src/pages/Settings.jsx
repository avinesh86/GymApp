import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, Plus, Trash2, Settings as SettingsIcon, Bell, Users, Pencil, X, Copy, Shield, Wrench, MapPin, FileText, Calendar } from "lucide-react";
import moment from "moment";
import MaintenancePanel from "@/components/settings/MaintenancePanel";
import RoleAccessControl from "@/components/settings/RoleAccessControl";
import LocationSettings from "@/components/settings/LocationSettings";
import BonusRulesEditor from "@/components/settings/BonusRulesEditor";

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [classTypes, setClassTypes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [weeksAhead, setWeeksAhead] = useState(12);
  const [weeksAheadSettingId, setWeeksAheadSettingId] = useState(null);
  const [recurringWeeksAhead, setRecurringWeeksAhead] = useState(4);
  const [recurringWeeksSettingId, setRecurringWeeksSettingId] = useState(null);
  const [savingTimetable, setSavingTimetable] = useState(false);
  const [editingClassType, setEditingClassType] = useState(null);
  const [currencySymbol, setCurrencySymbol] = useState("$");
  const [currencySettingId, setCurrencySettingId] = useState(null);
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [updatingTargets, setUpdatingTargets] = useState(false);

  // Invoice period settings
  const [invoiceFrequencyWeeks, setInvoiceFrequencyWeeks] = useState(2);
  const [invoiceStartDate, setInvoiceStartDate] = useState("");
  const [invoicePeriodSettingId, setInvoicePeriodSettingId] = useState(null);
  const [savingInvoicePeriod, setSavingInvoicePeriod] = useState(false);
  const [newClassType, setNewClassType] = useState({
    name: "",
    duration_minutes: 60,
    location: "",
    amber_min: 5,
    green_min: 10,
    purple_min: 20,
    attendance_required: true,
    color: "#6366f1"
  });

  useEffect(() => {
    loadData();
    base44.auth.me().then(u => {
      base44.entities.Staff.filter({ email: u.email }).then(staff => {
        if (staff.length > 0) setUserRole(staff[0].role);
      });
    }).catch(() => {});
  }, []);

  const loadData = async () => {
    try {
      const [types, settingsList, recurringSettingsList, locSettings, currencySettings, invoicePeriodSettings] = await Promise.all([
        base44.entities.ClassType.list('name'),
        base44.entities.AppSettings.filter({ setting_key: 'timetable_weeks_ahead' }),
        base44.entities.AppSettings.filter({ setting_key: 'timetable_recurring_weeks_ahead' }),
        base44.entities.AppSettings.filter({ setting_key: 'locations' }),
        base44.entities.AppSettings.filter({ setting_key: 'currency_symbol' }),
        base44.entities.AppSettings.filter({ setting_key: 'invoice_period' }),
      ]);
      if (locSettings.length > 0) {
        try { setLocations(JSON.parse(locSettings[0].setting_value) || []); } catch {}
      }
      setClassTypes(types);
      if (settingsList.length > 0) {
        setWeeksAhead(parseInt(settingsList[0].setting_value) || 12);
        setWeeksAheadSettingId(settingsList[0].id);
      }
      if (recurringSettingsList.length > 0) {
        setRecurringWeeksAhead(parseInt(recurringSettingsList[0].setting_value) || 4);
        setRecurringWeeksSettingId(recurringSettingsList[0].id);
      }
      if (currencySettings.length > 0) {
        setCurrencySymbol(currencySettings[0].setting_value || "$");
        setCurrencySettingId(currencySettings[0].id);
      }
      if (invoicePeriodSettings.length > 0) {
        try {
          const v = JSON.parse(invoicePeriodSettings[0].setting_value);
          setInvoiceFrequencyWeeks(v.frequency_weeks || 2);
          setInvoiceStartDate(v.start_date || "");
          setInvoicePeriodSettingId(invoicePeriodSettings[0].id);
        } catch {}
      }
    } catch (e) {
      console.error("Error loading settings:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClassType = async () => {
    if (!newClassType.name) return;
    
    await base44.entities.ClassType.create({
      ...newClassType,
      status: 'active'
    });
    
    setNewClassType({
      name: "",
      duration_minutes: 60,
      location: "",
      amber_min: 5,
      green_min: 10,
      purple_min: 20,
      attendance_required: true,
      color: "#6366f1"
    });
    
    toast.success("Class type created");
    loadData();
  };

  const handleUpdateClassType = async (classType) => {
    await base44.entities.ClassType.update(classType.id, classType);
    toast.success("Class type updated");
    setEditingClassType(null);
    loadData();
  };

  const handleDeleteClassType = async (classTypeId) => {
    await base44.entities.ClassType.update(classTypeId, { status: 'inactive' });
    toast.success("Class type deactivated");
    loadData();
  };

  const handleDuplicateClassType = async (ct) => {
    const { id, created_date, updated_date, created_by, ...rest } = ct;
    await base44.entities.ClassType.create({ ...rest, name: `${ct.name} (Copy)` });
    toast.success("Class type duplicated");
    loadData();
  };

  const handleSaveCurrency = async () => {
    setSavingCurrency(true);
    if (currencySettingId) {
      await base44.entities.AppSettings.update(currencySettingId, { setting_value: currencySymbol });
    } else {
      const created = await base44.entities.AppSettings.create({
        setting_key: 'currency_symbol',
        setting_value: currencySymbol,
        description: 'Currency symbol displayed throughout the app (e.g. $, £, €)'
      });
      setCurrencySettingId(created.id);
    }
    toast.success('Currency setting saved');
    setSavingCurrency(false);
  };

  const handleUpdateTargets = async () => {
    setUpdatingTargets(true);
    try {
      // Re-compute viability_color for all events that have attendance_count recorded
      const allEvents = await base44.entities.TimetableEvent.filter({ attendance_status: 'recorded' }, '-start_datetime', 2000);
      const ctList = await base44.entities.ClassType.list('name');
      const ctMap = {};
      ctList.forEach(ct => { ctMap[ct.id] = ct; ctMap[ct.name] = ct; });

      let updated = 0;
      for (const e of allEvents) {
        if (e.attendance_count == null) continue;
        const ct = ctMap[e.class_type_id] || ctMap[e.class_type_name];
        if (!ct) continue;
        const purple = e.purple_min ?? ct.purple_min ?? 20;
        const green  = e.green_min  ?? ct.green_min  ?? 10;
        const amber  = e.amber_min  ?? ct.amber_min  ?? 5;
        const color = e.attendance_count >= purple ? "purple"
          : e.attendance_count >= green ? "green"
          : e.attendance_count >= amber ? "amber" : "red";
        if (color !== e.viability_color) {
          await base44.entities.TimetableEvent.update(e.id, { viability_color: color });
          updated++;
        }
      }
      toast.success(`Targets updated — ${updated} class record${updated !== 1 ? 's' : ''} recalculated`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update targets');
    } finally {
      setUpdatingTargets(false);
    }
  };

  const handleSaveTimetableSettings = async () => {
    setSavingTimetable(true);
    if (weeksAheadSettingId) {
      await base44.entities.AppSettings.update(weeksAheadSettingId, { setting_value: String(weeksAhead) });
    } else {
      const created = await base44.entities.AppSettings.create({
        setting_key: 'timetable_weeks_ahead',
        setting_value: String(weeksAhead),
        description: 'How many weeks ahead to display in timetable'
      });
      setWeeksAheadSettingId(created.id);
    }
    if (recurringWeeksSettingId) {
      await base44.entities.AppSettings.update(recurringWeeksSettingId, { setting_value: String(recurringWeeksAhead) });
    } else {
      const created = await base44.entities.AppSettings.create({
        setting_key: 'timetable_recurring_weeks_ahead',
        setting_value: String(recurringWeeksAhead),
        description: 'How many weeks ahead to auto-generate recurring class instances'
      });
      setRecurringWeeksSettingId(created.id);
    }
    toast.success('Timetable settings saved');
    setSavingTimetable(false);
  };

  const handleSaveInvoicePeriod = async () => {
    setSavingInvoicePeriod(true);
    const value = JSON.stringify({ frequency_weeks: invoiceFrequencyWeeks, start_date: invoiceStartDate });
    if (invoicePeriodSettingId) {
      await base44.entities.AppSettings.update(invoicePeriodSettingId, { setting_value: value });
    } else {
      const created = await base44.entities.AppSettings.create({
        setting_key: 'invoice_period',
        setting_value: value,
        description: 'Invoice generation frequency and start date'
      });
      setInvoicePeriodSettingId(created.id);
    }
    toast.success('Invoice period settings saved');
    setSavingInvoicePeriod(false);
  };

  // Compute next invoice periods from settings
  const nextInvoicePeriods = (() => {
    if (!invoiceStartDate || !invoiceFrequencyWeeks) return [];
    const start = moment(invoiceStartDate);
    if (!start.isValid()) return [];
    const today = moment();
    const periods = [];
    let cursor = start.clone();
    // Find the current/next period
    while (cursor.isBefore(today)) cursor.add(invoiceFrequencyWeeks, 'weeks');
    for (let i = 0; i < 4; i++) {
      periods.push({
        start: cursor.clone().format("DD MMM YYYY"),
        end: cursor.clone().add(invoiceFrequencyWeeks, 'weeks').subtract(1, 'day').format("DD MMM YYYY"),
        due: cursor.clone().add(invoiceFrequencyWeeks, 'weeks').add(3, 'days').format("DD MMM YYYY"),
      });
      cursor.add(invoiceFrequencyWeeks, 'weeks');
    }
    return periods;
  })();

  const handleEditField = (field, value) => {
    setEditingClassType(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500">Manage app configuration and class types</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="bg-white border w-full flex overflow-x-auto">
          <TabsTrigger value="general" className="gap-1.5 flex-1 min-w-0 text-xs sm:text-sm">
            <SettingsIcon className="w-4 h-4 shrink-0" />
            <span className="truncate">General</span>
          </TabsTrigger>
          <TabsTrigger value="class-types" className="gap-1.5 flex-1 min-w-0 text-xs sm:text-sm">
            <Users className="w-4 h-4 shrink-0" />
            <span className="truncate">Class Types</span>
          </TabsTrigger>
          <TabsTrigger value="thresholds" className="gap-1.5 flex-1 min-w-0 text-xs sm:text-sm">
            <SettingsIcon className="w-4 h-4 shrink-0" />
            <span className="truncate">Viability</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5 flex-1 min-w-0 text-xs sm:text-sm">
            <Bell className="w-4 h-4 shrink-0" />
            <span className="truncate">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="access" className="gap-1.5 flex-1 min-w-0 text-xs sm:text-sm">
            <Shield className="w-4 h-4 shrink-0" />
            <span className="truncate">Access</span>
          </TabsTrigger>
          <TabsTrigger value="timetable" className="gap-1.5 flex-1 min-w-0 text-xs sm:text-sm">
            <SettingsIcon className="w-4 h-4 shrink-0" />
            <span className="truncate">Timetable</span>
          </TabsTrigger>
          <TabsTrigger value="locations" className="gap-1.5 flex-1 min-w-0 text-xs sm:text-sm">
            <MapPin className="w-4 h-4 shrink-0" />
            <span className="truncate">Locations</span>
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5 flex-1 min-w-0 text-xs sm:text-sm">
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate">Invoices</span>
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-1.5 flex-1 min-w-0 text-xs sm:text-sm">
            <Wrench className="w-4 h-4 shrink-0" />
            <span className="truncate">Maintenance</span>
          </TabsTrigger>
        </TabsList>

        {/* ── General Tab ── */}
        <TabsContent value="general" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Currency</CardTitle>
              <CardDescription>Set the currency symbol used throughout the app in financial reports and invoices</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label>Currency Symbol</Label>
                  <div className="flex gap-3 mt-2 flex-wrap">
                    {["$","£","€","¥","₹","A$","C$","CHF"].map(sym => (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => setCurrencySymbol(sym)}
                        className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                          currencySymbol === sym
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {sym}
                      </button>
                    ))}
                    <div className="flex items-center gap-2">
                      <Input
                        value={currencySymbol}
                        onChange={e => setCurrencySymbol(e.target.value)}
                        placeholder="Custom"
                        className="w-24 h-9"
                        maxLength={4}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">Preview: {currencySymbol}100.00</p>
                </div>
              </div>
              <Button onClick={handleSaveCurrency} disabled={savingCurrency} className="gap-2">
                <Save className="w-4 h-4" />
                {savingCurrency ? 'Saving...' : 'Save Currency Setting'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="class-types" className="space-y-6 mt-6">
          {/* Add New Class Type */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add New Class Type</CardTitle>
              <CardDescription>Create a new class type for your timetable</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Class Name *</Label>
                  <Input
                    value={newClassType.name}
                    onChange={(e) => setNewClassType(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., F2 Strength"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Duration (minutes)</Label>
                  <Input
                    type="number"
                    value={newClassType.duration_minutes}
                    onChange={(e) => setNewClassType(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) }))}
                    className="mt-1"
                  />
                </div>
                <div>
                   <Label>Default Location</Label>
                   {locations.length > 0 ? (
                     <Select value={newClassType.location} onValueChange={v => setNewClassType(prev => ({ ...prev, location: v }))}>
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
                     <Input
                       value={newClassType.location}
                       onChange={(e) => setNewClassType(prev => ({ ...prev, location: e.target.value }))}
                       placeholder="e.g., Studio A"
                       className="mt-1"
                     />
                   )}
                 </div>
                <div>
                  <Label>Color</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="color"
                      value={newClassType.color}
                      onChange={(e) => setNewClassType(prev => ({ ...prev, color: e.target.value }))}
                      className="w-14 h-10 p-1"
                    />
                    <Input
                      value={newClassType.color}
                      onChange={(e) => setNewClassType(prev => ({ ...prev, color: e.target.value }))}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Amber Min (attendance)</Label>
                  <Input
                    type="number"
                    value={newClassType.amber_min}
                    onChange={(e) => setNewClassType(prev => ({ ...prev, amber_min: parseInt(e.target.value) }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Green Min</Label>
                  <Input
                    type="number"
                    value={newClassType.green_min}
                    onChange={(e) => setNewClassType(prev => ({ ...prev, green_min: parseInt(e.target.value) }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Purple Min (excellent)</Label>
                  <Input
                    type="number"
                    value={newClassType.purple_min}
                    onChange={(e) => setNewClassType(prev => ({ ...prev, purple_min: parseInt(e.target.value) }))}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <Label>Require Attendance Submission</Label>
                  <p className="text-xs text-slate-500">Instructors must submit attendance after class</p>
                </div>
                <Switch
                  checked={newClassType.attendance_required}
                  onCheckedChange={(v) => setNewClassType(prev => ({ ...prev, attendance_required: v }))}
                />
              </div>

              <BonusRulesEditor
                rules={newClassType.bonus_rules || []}
                onChange={rules => setNewClassType(prev => ({ ...prev, bonus_rules: rules }))}
              />

              <Button onClick={handleSaveClassType} disabled={!newClassType.name} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Add Class Type
              </Button>
            </CardContent>
          </Card>

          {/* Existing Class Types */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Existing Class Types</CardTitle>
              <CardDescription>{classTypes.filter(ct => ct.status === 'active').length} active class types</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {classTypes.filter(ct => ct.status === 'active').map(ct => (
                  <div key={ct.id} className="border rounded-lg p-4">
                    {editingClassType?.id === ct.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Class Name *</Label>
                            <Input value={editingClassType.name} onChange={e => handleEditField('name', e.target.value)} className="mt-1 h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs">Duration (min)</Label>
                            <Input type="number" value={editingClassType.duration_minutes} onChange={e => handleEditField('duration_minutes', parseInt(e.target.value))} className="mt-1 h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs">Location</Label>
                            <Input value={editingClassType.location || ''} onChange={e => handleEditField('location', e.target.value)} className="mt-1 h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs">Color</Label>
                            <div className="flex gap-2 mt-1">
                              <Input type="color" value={editingClassType.color || '#6366f1'} onChange={e => handleEditField('color', e.target.value)} className="w-10 h-8 p-0.5" />
                              <Input value={editingClassType.color || ''} onChange={e => handleEditField('color', e.target.value)} className="flex-1 h-8 text-sm" />
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <Label className="text-xs">Amber Min</Label>
                            <Input type="number" value={editingClassType.amber_min} onChange={e => handleEditField('amber_min', parseInt(e.target.value))} className="mt-1 h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs">Green Min</Label>
                            <Input type="number" value={editingClassType.green_min} onChange={e => handleEditField('green_min', parseInt(e.target.value))} className="mt-1 h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs">Purple Min</Label>
                            <Input type="number" value={editingClassType.purple_min} onChange={e => handleEditField('purple_min', parseInt(e.target.value))} className="mt-1 h-8 text-sm" />
                          </div>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <Label className="text-xs">Require Attendance Submission</Label>
                          <Switch checked={!!editingClassType.attendance_required} onCheckedChange={v => handleEditField('attendance_required', v)} />
                        </div>
                        <BonusRulesEditor
                          rules={editingClassType.bonus_rules || []}
                          onChange={rules => handleEditField('bonus_rules', rules)}
                        />
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" onClick={() => handleUpdateClassType(editingClassType)} className="gap-1.5">
                            <Save className="w-3.5 h-3.5" /> Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingClassType(null)} className="gap-1.5">
                            <X className="w-3.5 h-3.5" /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ct.color || '#6366f1' }} />
                          <Badge variant="secondary" className="bg-amber-100 text-amber-700">{ct.amber_min}+</Badge>
                          <Badge variant="secondary" className="bg-green-100 text-green-700">{ct.green_min}+</Badge>
                          <Badge variant="secondary" className="bg-purple-100 text-purple-700">{ct.purple_min}+</Badge>
                        </div>
                        <p className="font-medium text-slate-900 mb-1">{ct.name}</p>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-slate-500">{ct.duration_minutes} min • {ct.location || 'No location'}</p>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setEditingClassType({ ...ct })} className="text-slate-500 hover:text-slate-700 h-7 w-7 p-0">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDuplicateClassType(ct)} className="text-indigo-500 hover:text-indigo-700 h-7 w-7 p-0">
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteClassType(ct.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-7 w-7 p-0">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="thresholds" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Default Viability Thresholds</CardTitle>
              <CardDescription>
                Set default attendance thresholds for viability scoring
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <Label className="text-red-700">Red (Low)</Label>
                  </div>
                  <p className="text-sm text-red-600">Below amber threshold</p>
                </div>
                
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <Label className="text-amber-700">Amber (Moderate)</Label>
                  </div>
                  <p className="text-sm text-amber-600">Between amber and green thresholds</p>
                </div>
                
                <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <Label className="text-green-700">Green (Good)</Label>
                  </div>
                  <p className="text-sm text-green-600">Between green and purple thresholds</p>
                </div>
                
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500" />
                    <Label className="text-purple-700">Purple (Excellent)</Label>
                  </div>
                  <p className="text-sm text-purple-600">Above purple threshold</p>
                </div>
              </div>

              <p className="text-sm text-slate-500">
                Individual class types can override these defaults. Edit class types above to customize thresholds per class.
              </p>

              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Recalculate Viability from Updated Targets</p>
                    <p className="text-sm text-slate-500 mt-0.5">After changing thresholds on any class type, click this to retroactively recalculate viability colours on all historical attendance records.</p>
                  </div>
                  <Button onClick={handleUpdateTargets} disabled={updatingTargets} variant="outline" className="gap-2 shrink-0">
                    <SettingsIcon className={`w-4 h-4 ${updatingTargets ? 'animate-spin' : ''}`} />
                    {updatingTargets ? 'Recalculating...' : 'Update Viability Data'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notification Settings</CardTitle>
              <CardDescription>Configure when and how notifications are sent</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <Label>Cover Request Notifications</Label>
                  <p className="text-sm text-slate-500">Notify eligible instructors when cover is needed</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <Label>Attendance Reminders</Label>
                  <p className="text-sm text-slate-500">Remind instructors to submit attendance after class</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <Label>Invoice Status Updates</Label>
                  <p className="text-sm text-slate-500">Notify when invoices are approved, rejected, or paid</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <Label>Timetable Changes</Label>
                  <p className="text-sm text-slate-500">Notify instructors when their schedule changes</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access" className="mt-6">
          <RoleAccessControl canEdit={["owner", "admin", "gym_manager"].includes(userRole)} />
        </TabsContent>

        <TabsContent value="timetable" className="mt-6 space-y-6">
          {/* Recurring Event Generation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recurring Event Generation Window</CardTitle>
              <CardDescription>
                Controls how many weeks ahead recurring class instances are auto-generated. Keeping this low reduces data volume and prevents rate limit issues.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                <strong>Data Optimisation:</strong> We recommend 4–8 weeks for recurring events. The rolling generator will automatically extend the window as time progresses, so you never lose future schedule visibility.
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[4, 6, 8].map(w => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setRecurringWeeksAhead(w)}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      recurringWeeksAhead === w
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-2xl font-bold">{w}</p>
                    <p className="text-xs mt-1">{w} weeks</p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400">One-off (non-recurring) events can still be scheduled up to 1 year in advance for future planning — this limit only applies to auto-generated recurring series.</p>
            </CardContent>
          </Card>

          {/* Timetable Display Window */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Timetable Display Window</CardTitle>
              <CardDescription>How far ahead the timetable view loads and displays events</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {[6, 12, 26, 52].map(w => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWeeksAhead(w)}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      weeksAhead === w
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-2xl font-bold">{w}</p>
                    <p className="text-xs mt-1">{w === 52 ? '1 year' : w === 26 ? '6 months' : w === 12 ? '3 months' : '6 weeks'}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSaveTimetableSettings} disabled={savingTimetable} className="gap-2">
            <Save className="w-4 h-4" />
            {savingTimetable ? 'Saving...' : 'Save Timetable Settings'}
          </Button>
        </TabsContent>

        <TabsContent value="locations" className="mt-6">
          <LocationSettings />
        </TabsContent>

        <TabsContent value="invoices" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Calendar className="w-5 h-5 text-indigo-600" /> Invoice Period Settings</CardTitle>
              <CardDescription>Define how often invoice periods run and the reference start date. Instructors generate invoices manually aligned to these periods.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Invoice Frequency</Label>
                  <p className="text-xs text-slate-400 mb-2">How many weeks per invoice period</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 4, 8].map(w => (
                      <button key={w} type="button" onClick={() => setInvoiceFrequencyWeeks(w)}
                        className={`p-3 rounded-xl border-2 text-center transition-all ${invoiceFrequencyWeeks === w ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                        <p className="text-xl font-bold">{w}</p>
                        <p className="text-xs mt-0.5">{w === 1 ? 'weekly' : w === 2 ? 'fortnightly' : w === 4 ? 'monthly' : '8-week'}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Period Start Date</Label>
                  <p className="text-xs text-slate-400 mb-2">The reference date periods are calculated from</p>
                  <Input type="date" value={invoiceStartDate} onChange={e => setInvoiceStartDate(e.target.value)} className="mt-1" />
                  {invoiceStartDate && (
                    <p className="text-xs text-indigo-600 mt-2">Periods run every <strong>{invoiceFrequencyWeeks} week{invoiceFrequencyWeeks > 1 ? 's' : ''}</strong> from <strong>{moment(invoiceStartDate).format("DD MMM YYYY")}</strong></p>
                  )}
                </div>
              </div>

              {nextInvoicePeriods.length > 0 && (
                <div>
                  <Label className="text-sm font-medium text-slate-700">Upcoming Invoice Periods</Label>
                  <div className="mt-2 space-y-2">
                    {nextInvoicePeriods.map((p, i) => (
                      <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${i === 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'}`}>
                        <div>
                          <span className={`text-sm font-medium ${i === 0 ? 'text-indigo-700' : 'text-slate-700'}`}>
                            {i === 0 ? '→ Next: ' : ''}{p.start} – {p.end}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">Due by {p.due}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 space-y-2">
                <p className="font-semibold">📋 Invoice Workflow</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-600">
                  <li>Invoice period ends → Instructor generates & submits invoice</li>
                  <li>Gym Manager is notified & reviews (flagged edits are highlighted)</li>
                  <li>Gym Manager approves → Payroll is notified</li>
                  <li>Payroll marks as Paid → Instructor receives receipt notification</li>
                  <li>All paid amounts feed into Financial Reports automatically</li>
                </ol>
              </div>

              <Button onClick={handleSaveInvoicePeriod} disabled={savingInvoicePeriod || !invoiceStartDate} className="gap-2">
                <Save className="w-4 h-4" />
                {savingInvoicePeriod ? 'Saving...' : 'Save Invoice Period Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="mt-6">
          <MaintenancePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}