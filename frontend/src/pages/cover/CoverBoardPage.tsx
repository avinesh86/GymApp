import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, CheckCircle, X, XCircle, AlertTriangle } from 'lucide-react'
import { listCoverRequests, acceptCoverOffer, cancelCoverRequest } from '../../api/cover'
import type { CoverRequest, CoverOffer } from '../../types'
import { CoverRequestCard } from './CoverRequestCard'
import { CreateCoverRequestModal } from './CreateCoverRequestModal'
import { PageHeader } from '../../components/shared/PageHeader'
import { PageSpinner } from '../../components/ui/Spinner'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { RoleGuard } from '../../components/shared/RoleGuard'
import { EmptyState } from '../../components/ui/EmptyState'
import { RefreshCcw } from 'lucide-react'

export function CoverBoardPage() {
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<CoverRequest | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState('')

  // Cancel flow state
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [cancellationReason, setCancellationReason] = useState('')

  const { data: allRequests = [], isLoading } = useQuery({
    queryKey: ['cover-requests', { status: statusFilter, urgency: urgencyFilter }],
    queryFn: () => listCoverRequests({ status: statusFilter || undefined, urgency: urgencyFilter || undefined }),
  })

  const { mutate: acceptOffer, isPending: isAccepting } = useMutation({
    mutationFn: ({ requestId, offerId }: { requestId: number; offerId: number }) =>
      acceptCoverOffer(requestId, offerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cover-requests'] })
      toast.success('Offer accepted')
      setSelectedRequest(null)
    },
    onError: () => toast.error('Failed to accept offer'),
  })

  const { mutate: cancelRequest, isPending: isCancelling } = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: number; reason: string }) =>
      cancelCoverRequest(requestId, reason),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['cover-requests'] })
      toast.success('Cover request cancelled')
      setSelectedRequest(updated)
      setShowCancelForm(false)
      setCancellationReason('')
    },
    onError: () => toast.error('Failed to cancel cover request'),
  })

  const openRequests = allRequests.filter((r) => ['open', 'offered'].includes(r.status))
  const resolvedRequests = allRequests.filter((r) => ['accepted', 'cancelled'].includes(r.status))

  if (isLoading) return <PageSpinner />

  return (
    <div>
      <PageHeader
        title="Cover Board"
        subtitle={`${openRequests.length} open request${openRequests.length !== 1 ? 's' : ''}`}
        actions={
          <RoleGuard permission="cover">
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowCreateModal(true)}>
              Create Cover Request
            </Button>
          </RoleGuard>
        }
      />

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="offered">Offered</option>
          <option value="accepted">Accepted</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={urgencyFilter}
          onChange={(e) => setUrgencyFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="">All Urgency</option>
          <option value="low">Low</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {/* Open requests */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Open Requests</h2>
        {openRequests.length === 0 ? (
          <EmptyState
            icon={<RefreshCcw className="h-10 w-10" />}
            title="No open cover requests"
            description="All classes are covered. Great work!"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {openRequests.map((request) => (
              <CoverRequestCard
                key={request.id}
                request={request}
                onViewDetails={setSelectedRequest}
              />
            ))}
          </div>
        )}
      </section>

      {/* Resolved requests */}
      {resolvedRequests.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Resolved Requests</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {resolvedRequests.map((request) => (
              <CoverRequestCard
                key={request.id}
                request={request}
                onViewDetails={setSelectedRequest}
                muted
              />
            ))}
          </div>
        </section>
      )}

      {/* Detail modal */}
      {selectedRequest && (
        <Modal
          isOpen={!!selectedRequest}
          onClose={() => {
            setSelectedRequest(null)
            setShowCancelForm(false)
            setCancellationReason('')
          }}
          title="Cover Request Details"
          size="md"
          footer={
            // Cancel footer — always visible, only for open/offered requests
            ['open', 'offered'].includes(selectedRequest.status) ? (
              !showCancelForm ? (
                <button
                  onClick={() => setShowCancelForm(true)}
                  className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 transition-colors font-medium"
                >
                  <XCircle className="h-4 w-4" />
                  Cancel this request
                </button>
              ) : (
                <div className="flex flex-col gap-3 w-full">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-sm font-medium text-gray-800">
                      Why are you cancelling this request?
                    </p>
                  </div>
                  <textarea
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    placeholder="e.g. Class cancelled, original instructor available, venue issue..."
                    rows={3}
                    autoFocus
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowCancelForm(false)
                        setCancellationReason('')
                      }}
                      className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 transition-colors"
                    >
                      Go back
                    </button>
                    <button
                      onClick={() =>
                        cancelRequest({
                          requestId: selectedRequest.id,
                          reason: cancellationReason,
                        })
                      }
                      disabled={!cancellationReason.trim() || isCancelling}
                      className="flex items-center gap-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 px-4 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {isCancelling ? (
                        <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      Confirm cancellation
                    </button>
                  </div>
                </div>
              )
            ) : undefined
          }
        >
          <div className="flex flex-col gap-4">
            {/* Offers list */}
            <div>
              <p className="text-sm font-medium text-gray-500">Offers</p>
              {selectedRequest.offers.length === 0 ? (
                <p className="text-sm text-gray-400 mt-2">No offers yet</p>
              ) : (
                <ul className="divide-y divide-gray-100 mt-2">
                  {selectedRequest.offers.map((offer: CoverOffer) => (
                    <li key={offer.id} className="flex items-center justify-between py-2">
                      <span className="text-sm text-gray-800">{offer.instructor_name}</span>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            offer.status === 'accepted'
                              ? 'green'
                              : offer.status === 'declined'
                              ? 'red'
                              : 'grey'
                          }
                        >
                          {offer.status}
                        </Badge>
                        {offer.status === 'pending' && selectedRequest.status === 'offered' && (
                          <Button
                            size="sm"
                            leftIcon={<CheckCircle className="h-3.5 w-3.5" />}
                            onClick={() =>
                              acceptOffer({
                                requestId: selectedRequest.id,
                                offerId: offer.id,
                              })
                            }
                            isLoading={isAccepting}
                          >
                            Accept
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Absence notes */}
            {selectedRequest.notes && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-700">{selectedRequest.notes}</p>
              </div>
            )}

            {/* Cancellation audit — shown when already cancelled */}
            {selectedRequest.status === 'cancelled' && selectedRequest.cancellation_reason && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 flex gap-2">
                <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-red-600 mb-0.5">
                    Cancelled{selectedRequest.cancelled_by_name ? ` by ${selectedRequest.cancelled_by_name}` : ''}
                  </p>
                  <p className="text-sm text-red-700">{selectedRequest.cancellation_reason}</p>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      <CreateCoverRequestModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  )
}
