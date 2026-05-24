import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Edit2 } from 'lucide-react'
import { listUsers, inviteUser, updateUser, deactivateUser } from '../../../api/settings'
import type { User } from '../../../types'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Table } from '../../../components/ui/Table'
import { PageSpinner } from '../../../components/ui/Spinner'

const ROLE_OPTIONS = [
  { value: 'instructor',        label: 'Instructor' },
  { value: 'team_leader',       label: 'Team Leader' },
  { value: 'gym_manager',       label: 'Gym Manager' },
  { value: 'payroll',           label: 'Payroll' },
  { value: 'admin',             label: 'Admin' },
  { value: 'class_count_admin', label: 'Class Count Admin' },
]

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', gym_manager: 'Gym Manager',
  payroll: 'Payroll', team_leader: 'Team Leader',
  instructor: 'Instructor', class_count_admin: 'Class Count Admin',
}

export function AccessTab() {
  const queryClient = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFirst, setInviteFirst] = useState('')
  const [inviteLast, setInviteLast] = useState('')
  const [inviteRole, setInviteRole] = useState('instructor')
  const [editRole, setEditRole] = useState('instructor')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
  })

  const { mutate: invite, isPending: isInviting } = useMutation({
    mutationFn: () => inviteUser({ email: inviteEmail, first_name: inviteFirst, last_name: inviteLast, role: inviteRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User invited')
      setShowInvite(false)
      setInviteEmail('')
      setInviteFirst('')
      setInviteLast('')
    },
    onError: () => toast.error('Failed to invite user'),
  })

  const { mutate: changeRole, isPending: isUpdating } = useMutation({
    mutationFn: () => updateUser(editUser!.id, { role: editRole as never }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Role updated')
      setEditUser(null)
    },
    onError: () => toast.error('Failed to update role'),
  })

  const { mutate: deactivate } = useMutation({
    mutationFn: (id: number) => deactivateUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User deactivated')
    },
    onError: () => toast.error('Failed to deactivate user'),
  })

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (user: User) => (
        <span className="font-medium text-gray-900">
          {user.first_name} {user.last_name}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (user: User) => <span className="text-gray-600">{user.email}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      render: (user: User) => (
        <Badge variant="blue">{ROLE_LABELS[user.role] ?? user.role}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (user: User) => (
        <Badge variant={user.is_active ? 'green' : 'grey'} dot>
          {user.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (user: User) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setEditUser(user); setEditRole(user.role) }}
            className="p-1.5 text-gray-400 hover:text-cyan-600 rounded-lg hover:bg-cyan-50 transition-colors"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          {user.is_active && user.role !== 'owner' && (
            <button
              onClick={() => deactivate(user.id)}
              className="text-xs text-red-500 hover:underline px-2"
            >
              Deactivate
            </button>
          )}
        </div>
      ),
    },
  ]

  if (isLoading) return <PageSpinner />

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowInvite(true)}>
          Invite User
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <Table columns={columns} data={users} keyExtractor={(u) => u.id} emptyMessage="No users found" />
      </div>

      {/* Invite modal */}
      <Modal
        isOpen={showInvite}
        onClose={() => setShowInvite(false)}
        title="Invite User"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button onClick={() => invite()} isLoading={isInviting}>Send Invite</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" value={inviteFirst} onChange={(e) => setInviteFirst(e.target.value)} required />
            <Input label="Last Name" value={inviteLast} onChange={(e) => setInviteLast(e.target.value)} required />
          </div>
          <Input label="Email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
          <Select label="Role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} options={ROLE_OPTIONS} />
        </div>
      </Modal>

      {/* Edit role modal */}
      <Modal
        isOpen={!!editUser}
        onClose={() => setEditUser(null)}
        title="Edit User Role"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={() => changeRole()} isLoading={isUpdating}>Save</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-600">
            Updating role for <strong>{editUser?.first_name} {editUser?.last_name}</strong>
          </p>
          <Select
            label="Role"
            value={editRole}
            onChange={(e) => setEditRole(e.target.value)}
            options={ROLE_OPTIONS}
          />
        </div>
      </Modal>
    </div>
  )
}
