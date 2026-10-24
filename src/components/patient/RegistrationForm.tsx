import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { useId, useRef, useState, type FormEvent } from 'react'

import { useLanguage } from '../../hooks/useLanguage'
import { isTurnstileEnabled } from '../../lib/env'
import { cn } from '../../lib/utils'
import { validateRegistration, type RegistrationField } from '../../lib/validation'
import type { PatientType } from '../../types/database'
import type { DoctorOption } from '../../types/queue'
import { Button } from '../common/Button'
import { TurnstileWidget } from './TurnstileWidget'

export interface RegistrationFormValues {
  doctorId: string
  patientName: string
  mobile: string | null
  patientType: PatientType
  /** Null when Turnstile is not configured (demo mode or local development). */
  turnstileToken: string | null
}

interface RegistrationFormProps {
  doctors: DoctorOption[]
  submitting: boolean
  submitError: string | null
  /** Pre-selected doctor, used when a patient scans a doctor-specific QR poster. */
  initialDoctorId?: string
  onSubmit: (values: RegistrationFormValues) => void
}

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-lg text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-brand-600 focus:outline-none ' +
  'aria-[invalid=true]:border-red-400 aria-[invalid=true]:bg-red-50/40'

/**
 * The patient registration form.
 *
 * Four fields, nothing else. There is deliberately nowhere to record why the
 * patient has come, what they have been prescribed, or anything else clinical —
 * this is a queue, not a medical record (spec §37).
 *
 * Doctor selection uses large radio cards rather than a dropdown: on a phone
 * held one-handed, a card showing the department and room number is both easier
 * to hit and more informative than a collapsed `<select>`.
 */
export function RegistrationForm({
  doctors,
  submitting,
  submitError,
  initialDoctorId,
  onSubmit,
}: RegistrationFormProps) {
  const nameId = useId()
  const mobileId = useId()
  const nameErrorId = useId()
  const mobileErrorId = useId()
  const doctorErrorId = useId()

  const [patientName, setPatientName] = useState('')
  const [mobile, setMobile] = useState('')
  const [doctorId, setDoctorId] = useState(initialDoctorId ?? '')
  const [patientType, setPatientType] = useState<PatientType>('NEW')
  const [errors, setErrors] = useState<Partial<Record<RegistrationField, string>>>({})
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileKey, setTurnstileKey] = useState(0)
  const [captchaError, setCaptchaError] = useState(false)

  const nameRef = useRef<HTMLInputElement>(null)
  const doctorGroupRef = useRef<HTMLFieldSetElement>(null)

  const { messages } = useLanguage()
  const t = messages.ui.registrationForm

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    // A second guard on top of the disabled button: some mobile browsers still
    // fire submit on a double-tap before the disabled state paints.
    if (submitting) return

    const result = validateRegistration({ patientName, mobile, doctorId, patientType }, messages)
    setErrors(result.errors)

    if (!result.valid) {
      if (result.errors.patientName) nameRef.current?.focus()
      else if (result.errors.doctorId) doctorGroupRef.current?.focus()
      return
    }

    if (isTurnstileEnabled && !turnstileToken) {
      setCaptchaError(true)
      return
    }

    onSubmit({
      doctorId: result.normalised.doctorId,
      patientName: result.normalised.patientName,
      mobile: result.normalised.mobile,
      patientType: result.normalised.patientType,
      turnstileToken,
    })

    // A Turnstile token is single-use. Discard it and ask for a fresh challenge
    // so that if this submit fails, retrying does not resend a spent token.
    if (isTurnstileEnabled) {
      setTurnstileToken(null)
      setTurnstileKey((key) => key + 1)
    }
  }

  const doctorError = errors.doctorId

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/* ---- Patient name ------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <label htmlFor={nameId} className="text-base font-semibold text-slate-800">
          {t.nameLabel} <span className="text-red-600">*</span>
        </label>
        <input
          ref={nameRef}
          id={nameId}
          name="patientName"
          type="text"
          value={patientName}
          onChange={(event) => setPatientName(event.target.value)}
          placeholder={t.namePlaceholder}
          autoComplete="name"
          enterKeyHint="next"
          maxLength={120}
          aria-invalid={errors.patientName ? true : undefined}
          aria-describedby={errors.patientName ? nameErrorId : undefined}
          className={INPUT_CLASSES}
        />
        {errors.patientName ? (
          <p id={nameErrorId} role="alert" className="flex items-center gap-1.5 text-sm font-medium text-red-700">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            {errors.patientName}
          </p>
        ) : null}
      </div>

      {/* ---- Mobile (optional) -------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <label htmlFor={mobileId} className="text-base font-semibold text-slate-800">
          {t.mobileLabel} <span className="text-sm font-normal text-slate-500">{t.optional}</span>
        </label>
        <input
          id={mobileId}
          name="mobile"
          type="tel"
          inputMode="numeric"
          value={mobile}
          onChange={(event) => setMobile(event.target.value)}
          placeholder={t.mobilePlaceholder}
          autoComplete="tel-national"
          enterKeyHint="next"
          maxLength={16}
          aria-invalid={errors.mobile ? true : undefined}
          aria-describedby={errors.mobile ? mobileErrorId : undefined}
          className={INPUT_CLASSES}
        />
        {errors.mobile ? (
          <p id={mobileErrorId} role="alert" className="flex items-center gap-1.5 text-sm font-medium text-red-700">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            {errors.mobile}
          </p>
        ) : (
          <p className="text-sm text-slate-500">{t.mobileHint}</p>
        )}
      </div>

      {/* ---- Doctor -------------------------------------------------------- */}
      <fieldset
        ref={doctorGroupRef}
        tabIndex={-1}
        aria-invalid={doctorError ? true : undefined}
        aria-describedby={doctorError ? doctorErrorId : undefined}
        className="flex flex-col gap-3"
      >
        <legend className="mb-3 text-base font-semibold text-slate-800">
          {t.doctorLegend} <span className="text-red-600">*</span>
        </legend>

        <div className="grid gap-3 sm:grid-cols-2">
          {doctors.map((doctor) => {
            const selected = doctorId === doctor.id
            return (
              <label
                key={doctor.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors',
                  selected
                    ? 'border-brand-600 bg-brand-50'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <input
                  type="radio"
                  name="doctorId"
                  value={doctor.id}
                  checked={selected}
                  onChange={() => setDoctorId(doctor.id)}
                  className="mt-1 size-5 shrink-0 accent-brand-700"
                />
                <span className="flex flex-col">
                  <span className="flex items-center gap-1.5 text-base font-bold text-slate-900">
                    {doctor.name}
                    {selected ? (
                      <CheckCircle2 className="size-4 text-brand-700" aria-hidden="true" />
                    ) : null}
                  </span>
                  {doctor.department ? (
                    <span className="text-sm text-slate-600">{doctor.department}</span>
                  ) : null}
                  {doctor.roomNumber ? (
                    <span className="text-sm text-slate-500">{messages.roomShort(doctor.roomNumber)}</span>
                  ) : null}
                </span>
              </label>
            )
          })}
        </div>

        {doctorError ? (
          <p id={doctorErrorId} role="alert" className="flex items-center gap-1.5 text-sm font-medium text-red-700">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            {doctorError}
          </p>
        ) : null}
      </fieldset>

      {/* ---- Patient type -------------------------------------------------- */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-base font-semibold text-slate-800">{t.patientTypeLegend}</legend>
        <div className="grid grid-cols-2 gap-3">
          {(['NEW', 'FOLLOWUP'] as const).map((type) => {
            const selected = patientType === type
            return (
              <label
                key={type}
                className={cn(
                  'flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 px-3 text-center transition-colors',
                  selected
                    ? 'border-brand-600 bg-brand-50'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <input
                  type="radio"
                  name="patientType"
                  value={type}
                  checked={selected}
                  onChange={() => setPatientType(type)}
                  className="size-5 shrink-0 accent-brand-700"
                />
                <span className="text-base font-semibold text-slate-800">
                  {messages.patientType[type]}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* ---- Privacy note -------------------------------------------------- */}
      <p className="flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm leading-relaxed text-brand-900">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t.privacyNote}
      </p>

      {/* ---- Abuse check --------------------------------------------------- */}
      {isTurnstileEnabled ? (
        <div className="flex flex-col gap-2">
          <TurnstileWidget
            resetKey={turnstileKey}
            onVerify={(token) => {
              setTurnstileToken(token)
              if (token) setCaptchaError(false)
            }}
          />
          {captchaError ? (
            <p
              role="alert"
              className="flex items-center gap-1.5 text-sm font-medium text-red-700"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              {t.captchaRequired}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ---- Submit error -------------------------------------------------- */}
      {submitError ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {submitError}
        </p>
      ) : null}

      <Button
        type="submit"
        size="xl"
        fullWidth
        loading={submitting}
        icon={submitting ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : undefined}
      >
        {submitting ? t.submitting : t.submit}
      </Button>
    </form>
  )
}
