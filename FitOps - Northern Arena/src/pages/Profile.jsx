import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import StatusBadge from "@/components/ui/StatusBadge";
import { User, Mail, Phone, Calendar, Save, Clock, Star } from "lucide-react";
import InvoiceSettingsTab from "@/components/profile/InvoiceSettingsTab";

const TIME_BANDS = ["morning", "lunch", "afternoon", "evening"];
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export default function Profile() {
  const [user, setUser] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [myEvents, setMyEvents] = useState([]);
  const [myInvoices, setMyInvoices] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
      
      const staffList = await base44.entities.Staff.filter({ email: userData.email });
      if (staffList.length > 0) {
        const profile = staffList[0];
        setStaffProfile(profile);
        
        // Load my classes (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const [events, invoices] = await Promise.all([
          base44.entities.TimetableEvent.filter({
            assigned_instructor_id: profile.id,
            start_datetime: { $gte: thirtyDaysAgo.toISOString() }
          }, '-start_datetime', 50),
          base44.entities.Invoice.filter({
            instructor_id: profile.id
          }, '-created_date', 10)
        ]);
        
        setMyEvents(events);
        setMyInvoices(invoices);
      }
    } catch (e) {
      console.error("Error loading profile:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleAvailabilityChange = (day, timeBand, checked) => {
    const current = staffProfile.availability_preferences || {};
    const dayPrefs = current[day] || [];
    
    let newDayPrefs;
    if (checked) {
      newDayPrefs = [...dayPrefs, timeBand];
    } else {
      newDayPrefs = dayPrefs.filter(t => t !== timeBand);
    }
    
    setStaffProfile(prev => ({
      ...prev,
      availability_preferences: {
        ...prev.availability_preferences,
        [day]: newDayPrefs
      }
    }));
  };

  const handleSaveAvailability = async () => {
    setSaving(true);
    try {
      await base44.entities.Staff.update(staffProfile.id, {
        availability_preferences: staffProfile.availability_preferences
      });
      toast.success("Availability updated");
    } catch (e) {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePhone = async () => {
    setSaving(true);
    try {
      await base44.entities.Staff.update(staffProfile.id, {
        phone: staffProfile.phone
      });
      toast.success("Phone updated");
    } catch (e) {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Calculate stats
  const completedClasses = myEvents.filter(e => e.status === 'completed').length;
  const avgAttendance = myEvents
    .filter(e => e.attendance_count !== null && e.attendance_count !== undefined)
    .reduce((acc, e, _, arr) => acc + e.attendance_count / arr.length, 0);
  const totalEarnings = myInvoices
    .filter(inv => inv.status === 'paid')
    .reduce((acc, inv) => acc + (inv.total_amount || 0), 0);

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Profile Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-3xl">
              {user?.full_name?.charAt(0) || user?.email?.charAt(0) || "?"}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-900">{user?.full_name || staffProfile?.name}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <Badge variant="secondary" className="capitalize">
                  {staffProfile?.role?.replace(/_/g, ' ') || 'User'}
                </Badge>
                <StatusBadge status={staffProfile?.status || 'active'} />
              </div>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  {user?.email}
                </span>
                {staffProfile?.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-4 h-4" />
                    {staffProfile.phone}
                  </span>
                )}
              </div>
            </div>
            {staffProfile?.cover_reliability_score !== undefined && (
              <div className="text-center p-4 bg-amber-50 rounded-xl">
                <div className="flex items-center justify-center gap-1 text-amber-500">
                  <Star className="w-5 h-5 fill-current" />
                  <span className="text-2xl font-bold">{staffProfile.cover_reliability_score}%</span>
                </div>
                <p className="text-xs text-amber-600">Reliability Score</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {staffProfile?.role === 'instructor' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <Calendar className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
              <p className="text-3xl font-bold text-slate-900">{completedClasses}</p>
              <p className="text-sm text-slate-500">Classes (30 days)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <User className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-3xl font-bold text-slate-900">{avgAttendance.toFixed(1)}</p>
              <p className="text-sm text-slate-500">Avg Attendance</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <span className="text-3xl text-indigo-500 font-bold">$</span>
              <p className="text-3xl font-bold text-slate-900 inline">{totalEarnings.toFixed(0)}</p>
              <p className="text-sm text-slate-500">Total Paid</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="contact">
        <TabsList className="bg-white border flex-wrap">
          <TabsTrigger value="contact">Contact Info</TabsTrigger>
          {staffProfile?.role === 'instructor' && (
            <TabsTrigger value="availability">Availability</TabsTrigger>
          )}
          <TabsTrigger value="qualifications">Qualifications</TabsTrigger>
          {staffProfile?.role === 'instructor' && (
            <TabsTrigger value="invoice">Invoice Settings</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="contact" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input value={user?.email || ""} disabled className="mt-1 bg-slate-50" />
                <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
              </div>
              <div>
                <Label>Phone Number</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={staffProfile?.phone || ""}
                    onChange={(e) => setStaffProfile(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+1 (555) 000-0000"
                  />
                  <Button onClick={handleUpdatePhone} disabled={saving}>
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {staffProfile?.role === 'instructor' && (
          <TabsContent value="availability" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Availability Preferences</CardTitle>
                <CardDescription>
                  Set your preferred availability for cover requests and scheduling
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left py-2 pr-4"></th>
                        {TIME_BANDS.map(band => (
                          <th key={band} className="text-center px-3 py-2 capitalize">{band}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map(day => (
                        <tr key={day} className="border-t border-slate-100">
                          <td className="py-4 pr-4 font-medium capitalize">{day}</td>
                          {TIME_BANDS.map(band => {
                            const isAvailable = staffProfile?.availability_preferences?.[day]?.includes(band);
                            return (
                              <td key={band} className="text-center px-3 py-4">
                                <Checkbox
                                  checked={isAvailable}
                                  onCheckedChange={(checked) => handleAvailabilityChange(day, band, checked)}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button onClick={handleSaveAvailability} disabled={saving} className="mt-4 w-full">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Availability"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="qualifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Qualifications</CardTitle>
              <CardDescription>Your certifications and credentials</CardDescription>
            </CardHeader>
            <CardContent>
              {staffProfile?.qualifications?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {staffProfile.qualifications.map((q, i) => (
                    <Badge key={i} variant="secondary" className="text-sm py-1 px-3">
                      {q}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500">No qualifications added. Contact an admin to update.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {staffProfile?.role === 'instructor' && (
          <TabsContent value="invoice" className="mt-6">
            <InvoiceSettingsTab
              staffProfile={staffProfile}
              onUpdate={setStaffProfile}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}