/**
 * Environment configuration, read once at startup.
 *
 * Nothing here has a default that could silently point at a real backend: if
 * the Supabase values are missing, `isSupabaseConfigured` is false and the app
 * shows setup instructions instead of failing with a confusing network error.
 */

const rawUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const rawAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

/**
 * Demo mode runs the whole application against an in-browser mock instead of
 * Supabase — no database, no network, no credentials. Intended for showing the
 * system to the doctor and for local development (spec §41).
 */
export const IS_DEMO_MODE = (import.meta.env.VITE_DEMO_MODE ?? '').trim().toLowerCase() === 'true'

/** True only outside a production build, used to gate demo controls. */
export const IS_DEV = Boolean(import.meta.env.DEV)

export const SUPABASE_URL = rawUrl
export const SUPABASE_ANON_KEY = rawAnonKey

/** Whether a real Supabase project has been configured. */
export const isSupabaseConfigured = rawUrl !== '' && rawAnonKey !== ''

/**
 * Whether the app can run at all. In demo mode no backend is needed; otherwise
 * Supabase credentials are required.
 */
export const canRunApp = IS_DEMO_MODE || isSupabaseConfigured

/**
 * Demo controls (seed queue, reset, fast-forward) are shown only when running
 * against the mock. They can never appear in front of real patients.
 */
export const showDemoControls = IS_DEMO_MODE

/** The public URL of this deployment, used to build the QR code. */
export function siteOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

/** The URL a patient lands on after scanning the poster's QR code. */
export function registrationUrl(): string {
  return `${siteOrigin()}/register`
}

/** The public TV URL for a given doctor. */
export function displayUrl(doctorId: string): string {
  return `${siteOrigin()}/display/${doctorId}`
}
