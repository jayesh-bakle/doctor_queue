/**
 * Supabase client.
 *
 * Only the publishable anon key is ever used here. It is safe to ship in the
 * bundle because every table is protected by row level security — the key
 * identifies the project, it does not grant access. The service-role key
 * bypasses RLS entirely and must never appear in frontend code (spec §19).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { IS_DEMO_MODE, SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './env'

let client: SupabaseClient | null = null

/**
 * Returns the shared Supabase client.
 *
 * Throws a clear, actionable error when credentials are missing, rather than
 * letting a malformed request fail somewhere less obvious.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client

  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file, ' +
        'or set VITE_DEMO_MODE=true to run without a backend.',
    )
  }

  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The app is a plain SPA with no OAuth redirect handling; keeping this off
      // avoids Supabase parsing the URL hash on every navigation.
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        // Ten events per second is far more than a clinic queue produces, and
        // keeps the TV's connection light.
        eventsPerSecond: 10,
      },
    },
  })

  return client
}

/** True when the app is talking to a real Supabase project. */
export const usingSupabase = isSupabaseConfigured && !IS_DEMO_MODE
