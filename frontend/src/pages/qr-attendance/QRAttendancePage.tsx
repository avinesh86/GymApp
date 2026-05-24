import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { QRCodeSVG } from 'qrcode.react'
import { format } from 'date-fns'
import { Info, QrCode } from 'lucide-react'
import { listQRTokens, createQRToken } from '../../api/attendance'
import { listEvents } from '../../api/timetable'
import type { QRToken, TimetableEvent } from '../../types'
import { PageHeader } from '../../components/shared/PageHeader'
import { PageSpinner } from '../../components/ui/Spinner'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { Card } from '../../components/ui/Card'

export function QRAttendancePage() {
  const queryClient = useQueryClient()
  const today = format(new Date(), 'yyyy-MM-dd')
  const [selectedToken, setSelectedToken] = useState<QRToken | null>(null)
  const [generatingFor, setGeneratingFor] = useState<number | null>(null)

  const { data: todaysEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['timetable-events', 'today', today],
    queryFn: () => listEvents({ from: today, to: today }),
  })

  const { data: qrTokens = [], isLoading: tokensLoading } = useQuery({
    queryKey: ['qr-tokens', today],
    queryFn: () => listQRTokens(today),
  })

  const { mutate: generateToken, isPending: isGenerating } = useMutation({
    mutationFn: (eventId: number) => createQRToken(eventId),
    onSuccess: (token) => {
      queryClient.invalidateQueries({ queryKey: ['qr-tokens'] })
      toast.success('QR code generated')
      setSelectedToken(token)
    },
    onError: () => toast.error('Failed to generate QR code'),
  })

  function getTokenForEvent(eventId: number): QRToken | undefined {
    return qrTokens.find((t) => t.event === eventId)
  }

  function handleGenerate(event: TimetableEvent) {
    const existing = getTokenForEvent(event.id)
    if (existing) {
      setSelectedToken(existing)
    } else {
      setGeneratingFor(event.id)
      generateToken(event.id)
    }
  }

  const isLoading = eventsLoading || tokensLoading

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="QR Attendance"
        subtitle={`${format(new Date(), 'EEEE, d MMMM')} · ${todaysEvents.length} class${todaysEvents.length !== 1 ? 'es' : ''} today`}
      />

      {/* How it works */}
      <div className="flex gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
        <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-800">How it works</p>
          <p className="text-sm text-blue-600 mt-0.5">
            Generate a QR code for each class. Instructors scan the code to record attendance
            — no login required. QR codes expire after use.
          </p>
        </div>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : todaysEvents.length === 0 ? (
        <EmptyState
          icon={<QrCode className="h-12 w-12" />}
          title="No classes scheduled for today"
          description="QR codes will appear here for today's scheduled classes"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {todaysEvents.map((event) => {
            const existingToken = getTokenForEvent(event.id)
            const isThisGenerating = isGenerating && generatingFor === event.id

            return (
              <Card key={event.id} className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{event.class_type_name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {event.start_time} – {event.end_time} · {event.site_name}
                  </p>
                  {existingToken && (
                    <p className="text-xs text-green-600 mt-1 font-medium">QR code ready</p>
                  )}
                </div>
                <Button
                  variant={existingToken ? 'secondary' : 'primary'}
                  size="sm"
                  leftIcon={<QrCode className="h-4 w-4" />}
                  onClick={() => handleGenerate(event)}
                  isLoading={isThisGenerating}
                >
                  {existingToken ? 'Show QR' : 'Generate QR'}
                </Button>
              </Card>
            )
          })}
        </div>
      )}

      {/* QR modal */}
      <Modal
        isOpen={!!selectedToken}
        onClose={() => setSelectedToken(null)}
        title="Scan to Record Attendance"
        size="sm"
      >
        {selectedToken && (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white border-2 border-gray-100 rounded-xl p-4">
              <QRCodeSVG
                value={selectedToken.url}
                size={220}
                level="H"
                includeMargin
              />
            </div>
            <p className="text-xs text-gray-400 text-center">
              Show this QR code to the instructor to scan with their phone
            </p>
            <div className="bg-gray-50 rounded-lg px-4 py-2 w-full">
              <p className="text-xs text-gray-500 text-center break-all">{selectedToken.url}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
