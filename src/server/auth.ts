import {kv} from '@vercel/kv'
import {base64urlEncode, generateSid, readJson} from './utils'
import {createSession, buildSessionCookie, clearSessionCookie, deleteSession, getRootDomain, requestSid} from './session'
import {buildCorsHeaders} from './cors'

const SCOPES = 'openid email https://www.googleapis.com/auth/analytics.readonly'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const CLAIM_TTL = 600

function popupSuccessHtml(): string {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;color:#475569">Connected. You can close this window.<script>window.close()</script></body></html>`
}

function oauthErrorHtml(message: string): string {
  return `<!DOCTYPE html><html><body><p style="font-family:sans-serif;color:red">${message}</p></body></html>`
}

function html(body: string, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {'Content-Type': 'text/html; charset=utf-8', ...extraHeaders},
  })
}

export async function login(request: Request): Promise<Response> {
  const clientId = process.env.YAYA_GA_OAUTH_CLIENT_ID
  const studioUrl = process.env.NEXT_PUBLIC_SANITY_STUDIO_URL
  if (!clientId) return html(oauthErrorHtml('OAuth client not configured.'), 500)

  const url = new URL(request.url)
  const callbackBase = `${url.protocol}//${url.host}`

  const verifier = generateSid() + generateSid()
  const verifierBytes = new TextEncoder().encode(verifier)
  const challengeHash = await crypto.subtle.digest('SHA-256', verifierBytes)
  const challenge = base64urlEncode(new Uint8Array(challengeHash))
  const state = generateSid()
  // The Studio generates the nonce and polls claim-session with it. Carrying it
  // in the PKCE record lets the callback hand the session to that poll.
  const nonce = url.searchParams.get('nonce') ?? undefined

  await kv.set(`ga:pkce:${state}`, JSON.stringify({verifier, studioUrl, nonce}), {ex: 300})

  const redirectUri = `${callbackBase}/api/auth/google/callback`
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')

  return Response.redirect(authUrl.toString(), 302)
}

export async function callback(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) return html(oauthErrorHtml(`Google returned an error: ${error}`), 400)
  if (!code || !state) return html(oauthErrorHtml('Missing code or state.'), 400)

  const clientId = process.env.YAYA_GA_OAUTH_CLIENT_ID
  const clientSecret = process.env.YAYA_GA_OAUTH_CLIENT_SECRET
  const encKey = process.env.GA_TOKEN_ENC_KEY
  if (!clientId || !clientSecret || !encKey)
    return html(oauthErrorHtml('Server misconfigured.'), 500)

  const pkceRaw = await kv.get<unknown>(`ga:pkce:${state}`)
  if (!pkceRaw) return html(oauthErrorHtml('Invalid or expired state.'), 400)

  let pkce: {verifier: string; studioUrl?: string; nonce?: string}
  try {
    pkce = readJson(pkceRaw)
  } catch {
    return html(oauthErrorHtml('Corrupt state.'), 400)
  }

  await kv.del(`ga:pkce:${state}`)

  const callbackBase = `${url.protocol}//${url.host}`
  const redirectUri = `${callbackBase}/api/auth/google/callback`

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: pkce.verifier,
    }),
  })

  if (!tokenRes.ok) {
    const e = await tokenRes.text().catch(() => '')
    return html(oauthErrorHtml(`Token exchange failed: ${e}`), 502)
  }

  const tokens = (await tokenRes.json()) as {
    access_token?: string
    refresh_token?: string
    id_token?: string
  }

  if (!tokens.refresh_token)
    return html(oauthErrorHtml('No refresh token returned. Revoke access and try again.'), 502)

  // Decode id_token to get sub + email (no signature verification needed — we just got it from Google)
  let sub = ''
  let email = ''
  if (tokens.id_token) {
    try {
      const payload = JSON.parse(atob(tokens.id_token.split('.')[1])) as {
        sub?: string
        email?: string
      }
      sub = payload.sub ?? ''
      email = payload.email ?? ''
    } catch {
      // non-fatal
    }
  }

  const sid = await createSession(tokens.refresh_token, sub, email, encKey)
  if (pkce.nonce) await kv.set(`ga:claim:${pkce.nonce}`, {sid}, {ex: CLAIM_TTL})
  const host = url.host
  const rootDomain = getRootDomain(host)
  const cookie = buildSessionCookie(sid, rootDomain)

  return html(popupSuccessHtml(), 200, {'Set-Cookie': cookie})
}

export async function logout(request: Request): Promise<Response> {
  const sid = requestSid(request)

  if (sid) {
    const refreshToken = await deleteSession(sid)
    if (refreshToken) {
      // Revoke at Google — best-effort
      fetch(REVOKE_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({token: refreshToken}),
      }).catch(() => {})
    }
  }

  const url = new URL(request.url)
  const rootDomain = getRootDomain(url.host)
  const clearCookie = clearSessionCookie(rootDomain)
  const studioOrigin = process.env.NEXT_PUBLIC_SANITY_STUDIO_URL ?? ''

  return new Response(JSON.stringify({ok: true}), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearCookie,
      'Access-Control-Allow-Origin': studioOrigin,
      'Access-Control-Allow-Credentials': 'true',
    },
  })
}

// The Studio polls this with the nonce it generated before opening the OAuth
// popup. Once the callback has stashed the session ID under that nonce it is
// returned once, then deleted.
export async function claimSession(request: Request): Promise<Response> {
  const studioOrigin = process.env.NEXT_PUBLIC_SANITY_STUDIO_URL ?? ''
  const corsHeaders = buildCorsHeaders(studioOrigin, request)
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {...corsHeaders, 'Content-Type': 'application/json'},
    })

  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders})
  if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405)

  let nonce = ''
  try {
    const body = (await request.json()) as {nonce?: unknown}
    if (typeof body?.nonce === 'string') nonce = body.nonce
  } catch {
    return json({error: 'Invalid body'}, 400)
  }
  if (!nonce) return json({error: 'Missing nonce'}, 400)

  const raw = await kv.get<unknown>(`ga:claim:${nonce}`)
  if (!raw) return json({pending: true}, 200)

  let sid: string | undefined
  try {
    sid = readJson<{sid?: string}>(raw).sid
  } catch {
    sid = undefined
  }
  if (!sid) return json({pending: true}, 200)

  await kv.del(`ga:claim:${nonce}`)
  return json({sid}, 200)
}
