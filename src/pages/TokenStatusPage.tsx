import { CheckCircle2, RefreshCw, Smartphone } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Button } from '../components/common/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/common/Feedback'
import { TokenDisplay } from '../components/common/TokenDisplay'
import { SituationCard } from '../components/patient/SituationCard'
import { TokenDetailsCard } from '../components/patient/TokenDetailsCard'
import { useLanguage } from '../hooks/useLanguage'
import { useTokenStatus } from '../hooks/useTokenStatus'
import { DEFAULT_TIME_ZONE } from '../lib/utils'
import { PatientLayout } from '../layouts/PatientLayout'

/**
 * The patient's live token page.
 *
 * The page polls a tiny payload on an adaptive timer (15 s near the front of
 * the queue, up to 45 s while far away), and only while the tab is visible.
 * That keeps the patient's phone off the Realtime connection and message
 * quotas, which is what lets several hospitals share one free Supabase project.
 * The full record is read once; subsequent polls merge only the changing fields.
 *
 * The patient never has to refresh, and never has to ask reception (spec §2).
 */
export function TokenStatusPage() {
  const { publicId } = useParams<{ publicId: string }>()
  const { data, loading, notFound, error, refresh } = useTokenStatus(publicId)
  const { messages } = useLanguage()
  const t = messages.ui.token

  if (loading) {
    return (
      <PatientLayout>
        <LoadingState message={t.loading} />
      </PatientLayout>
    )
  }

  if (notFound) {
    return (
      <PatientLayout>
        <EmptyState
          title={t.notFoundTitle}
          description={t.notFoundDescription}
          action={
            <Link to="/register">
              <Button variant="secondary">{t.registerAction}</Button>
            </Link>
          }
        />
      </PatientLayout>
    )
  }

  if (error || !data) {
    return (
      <PatientLayout>
        <ErrorState message={error ?? t.errorFallback} onRetry={() => void refresh()} />
      </PatientLayout>
    )
  }

  const timezone = data.hospital_timezone || DEFAULT_TIME_ZONE

  const situation = messages.describeSituation({
    status: data.status,
    tokenNumber: data.token_number,
    patientsAhead: data.patients_ahead,
    currentToken: data.current_token,
    roomNumber: data.room_number,
  })

  return (
    <PatientLayout>
      {/* ---- Confirmation ------------------------------------------------ */}
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3">
        <CheckCircle2 className="size-6 shrink-0 text-emerald-700" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-base font-bold text-emerald-900">{t.confirmed}</p>
          <p className="truncate text-sm text-emerald-800">
            {data.patient_name} · {data.doctor_name}
          </p>
        </div>
      </div>

      {/* ---- The token --------------------------------------------------- */}
      <div className="rounded-3xl border-2 border-brand-200 bg-white px-4 py-8 shadow-sm">
        <TokenDisplay token={data.token_number} size="xl" label={t.myToken} />
      </div>

      {/* ---- What to do now ---------------------------------------------- */}
      <div className="mt-5">
        <SituationCard situation={situation} />
      </div>

      {/* ---- Live queue numbers ------------------------------------------ */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {t.currentlyServing}
          </p>
          <TokenDisplay
            token={data.current_token}
            size="md"
            className="mt-1"
            animate={false}
            emptyText="—"
          />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {t.aheadOfYou}
          </p>
          <p className="token-digits mt-2 text-5xl font-extrabold text-slate-900">
            {messages.patientCount(data.patients_ahead)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-center text-sm text-slate-600">
        {messages.waitingCount(data.waiting_count)}
      </p>

      {/* ---- Details ------------------------------------------------------ */}
      <TokenDetailsCard
        className="mt-5"
        doctorName={data.doctor_name}
        department={data.department}
        roomNumber={data.room_number}
        hospitalName={data.hospital_name}
        queueDateLabel={messages.date(data.queue_date, timezone)}
        patientsAhead={data.patients_ahead}
        avgConsultationMinutes={data.avg_consultation_minutes}
        showEstimate
      />

      {/* ---- Reassurance --------------------------------------------------- */}
      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-4">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-brand-800" aria-hidden="true" />
        <div className="text-sm text-brand-900">
          <p className="font-bold">{t.keepPhoneTitle}</p>
          <p className="mt-0.5">{t.keepPhoneDetail}</p>
        </div>
      </div>

      <div className="mt-5 flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw className="size-4" aria-hidden="true" />}
          onClick={() => void refresh()}
        >
          {t.refreshNow}
        </Button>
      </div>
    </PatientLayout>
  )
}
