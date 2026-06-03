import React, { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Upload, FileText, CheckCircle, XCircle, Download } from 'lucide-react'
import { createImportJob, getImportJob, downloadTemplate } from '../../api/imports'
import type { ImportJob, ImportType } from '../../types'
import { PageHeader } from '../../components/shared/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'

const IMPORT_TYPE_OPTIONS: { value: ImportType; label: string; description: string }[] = [
  {
    value: 'staff',
    label: 'Staff',
    description: 'Import staff members with their details and roles',
  },
  {
    value: 'timetable',
    label: 'Timetable',
    description: 'Import class schedules and event data',
  },
  {
    value: 'attendance',
    label: 'Attendance',
    description: 'Import historical attendance records',
  },
]

// Query keys to invalidate after a successful import so that stale cached
// data (class types, sites, timetable events, staff) is immediately refreshed.
const IMPORT_INVALIDATION_KEYS: Record<string, string[][]> = {
  staff:      [['staff']],
  timetable:  [['timetable-events'], ['class-types'], ['sites']],
  attendance: [['attendance']],
}

function usePollingImportJob(jobId: number | null, importType: string) {
  const [job, setJob] = useState<ImportJob | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const queryClient = useQueryClient()

  React.useEffect(() => {
    if (!jobId) {
      setJob(null)
      return
    }

    async function poll() {
      if (!jobId) return
      try {
        const result = await getImportJob(jobId)
        setJob(result)
        if (result.status === 'complete' || result.status === 'failed') {
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }

          // Invalidate related queries so the UI picks up newly created
          // records without requiring a manual page refresh.
          if (result.status === 'complete') {
            const keys = IMPORT_INVALIDATION_KEYS[importType] ?? []
            keys.forEach((queryKey) =>
              queryClient.invalidateQueries({ queryKey })
            )
          }
        }
      } catch {
        // silently ignore polling errors
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 2000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [jobId, importType, queryClient])

  return job
}

export function CSVImportPage() {
  const [importType, setImportType] = useState<ImportType>('staff')
  const [dragOver, setDragOver] = useState(false)
  const [currentJobId, setCurrentJobId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const job = usePollingImportJob(currentJobId, importType)

  const { mutate: uploadFile, isPending: isUploading } = useMutation({
    mutationFn: (file: File) => createImportJob(importType, file),
    onSuccess: (result) => {
      setCurrentJobId(result.id)
      toast.success('File uploaded, processing...')
    },
    onError: () => toast.error('Failed to upload file'),
  })

  async function handleDownloadTemplate() {
    try {
      const blob = await downloadTemplate(importType)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${importType}-template.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download template')
    }
  }

  function handleFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file')
      return
    }
    setCurrentJobId(null)
    uploadFile(file)
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    setDragOver(false)
    const file = event.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const statusVariant: Record<string, 'blue' | 'green' | 'red' | 'grey'> = {
    pending:    'blue',
    processing: 'blue',
    complete:   'green',
    failed:     'red',
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title="CSV Import" />

      {/* Import type selection */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {IMPORT_TYPE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => { setImportType(option.value); setCurrentJobId(null) }}
            className={[
              'text-left p-4 rounded-xl border-2 transition-colors',
              importType === option.value
                ? 'border-cyan-500 bg-cyan-50'
                : 'border-gray-200 bg-white hover:border-gray-300',
            ].join(' ')}
          >
            <p className={`text-sm font-semibold ${importType === option.value ? 'text-cyan-700' : 'text-gray-900'}`}>
              {option.label}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{option.description}</p>
          </button>
        ))}
      </div>

      {/* Template download */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-600">
          Upload a CSV file to import {importType} data
        </p>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Download className="h-4 w-4" />}
          onClick={handleDownloadTemplate}
        >
          Download Template
        </Button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={[
          'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
          dragOver
            ? 'border-cyan-500 bg-cyan-50'
            : 'border-gray-300 hover:border-gray-400 bg-white',
          isUploading ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <Spinner size="lg" />
            <p className="text-sm text-gray-500">Uploading...</p>
          </div>
        ) : (
          <>
            <Upload className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">
              Drag &amp; drop your CSV file here
            </p>
            <p className="text-xs text-gray-400 mt-1">or click to browse</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
      </div>

      {/* Import job progress */}
      {job && (
        <Card className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Import Progress</h3>
            <Badge variant={statusVariant[job.status] ?? 'grey'}>
              {job.status}
            </Badge>
          </div>

          {(job.status === 'processing' || job.status === 'pending') && (
            <div className="flex items-center gap-3 mb-4">
              <Spinner size="sm" />
              <p className="text-sm text-gray-500">Processing your file...</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{job.rows_total}</p>
              <p className="text-xs text-gray-400">Total Rows</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{job.rows_success}</p>
              <p className="text-xs text-gray-400">Successful</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{job.rows_failed}</p>
              <p className="text-xs text-gray-400">Failed</p>
            </div>
          </div>

          {/* Progress bar */}
          {job.rows_total > 0 && (
            <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
              <div
                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${((job.rows_success + job.rows_failed) / job.rows_total) * 100}%`,
                }}
              />
            </div>
          )}

          {/* Errors */}
          {job.error_log.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-red-600 mb-2">
                {job.error_log.length} error{job.error_log.length !== 1 ? 's' : ''}
              </h4>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-red-100 bg-red-50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-red-100">
                      <th className="px-3 py-2 text-left text-red-700">Row</th>
                      <th className="px-3 py-2 text-left text-red-700">Field</th>
                      <th className="px-3 py-2 text-left text-red-700">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.error_log.map((err, i) => (
                      <tr key={i} className="border-b border-red-50">
                        <td className="px-3 py-1.5 text-red-600">{err.row}</td>
                        <td className="px-3 py-1.5 text-red-600 font-medium">{err.field}</td>
                        <td className="px-3 py-1.5 text-red-600">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {job.status === 'complete' && job.rows_failed === 0 && (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <p className="text-sm font-medium">Import completed successfully</p>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
