import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { createStaff, createPayRate } from '../../api/staff'
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

interface AddStaffModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AddStaffModal({ isOpen, onClose }: AddStaffModalProps) {
  const queryClient = useQueryClient()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [email, setEmail]         = useState('')
  const [phone, setPhone]         = useState('')
  const [role, setRole]           = useState('instructor')
  const [isActive, setIsActive]   = useState('true')
  const [payRate, setPayRate]     = useState('')

  const { mutate: addStaff, isPending } = useMutation({
    mutationFn: createStaff,
    onSuccess: async (created) => {
      // Optionally create an initial pay rate if provided
      if (payRate && Number(payRate) > 0) {
        try {
          await createPayRate(created.id, {
            rate_per_hour: payRate,
            effective_from: new Date().toISOString().split('T')[0],
          })
        } catch {
          // Non-fatal — staff is created, rate can be added later
          toast('Staff created but pay rate could not be saved', { icon: '⚠️' })
        }
      }
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      toast.success('Staff member added')
      onClose()
      resetForm()
    },
    onError: () => toast.error('Failed to add staff member'),
  })

  function resetForm() {
    setFirstName('')
    setLastName('')
    setEmail('')
    setPhone('')
    setRole('instructor')
    setIsActive('true')
    setPayRate('')
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    addStaff({
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || undefined,
      role: role as never,
      is_active: isActive === 'true',
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Staff Member"
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-staff-form" isLoading={isPending}>
            Save
          </Button>
        </div>
      }
    >
      <form id="add-staff-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
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

        <Select
          label="Status"
          value={isActive}
          onChange={(e) => setIsActive(e.target.value)}
          options={[
            { value: 'true',  label: 'Active' },
            { value: 'false', label: 'Inactive' },
          ]}
        />

        <Input
          label="Pay Rate ($ per class)"
          type="number"
          min="0"
          step="0.01"
          value={payRate}
          onChange={(e) => setPayRate(e.target.value)}
          placeholder="e.g. 35.00"
        />
      </form>
    </Modal>
  )
}
