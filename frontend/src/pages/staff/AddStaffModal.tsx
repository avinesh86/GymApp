import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { createStaff, createPayRate, createCapability } from '../../api/staff'
import { listClassTypes } from '../../api/timetable'
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
  const [status, setStatus]       = useState<'active' | 'inactive'>('active')
  const [payRate, setPayRate]     = useState('')
  const [classTypeIds, setClassTypeIds] = useState<Set<number>>(new Set())

  const { data: classTypes = [] } = useQuery({
    queryKey: ['class-types'],
    queryFn: listClassTypes,
  })

  function toggleClassType(id: number) {
    setClassTypeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const { mutate: addStaff, isPending } = useMutation({
    mutationFn: createStaff,
    onSuccess: async (created) => {
      // Optionally create an initial pay rate if provided
      if (payRate && Number(payRate) > 0) {
        try {
          await createPayRate(created.id, {
            amount: payRate,
            rate_type: 'per_class',
            effective_from: new Date().toISOString().split('T')[0],
          })
        } catch {
          // Non-fatal — staff is created, rate can be added later
          toast('Staff created but pay rate could not be saved', { icon: '⚠️' })
        }
      }
      // Create the selected "classes can teach" capabilities. Non-fatal: the
      // staff member already exists and capabilities can be edited later.
      if (classTypeIds.size > 0) {
        const results = await Promise.allSettled(
          [...classTypeIds].map((id) => createCapability(created.id, { class_type: id })),
        )
        if (results.some((r) => r.status === 'rejected')) {
          toast('Staff created but some class types could not be assigned', { icon: '⚠️' })
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
    setStatus('active')
    setPayRate('')
    setClassTypeIds(new Set())
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    addStaff({
      name: [firstName, lastName].filter(Boolean).join(' '),
      email,
      phone: phone || undefined,
      role: role as never,
      status,
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
          value={status}
          onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
          options={[
            { value: 'active',   label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
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

        {classTypes.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Classes Can Teach
            </legend>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {classTypes.map((ct) => (
                <label key={ct.id} className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={classTypeIds.has(ct.id)}
                    onChange={() => toggleClassType(ct.id)}
                    className="h-4 w-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-400"
                  />
                  {ct.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </form>
    </Modal>
  )
}
