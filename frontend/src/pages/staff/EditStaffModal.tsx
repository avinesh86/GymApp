import React, { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { updateStaff } from '../../api/staff'
import type { StaffMember } from '../../types'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'

const ROLE_OPTIONS = [
  { value: 'instructor',        label: 'Instructor' },
  { value: 'team_leader',       label: 'Team Leader' },
  { value: 'gym_manager',       label: 'Gym Manager' },
  { value: 'payroll',           label: 'Payroll' },
  { value: 'admin',             label: 'Admin' },
  { value: 'class_count_admin', label: 'Class Count Admin' },
]

interface EditStaffModalProps {
  staff: StaffMember | null
  onClose: () => void
}

export function EditStaffModal({ staff, onClose }: EditStaffModalProps) {
  const queryClient = useQueryClient()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('instructor')

  useEffect(() => {
    if (staff) {
      setFirstName(staff.first_name)
      setLastName(staff.last_name)
      setEmail(staff.email)
      setPhone(staff.phone)
      setRole(staff.role)
    }
  }, [staff])

  const { mutate: editStaff, isPending } = useMutation({
    mutationFn: (data: Partial<StaffMember>) => updateStaff(staff!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      toast.success('Staff member updated')
      onClose()
    },
    onError: () => toast.error('Failed to update staff member'),
  })

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    editStaff({ first_name: firstName, last_name: lastName, email, phone, role: role as never })
  }

  return (
    <Modal
      isOpen={!!staff}
      onClose={onClose}
      title="Edit Staff Member"
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-staff-form" isLoading={isPending}>
            Save Changes
          </Button>
        </div>
      }
    >
      <form id="edit-staff-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <Input
            label="Last Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Select
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          options={ROLE_OPTIONS}
          required
        />
      </form>
    </Modal>
  )
}
