import { useParams } from 'react-router-dom'

import { useStaffAuth } from './useStaffAuth'

/**
 * Which hospital is this screen about?
 *
 * One deployment serves several clinics, so every hospital-scoped read needs an
 * answer to that question. Rather than thread an id through every layout and
 * page, the order of precedence lives here:
 *
 *   1. an explicit argument — a page that already knows, such as `/h/:hospitalId`
 *      or `/register?hospital=…`
 *   2. the `hospitalId` route parameter, which is how a patient's QR code
 *      identifies the clinic
 *   3. the signed-in staff member's hospital, which is how every staff screen
 *      stays inside its own tenant
 *   4. `undefined` — nobody has said, so the data source may only answer when
 *      the database holds a single hospital (a one-clinic installation)
 *
 * Returning `undefined` rather than a guess is deliberate: showing Clinic A's
 * name, doctors or timezone to Clinic B's patient is worse than showing less.
 */
export function useHospitalId(explicit?: string): string | undefined {
  const { hospitalId: routeHospitalId } = useParams<{ hospitalId?: string }>()
  const { session } = useStaffAuth()

  return explicit || routeHospitalId || session?.hospitalId || undefined
}
