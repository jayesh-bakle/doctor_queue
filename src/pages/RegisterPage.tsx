import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '../components/common/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/common/Feedback'
import { RegistrationForm, type RegistrationFormValues } from '../components/patient/RegistrationForm'
import { useDoctors } from '../hooks/useDoctors'
import { useLanguage } from '../hooks/useLanguage'
import { dataSource } from '../lib/datasource'
import { logTechnicalError, toUserMessage } from '../lib/errors'
import { PatientLayout } from '../layouts/PatientLayout'

/**
 * Patient registration — the page the QR code leads to.
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
  const [searchParams] = useSearchParams()
  const { doctors, loading, error, reload } = useDoctors()
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

  return (
    <PatientLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">{t.title}</h1>
        <p className="mt-1 text-base text-slate-600">{t.subtitle}</p>
      </div>

      {loading ? <LoadingState message={t.loadingDoctors} /> : null}

      {!loading && error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}

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
