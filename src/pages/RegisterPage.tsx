import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { Button } from '../components/common/Button'
import { Card, CardBody } from '../components/common/Card'
import { EmptyState, ErrorState, LoadingState } from '../components/common/Feedback'
import { RegistrationForm, type RegistrationFormValues } from '../components/patient/RegistrationForm'
import { useDoctors } from '../hooks/useDoctors'
import { useHospital } from '../hooks/useHospital'
import { useLanguage } from '../hooks/useLanguage'
import { usePublicQueue } from '../hooks/usePublicQueue'
import { dataSource } from '../lib/datasource'
import { logTechnicalError, toUserMessage } from '../lib/errors'
import type { DoctorOption } from '../types/queue'
import { PatientLayout } from '../layouts/PatientLayout'

/**
 * One doctor's live token, as the patient sees it before registering.
 *
 * This is the same public payload the TV display uses — name, room, current
 * token and a waiting count, and no patient data of any kind. Rendering one row
 * per doctor is deliberate: the patient needs to see which queue is short before
 * choosing a doctor.
 */
function DoctorQueueSummary({ doctor }: { doctor: DoctorOption }) {
  const { messages } = useLanguage()
  const t = messages.ui.register
  const { data } = usePublicQueue(doctor.id)

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-base font-semibold text-slate-800">
        {doctor.name}
        {doctor.roomNumber ? (
          <span className="ml-1 text-sm font-normal text-slate-500">
            {messages.roomShort(doctor.roomNumber)}
          </span>
        ) : null}
      </span>
      <span className="text-sm text-slate-600">
        {t.nowServing}:{' '}
        <span className="font-bold text-slate-900">
          {data?.current_token != null ? messages.token(data.current_token) : '—'}
        </span>
        <span className="mx-2 text-slate-300">·</span>
        {t.waitingLabel}: <span className="font-semibold">{messages.patientCount(data?.waiting_count ?? 0)}</span>
      </span>
    </li>
  )
}

/**
 * Patient registration — the page a clinic's QR code leads to.
 *
 * One deployment serves several clinics, so the URL carries the hospital:
 * `/h/:hospitalId` is what the printed poster encodes. `/register` is kept for
 * posters printed before multi-clinic support; it works while the database holds
 * exactly one hospital and shows the "scan the code again" message otherwise.
 *
 * On success the patient is redirected to their own token page rather than
 * shown a confirmation here. That gives them a URL they can refresh, bookmark
 * or come back to, which matters because the whole point is that they stop
 * asking reception how long is left.
 *
 * `submitting` is held here rather than in the form so that the button stays
 * disabled for the entire request, closing the double-submit window (spec §20).
 */
export function RegisterPage() {
  const navigate = useNavigate()
  const { hospitalId: routeHospitalId } = useParams<{ hospitalId: string }>()
  const [searchParams] = useSearchParams()

  // `?hospital=` is the documented fallback; neither value is trusted beyond
  // identifying which row to read, and the server validates the doctor on submit.
  const hospitalId = routeHospitalId ?? searchParams.get('hospital') ?? undefined

  const { hospital, loading: hospitalLoading } = useHospital(hospitalId)
  const { doctors, loading, error, reload } = useDoctors({ hospitalId })
  const { messages } = useLanguage()
  const t = messages.ui.register

  // A doctor-specific QR poster links here with ?doctorId=…, which preselects
  // that doctor. The value is only a hint — the server validates it on submit.
  const requestedDoctorId = searchParams.get('doctorId') ?? ''
  const initialDoctorId = doctors.some((d) => d.id === requestedDoctorId)
    ? requestedDoctorId
    : undefined

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleSubmit = async (values: RegistrationFormValues) => {
    if (submitting) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      const result = await dataSource.registerPatient({
        doctorId: values.doctorId,
        patientName: values.patientName,
        mobile: values.mobile,
        patientType: values.patientType,
      })

      // `replace` so the back button does not return to a form that would
      // create a second token if resubmitted.
      navigate(`/token/${result.public_id}`, { replace: true })
    } catch (caught) {
      logTechnicalError('RegisterPage — registerPatient', caught)
      setSubmitError(toUserMessage(caught, messages))
      setSubmitting(false)
    }
  }

  // While the hospital row is loading, say so rather than flashing the error.
  if (hospitalLoading) {
    return (
      <PatientLayout>
        <LoadingState message={t.loadingDoctors} />
      </PatientLayout>
    )
  }

  // No hospital: either the id in the URL is wrong, or this is a multi-clinic
  // database reached through the old /register URL, where there is no correct
  // clinic to guess. Both cases get the same instruction.
  if (!hospital) {
    return (
      <PatientLayout>
        <EmptyState title={t.hospitalMissingTitle} description={t.hospitalMissingDescription} />
      </PatientLayout>
    )
  }

  return (
    <PatientLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">{t.title}</h1>
        <p className="mt-1 text-base text-slate-600">{t.subtitle}</p>
      </div>

      {loading ? <LoadingState message={t.loadingDoctors} /> : null}

      {!loading && error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}

      {!loading && !error && doctors.length > 0 ? (
        <Card className="mb-6">
          <CardBody>
            <h2 className="mb-3 text-base font-bold text-slate-800">{t.queueSummaryTitle}</h2>
            <ul className="flex flex-col gap-2">
              {doctors.map((doctor) => (
                <DoctorQueueSummary key={doctor.id} doctor={doctor} />
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {!loading && !error && doctors.length === 0 ? (
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyDescription}
          action={
            <Button variant="secondary" onClick={() => void reload()}>
              {messages.ui.common.retry}
            </Button>
          }
        />
      ) : null}

      {!loading && !error && doctors.length > 0 ? (
        <RegistrationForm
          doctors={doctors}
          submitting={submitting}
          submitError={submitError}
          initialDoctorId={initialDoctorId}
          onSubmit={(values) => void handleSubmit(values)}
        />
      ) : null}
    </PatientLayout>
  )
}
