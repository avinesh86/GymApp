import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { acceptCoverByCode } from '../../api/cover'

type PageState = 'loading' | 'success' | 'already_taken' | 'error'

export function AcceptCoverPage() {
  const { code } = useParams<{ code: string }>()
  const [state, setState] = useState<PageState>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!code) {
      setState('error')
      setErrorMessage('No accept code found in the link.')
      return
    }

    acceptCoverByCode(code)
      .then(() => setState('success'))
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? ''

        if (status === 404 || status === 409) {
          setState('already_taken')
        } else {
          setState('error')
          setErrorMessage(detail || 'Something went wrong. Please try again.')
        }
      })
  }, [code])

  return (
    <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#0A0D14] px-8 py-6">
          <span className="text-cyan-400 font-bold text-xl tracking-tight">FitOps</span>
          <p className="text-white/60 text-sm mt-1">Cover Request Response</p>
        </div>

        {/* Body */}
        <div className="px-8 py-8 text-center">
          {state === 'loading' && (
            <>
              <div className="w-12 h-12 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin mx-auto mb-4" />
              <p className="text-gray-600 text-sm">Confirming your cover acceptance…</p>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">You're confirmed!</h2>
              <p className="text-gray-500 text-sm mb-6">
                You've successfully accepted the cover slot. You'll receive a confirmation shortly.
              </p>
              <Link
                to="/login"
                className="inline-block bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
              >
                Go to FitOps
              </Link>
            </>
          )}

          {state === 'already_taken' && (
            <>
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Slot already filled</h2>
              <p className="text-gray-500 text-sm mb-6">
                Another instructor accepted this cover before you. No action needed.
              </p>
              <Link
                to="/login"
                className="inline-block bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
              >
                Go to FitOps
              </Link>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
              <p className="text-gray-500 text-sm mb-6">{errorMessage}</p>
              <Link
                to="/login"
                className="inline-block bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
              >
                Go to FitOps
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
