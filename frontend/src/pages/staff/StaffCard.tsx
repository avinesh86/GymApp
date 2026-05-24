import React from 'react'
import { Mail, Phone, Star } from 'lucide-react'
import type { StaffMember } from '../../types'
import { Badge } from '../../components/ui/Badge'

const ROLE_VARIANTS: Record<string, 'blue' | 'purple' | 'green' | 'orange' | 'grey' | 'yellow' | 'red'> = {
  owner:            'purple',
  admin:            'blue',
  gym_manager:      'blue',
  payroll:          'green',
  team_leader:      'orange',
  instructor:       'yellow',
  class_count_admin:'grey',
}

const ROLE_LABELS: Record<string, string> = {
  owner:            'Owner',
  admin:            'Admin',
  gym_manager:      'Gym Manager',
  payroll:          'Payroll',
  team_leader:      'Team Leader',
  instructor:       'Instructor',
  class_count_admin:'Class Count Admin',
}

interface StaffCardProps {
  staff: StaffMember
  onClick: (staff: StaffMember) => void
}

export function StaffCard({ staff, onClick }: StaffCardProps) {
  const initials = `${(staff.first_name || staff.name || '?').charAt(0)}${(staff.last_name || '').charAt(0)}`.toUpperCase()
  const fullName = staff.name || `${staff.first_name} ${staff.last_name}`.trim()

  return (
    <div
      onClick={() => onClick(staff)}
      className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow duration-150"
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="h-11 w-11 rounded-full bg-cyan-500 flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-bold">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{fullName}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <Badge
              variant={staff.status === 'active' ? 'green' : 'grey'}
              dot
            >
              {staff.status === 'active' ? 'Active' : staff.status ?? 'Inactive'}
            </Badge>
            <Badge variant={ROLE_VARIANTS[staff.role] ?? 'grey'}>
              {ROLE_LABELS[staff.role] ?? staff.role}
            </Badge>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="flex flex-col gap-1.5 mb-3">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Mail className="h-3.5 w-3.5 text-gray-400" />
          <span className="truncate">{staff.email}</span>
        </div>
        {staff.phone && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Phone className="h-3.5 w-3.5 text-gray-400" />
            <span>{staff.phone}</span>
          </div>
        )}
      </div>

      {/* Reliability score */}
      <div className="flex items-center gap-1.5 border-t border-gray-50 pt-3">
        <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
        <span className="text-sm font-medium text-gray-700">
          {parseFloat(String(staff.reliability_score ?? 0)).toFixed(0)}%
        </span>
        <span className="text-xs text-gray-400">reliability</span>
      </div>
    </div>
  )
}
