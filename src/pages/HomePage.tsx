import { LogIn, HeartPulse } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useHospital } from '../hooks/useHospital'
import { useLanguage } from '../hooks/useLanguage'
import { LanguageSwitcher } from '../components/common/LanguageSwitcher'

/**
 * The entry point for staff.
 *
 * Patients do not use this page: a clinic's QR code takes them straight to
 * `/h/<hospital-id>`, where the registration form and that clinic's live queue
 * already are. Offering a second "join the queue" button here was both
 * redundant and ambiguous once one deployment served several clinics — there is
 * no way to know which clinic's queue it should open. So this page does one
 * thing: it gets a receptionist to their clinic's login.
 */
export function HomePage() {
  const { hospital } = useHospital()
  const { messages } = useLanguage()
  const t = messages.ui.home

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-700 text-white">
            <HeartPulse className="size-8" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            {hospital?.name ?? messages.ui.common.hospitalFallback}
          </h1>
          <p className="mt-1 text-base text-slate-600">{messages.ui.common.queueSystem}</p>
        </div>

        <Link
          to="/staff/login"
          className="flex items-center gap-4 rounded-2xl border-2 border-brand-700 bg-brand-700 px-5 py-5 text-white shadow-sm transition-colors hover:bg-brand-800"
        >
          <LogIn className="size-8 shrink-0" aria-hidden="true" />
          <span className="flex flex-col">
            <span className="text-xl font-bold">{t.staffLogin}</span>
            <span className="text-sm text-brand-100">{t.staffLoginHint}</span>
          </span>
        </Link>

        {/* Patients still need to know what to do if they reach the bare site
            address instead of a clinic's QR link. This is a sentence, not a
            second way into a queue. */}
        <p className="mt-5 text-center text-sm text-slate-500">{t.patientHint}</p>

        {/* This page sits outside every layout, so it carries the switcher itself —
            otherwise someone who cannot read Marathi has no way to change the
            language. */}
        <div className="mt-8 flex justify-center">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  )
}
