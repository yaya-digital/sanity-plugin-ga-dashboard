import {beforeEach, describe, expect, it, vi} from 'vitest'

// Mirrors @vercel/kv: a value written as a JSON string is returned parsed.
const store = new Map<string, unknown>()
vi.mock('@vercel/kv', () => ({
  kv: {
    set: async (key: string, value: unknown) => {
      store.set(key, value)
    },
    get: async (key: string) => {
      const value = store.get(key)
      if (typeof value !== 'string') return value ?? null
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    },
    del: async (...keys: string[]) => {
      for (const key of keys) store.delete(key)
    },
    incr: async (key: string) => {
      const next = ((store.get(key) as number) ?? 0) + 1
      store.set(key, next)
      return next
    },
    expire: async () => 1,
  },
}))

import {callbackHandler, claimSessionHandler, loginHandler, runReportHandler} from '../src/server/index'

const SITE = 'https://customer.com'
const STUDIO = 'https://customer.sanity.studio'

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const calls: {url: string; init?: RequestInit}[] = []
  vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({url, init})
    return new Response(JSON.stringify(handler(url, init)), {status: 200})
  })
  return calls
}

async function connect(nonce?: string): Promise<Response> {
  const login = await loginHandler(
    new Request(`${SITE}/api/auth/google/login${nonce ? `?nonce=${nonce}` : ''}`),
  )
  const state = new URL(login.headers.get('location')!).searchParams.get('state')
  stubFetch(() => ({access_token: 'at', refresh_token: 'rt', expires_in: 3600}))
  return callbackHandler(new Request(`${SITE}/api/auth/google/callback?code=c&state=${state}`))
}

function claim(nonce: string): Promise<Response> {
  return claimSessionHandler(
    new Request(`${SITE}/api/ga4/claim-session`, {
      method: 'POST',
      headers: {origin: STUDIO, 'content-type': 'application/json'},
      body: JSON.stringify({nonce}),
    }),
  )
}

beforeEach(() => {
  store.clear()
  vi.unstubAllGlobals()
  process.env.YAYA_GA_OAUTH_CLIENT_ID = 'client-id'
  process.env.YAYA_GA_OAUTH_CLIENT_SECRET = 'client-secret'
  process.env.GA_TOKEN_ENC_KEY = 'ab'.repeat(32)
  process.env.GA4_PROPERTY_ID = '123456789'
  process.env.NEXT_PUBLIC_SANITY_STUDIO_URL = STUDIO
})

describe('login', () => {
  it('builds the redirect URI from the host that received the request', async () => {
    const res = await loginHandler(new Request(`${SITE}/api/auth/google/login`))
    const auth = new URL(res.headers.get('location')!)
    expect(res.status).toBe(302)
    expect(auth.searchParams.get('redirect_uri')).toBe(`${SITE}/api/auth/google/callback`)
    expect(auth.searchParams.get('client_id')).toBe('client-id')
  })
})

describe('callback', () => {
  it('completes when KV returns the PKCE record already parsed', async () => {
    const res = await connect()
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('__Secure-yaya_ga=')
  })

  it('rejects an unknown state', async () => {
    const res = await callbackHandler(
      new Request(`${SITE}/api/auth/google/callback?code=c&state=nope`),
    )
    expect(res.status).toBe(400)
  })
})

describe('claim-session', () => {
  it('is pending until the callback has run', async () => {
    expect(await (await claim('n1')).json()).toEqual({pending: true})
  })

  it('hands the session ID over once', async () => {
    await connect('n1')
    const first = await claim('n1')
    const {sid} = (await first.json()) as {sid: string}
    expect(sid).toMatch(/^[0-9a-f]{32}$/)
    expect(first.headers.get('access-control-allow-origin')).toBe(STUDIO)
    expect(await (await claim('n1')).json()).toEqual({pending: true})
  })

  it('does not allow another origin', async () => {
    const res = await claimSessionHandler(
      new Request(`${SITE}/api/ga4/claim-session`, {
        method: 'OPTIONS',
        headers: {origin: 'https://evil.example'},
      }),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('')
  })
})

describe('run-report', () => {
  function report(headers: Record<string, string>, body: unknown): Promise<Response> {
    return runReportHandler(
      new Request(`${SITE}/api/ga4/run-report`, {
        method: 'POST',
        headers: {origin: STUDIO, 'content-type': 'application/json', ...headers},
        body: JSON.stringify(body),
      }),
    )
  }

  it('allows the session header in the preflight', async () => {
    const res = await runReportHandler(
      new Request(`${SITE}/api/ga4/run-report`, {method: 'OPTIONS', headers: {origin: STUDIO}}),
    )
    expect(res.headers.get('access-control-allow-headers')).toContain('x-ga-session')
  })

  it('is unauthenticated without a session', async () => {
    expect((await report({}, {dateRange: '30'})).status).toBe(401)
  })

  it('accepts the session header and a day-count range', async () => {
    await connect('n1')
    const {sid} = (await (await claim('n1')).json()) as {sid: string}

    const calls = stubFetch((url) =>
      url.includes('oauth2.googleapis.com') ? {access_token: 'at', expires_in: 3600} : {rows: []},
    )
    const res = await report({'x-ga-session': sid}, {dateRange: '30'})

    expect(res.status).toBe(200)
    const gaBodies = calls
      .filter((c) => c.url.includes('analyticsdata.googleapis.com'))
      .map((c) => String(c.init?.body))
    expect(gaBodies.length).toBeGreaterThan(0)
    expect(gaBodies.some((b) => b.includes('"startDate":"30daysAgo"'))).toBe(true)
  })

  it('rejects a malformed range', async () => {
    await connect('n1')
    const {sid} = (await (await claim('n1')).json()) as {sid: string}
    stubFetch(() => ({access_token: 'at', expires_in: 3600}))
    expect((await report({'x-ga-session': sid}, {dateRange: 'soon'})).status).toBe(400)
  })
})
