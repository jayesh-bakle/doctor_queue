import { Save } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'

import { Button } from '../components/common/Button'
import { Card, CardBody, CardHeader } from '../components/common/Card'
import { ErrorState, LoadingState } from '../components/common/Feedback'
import { useHospital } from '../hooks/useHospital'
import { dataSource } from '../lib/datasource'
import { logTechnicalError, toMarathiError } from '../lib/errors'
import { StaffLayout } from '../layouts/StaffLayout'

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-brand-600 focus:outline-none'

/**
 * Hospital settings (spec §17).
 *
 * Every value here is in the database rather than the source code, so a clinic
 * can rename itself, change its phone number, or tune the consultation estimate
 * without a developer. The timezone in particular is the authoritative clock
 * for when the daily token sequence resets — it is deliberately a stored value
 * and not something inferred from whatever device is looking at the screen.
 */
export function SettingsPage() {
  const { hospital, loading, reload } = useHospital()

  const nameId = useId()
  const addressId = useId()
  const phoneId = useId()
  const timezoneId = useId()
  const messageId = useId()
  const avgId = useId()
  const announceId = useId()

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [displayMessage, setDisplayMessage] = useState('')
  const [avgMinutes, setAvgMinutes] = useState('10')
  const [announcementEnabled, setAnnouncementEnabled] = useState(true)

  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Populate the form once the row arrives.
  useEffect(() => {
    if (!hospital) return
    setName(hospital.name)
    setAddress(hospital.address ?? '')
    setPhone(hospital.phone ?? '')
    setTimezone(hospital.timezone)
    setDisplayMessage(hospital.display_message)
    setAvgMinutes(String(hospital.avg_consultation_minutes))
    setAnnouncementEnabled(hospital.announcement_enabled)
  }, [hospital])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)
    setSaved(false)

    try {
      const parsedAvg = Number.parseInt(avgMinutes, 10)
      await dataSource.updateHospital({
        name,
        address: address.trim() === '' ? null : address.trim(),
        phone: phone.trim() === '' ? null : phone.trim(),
        timezone: timezone.trim() || 'Asia/Kolkata',
        announcementEnabled,
        displayMessage,
        avgConsultationMinutes:
          Number.isFinite(parsedAvg) && parsedAvg >= 1 && parsedAvg <= 240 ? parsedAvg : 10,
      })
      await reload()
      setSaved(true)
    } catch (caught) {
      logTechnicalError('SettingsPage — updateHospital', caught)
      setError(toMarathiError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <StaffLayout>
        <LoadingState message="सेटिंग्ज लोड होत आहेत…" />
      </StaffLayout>
    )
  }

  if (!hospital) {
    return (
      <StaffLayout>
        <ErrorState
          message="रुग्णालयाची माहिती मिळाली नाही. कृपया पुन्हा प्रयत्न करा."
          onRetry={() => void reload()}
        />
      </StaffLayout>
    )
  }

  return (
    <StaffLayout>
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader
            title="रुग्णालय सेटिंग्ज"
            description="ही माहिती रुग्ण आणि टीव्ही डिस्प्लेवर दिसते."
          />

          <CardBody>
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={nameId} className="text-sm font-semibold text-slate-800">
                  रुग्णालयाचे नाव
                </label>
                <input
                  id={nameId}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="आपल्या रुग्णालयाचे नाव"
                  maxLength={120}
                  className={INPUT_CLASSES}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={addressId} className="text-sm font-semibold text-slate-800">
                  पत्ता
                </label>
                <input
                  id={addressId}
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  maxLength={240}
                  className={INPUT_CLASSES}
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={phoneId} className="text-sm font-semibold text-slate-800">
                    दूरध्वनी
                  </label>
                  <input
                    id={phoneId}
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+91 20 1234 5678"
                    maxLength={32}
                    className={INPUT_CLASSES}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor={timezoneId} className="text-sm font-semibold text-slate-800">
                    टाइम झोन
                  </label>
                  <input
                    id={timezoneId}
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    placeholder="Asia/Kolkata"
                    maxLength={64}
                    className={INPUT_CLASSES}
                  />
                  <p className="text-xs text-slate-500">
                    रांग दररोज मध्यरात्री या टाइम झोननुसार नव्याने सुरू होते.
                  </p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={avgId} className="text-sm font-semibold text-slate-800">
                    सरासरी तपासणी वेळ (मिनिटे)
                  </label>
                  <input
                    id={avgId}
                    type="number"
                    min={1}
                    max={240}
                    value={avgMinutes}
                    onChange={(event) => setAvgMinutes(event.target.value)}
                    className={INPUT_CLASSES}
                  />
                  <p className="text-xs text-slate-500">
                    फक्त अंदाजे प्रतीक्षा वेळ दाखवण्यासाठी वापरला जातो.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor={messageId} className="text-sm font-semibold text-slate-800">
                    टीव्हीवरील संदेश
                  </label>
                  <input
                    id={messageId}
                    value={displayMessage}
                    onChange={(event) => setDisplayMessage(event.target.value)}
                    placeholder="कृपया आपल्या क्रमांकाची वाट पाहा."
                    maxLength={160}
                    className={INPUT_CLASSES}
                  />
                </div>
              </div>

              <label
                htmlFor={announceId}
                className="flex w-fit cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5"
              >
                <input
                  id={announceId}
                  type="checkbox"
                  checked={announcementEnabled}
                  onChange={(event) => setAnnouncementEnabled(event.target.checked)}
                  className="size-5 accent-brand-700"
                />
                <span className="text-sm font-medium text-slate-800">
                  आवाजाद्वारे क्रमांक जाहीर करा
                </span>
              </label>

              {error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
                >
                  {error}
                </p>
              ) : null}

              {saved ? (
                <p
                  role="status"
                  className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
                >
                  सेटिंग्ज जतन झाल्या.
                </p>
              ) : null}

              <div>
                <Button
                  type="submit"
                  size="lg"
                  loading={submitting}
                  icon={<Save className="size-5" aria-hidden="true" />}
                >
                  जतन करा
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </StaffLayout>
  )
}
