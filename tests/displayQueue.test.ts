import { describe, expect, it } from 'vitest'

import {
  isDisplayableDoctorQueue,
  publicQueueToDisplayRow,
} from '../src/lib/displayQueue'
import type { PublicQueueResult } from '../src/types/database'

const queue: PublicQueueResult = {
  doctor_id: 'doctor-1',
  doctor_name: 'Dr. Patil',
  department: 'General',
  department_i18n: { mr: 'सामान्य' },
  room_number: '1',
  is_active: true,
  hospital_name: 'Clinic',
  hospital_address: 'Pune',
  hospital_phone: '020',
  hospital_timezone: 'Asia/Kolkata',
  display_message: 'Welcome',
  display_message_i18n: { mr: 'स्वागत' },
  announcement_enabled: true,
  avg_consultation_minutes: 10,
  queue_date: '2026-10-28',
  current_token: 4,
  next_token: 5,
  waiting_count: 3,
  total_today: 12,
  updated_at: '2026-10-28T10:00:00Z',
}

describe('doctor-specific TV queue', () => {
  it('maps the public queue into the shared display row', () => {
    expect(publicQueueToDisplayRow(queue)).toEqual({
      hospital_id: '',
      hospital_name: 'Clinic',
      hospital_address: 'Pune',
      hospital_phone: '020',
      hospital_timezone: 'Asia/Kolkata',
      display_message: 'Welcome',
      display_message_i18n: { mr: 'स्वागत' },
      announcement_enabled: true,
      avg_consultation_minutes: 10,
      queue_date: '2026-10-28',
      doctor_id: 'doctor-1',
      doctor_name: 'Dr. Patil',
      department: 'General',
      department_i18n: { mr: 'सामान्य' },
      room_number: '1',
      display_order: null,
      current_token: 4,
      next_token: 5,
      waiting_count: 3,
      total_today: 12,
      updated_at: '2026-10-28T10:00:00Z',
    })
  })

  it('only displays an active doctor queue', () => {
    expect(isDisplayableDoctorQueue(queue)).toBe(true)
    expect(isDisplayableDoctorQueue({ ...queue, is_active: false })).toBe(false)
    expect(isDisplayableDoctorQueue(null)).toBe(false)
  })
})
