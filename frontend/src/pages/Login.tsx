import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { api } from '../api/client'

export default function Login() {
  const { login } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [showForgot, setShowForgot] = useState(false)
  const [forgotId, setForgotId] = useState('')
  const [forgotMsg, setForgotMsg] = useState('')
  const [forgotError, setForgotError] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/')
    } catch {
      setError('Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  const submitForgot = async (e: FormEvent) => {
    e.preventDefault()
    setForgotLoading(true)
    setForgotMsg('')
    setForgotError('')
    try {
      const res = await api.forgotPassword(forgotId.trim())
      setForgotMsg(res.detail)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('503')) {
        setForgotError('SMTP non configurato sul server. Aggiungi le variabili SMTP su Coolify.')
      } else if (msg.includes('422')) {
        setForgotError('Nessuna email configurata per questo account. Aggiungi AUTH_EMAIL_OMAR o AUTH_EMAIL_EMANUEL su Coolify.')
      } else {
        setForgotError('Errore durante l\'invio. Riprova.')
      }
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center px-4">
      <button
        onClick={toggle}
        className="absolute top-5 right-5 p-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14A7 7 0 0012 5z"/>
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
          </svg>
        )}
      </button>

      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-violet-600 mb-6">
            <span className="text-white font-bold text-lg">P</span>
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Phoenix Finance
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Sign in to your dashboard
          </p>
        </div>

        {!showForgot ? (
          <>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700
                    bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50
                    placeholder-zinc-400 dark:placeholder-zinc-500
                    focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
                    transition-colors text-sm"
                  placeholder="omar"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700
                    bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50
                    placeholder-zinc-400 dark:placeholder-zinc-500
                    focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
                    transition-colors text-sm"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-violet-600 hover:bg-violet-700 disabled:opacity-60
                  text-white font-medium rounded-lg transition-colors text-sm"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => { setShowForgot(true); setForgotId('') }}
                className="text-sm text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
              >
                Password dimenticata?
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <form onSubmit={submitForgot} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Username o email
                </label>
                <input
                  type="text"
                  value={forgotId}
                  onChange={e => setForgotId(e.target.value)}
                  autoFocus
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700
                    bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50
                    placeholder-zinc-400 dark:placeholder-zinc-500
                    focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
                    transition-colors text-sm"
                  placeholder="omar oppure tua@email.com"
                />
              </div>

              {forgotMsg && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">{forgotMsg}</p>
              )}
              {forgotError && (
                <p className="text-sm text-red-500 dark:text-red-400">{forgotError}</p>
              )}

              <button
                type="submit"
                disabled={forgotLoading || !forgotId.trim()}
                className="w-full py-2.5 px-4 bg-violet-600 hover:bg-violet-700 disabled:opacity-60
                  text-white font-medium rounded-lg transition-colors text-sm"
              >
                {forgotLoading ? 'Invio…' : 'Invia credenziali via email'}
              </button>
            </form>

            <div className="text-center">
              <button
                onClick={() => { setShowForgot(false); setForgotMsg(''); setForgotError(''); setForgotId('') }}
                className="text-sm text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
              >
                ← Torna al login
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
