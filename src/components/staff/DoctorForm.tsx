import { AlertCircle } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'

import { cn, normaliseName } from '../../lib/utils'
import type { DoctorOption } from '../../types/queue'
import { Button } from '../common/Button'

export interface DoctorFormValues {
  name: string
  department: string
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
  submitLabel = 'जतन करा',
}: DoctorFormProps) {
  const nameId = useId()
  const departmentId = useId()
  const roomId = useId()
  const activeId = useId()
  const errorId = useId()

  const [name, setName] = useState(initial?.name ?? '')
  const [department, setDepartment] = useState(initial?.department ?? '')
  const [roomNumber, setRoomNumber] = useState(initial?.roomNumber ?? '')
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    const trimmedName = normaliseName(name)
    if (trimmedName === '') {
      setError('कृपया डॉक्टरांचे नाव भरा.')
      return
    }

    setError(null)
    onSubmit({
      name: trimmedName,
      department: department.trim(),
      roomNumber: roomNumber.trim(),
      isActive,
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="text-sm font-semibold text-slate-800">
            डॉक्टरांचे नाव <span className="text-red-600">*</span>
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="उदा. डॉ. अमोल देशमुख"
            maxLength={120}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={INPUT_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={departmentId} className="text-sm font-semibold text-slate-800">
            विभाग
          </label>
          <input
            id={departmentId}
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            placeholder="उदा. सामान्य वैद्यक"
            maxLength={80}
            className={INPUT_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={roomId} className="text-sm font-semibold text-slate-800">
            कक्ष क्रमांक
          </label>
          <input
            id={roomId}
            value={roomNumber}
            onChange={(event) => setRoomNumber(event.target.value)}
            placeholder="उदा. १"
            maxLength={16}
            className={INPUT_CLASSES}
          />
        </div>
      </div>

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
        <span className="text-sm font-medium text-slate-800">
          रांग सुरू (नोंदणी फॉर्ममध्ये दिसेल)
        </span>
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
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            रद्द करा
          </Button>
        ) : null}
      </div>
    </form>
  )
}
