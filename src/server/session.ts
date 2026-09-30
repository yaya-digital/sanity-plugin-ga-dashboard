import {kv} from '@vercel/kv'
import type {EncryptedData} from './crypto'
import {encrypt, decrypt} from './crypto'
import {generateSid, readJson} from './utils'

const SESSION_TTL = 60 * 60 * 24 * 30 // 30 days
const ACCESS_TOKEN_TTL = 60 * 50 // 50 minutes

export interface SessionData {
  encryptedRefreshToken: EncryptedData
  sub: string
  email: string
  createdAt: number
}

export function getRootDomain(host: string): string {
  const parts = host.split('.')
  if (parts.length <= 2) return host
  return parts.slice(1).join('.')
}

// The Studio is on a different site from the BFF, so the session cookie never
// reaches it. The Studio sends the session ID as a header instead; the cookie
// is still honoured for same-site setups.
export function requestSid(request: Request): string | null {
  return request.headers.get('x-ga-session') || parseSid(request.headers.get('cookie'))
}

export function parseSid(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === '__Secure-yaya_ga') return rest.join('=')
  }
  return null
}

export function buildSessionCookie(sid: string, rootDomain: string): string {
  return `__Secure-yaya_ga=${sid}; Domain=.${rootDomain}; Path=/; Max-Age=${SESSION_TTL}; HttpOnly; Secure; SameSite=None`
}

export function clearSessionCookie(rootDomain: string): string {
  return `__Secure-yaya_ga=; Domain=.${rootDomain}; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`
}

export async function createSession(
  refreshToken: string,
  sub: string,
  email: string,
  encKey: string,
): Promise<string> {
  const sid = generateSid()
  const encryptedRefreshToken = await encrypt(refreshToken, encKey)
  const data: SessionData = {encryptedRefreshToken, sub, email, createdAt: Date.now()}
  await kv.set(`ga:session:${sid}`, JSON.stringify(data), {ex: SESSION_TTL})
  return sid
}

export async function getAccessToken(
  sid: string,
  encKey: string,
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  const cached = await kv.get<string>(`ga:access:${sid}`)
  if (cached) return cached

  const raw = await kv.get<unknown>(`ga:session:${sid}`)
  if (!raw) return null

  let session: SessionData
  try {
    session = readJson<SessionData>(raw)
  } catch {
    return null
  }

  let refreshToken: string
  try {
    refreshToken = await decrypt(session.encryptedRefreshToken, encKey)
  } catch {
    return null
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (!tokenRes.ok) return null

  const tokenData = (await tokenRes.json()) as {access_token?: string; expires_in?: number}
  if (!tokenData.access_token) return null

  const ttl = Math.max((tokenData.expires_in ?? 3600) - 600, 60)
  await kv.set(`ga:access:${sid}`, tokenData.access_token, {ex: ttl})
  // Rolling session TTL
  await kv.expire(`ga:session:${sid}`, SESSION_TTL)

  return tokenData.access_token
}

export async function deleteSession(sid: string): Promise<string | null> {
  const raw = await kv.get<unknown>(`ga:session:${sid}`)
  let refreshToken: string | null = null

  if (raw) {
    try {
      const encKey = process.env.GA_TOKEN_ENC_KEY!
      const session = readJson<SessionData>(raw)
      refreshToken = await decrypt(session.encryptedRefreshToken, encKey)
    } catch {
      // best-effort
    }
  }

  await kv.del(`ga:session:${sid}`, `ga:access:${sid}`)
  return refreshToken
}

export async function checkRateLimit(sid: string): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60000)
  const key = `ga:rl:${sid}:${minute}`
  const count = await kv.incr(key)
  if (count === 1) await kv.expire(key, 120)
  return count <= 60
}
