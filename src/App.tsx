import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { ErrorBoundary } from './components/common/ErrorBoundary'
import { LanguageProvider } from './hooks/useLanguage'
import { StaffAuthProvider } from './hooks/useStaffAuth'
import { canRunApp } from './lib/env'
import { DisplayPage } from './pages/DisplayPage'
import { DoctorsPage } from './pages/DoctorsPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { QRPage } from './pages/QRPage'
import { RegisterPage } from './pages/RegisterPage'
import { SettingsPage } from './pages/SettingsPage'
import { SetupNotice } from './pages/SetupNotice'
import { StaffDashboardPage } from './pages/StaffDashboardPage'
import { StaffLoginPage } from './pages/StaffLoginPage'
import { TokenStatusPage } from './pages/TokenStatusPage'

/**
 * Application root: routing, and the three providers that wrap everything.
 *
 * `ErrorBoundary` is outermost so a crash anywhere else — including inside a
 * provider — still lands on a readable screen. `LanguageProvider` sits directly
 * inside it, above the router, so every route can read the chosen language and
 * switching re-renders the whole tree in place without a navigation.
 * `StaffAuthProvider` sits inside the router so `useStaffAuth` is available to
 * every staff route (spec §24).
 *
 * The setup notice short-circuits before all of this: with no Supabase project
 * and no demo mode there is nothing to route to, and a page of instructions is
 * more useful than nine routes that all fail. It is developer-facing and
 * deliberately English-only — it renders before any language has been chosen.
 */
export function App() {
  if (!canRunApp) {
    return <SetupNotice />
  }

  return (
    <ErrorBoundary>
      <LanguageProvider>
        <BrowserRouter>
          <StaffAuthProvider>
            <Routes>
              {/* --- Patient (no login) ------------------------------------- */}
              <Route path="/" element={<HomePage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/token/:publicId" element={<TokenStatusPage />} />

              {/* --- Staff (authenticated) ---------------------------------- */}
              <Route path="/staff/login" element={<StaffLoginPage />} />
              <Route path="/staff/dashboard" element={<StaffDashboardPage />} />
              <Route path="/staff/doctors" element={<DoctorsPage />} />
              <Route path="/staff/settings" element={<SettingsPage />} />

              {/* --- Public display (TV, no login, no PII) ------------------ */}
              <Route path="/display/:doctorId" element={<DisplayPage />} />

              {/* --- QR poster ----------------------------------------------- */}
              <Route path="/qr" element={<QRPage />} />

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </StaffAuthProvider>
        </BrowserRouter>
      </LanguageProvider>
    </ErrorBoundary>
  )
}
