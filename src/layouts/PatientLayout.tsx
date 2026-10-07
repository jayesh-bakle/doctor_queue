import { HeartPulse } from 'lucide-react'
import type { ReactNode } from 'react'

import { OfflineNotice } from '../components/common/Feedback'
import { useHospital } from '../hooks/useHospital'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

/**
 * The frame for every patient-facing page.
 *
 * Narrow, single-column and generous with vertical space, because it will
 * almost always be read on a phone held at arm's length in a waiting room.
 * Everything important sits in the top half of the screen.
 */
export function PatientLayout({ children }: { children: ReactNode }) {
  const { hospital } = useHospital()
  const online = useOnlineStatus()

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-lg items-center gap-3 px-4 py-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white">
            <HeartPulse className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900">
              {hospital?.name ?? 'आपल्या रुग्णालयाचे नाव'}
            </p>
            <p className="text-xs text-slate-500">रुग्ण रांग व्यवस्थापन</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
        {!online ? <OfflineNotice className="mb-4" /> : null}
        {children}
      </main>

      <footer className="px-4 pb-6 text-center text-xs text-slate-400">
        {hospital?.phone ? <p>मदतीसाठी: {hospital.phone}</p> : null}
      </footer>
    </div>
  )
}
