import { AlertCircle, HeartPulse, LogIn } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Button } from '../components/common/Button'
import { EmptyState, LoadingState } from '../components/common/Feedback'
import { LanguageSwitcher } from '../components/common/LanguageSwitcher'
import { useHospital } from '../hooks/useHospital'
import { useLanguage } from '../hooks/useLanguage'
import { useStaffAuth } from '../hooks/useStaffAuth'
import { DEMO_CREDENTIALS } from '../lib/datasource/demoDataSource'
import { IS_DEMO_MODE } from '../lib/env'
import { logTechnicalError, toUserMessage } from '../lib/errors'

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
 *
 * With several clinics on one deployment, each clinic shares its own address,
 * `/staff/login/<hospital-id>`. The id in the path is what lets this screen show
 * that clinic's name and address before anyone has signed in — after sign-in the
 * dashboard header shows the same name. The bare `/staff/login` remains valid
 * for generic links.
 */
export function StaffLoginPage() {
  const { hospitalId: routeHospitalId } = useParams<{ hospitalId?: string }>()
  const requiredHospitalId = routeHospitalId ?? null

  const { signIn, signOut, session, loading } = useStaffAuth()
  const { hospital, loading: hospitalLoading } = useHospital(routeHospitalId)
  const { messages } = useLanguage()
  const t = messages.ui.login
  const navigate = useNavigate()

  const emailId = useId()
  const passwordId = useId()
  const errorId = useId()

  const [email, setEmail] = useState(IS_DEMO_MODE ? DEMO_CREDENTIALS.email : '')
  const [password, setPassword] = useState(IS_DEMO_MODE ? DEMO_CREDENTIALS.password : '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Set while a hospital-specific sign-in is in flight. Without it the effect
   * below would navigate to the dashboard the instant `signIn` sets the session,
   * before this page can check that the account belongs to the clinic in the
   * URL. A ref rather than state because it must be read by the effect without
   * causing another render.
   */
  const skipAutoRedirect = useRef(false)

  // Already signed in? Go straight to the queue.
  useEffect(() => {
    if (!loading && session && !skipAutoRedirect.current) {
      navigate('/staff/dashboard', { replace: true })
    }
  }, [loading, session, navigate])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)
    skipAutoRedirect.current = Boolean(requiredHospitalId)

    try {
      const next = await signIn(email, password)

      // The link names clinic A, but these credentials belong to clinic B.
      // Signing B in here would show a dashboard whose header contradicts the
      // login screen the receptionist just used, so refuse it outright.
      if (requiredHospitalId && next.hospitalId !== requiredHospitalId) {
        await signOut()
        setError(t.wrongHospital)
        setSubmitting(false)
        return
      }

      navigate('/staff/dashboard', { replace: true })
    } catch (caught) {
      logTechnicalError('StaffLoginPage — signIn', caught)
      setError(toUserMessage(caught, messages))
      setSubmitting(false)
    } finally {
      skipAutoRedirect.current = false
    }
  }

  if (loading) {
    return <LoadingState message={t.checking} />
  }

  // A hospital link whose id does not resolve gets no form at all: there is no
  // queue to sign in to, and the message tells staff what to do about it.
  if (requiredHospitalId && hospitalLoading) {
    return <LoadingState message={messages.ui.common.loading} />
  }

  if (requiredHospitalId && !hospital) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-100 px-4 py-10">
        <div className="w-full max-w-sm">
          <EmptyState
            title={t.hospitalMissingTitle}
            description={t.hospitalMissingDescription}
          />
          <p className="mt-2 text-center text-sm text-slate-500">
            <Link to="/" className="font-semibold text-brand-700 hover:underline">
              {t.backHome}
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-center">
          <LanguageSwitcher />
        </div>
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-700 text-white">
            <HeartPulse className="size-7" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-extrabold text-slate-900">
            {hospital?.name ?? messages.ui.common.hospitalFallback}
          </h1>
          {/* Only on a hospital-specific link: this is the same name and
              address printed on that clinic's poster, so staff can confirm at a
              glance that they opened the right clinic's login. */}
          {requiredHospitalId && hospital?.address ? (
            <p className="mt-1 text-sm text-slate-500">{hospital.address}</p>
          ) : null}
          {requiredHospitalId && hospital?.phone ? (
            <p className="text-sm text-slate-500">{hospital.phone}</p>
          ) : null}
          <p className="mt-1 text-sm text-slate-600">{t.subtitle}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor={emailId} className="text-sm font-semibold text-slate-800">
              {t.email}
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
              {t.password}
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
            {submitting ? t.submitting : t.submit}
          </Button>

          {IS_DEMO_MODE ? (
            <p className="rounded-xl border border-dashed border-purple-300 bg-purple-50 px-3 py-2.5 text-xs text-purple-900">
              <strong className="font-semibold">{t.demoMode}</strong> {DEMO_CREDENTIALS.email} /{' '}
              {DEMO_CREDENTIALS.password}
            </p>
          ) : null}
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          <Link to="/" className="font-semibold text-brand-700 hover:underline">
            {t.backHome}
          </Link>
        </p>
      </div>
    </div>
  )
}
