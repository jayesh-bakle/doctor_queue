import { HeartPulse, LayoutList, LogOut, QrCode, Settings, Stethoscope } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, NavLink } from 'react-router-dom'

import { ConnectionIndicator } from '../components/common/ConnectionIndicator'
import { LoadingState } from '../components/common/Feedback'
import { LanguageSwitcher } from '../components/common/LanguageSwitcher'
import { useHospital } from '../hooks/useHospital'
import { useLanguage } from '../hooks/useLanguage'
import { useStaffAuth } from '../hooks/useStaffAuth'
import { cn } from '../lib/utils'

/**
 * The frame for the reception area.
 *
 * Also the authentication boundary: every staff route renders inside this
 * layout, so gating here means a new staff page cannot accidentally be added
 * without a login check.
 */
export function StaffLayout({ children }: { children: ReactNode }) {
  const { session, loading, signOut } = useStaffAuth()
  const { hospital } = useHospital()
  const { messages } = useLanguage()
  const m = messages.ui

  // Built here rather than at module scope because the labels are translated.
  const navItems = [
    { to: '/staff/dashboard', label: m.nav.queue, icon: LayoutList },
    { to: '/staff/doctors', label: m.nav.doctors, icon: Stethoscope },
    { to: '/staff/settings', label: m.nav.settings, icon: Settings },
    { to: '/qr', label: m.nav.qr, icon: QrCode },
  ]

  if (loading) {
    return <LoadingState message={m.staff.checkingLogin} />
  }

  if (!session) {
    return <Navigate to="/staff/login" replace />
  }

  const timezone = hospital?.timezone ?? 'Asia/Kolkata'

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white">
              <HeartPulse className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900">
                {hospital?.name ?? m.common.hospitalFallback}
              </p>
              <p className="text-xs text-slate-500">
                {messages.dateWithWeekday(new Date(), timezone)}
              </p>
            </div>
          </div>

          <nav aria-label={m.nav.label} className="order-3 w-full sm:order-none sm:w-auto">
            <ul className="flex flex-wrap gap-1">
              {navItems.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        'inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors',
                        isActive
                          ? 'bg-brand-50 text-brand-800'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                      )
                    }
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <ConnectionIndicator />
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <div className="hidden text-right lg:block">
              <p className="text-sm font-semibold text-slate-800">
                {session.fullName || session.email}
              </p>
              <p className="text-xs text-slate-500">{m.staff.role}</p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{m.staff.signOut}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  )
}
