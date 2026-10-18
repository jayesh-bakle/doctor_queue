/**
 * Minimal Google Sheets client for the export edge function.
 *
 * No googleapis dependency: the service-account flow is three HTTP calls, and
 * Web Crypto can sign the JWT. Keeping it dependency-free means the function
 * deploys quickly and has nothing to keep up to date.
 *
 * Credentials arrive as function secrets. Nothing here is ever logged — the
 * private key must not reach a log line.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

/** How long a cached access token is reused before asking Google again. */
const TOKEN_SAFETY_MARGIN_MS = 60_000

let cachedToken: { value: string; expiresAt: number } | null = null

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

/**
 * PEM -> DER. Accepts both real newlines and the literal `\n` sequence that
 * survives a copy-paste through a dashboard text box.
 */
function pemToDer(pem: string): Uint8Array {
  const normalized = pem.replace(/\\n/g, '\n')
  const body = normalized
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')

  const binary = atob(body)
  const der = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    der[index] = binary.charCodeAt(index)
  }
  return der
}

async function signJwt(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(utf8(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const claims = base64UrlEncode(
    utf8(
      JSON.stringify({
        iss: clientEmail,
        scope: SHEETS_SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    ),
  )

  const signingInput = `${header}.${claims}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, utf8(signingInput)),
  )

  return `${signingInput}.${base64UrlEncode(signature)}`
}

/** Exchanges the service account's signed assertion for an access token. */
export async function getAccessToken(
  clientEmail: string,
  privateKey: string,
): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt - TOKEN_SAFETY_MARGIN_MS > now) {
    return cachedToken.value
  }

  const assertion = await signJwt(clientEmail, privateKey)
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Google token exchange failed (${response.status}): ${detail.slice(0, 300)}`)
  }

  const payload = (await response.json()) as {
    access_token?: string
    expires_in?: number
  }
  if (!payload.access_token) {
    throw new Error('Google token exchange returned no access_token')
  }

  cachedToken = {
    value: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600) * 1000,
  }
  return cachedToken.value
}

function encodeRange(tab: string, a1: string): string {
  return encodeURIComponent(`${tab}!${a1}`)
}

async function sheetsFetch(
  url: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Google Sheets API ${response.status}: ${detail.slice(0, 300)}`)
  }

  return response.json()
}

/** Verifies the configured tab exists and returns its numeric grid id. */
export async function getSheetId(
  spreadsheetId: string,
  tab: string,
  accessToken: string,
): Promise<number> {
  const payload = (await sheetsFetch(
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
    accessToken,
  )) as { sheets?: Array<{ properties?: { sheetId?: number; title?: string } }> }

  const match = payload.sheets?.find((sheet) => sheet.properties?.title === tab)
  if (!match?.properties || match.properties.sheetId === undefined) {
    throw new Error(
      `Sheet tab "${tab}" was not found. Create it, or set GOOGLE_SHEET_TAB to its name.`,
    )
  }
  return match.properties.sheetId
}

/** Writes the header row if the tab is empty. Never overwrites existing rows. */
export async function ensureHeader(
  spreadsheetId: string,
  tab: string,
  header: readonly string[],
  accessToken: string,
): Promise<void> {
  const range = encodeRange(tab, 'A1:L1')
  const payload = (await sheetsFetch(
    `${SHEETS_API}/${spreadsheetId}/values/${range}`,
    accessToken,
  )) as { values?: string[][] }

  if (payload.values && payload.values.length > 0) return

  await sheetsFetch(
    `${SHEETS_API}/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({ values: [header] }),
    },
  )
}

/** The Date column, one value per row, header included. */
export async function readDateColumn(
  spreadsheetId: string,
  tab: string,
  accessToken: string,
): Promise<string[][]> {
  const range = encodeRange(tab, 'A:A')
  const payload = (await sheetsFetch(
    `${SHEETS_API}/${spreadsheetId}/values/${range}`,
    accessToken,
  )) as { values?: string[][] }
  return payload.values ?? []
}

export async function appendRows(
  spreadsheetId: string,
  tab: string,
  rows: ReadonlyArray<ReadonlyArray<string>>,
  accessToken: string,
): Promise<void> {
  if (rows.length === 0) return

  await sheetsFetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encodeRange(tab, 'A1')}:append` +
      '?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ values: rows }),
    },
  )
}

/**
 * Deletes grid rows by 0-based index.
 *
 * Indices are grouped into contiguous runs and sent in one batchUpdate,
 * descending — deleting a lower row first would shift every later index and
 * remove the wrong rows.
 */
export async function deleteRows(
  spreadsheetId: string,
  gridId: number,
  indices: ReadonlyArray<number>,
  accessToken: string,
): Promise<void> {
  if (indices.length === 0) return

  const sorted = [...new Set(indices)].sort((a, b) => b - a)
  const ranges: Array<{ startIndex: number; endIndex: number }> = []

  for (const index of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && last.startIndex === index + 1) {
      last.startIndex = index
    } else {
      ranges.push({ startIndex: index, endIndex: index + 1 })
    }
  }

  await sheetsFetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      requests: ranges.map((range) => ({
        deleteDimension: {
          range: {
            sheetId: gridId,
            dimension: 'ROWS',
            startIndex: range.startIndex,
            endIndex: range.endIndex,
          },
        },
      })),
    }),
  })
}
