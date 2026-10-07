import { ClipboardList, LogIn, HeartPulse } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useHospital } from '../hooks/useHospital'

/**
 * The entry point, deliberately reduced to two choices.
 *
 * A patient who scans the QR code lands straight on /register instead, so this
 * page is mostly reached by staff or by someone who typed the address. Two
 * large, unambiguous buttons are all it needs (spec §25).
 */
export function HomePage() {
  const { hospital } = useHospital()

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-700 text-white">
            <HeartPulse className="size-8" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            {hospital?.name ?? 'आपल्या रुग्णालयाचे नाव'}
          </h1>
          <p className="mt-1 text-base text-slate-600">रुग्ण रांग व्यवस्थापन</p>
        </div>

        <div className="flex flex-col gap-4">
          <Link
            to="/register"
            className="flex items-center gap-4 rounded-2xl border-2 border-brand-700 bg-brand-700 px-5 py-5 text-white shadow-sm transition-colors hover:bg-brand-800"
          >
            <ClipboardList className="size-8 shrink-0" aria-hidden="true" />
            <span className="flex flex-col">
              <span className="text-xl font-bold">रांगेत नोंदणी करा</span>
              <span className="text-sm text-brand-100">टोकन मिळवा आणि रांग पाहा</span>
            </span>
          </Link>

          <Link
            to="/staff/login"
            className="flex items-center gap-4 rounded-2xl border-2 border-slate-300 bg-white px-5 py-5 text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
          >
            <LogIn className="size-8 shrink-0" aria-hidden="true" />
            <span className="flex flex-col">
              <span className="text-xl font-bold">रिसेप्शन लॉगिन</span>
              <span className="text-sm text-slate-500">रुग्णांना बोलवण्यासाठी</span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  )
}
