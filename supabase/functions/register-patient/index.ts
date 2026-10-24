/**
 * Patient registration behind Cloudflare Turnstile.
 *
 * The browser can no longer call `register_patient()` directly once the anon
 * grant is revoked (see 008_daily_token_cap.sql). It calls this function, which:
 *
 *   1. verifies the Turnstile token against Cloudflare, using a secret that
 *      exists only here;
 *   2. calls the unchanged `register_patient()` RPC with the service role;
 *   3. returns the new token, or a stable machine code on failure.
 *
 * Deployed with `--no-verify-jwt` because patients have no Supabase account.
 * Turnstile is the gate. The daily per-doctor cap in the RPC is the backstop if
 * the captcha is ever solved by a bot farm.
 *
 * Secrets:
 *   TURNSTILE_SECRET_KEY        Cloudflare secret key
 *   SUPABASE_URL                injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY   injected by Supabase
 *
 * Privacy: nothing here is logged. The request body contains a patient's name
 * and optional mobile number, and logs are not the place for either.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Error codes the frontend already knows how to phrase. */
const KNOWN_CODES = new Set([
  'NAME_REQUIRED',
  'NAME_TOO_LONG',
  'INVALID_MOBILE',
  'INVALID_PATIENT_TYPE',
  'DOCTOR_REQUIRED',
  'DOCTOR_NOT_FOUND',
  'DOCTOR_INACTIVE',
  'HOSPITAL_NOT_FOUND',
  'QUEUE_FULL',
  'TURNSTILE_FAILED',
])

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  })
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value || value.trim() === '') {
    throw new Error(`Missing function secret: ${name}`)
  }
  return value
}

async function verifyTurnstile(token: string, remoteIp: string | null): Promise<boolean> {
  if (!token) return false

  const body = new URLSearchParams({
    secret: requireEnv('TURNSTILE_SECRET_KEY'),
    response: token,
  })
  if (remoteIp) body.set('remoteip', remoteIp)

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) return false

  const result = (await response.json()) as { success?: boolean }
  return result.success === true
}

function readRpcErrorCode(message: string | undefined): string {
  const first = (message ?? '').trim().split(/[\s:]+/)[0]?.toUpperCase()
  return first && KNOWN_CODES.has(first) ? first : 'UNKNOWN'
}

interface RegisterBody {
  p_doctor_id?: unknown
  p_patient_name?: unknown
  p_mobile?: unknown
  p_patient_type?: unknown
  turnstileToken?: unknown
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (request.method !== 'POST') {
    return json({ error: 'UNKNOWN' }, 405)
  }

  let body: RegisterBody
  try {
    body = (await request.json()) as RegisterBody
  } catch {
    return json({ error: 'UNKNOWN' }, 400)
  }

  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : ''
  const remoteIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  try {
    if (!(await verifyTurnstile(turnstileToken, remoteIp))) {
      return json({ error: 'TURNSTILE_FAILED' }, 403)
    }

    const admin = createClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    )

    const { data, error } = await admin.rpc('register_patient', {
      p_doctor_id: body.p_doctor_id,
      p_patient_name: body.p_patient_name,
      p_mobile: body.p_mobile ?? null,
      p_patient_type: body.p_patient_type ?? 'NEW',
    })

    if (error) {
      return json({ error: readRpcErrorCode(error.message) }, 409)
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) return json({ error: 'UNKNOWN' }, 500)

    return json(row, 201)
  } catch (error) {
    // Log the message only: never the body, which holds a patient's name and
    // mobile number. A missing secret is the likeliest cause here.
    console.error(
      '[register-patient]',
      error instanceof Error ? error.message : 'unknown failure',
    )
    return json({ error: 'UNKNOWN' }, 500)
  }
})
