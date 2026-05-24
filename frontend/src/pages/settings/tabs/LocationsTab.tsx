import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { listSites, createSite, updateSite, deleteSite } from '../../../api/settings'
import type { Site } from '../../../types'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Badge } from '../../../components/ui/Badge'
import { PageSpinner } from '../../../components/ui/Spinner'

function SiteFormModal({
  isOpen,
  onClose,
  initial,
}: {
  isOpen: boolean
  onClose: () => void
  initial?: Site
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(initial?.name ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      initial
        ? updateSite(initial.id, { name, address })
        : createSite({ name, address, is_active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      toast.success(initial ? 'Location updated' : 'Location added')
      onClose()
    },
    onError: () => toast.error('Failed to save location'),
  })

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initial ? 'Edit Location' : 'Add Location'}
      size="sm"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save()} isLoading={isPending}>
            {initial ? 'Save' : 'Add'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
    </Modal>
  )
}

export function LocationsTab() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Site | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null)

  const { data: sites = [], isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: listSites,
  })

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: (id: number) => deleteSite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      toast.success('Location deleted')
      setDeleteTarget(null)
    },
    onError: () => toast.error('Failed to delete location'),
  })

  if (isLoading) return <PageSpinner />

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{sites.length} locations</p>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditTarget(undefined); setShowForm(true) }}>
          Add Location
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {sites.map((site, index) => (
          <div
            key={site.id}
            className={['flex items-center justify-between px-4 py-3', index < sites.length - 1 ? 'border-b border-gray-100' : ''].join(' ')}
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900">{site.name}</p>
                <Badge variant={site.is_active ? 'green' : 'grey'} dot>
                  {site.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {site.address && <p className="text-xs text-gray-400 mt-0.5">{site.address}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setEditTarget(site); setShowForm(true) }}
                className="p-1.5 text-gray-400 hover:text-cyan-600 rounded-lg hover:bg-cyan-50 transition-colors"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setDeleteTarget(site)}
                className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {sites.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-10">No locations configured</p>
        )}
      </div>

      <SiteFormModal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditTarget(undefined) }}
        initial={editTarget}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove(deleteTarget.id)}
        title="Delete Location"
        message={`Are you sure you want to delete "${deleteTarget?.name}"?`}
        confirmLabel="Delete"
        isLoading={isDeleting}
      />
    </div>
  )
}
