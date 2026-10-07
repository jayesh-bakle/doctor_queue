import { AlertCircle, HeartPulse, LogIn } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '../components/common/Button'
import { LoadingState } from '../components/common/Feedback'
import { useHospital } from '../hooks/useHospital'
import { useStaffAuth } from '../hooks/useStaffAuth'
import { DEMO_CREDENTIALS } from '../lib/datasource/demoDataSource'
import { IS_DEMO_MODE } from '../lib/env'
import { logTechnicalError, toMarathiError } from '../lib/errors'

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-brand-600 focus:outline-none'

/**
 * Staff sign-in.
 *
 * Authentication is Supabase Auth, so no password ever touches this
 * application's own tables (spec §19). In demo mode the form is pre-filled with
 * the single demo account so the system can be shown to the doctor without a
 * backend at all.
 */
export function StaffLoginPage() {
  const { signIn, session, loading } = useStaffAuth()
  const { hospital } = useHospital()
  const navigate = useNavigate()

  const emailId = useId()
  const passwordId = useId()
  const errorId = useId()

  const [email, setEmail] = useState(IS_DEMO_MODE ? DEMO_CREDENTIALS.email : '')
  const [password, setPassword] = useState(IS_DEMO_MODE ? DEMO_CREDENTIALS.password : '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already signed in? Go straight to the queue.
  useEffect(() => {
    if (!loading && session) {
      navigate('/staff/dashboard', { replace: true })
    }
  }, [loading, session, navigate])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)

    try {
      await signIn(email, password)
      navigate('/staff/dashboard', { replace: true })
    } catch (caught) {
      logTechnicalError('StaffLoginPage — signIn', caught)
      setError(toMarathiError(caught))
      setSubmitting(false)
    }
  }

  if (loading) {
    return <LoadingState message="लॉगिन तपासत आहे…" />
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-700 text-white">
            <HeartPulse className="size-7" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-extrabold text-slate-900">
            {hospital?.name ?? 'आपल्या रुग्णालयाचे नाव'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">रिसेप्शन लॉगिन</p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor={emailId} className="text-sm font-semibold text-slate-800">
              ईमेल
            </label>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
              className={INPUT_CLASSES}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={passwordId} className="text-sm font-semibold text-slate-800">
              पासवर्ड
            </label>
            <input
              id={passwordId}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              aria-describedby={error ? errorId : undefined}
              className={INPUT_CLASSES}
            />
          </div>

          {error ? (
            <p
              id={errorId}
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={submitting}
            icon={<LogIn className="size-5" aria-hidden="true" />}
          >
            {submitting ? 'लॉगिन होत आहे…' : 'लॉगिन करा'}
          </Button>

          {IS_DEMO_MODE ? (
            <p className="rounded-xl border border-dashed border-purple-300 bg-purple-50 px-3 py-2.5 text-xs text-purple-900">
              <strong className="font-semibold">डेमो मोड:</strong> {DEMO_CREDENTIALS.email} /{' '}
              {DEMO_CREDENTIALS.password}
            </p>
          ) : null}
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          <Link to="/" className="font-semibold text-brand-700 hover:underline">
            मुख्य पानावर परत जा
          </Link>
        </p>
      </div>
    </div>
  )
}
