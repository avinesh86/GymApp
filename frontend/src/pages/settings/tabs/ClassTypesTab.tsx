import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { listClassTypes, createClassType, updateClassType, deleteClassType } from '../../../api/timetable'
import { listSites } from '../../../api/settings'
import type { ClassType } from '../../../types'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { PageSpinner } from '../../../components/ui/Spinner'

function ClassTypeFormModal({
  isOpen,
  onClose,
  initial,
}: {
  isOpen: boolean
  onClose: () => void
  initial?: ClassType
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [duration, setDuration] = useState(String(initial?.duration_minutes ?? 60))
  const [defaultLocation, setDefaultLocation] = useState(initial?.default_location ?? '')
  const [color, setColor] = useState(initial?.color ?? '#06b6d4')

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: listSites,
  })

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      initial
        ? updateClassType(initial.id, { name, description, duration_minutes: Number(duration), default_location: defaultLocation, color })
        : createClassType({ name, description, duration_minutes: Number(duration), default_location: defaultLocation, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-types'] })
      toast.success(initial ? 'Class type updated' : 'Class type created')
      onClose()
    },
    onError: () => toast.error('Failed to save class type'),
  })

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initial ? 'Edit Class Type' : 'Add Class Type'}
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save()} isLoading={isPending}>
            {initial ? 'Save Changes' : 'Create'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>
        <Input label="Default Duration (min)" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
        <div className="flex flex-col gap-1">
          <label htmlFor="class-type-color" className="text-sm font-medium text-gray-700">Colour</label>
          <div className="flex items-center gap-3">
            <input
              id="class-type-color"
              type="color"
              aria-label="Class colour"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 rounded border border-gray-300 cursor-pointer p-0.5"
            />
            <span className="text-sm text-gray-500 tabular-nums">{color}</span>
          </div>
        </div>
        <Select
          label="Default Location"
          value={defaultLocation}
          onChange={(e) => setDefaultLocation(e.target.value)}
          options={sites.map((site) => ({ value: site.name, label: site.name }))}
          placeholder="No default location"
        />
      </div>
    </Modal>
  )
}

export function ClassTypesTab() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<ClassType | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<ClassType | null>(null)

  const { data: classTypes = [], isLoading } = useQuery({
    queryKey: ['class-types'],
    queryFn: listClassTypes,
  })

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: (id: number) => deleteClassType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-types'] })
      toast.success('Class type deleted')
      setDeleteTarget(null)
    },
    onError: () => toast.error('Failed to delete class type'),
  })

  if (isLoading) return <PageSpinner />

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{classTypes.length} class types</p>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditTarget(undefined); setShowForm(true) }}>
          Add Class Type
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {classTypes.map((ct, index) => (
          <div
            key={ct.id}
            className={['flex items-center justify-between px-4 py-3', index < classTypes.length - 1 ? 'border-b border-gray-100' : ''].join(' ')}
          >
            <div className="flex items-center gap-3">
              <span
                className="h-4 w-4 rounded-full shrink-0 border border-gray-200"
                style={{ backgroundColor: ct.color }}
                data-testid="class-type-swatch"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{ct.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {ct.duration_minutes}min{ct.default_location ? ` · ${ct.default_location}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setEditTarget(ct); setShowForm(true) }}
                className="p-1.5 text-gray-400 hover:text-cyan-600 transition-colors rounded-lg hover:bg-cyan-50"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setDeleteTarget(ct)}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {classTypes.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-10">No class types yet</p>
        )}
      </div>

      <ClassTypeFormModal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditTarget(undefined) }}
        initial={editTarget}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove(deleteTarget.id)}
        title="Delete Class Type"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        isLoading={isDeleting}
      />
    </div>
  )
}
