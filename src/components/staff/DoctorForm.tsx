import { AlertCircle } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'

import { useLanguage } from '../../hooks/useLanguage'
import { buildLocalizedText, type LocalizedText } from '../../lib/i18n/content'
import { cn, normaliseName } from '../../lib/utils'
import type { DoctorOption } from '../../types/queue'
import { Button } from '../common/Button'

export interface DoctorFormValues {
  name: string
  department: string
  departmentI18n: LocalizedText
  roomNumber: string
  isActive: boolean
}

interface DoctorFormProps {
  initial?: DoctorOption
  submitting: boolean
  onSubmit: (values: DoctorFormValues) => void
  onCancel?: () => void
  submitLabel?: string
}

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-brand-600 focus:outline-none'

/**
 * Create or edit a doctor.
 *
 * Room number is free text rather than a number input, because clinics label
 * rooms in ways a numeric field would fight — "१", "१अ", "मोठा कक्ष".
 */
export function DoctorForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
  submitLabel,
}: DoctorFormProps) {
  const nameId = useId()
  const departmentId = useId()
  const departmentMrId = useId()
  const departmentGuId = useId()
  const roomId = useId()
  const activeId = useId()
  const errorId = useId()

  const { messages } = useLanguage()
  const t = messages.ui.doctorForm

  const [name, setName] = useState(initial?.name ?? '')
  const [department, setDepartment] = useState(initial?.department ?? '')
  const [departmentMr, setDepartmentMr] = useState(initial?.departmentI18n?.mr ?? '')
  const [departmentGu, setDepartmentGu] = useState(initial?.departmentI18n?.gu ?? '')
  const [roomNumber, setRoomNumber] = useState(initial?.roomNumber ?? '')
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    const trimmedName = normaliseName(name)
    if (trimmedName === '') {
      setError(t.nameRequired)
      return
    }

    setError(null)
    onSubmit({
      name: trimmedName,
      department: department.trim(),
      departmentI18n: buildLocalizedText(department, departmentMr, departmentGu),
      roomNumber: roomNumber.trim(),
      isActive,
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="text-sm font-semibold text-slate-800">
            {t.nameLabel} <span className="text-red-600">*</span>
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.namePlaceholder}
            maxLength={120}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={INPUT_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={departmentId} className="text-sm font-semibold text-slate-800">
            {t.departmentLabel}
          </label>
          <input
            id={departmentId}
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            placeholder={t.departmentPlaceholder}
            maxLength={80}
            className={INPUT_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={roomId} className="text-sm font-semibold text-slate-800">
            {t.roomLabel}
          </label>
          <input
            id={roomId}
            value={roomNumber}
            onChange={(event) => setRoomNumber(event.target.value)}
            placeholder={t.roomPlaceholder}
            maxLength={16}
            className={INPUT_CLASSES}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-800">
          {t.departmentTranslations}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={departmentMrId} className="text-sm font-medium text-slate-700">
              <span lang="mr">मराठी</span>
            </label>
            <input
              id={departmentMrId}
              value={departmentMr}
              onChange={(event) => setDepartmentMr(event.target.value)}
              placeholder={t.departmentPlaceholder}
              maxLength={80}
              lang="mr"
              className={INPUT_CLASSES}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={departmentGuId} className="text-sm font-medium text-slate-700">
              <span lang="gu">ગુજરાતી</span>
            </label>
            <input
              id={departmentGuId}
              value={departmentGu}
              onChange={(event) => setDepartmentGu(event.target.value)}
              placeholder={t.departmentPlaceholder}
              maxLength={80}
              lang="gu"
              className={INPUT_CLASSES}
            />
          </div>
        </div>
      </fieldset>

      <label
        htmlFor={activeId}
        className="flex w-fit cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5"
      >
        <input
          id={activeId}
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          className="size-5 accent-brand-700"
        />
        <span className="text-sm font-medium text-slate-800">{t.activeLabel}</span>
      </label>

      {error ? (
        <p
          id={errorId}
          role="alert"
          className={cn('flex items-center gap-1.5 text-sm font-medium text-red-700')}
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={submitting}>
          {submitLabel ?? t.save}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            {messages.ui.common.cancel}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
