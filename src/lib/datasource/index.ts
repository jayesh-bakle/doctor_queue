/**
 * Chooses the backend once, at module load.
 *
 * Every hook and page imports `dataSource` from here and never knows which
 * implementation it received. Switching between the real database and the
 * offline demo is therefore a single environment variable, not a code change.
 */

import { IS_DEMO_MODE } from '../env'
import { demoDataSource } from './demoDataSource'
import { supabaseDataSource } from './supabaseDataSource'
import type { QueueDataSource } from './types'

export const dataSource: QueueDataSource = IS_DEMO_MODE ? demoDataSource : supabaseDataSource

export type {
  DoctorInput,
  HospitalSettingsInput,
  QueueDataSource,
  RegisterPatientInput,
  StaffSession,
} from './types'

export { toDoctorOption, toQueueEntryView } from './types'
