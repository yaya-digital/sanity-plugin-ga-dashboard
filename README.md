# sanity-plugin-ga-dashboard

A GA4 dashboard tool for Sanity Studio. The Studio never holds Google credentials: it talks to
five routes on your web app (the BFF), which run the OAuth flow and proxy the GA4 Data API.

## Studio

```ts
import {googleAnalyticsPlugin} from '@yaya-digital/sanity-plugin-ga-dashboard'

const gaBffOrigin = process.env.SANITY_STUDIO_GA_BFF_ORIGIN || ''

googleAnalyticsPlugin({bffOrigin: gaBffOrigin, disabled: !gaBffOrigin})
```

`SANITY_STUDIO_GA_BFF_ORIGIN` is the web app's origin (`https://customer.com`, no trailing
slash). Sanity inlines `SANITY_STUDIO_*` variables at build time, so it must be in the shell that
runs `sanity build` / `sanity deploy`, including CI. Setting it on a hosting dashboard after the
build does nothing.

The origin decides the OAuth redirect URI: the Studio opens `<origin>/api/auth/google/login`, and
the BFF builds `redirect_uri` from the host that received that request. Use the real site domain,
never a `*.vercel.app` alias.

## Web app routes

Each route is a thin wrapper around a handler from `@yaya-digital/sanity-plugin-ga-dashboard/server`.

| Route | Methods | Handler |
|---|---|---|
| `/api/auth/google/login` | `GET` | `loginHandler` |
| `/api/auth/google/callback` | `GET` | `callbackHandler` |
| `/api/auth/google/logout` | `GET` | `logoutHandler` |
| `/api/ga4/claim-session` | `POST`, `OPTIONS` | `claimSessionHandler` |
| `/api/ga4/run-report` | `POST`, `OPTIONS` | `runReportHandler` |

```ts
// app/api/ga4/claim-session/route.ts
import {claimSessionHandler} from '@yaya-digital/sanity-plugin-ga-dashboard/server'

export const POST = claimSessionHandler
export const OPTIONS = claimSessionHandler
```

## Web app environment

| Variable | Purpose |
|---|---|
| `YAYA_GA_OAUTH_CLIENT_ID` | OAuth client ID. One client per site. |
| `YAYA_GA_OAUTH_CLIENT_SECRET` | OAuth client secret. Server only. |
| `GA4_PROPERTY_ID` | Numeric GA4 property ID (not the `G-…` measurement ID). |
| `GA_TOKEN_ENC_KEY` | 64 hex characters (`openssl rand -hex 32`). Encrypts refresh tokens at rest. |
| `NEXT_PUBLIC_SANITY_STUDIO_URL` | The Studio's exact origin. The only origin CORS allows. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Vercel KV. Required: PKCE state, sessions and rate limiting live there, with no fallback. |

`@vercel/kv` is a peer dependency of the server entry; install it in the web app.

Register `https://<site>/api/auth/google/callback` (and
`http://localhost:3000/api/auth/google/callback` for local work) as redirect URIs on the site's
OAuth client.

## How a connect works

The Studio and the web app are on different sites, so the session cookie the callback sets never
reaches the Studio, and cross-origin isolation severs the popup handle.

1. The Studio generates a nonce and opens `login?nonce=<nonce>` in a popup.
2. `login` stores the nonce with the PKCE verifier and redirects to Google.
3. `callback` exchanges the code, creates a session, and stashes the session ID under the nonce
   for ten minutes.
4. The Studio polls `claim-session` with the nonce. The session ID is returned once, then deleted.
5. The Studio keeps it in `localStorage.__ga_sid` and sends it as `X-GA-Session` on every
   `run-report` request. A 401 clears it and shows the connect screen again.

## Development

```
npm install
npm run typecheck
npm test
npm run build
```

Pushing a `v*` tag publishes to GitHub Packages.
