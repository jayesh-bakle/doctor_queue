import { ClipboardList, LogIn, HeartPulse } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useHospital } from '../hooks/useHospital'
import { useLanguage } from '../hooks/useLanguage'
import { LanguageSwitcher } from '../components/common/LanguageSwitcher'

/**
 * The entry point, deliberately reduced to two choices.
 *
 * A patient who scans the QR code lands straight on /register instead, so this
 * page is mostly reached by staff or by someone who typed the address. Two
 * large, unambiguous buttons are all it needs (spec §25).
 */
export function HomePage() {
  const { hospital } = useHospital()
  const { messages } = useLanguage()
  const t = messages.ui.home

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-700 text-white">
            <HeartPulse className="size-8" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            {hospital?.name ?? messages.ui.common.hospitalFallback}
          </h1>
          <p className="mt-1 text-base text-slate-600">{messages.ui.common.queueSystem}</p>
        </div>

        <div className="flex flex-col gap-4">
          <Link
            to="/register"
            className="flex items-center gap-4 rounded-2xl border-2 border-brand-700 bg-brand-700 px-5 py-5 text-white shadow-sm transition-colors hover:bg-brand-800"
          >
            <ClipboardList className="size-8 shrink-0" aria-hidden="true" />
            <span className="flex flex-col">
              <span className="text-xl font-bold">{t.register}</span>
              <span className="text-sm text-brand-100">{t.registerHint}</span>
            </span>
          </Link>

          <Link
            to="/staff/login"
            className="flex items-center gap-4 rounded-2xl border-2 border-slate-300 bg-white px-5 py-5 text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
          >
            <LogIn className="size-8 shrink-0" aria-hidden="true" />
            <span className="flex flex-col">
              <span className="text-xl font-bold">{t.staffLogin}</span>
              <span className="text-sm text-slate-500">{t.staffLoginHint}</span>
            </span>
          </Link>
        </div>

        {/* This page sits outside every layout, so it carries the switcher itself —
            otherwise someone who cannot read Marathi has no way to change the
            language before choosing between the two buttons above. */}
        <div className="mt-8 flex justify-center">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  )
}
