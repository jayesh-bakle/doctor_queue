import type { PublicHospitalQueueRow, PublicQueueResult } from '../types/database'

export function publicQueueToDisplayRow(queue: PublicQueueResult): PublicHospitalQueueRow {
  return {
    hospital_id: '',
    hospital_name: queue.hospital_name,
    hospital_address: queue.hospital_address,
    hospital_phone: queue.hospital_phone,
    hospital_timezone: queue.hospital_timezone,
    display_message: queue.display_message,
    display_message_i18n: queue.display_message_i18n,
    announcement_enabled: queue.announcement_enabled,
    avg_consultation_minutes: queue.avg_consultation_minutes,
    queue_date: queue.queue_date,
    doctor_id: queue.doctor_id,
    doctor_name: queue.doctor_name,
    department: queue.department,
    department_i18n: queue.department_i18n,
    room_number: queue.room_number,
    display_order: null,
    current_token: queue.current_token,
    next_token: queue.next_token,
    waiting_count: queue.waiting_count,
    total_today: queue.total_today,
    updated_at: queue.updated_at,
  }
}

export function isDisplayableDoctorQueue(
  queue: PublicQueueResult | null,
): queue is PublicQueueResult {
  return queue !== null && queue.is_active
}
