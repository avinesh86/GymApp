import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../../api/auth'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'

/** Public page: enter your email to receive a password-reset link. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setIsSending(true)
    try {
      await requestPasswordReset(email)
    } finally {
      // Always show the same confirmation — never reveal whether the email exists.
      setSent(true)
      setIsSending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F2F5] px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8">
        {sent ? (
          <div className="text-center">
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h1>
            <p className="text-sm text-gray-500 mb-6">
              If an account exists for <span className="font-medium">{email}</span>, we've sent a
              link to reset your password.
            </p>
            <Link to="/login" className="text-sm text-cyan-600 hover:text-cyan-700 font-medium">
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-gray-900 mb-1">Reset your password</h1>
            <p className="text-sm text-gray-500 mb-6">
              Enter your email and we'll send you a reset link.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                autoFocus
              />
              <Button type="submit" isLoading={isSending} className="w-full mt-2" size="lg">
                Send reset link
              </Button>
            </form>
            <p className="text-center text-sm text-gray-400 mt-6">
              <Link to="/login" className="text-cyan-600 hover:text-cyan-700 font-medium">
                ← Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
