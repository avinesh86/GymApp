import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { setPasswordWithToken, validateInvite } from '../../api/auth'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'

/**
 * Public page for redeeming an invite or password-reset link
 * (/set-password?uid=…&token=…). Both flows use the same single-use token.
 */
export function SetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const uid = params.get('uid') ?? ''
  const token = params.get('token') ?? ''

  const [checking, setChecking] = useState(true)
  const [valid, setValid] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    validateInvite(uid, token).then((info) => {
      if (!active) return
      setValid(info.valid)
      setEmail(info.email ?? '')
      setChecking(false)
    })
    return () => {
      active = false
    }
  }, [uid, token])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setIsSaving(true)
    try {
      await setPasswordWithToken(uid, token, password)
      setDone(true)
      toast.success('Password set')
    } catch (err) {
      const data = (err as { response?: { data?: { password?: string[]; detail?: string } } })
        ?.response?.data
      if (data?.password?.length) {
        setError(data.password.join(' '))
      } else if (data?.detail) {
        setError(data.detail)
      } else {
        setError('This link is invalid or has expired. Request a new one.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F2F5] px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8">
        {checking ? (
          <p className="text-sm text-gray-500 text-center">Checking your link…</p>
        ) : done ? (
          <div className="text-center">
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Password set ✓</h1>
            <p className="text-sm text-gray-500 mb-6">You can now sign in.</p>
            <Button className="w-full" size="lg" onClick={() => navigate('/login', { replace: true })}>
              Go to sign in
            </Button>
          </div>
        ) : !valid ? (
          <div className="text-center">
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Link expired</h1>
            <p className="text-sm text-gray-500 mb-6">
              This link is invalid or has already been used.
            </p>
            <Link to="/forgot-password" className="text-sm text-cyan-600 hover:text-cyan-700 font-medium">
              Request a new link →
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-gray-900 mb-1">Set your password</h1>
            <p className="text-sm text-gray-500 mb-6">{email}</p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input
                label="New password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                autoFocus
              />
              <Input
                label="Confirm password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <Button type="submit" isLoading={isSaving} className="w-full mt-2" size="lg">
                Set password
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
