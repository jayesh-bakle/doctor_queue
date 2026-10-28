import { Save } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'

import { Button } from '../components/common/Button'
import { Card, CardBody, CardHeader } from '../components/common/Card'
import { ErrorState, LoadingState } from '../components/common/Feedback'
import { useHospital } from '../hooks/useHospital'
import { useLanguage } from '../hooks/useLanguage'
import { useStaffAuth } from '../hooks/useStaffAuth'
import { dataSource } from '../lib/datasource'
import { logTechnicalError, toUserMessage } from '../lib/errors'
import { buildLocalizedText } from '../lib/i18n/content'
import { DEFAULT_TIME_ZONE, isValidTimeZone } from '../lib/utils'
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
  const { session } = useStaffAuth()
  const { messages } = useLanguage()
  const t = messages.ui.settings

  const nameId = useId()
  const addressId = useId()
  const phoneId = useId()
  const timezoneId = useId()
  const messageId = useId()
  const messageMrId = useId()
  const messageGuId = useId()
  const avgId = useId()
  const announceId = useId()

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [displayMessage, setDisplayMessage] = useState('')
  const [displayMessageMr, setDisplayMessageMr] = useState('')
  const [displayMessageGu, setDisplayMessageGu] = useState('')
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
    setDisplayMessageMr(hospital.display_message_i18n?.mr ?? '')
    setDisplayMessageGu(hospital.display_message_i18n?.gu ?? '')
    setAvgMinutes(String(hospital.avg_consultation_minutes))
    setAnnouncementEnabled(hospital.announcement_enabled)
  }, [hospital])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    // A timezone the browser cannot parse makes `Intl` throw on every screen that
    // shows a date — reception, the dashboard and the TV at once — so refuse it
    // here, where it can still be corrected, rather than saving it and finding
    // out at the next page load. `resolveTimeZone` keeps the app standing either
    // way, but a silently-ignored setting would be worse than a rejected one.
    const trimmedTimeZone = timezone.trim() || DEFAULT_TIME_ZONE
    if (!isValidTimeZone(trimmedTimeZone)) {
      setSaved(false)
      setError(messages.errors.INVALID_TIME_ZONE)
      return
    }

    setSubmitting(true)
    setError(null)
    setSaved(false)

    try {
      const parsedAvg = Number.parseInt(avgMinutes, 10)
      await dataSource.updateHospital({
        name,
        address: address.trim() === '' ? null : address.trim(),
        phone: phone.trim() === '' ? null : phone.trim(),
        timezone: trimmedTimeZone,
        announcementEnabled,
        displayMessage,
        displayMessageI18n: buildLocalizedText(
          displayMessage,
          displayMessageMr,
          displayMessageGu,
        ),
        avgConsultationMinutes:
          Number.isFinite(parsedAvg) && parsedAvg >= 1 && parsedAvg <= 240 ? parsedAvg : 10,
      })
      await reload()
      setSaved(true)
    } catch (caught) {
      logTechnicalError('SettingsPage — updateHospital', caught)
      setError(toUserMessage(caught, messages))
    } finally {
      setSubmitting(false)
    }
  }

  if (session && session.role !== 'ADMIN') {
    return (
      <StaffLayout>
        <ErrorState message={messages.errors.NOT_AUTHORIZED} />
      </StaffLayout>
    )
  }

  if (loading) {
    return (
      <StaffLayout>
        <LoadingState message={t.loading} />
      </StaffLayout>
    )
  }

  if (!hospital) {
    return (
      <StaffLayout>
        <ErrorState message={t.loadFailed} onRetry={() => void reload()} />
      </StaffLayout>
    )
  }

  return (
    <StaffLayout>
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader title={t.title} description={t.description} />

          <CardBody>
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={nameId} className="text-sm font-semibold text-slate-800">
                  {t.name}
                </label>
                <input
                  id={nameId}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t.namePlaceholder}
                  maxLength={120}
                  className={INPUT_CLASSES}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={addressId} className="text-sm font-semibold text-slate-800">
                  {t.address}
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
                    {t.phone}
                  </label>
                  <input
                    id={phoneId}
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder={t.phonePlaceholder}
                    maxLength={32}
                    className={INPUT_CLASSES}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor={timezoneId} className="text-sm font-semibold text-slate-800">
                    {t.timezone}
                  </label>
                  <input
                    id={timezoneId}
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    placeholder={t.timezonePlaceholder}
                    maxLength={64}
                    className={INPUT_CLASSES}
                  />
                  <p className="text-xs text-slate-500">{t.timezoneHint}</p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={avgId} className="text-sm font-semibold text-slate-800">
                    {t.avgMinutes}
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
                  <p className="text-xs text-slate-500">{t.avgHint}</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor={messageId} className="text-sm font-semibold text-slate-800">
                    {t.displayMessage}
                  </label>
                  <input
                    id={messageId}
                    value={displayMessage}
                    onChange={(event) => setDisplayMessage(event.target.value)}
                    placeholder={t.displayMessagePlaceholder}
                    maxLength={160}
                    className={INPUT_CLASSES}
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={messageMrId} className="text-sm font-semibold text-slate-800">
                    {t.displayMessageMr}
                  </label>
                  <input
                    id={messageMrId}
                    value={displayMessageMr}
                    onChange={(event) => setDisplayMessageMr(event.target.value)}
                    placeholder={t.displayMessagePlaceholder}
                    maxLength={160}
                    lang="mr"
                    className={INPUT_CLASSES}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor={messageGuId} className="text-sm font-semibold text-slate-800">
                    {t.displayMessageGu}
                  </label>
                  <input
                    id={messageGuId}
                    value={displayMessageGu}
                    onChange={(event) => setDisplayMessageGu(event.target.value)}
                    placeholder={t.displayMessagePlaceholder}
                    maxLength={160}
                    lang="gu"
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
                <span className="text-sm font-medium text-slate-800">{t.announceAloud}</span>
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
                  {t.saved}
                </p>
              ) : null}

              <div>
                <Button
                  type="submit"
                  size="lg"
                  loading={submitting}
                  icon={<Save className="size-5" aria-hidden="true" />}
                >
                  {t.save}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </StaffLayout>
  )
}
