import { Navigate } from 'react-router-dom'

import { useHospital } from '../hooks/useHospital'
import { useLanguage } from '../hooks/useLanguage'
import { DisplayLayout } from '../layouts/DisplayLayout'

/**
 * `/tv` — a short TV link for a one-clinic installation.
 *
 * The full display URL carries the hospital id, which is awkward to type with a
 * TV remote. On a database with exactly one hospital the id is unambiguous, so
 * this route resolves it and replaces the URL with the canonical display path.
 *
 * With two or more hospitals there is no safe guess: showing Clinic A's queue
 * on Clinic B's TV would be worse than showing nothing. In that case the screen
 * asks for the full `/display/h/<hospital-id>` link from `/qr`.
 */
export function TvShortLinkPage() {
  const { hospital, loading } = useHospital()
  const { messages } = useLanguage()
  const t = messages.ui.display

  if (loading) {
    return (
      <DisplayLayout>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[clamp(1.5rem,2.5vw,4rem)] text-slate-400">{t.loading}</p>
        </div>
      </DisplayLayout>
    )
  }

  if (!hospital) {
    return (
      <DisplayLayout>
        <div className="flex flex-1 flex-col items-center justify-center gap-[clamp(1rem,2vw,2.5rem)] px-[clamp(2rem,4vw,6rem)] text-center">
          <p className="max-w-full break-words text-[clamp(2rem,4vw,6rem)] font-bold">
            {t.unavailable}
          </p>
          <p className="max-w-full break-words text-[clamp(1.25rem,2vw,3.5rem)] text-slate-400">
            {t.checkUrl}
          </p>
        </div>
      </DisplayLayout>
    )
  }

  return <Navigate to={`/display/h/${hospital.id}`} replace />
}
