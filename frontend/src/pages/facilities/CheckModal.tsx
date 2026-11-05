import React, { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { Camera, Check, X } from 'lucide-react'
import { completeChecklistRun, uploadCheckPhoto } from '../../api/facilities'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { RUN_STATUS } from './labels'
import type { ChecklistRun } from '../../types'

interface Answer {
  passed: boolean | null
  note: string
  photo: File | null
}

/**
 * Doing a check: Pass or Fail on every line, a note and optional photo when
 * something fails. A done check opens read-only, showing what was found.
 */
export function CheckModal({ run, onClose }: { run: ChecklistRun | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [answers, setAnswers] = useState<Record<number, Answer>>({})
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!run) return
    setAnswers(Object.fromEntries(run.items.map((i) => [i.id!, { passed: null, note: '', photo: null }])))
    setNotes('')
  }, [run])

  const set = (id: number, patch: Partial<Answer>) =>
    setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }))

  const submit = useMutation({
    mutationFn: async () => {
      const done = await completeChecklistRun(
        run!.id,
        run!.items.map((i) => ({ item: i.id!, passed: !!answers[i.id!].passed, note: answers[i.id!].note })),
        notes
      )
      // Photos go up once the answers exist to attach them to.
      const failedPhotos = run!.items
        .map((i) => ({ item: i.id!, photo: answers[i.id!].photo }))
        .filter((p) => p.photo)
      let photoFailed = false
      for (const p of failedPhotos) {
        const answer = done.answers.find((a) => a.item === p.item)
        if (!answer) continue
        try {
          await uploadCheckPhoto(answer.id, p.photo!)
        } catch {
          photoFailed = true
        }
      }
      return { done, photoFailed }
    },
    onSuccess: ({ done, photoFailed }) => {
      const failed = done.failed_count
      toast.success(
        failed ? `Check done — ${failed} problem${failed > 1 ? 's' : ''} sent to Maintenance` : 'Check done'
      )
      if (photoFailed) toast.error('The check is saved, but a photo could not be uploaded')
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
      onClose()
    },
    onError: () => toast.error('Could not save the check. Try again.'),
  })

  if (!run) return null
  const readOnly = !!run.completed_at || !run.can_complete
  const allAnswered = run.items.every((i) => answers[i.id!]?.passed !== null && answers[i.id!]?.passed !== undefined)

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={run.template_name}
      size="lg"
      footer={
        readOnly ? (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={() => submit.mutate()} isLoading={submit.isPending} disabled={!allAnswered}>
              Finish check
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 mb-4">
        <Badge variant={RUN_STATUS[run.status].variant}>{RUN_STATUS[run.status].label}</Badge>
        <span>
          Due {format(parseISO(run.due_at), 'EEE d MMM, h:mma')}
          {run.site_name && ` · ${run.site_name}`}
        </span>
        {run.completed_at && (
          <span>
            · Done {format(parseISO(run.completed_at), 'EEE d MMM, h:mma')} by {run.completed_by_name}
          </span>
        )}
      </div>

      {readOnly && run.completed_at ? (
        <ul className="flex flex-col gap-2" aria-label="Check results">
          {run.answers.map((a) => (
            <li key={a.id} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-start gap-2">
                {a.passed ? (
                  <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" aria-label="Pass" />
                ) : (
                  <X className="h-4 w-4 text-red-600 mt-0.5 shrink-0" aria-label="Fail" />
                )}
                <div className="min-w-0 text-sm">
                  <p className="text-gray-900">{a.item_text}</p>
                  {a.note && <p className="text-gray-600 mt-0.5">{a.note}</p>}
                  {a.fault && <p className="text-xs text-orange-700 mt-0.5">Sent to Maintenance</p>}
                  {a.photo && (
                    <a href={a.photo} target="_blank" rel="noreferrer">
                      <img src={a.photo} alt={`Photo: ${a.item_text}`} className="mt-2 h-24 rounded border border-gray-200" />
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
          {run.notes && <li className="text-sm text-gray-700">Notes: {run.notes}</li>}
        </ul>
      ) : readOnly ? (
        <p className="text-sm text-gray-500">This check is assigned to another role.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-3" aria-label="Items to check">
            {run.items.map((item) => {
              const a = answers[item.id!] ?? { passed: null, note: '', photo: null }
              return (
                <li key={item.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <p className="flex-1 text-sm text-gray-900">
                      {item.text}
                      {item.equipment_name && <span className="text-gray-500"> · {item.equipment_name}</span>}
                    </p>
                    <div className="flex gap-2" role="group" aria-label={item.text}>
                      <button
                        type="button"
                        aria-pressed={a.passed === true}
                        onClick={() => set(item.id!, { passed: true })}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                          a.passed === true ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-700'
                        }`}
                      >
                        Pass
                      </button>
                      <button
                        type="button"
                        aria-pressed={a.passed === false}
                        onClick={() => set(item.id!, { passed: false })}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                          a.passed === false ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-700'
                        }`}
                      >
                        Fail
                      </button>
                    </div>
                  </div>
                  {a.passed === false && (
                    <div className="mt-3 flex flex-col gap-2">
                      <input
                        aria-label={`What's wrong: ${item.text}`}
                        placeholder="What's wrong?"
                        value={a.note}
                        maxLength={500}
                        onChange={(e) => set(item.id!, { note: e.target.value })}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                      <label className="inline-flex items-center gap-2 text-sm text-cyan-700 cursor-pointer w-fit">
                        <Camera className="h-4 w-4" />
                        {a.photo ? a.photo.name : 'Add a photo (optional)'}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="sr-only"
                          aria-label={`Photo: ${item.text}`}
                          onChange={(e) => set(item.id!, { photo: e.target.files?.[0] ?? null })}
                        />
                      </label>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Notes (optional)</span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <p className="text-xs text-gray-500">Anything marked Fail is sent to Maintenance as a fault.</p>
        </div>
      )}
    </Modal>
  )
}
