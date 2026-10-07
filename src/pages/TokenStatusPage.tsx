import { CheckCircle2, RefreshCw, Smartphone } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Button } from '../components/common/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/common/Feedback'
import { TokenDisplay } from '../components/common/TokenDisplay'
import { SituationCard } from '../components/patient/SituationCard'
import { TokenDetailsCard } from '../components/patient/TokenDetailsCard'
import { useHospital } from '../hooks/useHospital'
import { useTokenStatus } from '../hooks/useTokenStatus'
import { patientCountLabel } from '../lib/marathiDigits'
import { describeSituation, waitingCountLabel } from '../lib/queue'
import { formatDate } from '../lib/utils'
import { PatientLayout } from '../layouts/PatientLayout'

/**
 * The patient's live token page.
 *
 * Two mechanisms keep it current, on purpose:
 *
 *   1. Realtime — the page subscribes to the doctor's public queue feed and
 *      re-reads its own row the moment anything changes. This is what makes the
 *      screen flip to "आता आपला क्रमांक आहे" the instant reception clicks.
 *   2. A slow poll — a 30-second safety net for when the realtime socket has
 *      quietly dropped (clinic wifi, a phone waking from sleep). Without it, a
 *      patient could sit looking at a stale number and never know.
 *
 * The patient never has to refresh, and never has to ask reception (spec §2).
 */
export function TokenStatusPage() {
  const { publicId } = useParams<{ publicId: string }>()
  const { data, loading, notFound, error, refresh } = useTokenStatus(publicId)
  const { hospital } = useHospital()

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh()
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  if (loading) {
    return (
      <PatientLayout>
        <LoadingState message="आपला टोकन क्रमांक मिळवत आहे…" />
      </PatientLayout>
    )
  }

  if (notFound) {
    return (
      <PatientLayout>
        <EmptyState
          title="हा टोकन क्रमांक सापडला नाही."
          description="कृपया रिसेप्शनशी संपर्क साधा किंवा पुन्हा नोंदणी करा."
          action={
            <Link to="/register">
              <Button variant="secondary">रांगेत नोंदणी करा</Button>
            </Link>
          }
        />
      </PatientLayout>
    )
  }

  if (error || !data) {
    return (
      <PatientLayout>
        <ErrorState message={error ?? 'माहिती मिळाली नाही.'} onRetry={() => void refresh()} />
      </PatientLayout>
    )
  }

  const timezone = hospital?.timezone ?? 'Asia/Kolkata'

  const situation = describeSituation({
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
          <p className="text-base font-bold text-emerald-900">नोंदणी यशस्वी</p>
          <p className="truncate text-sm text-emerald-800">
            {data.patient_name} · {data.doctor_name}
          </p>
        </div>
      </div>

      {/* ---- The token --------------------------------------------------- */}
      <div className="rounded-3xl border-2 border-brand-200 bg-white px-4 py-8 shadow-sm">
        <TokenDisplay token={data.token_number} size="xl" label="आपला टोकन क्रमांक" />
      </div>

      {/* ---- What to do now ---------------------------------------------- */}
      <div className="mt-5">
        <SituationCard situation={situation} />
      </div>

      {/* ---- Live queue numbers ------------------------------------------ */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            सध्या सुरू
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
            आपल्यापुढे
          </p>
          <p className="token-digits mt-2 text-5xl font-extrabold text-slate-900">
            {patientCountLabel(data.patients_ahead)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-center text-sm text-slate-600">
        {waitingCountLabel(data.waiting_count)}
      </p>

      {/* ---- Details ------------------------------------------------------ */}
      <TokenDetailsCard
        className="mt-5"
        doctorName={data.doctor_name}
        department={data.department}
        roomNumber={data.room_number}
        hospitalName={data.hospital_name}
        queueDateLabel={formatDate(data.queue_date, timezone)}
        patientsAhead={data.patients_ahead}
        avgConsultationMinutes={data.avg_consultation_minutes}
        showEstimate
      />

      {/* ---- Reassurance --------------------------------------------------- */}
      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-4">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-brand-800" aria-hidden="true" />
        <div className="text-sm text-brand-900">
          <p className="font-bold">कृपया आपला फोन जवळ ठेवा.</p>
          <p className="mt-0.5">ही माहिती आपोआप बदलत राहील — पान ताजे करण्याची गरज नाही.</p>
        </div>
      </div>

      <div className="mt-5 flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw className="size-4" aria-hidden="true" />}
          onClick={() => void refresh()}
        >
          आत्ता ताजे करा
        </Button>
      </div>
    </PatientLayout>
  )
}
