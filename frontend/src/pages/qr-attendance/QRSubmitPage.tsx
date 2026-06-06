import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getQRTokenInfo, submitQRAttendance, type QRTokenInfo } from '../../api/attendance'

/**
 * Public page the instructor lands on after scanning the attendance QR.
 * Reads ?token=, shows the session, takes a head count, and submits it.
 * No login required — the token is the authorization.
 */
export function QRSubmitPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [info, setInfo] = useState<QRTokenInfo | null>(null)
  const [loadError, setLoadError] = useState('')
  const [count, setCount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) {
      setLoadError('Missing token. Re-scan the QR code.')
      return
    }
    getQRTokenInfo(token)
      .then(setInfo)
      .catch(() => setLoadError('This QR code is invalid or has expired.'))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')
    const n = Number(count)
    if (!Number.isInteger(n) || n < 0) {
      setSubmitError('Enter a valid head count (0 or more).')
      return
    }
    setSubmitting(true)
    try {
      await submitQRAttendance(token, n)
      setDone(true)
    } catch {
      setSubmitError('Could not record attendance. The code may have expired or already been used.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F2F5] px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-6">
        <h1 className="text-lg font-bold text-gray-900 mb-1">Record Attendance</h1>

        {loadError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-4">
            {loadError}
          </p>
        )}

        {!loadError && !info && (
          <p className="text-sm text-gray-400 mt-4">Loading session…</p>
        )}

        {info && !done && (
          <>
            <div className="mt-2 mb-5">
              <p className="text-base font-semibold text-gray-900">{info.class_type_name}</p>
              <p className="text-sm text-gray-500">
                {info.date} · {info.start_time}
                {info.site_name ? ` · ${info.site_name}` : ''}
              </p>
              {info.instructor_name && (
                <p className="text-sm text-gray-500">Instructor: {info.instructor_name}</p>
              )}
            </div>

            {(!info.valid || info.is_used) && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
                {info.is_used
                  ? 'Attendance was already recorded for this session.'
                  : 'This QR code has expired.'}
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <label className="text-sm font-medium text-gray-700">
                Head count
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  disabled={!info.valid || info.is_used}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400 disabled:opacity-50"
                  placeholder="e.g. 12"
                  autoFocus
                />
              </label>

              {submitError && <p className="text-sm text-red-600">{submitError}</p>}

              <button
                type="submit"
                disabled={submitting || !info.valid || info.is_used}
                className="w-full py-2.5 rounded-xl bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-600 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Recording…' : 'Record Attendance'}
              </button>
            </form>
          </>
        )}

        {done && (
          <div className="mt-4 text-center">
            <p className="text-base font-semibold text-green-600">Attendance recorded ✓</p>
            <p className="text-sm text-gray-500 mt-1">
              {count} attendee{count === '1' ? '' : 's'} for {info?.class_type_name}. You can close this page.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
