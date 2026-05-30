import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import axios from 'axios'
import toast from 'react-hot-toast'
import { signupTenant } from '../../api/signup'
import { useAuth } from '../../hooks/useAuth'
import type { AuthUser } from '../../types'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '')

// ─── Form fields state ────────────────────────────────────────────────────────

interface FormFields {
  business_name: string
  first_name: string
  last_name: string
  email: string
  phone: string
  password: string
}

const INITIAL_FORM: FormFields = {
  business_name: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  password: '',
}

// ─── The actual form (must live inside <Elements>) ────────────────────────────

function SignupForm() {
  const stripe = useStripe()
  const elements = useElements()
  const navigate = useNavigate()
  const { login } = useAuth()

  const [isLoading, setIsLoading] = useState(false)
  const [form, setForm] = useState<FormFields>(INITIAL_FORM)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [cardError, setCardError] = useState<string>('')

  function setField(field: keyof FormFields, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((prev) => ({ ...prev, [field]: '' }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!stripe || !elements) return

    setIsLoading(true)
    setFieldErrors({})
    setCardError('')

    try {
      const cardElement = elements.getElement(CardElement)
      if (!cardElement) throw new Error('Card element not mounted.')

      const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
          name: `${form.first_name} ${form.last_name}`.trim(),
          email: form.email,
        },
      })

      if (stripeError) {
        setCardError(stripeError.message ?? 'Card error')
        return
      }

      const result = await signupTenant({
        ...form,
        payment_method_id: paymentMethod!.id,
      })

      const userResponse = await axios.get<AuthUser>('/api/v1/users/me/', {
        headers: { Authorization: `Bearer ${result.access}` },
      })
      login({ access: result.access, refresh: result.refresh }, userResponse.data)

      toast.success(
        `Welcome to FitOps, ${result.tenant_name}! Your 14-day trial has started.`
      )
      navigate('/settings')
    } catch (error: any) {
      if (error?.response?.data) {
        const data = error.response.data
        if (typeof data === 'object' && !data.detail) {
          setFieldErrors(data)
        } else {
          toast.error(data.detail ?? 'Signup failed. Please try again.')
        }
      } else {
        toast.error('Signup failed. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'
  const errorClass = 'text-xs text-red-500 mt-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Business name */}
      <div>
        <label className={labelClass}>Business Name *</label>
        <input
          value={form.business_name}
          onChange={(e) => setField('business_name', e.target.value)}
          placeholder="Northern Arena"
          className={inputClass}
          required
        />
        {fieldErrors.business_name && (
          <p className={errorClass}>{fieldErrors.business_name}</p>
        )}
      </div>

      {/* Name row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>First Name *</label>
          <input
            value={form.first_name}
            onChange={(e) => setField('first_name', e.target.value)}
            placeholder="Alex"
            className={inputClass}
            required
          />
          {fieldErrors.first_name && (
            <p className={errorClass}>{fieldErrors.first_name}</p>
          )}
        </div>
        <div>
          <label className={labelClass}>Last Name</label>
          <input
            value={form.last_name}
            onChange={(e) => setField('last_name', e.target.value)}
            placeholder="Smith"
            className={inputClass}
          />
        </div>
      </div>

      {/* Email */}
      <div>
        <label className={labelClass}>Email Address *</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setField('email', e.target.value)}
          placeholder="alex@yourgym.com"
          className={inputClass}
          required
        />
        {fieldErrors.email && <p className={errorClass}>{fieldErrors.email}</p>}
      </div>

      {/* Phone (optional) */}
      <div>
        <label className={labelClass}>
          Phone{' '}
          <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setField('phone', e.target.value)}
          placeholder="+64 21 000 0000"
          className={inputClass}
        />
      </div>

      {/* Password */}
      <div>
        <label className={labelClass}>Password *</label>
        <input
          type="password"
          value={form.password}
          onChange={(e) => setField('password', e.target.value)}
          placeholder="Min. 8 characters"
          className={inputClass}
          required
          minLength={8}
        />
        {fieldErrors.password && <p className={errorClass}>{fieldErrors.password}</p>}
      </div>

      {/* Card details */}
      <div>
        <label className={labelClass}>Card Details *</label>
        <div className="rounded-lg border border-gray-300 px-3 py-3 focus-within:ring-2 focus-within:ring-cyan-500 focus-within:border-transparent">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '14px',
                  color: '#111827',
                  '::placeholder': { color: '#9ca3af' },
                },
                invalid: { color: '#ef4444' },
              },
              hidePostalCode: true,
            }}
            onChange={(e) => setCardError(e.error?.message ?? '')}
          />
        </div>
        {cardError && <p className={errorClass}>{cardError}</p>}
        <p className="text-xs text-gray-400 mt-1.5">
          Your card won't be charged until after your 14-day free trial ends.
        </p>
      </div>

      {/* Generic API error */}
      {fieldErrors.detail && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {fieldErrors.detail}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading || !stripe}
        className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {isLoading && (
          <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        )}
        {isLoading ? 'Creating account...' : 'Start 14-day free trial'}
      </button>

      <p className="text-center text-xs text-gray-400">
        By signing up you agree to our Terms of Service and Privacy Policy.
      </p>
    </form>
  )
}

// ─── Branding panel bullet items ──────────────────────────────────────────────

const SELLING_POINTS = [
  '14-day free trial, no commitment',
  'Cancel anytime',
  'Set up in minutes',
]

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export function SignupPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-2/5 bg-gray-900 flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="h-9 w-9 rounded-lg bg-cyan-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">F</span>
            </div>
            <span className="text-white font-bold text-xl">FitOps</span>
          </div>
          <h2 className="text-3xl font-bold text-white leading-tight mb-4">
            Everything your gym needs, in one platform.
          </h2>
          <p className="text-gray-400 text-base">
            Timetables, staff, cover management, invoicing, and attendance — all connected.
          </p>
        </div>
        <div className="space-y-4">
          {SELLING_POINTS.map((item) => (
            <div key={item} className="flex items-center gap-2.5 text-gray-300 text-sm">
              <span className="h-5 w-5 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0">
                <span className="text-cyan-400 text-xs">✓</span>
              </span>
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              Create your gym account
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              Free for 14 days. Card required to start trial.
            </p>

            <Elements stripe={stripePromise}>
              <SignupForm />
            </Elements>

            <p className="text-center text-sm text-gray-500 mt-6">
              Already have an account?{' '}
              <Link
                to="/login"
                className="text-cyan-600 hover:text-cyan-700 font-medium"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
