import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import StaffCard from "@/components/staff/StaffCard";
import StaffDetailModal from "@/components/staff/StaffDetailModal";
import AddStaffModal from "@/components/staff/AddStaffModal";
import { Plus, Search, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Staff() {
  const [user, setUser] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [classTypes, setClassTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [payRateFilter, setPayRateFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("default");
  const [classFilter, setClassFilter] = useState("all");
  const [showClassDetail, setShowClassDetail] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [userData, allStaff, types] = await Promise.all([
        base44.auth.me(),
        base44.entities.Staff.list('-created_date', 100),
        base44.entities.ClassType.filter({ status: 'active' })
      ]);
      
      setUser(userData);
      setStaffList(allStaff);
      setClassTypes(types);
      
      const myProfile = allStaff.find(s => s.email === userData.email);
      setStaffProfile(myProfile);
    } catch (e) {
      console.error("Error loading staff:", e);
    } finally {
      setLoading(false);
    }
  };

  const userRole = staffProfile?.role || 'instructor';
  const canEdit = ['owner', 'admin'].includes(userRole);
  const canViewAll = ['owner', 'admin', 'gym_manager', 'team_leader'].includes(userRole);

  // Apply filters
  const filteredStaff = staffList.filter(staff => {
    if (searchQuery && !staff.name?.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !staff.email?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (roleFilter !== 'all' && staff.role !== roleFilter) return false;
    if (statusFilter !== 'all' && staff.status !== statusFilter) return false;
    if (payRateFilter !== 'all' && staff.default_pay_rate_type !== payRateFilter) return false;
    if (availabilityFilter !== 'all') {
      const day = availabilityFilter;
      const avail = staff.availability_preferences?.[day];
      if (!avail || avail.length === 0) return false;
    }
    if (classFilter !== 'all') {
      if (!staff.classes_can_teach?.includes(classFilter)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortOrder === 'az') return (a.name || '').localeCompare(b.name || '');
    if (sortOrder === 'za') return (b.name || '').localeCompare(a.name || '');
    return 0;
  });

  const handleDeleteStaff = async (staffId) => {
    await base44.entities.Staff.delete(staffId);
    loadData();
    setSelectedStaff(null);
  };

  const handleUpdateStaff = async (staffId, updates) => {
    await base44.entities.Staff.update(staffId, updates);
    loadData();
    setSelectedStaff(null);
  };

  const handleAddStaff = async (staffData) => {
    await base44.entities.Staff.create(staffData);
    setShowAddModal(false);
    loadData();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Staff</h1>
          <p className="text-slate-500">{filteredStaff.length} team members</p>
        </div>
        {canEdit && (
          <Button onClick={() => setShowAddModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Staff
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="gym_manager">Gym Manager</SelectItem>
            <SelectItem value="payroll">Payroll</SelectItem>
            <SelectItem value="team_leader">Team Leader</SelectItem>
            <SelectItem value="instructor">Instructor</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          <Select value={payRateFilter} onValueChange={setPayRateFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Pay Rate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pay Rates</SelectItem>
              <SelectItem value="per_class">Per Class</SelectItem>
              <SelectItem value="per_head">Per Head</SelectItem>
              <SelectItem value="blended">Blended</SelectItem>
            </SelectContent>
          </Select>

          <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Available" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Day</SelectItem>
              <SelectItem value="monday">Monday</SelectItem>
              <SelectItem value="tuesday">Tuesday</SelectItem>
              <SelectItem value="wednesday">Wednesday</SelectItem>
              <SelectItem value="thursday">Thursday</SelectItem>
              <SelectItem value="friday">Friday</SelectItem>
              <SelectItem value="saturday">Saturday</SelectItem>
              <SelectItem value="sunday">Sunday</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortOrder} onValueChange={setSortOrder}>
            <SelectTrigger className="w-full md:w-36">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default Order</SelectItem>
              <SelectItem value="az">Name A → Z</SelectItem>
              <SelectItem value="za">Name Z → A</SelectItem>
            </SelectContent>
          </Select>

          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-full md:w-44">
              <SelectValue placeholder="Class type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Class Types</SelectItem>
              {classTypes.map(ct => (
                <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={showClassDetail ? "default" : "outline"}
            onClick={() => setShowClassDetail(v => !v)}
            className="gap-2 whitespace-nowrap"
            title="Toggle class detail on cards"
          >
            <Layers className="w-4 h-4" />
            <span className="hidden sm:inline">Class Detail</span>
          </Button>
        </div>
      </div>

      {/* Staff Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStaff.map(staff => (
          <StaffCard 
            key={staff.id} 
            staff={staff} 
            onClick={setSelectedStaff}
            classTypes={classTypes}
            showClassDetail={showClassDetail}
          />
        ))}
      </div>

      {filteredStaff.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-500">No staff members found</p>
        </div>
      )}

      {/* Staff Detail Modal */}
      {selectedStaff && (
        <StaffDetailModal
          staff={selectedStaff}
          isOpen={!!selectedStaff}
          onClose={() => setSelectedStaff(null)}
          onUpdate={handleUpdateStaff}
          onDelete={canEdit ? handleDeleteStaff : undefined}
          classTypes={classTypes}
          canEdit={canEdit}
          canViewRates={canEdit}
        />
      )}

      {/* Add Staff Modal */}
      {showAddModal && (
        <AddStaffModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddStaff}
          classTypes={classTypes}
        />
      )}
    </div>
  );
}