import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { login } from '../api/auth'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

function WaveIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 18C5 14 8 10 11 14C14 18 17 10 20 8C23 6 25 10 26 14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M2 22C5 18 8 14 11 18C14 22 17 14 20 12C23 10 25 14 26 18" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
    </svg>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const { login: storeLogin } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await login({ email, password })
      storeLogin({ access: response.access, refresh: response.refresh }, response.user)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Invalid email or password. Please try again.')
      toast.error('Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-[#0A0D14] px-14 py-12">
        <div className="flex items-center gap-3">
          <WaveIcon />
          <span className="text-xl font-bold text-white">Northern Arena</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Your gym.<br />Fully managed.
          </h1>
          <p className="text-sm font-medium tracking-widest text-cyan-400 uppercase">
            Total Fitness · Unlimited Classes · Smart Support
          </p>
        </div>

        <p className="text-xs text-white/30">
          Northern Arena &copy; {new Date().getFullYear()}
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-col items-center justify-center flex-1 bg-white px-6 py-12">
        {/* Mobile logo */}
        <div className="flex items-center gap-2.5 mb-8 lg:hidden">
          <div className="h-10 w-10 rounded-xl bg-[#0A0D14] flex items-center justify-center">
            <WaveIcon />
          </div>
          <span className="text-xl font-bold text-gray-900">Northern Arena</span>
        </div>

        <div className="w-full max-w-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Sign in to your account</h2>
          <p className="text-sm text-gray-500 mb-6">Welcome back. Enter your credentials below.</p>

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

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              isLoading={isLoading}
              className="w-full mt-2"
              size="lg"
            >
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
