import {z} from 'zod'
import {buildCorsHeaders} from './cors'
import {parseSid, getAccessToken, checkRateLimit} from './session'

const DateRangeSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
})

const BodySchema = z.discriminatedUnion('mode', [
  z.object({mode: z.literal('event-params'), event: z.string(), dateRange: DateRangeSchema}),
  z.object({mode: z.undefined().default(undefined), dateRange: DateRangeSchema}),
])

type DateRangeInput = {startDate: string; endDate: string}

async function gaPost(
  propertyId: string,
  accessToken: string,
  body: object,
): Promise<unknown> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GA4 API error ${res.status}: ${text}`)
  }
  return res.json()
}

async function fetchAllReports(
  propertyId: string,
  accessToken: string,
  dateRange: DateRangeInput,
) {
  const dr = [{startDate: dateRange.startDate, endDate: dateRange.endDate}]
  const today = [{startDate: 'today', endDate: 'today'}]

  const [
    activeUsers,
    overview,
    timeSeries,
    hourlyToday,
    topPages,
    landingPages,
    devices,
    browsers,
    operatingSystems,
    countries,
    cities,
    trafficSources,
    channels,
    newVsReturning,
    topEvents,
    referrers,
  ] = await Promise.all([
    gaPost(propertyId, accessToken, {
      dateRanges: today,
      metrics: [{name: 'activeUsers'}],
    }),
    gaPost(propertyId, accessToken, {
      dateRanges: dr,
      metrics: [
        {name: 'totalUsers'},
        {name: 'newUsers'},
        {name: 'sessions'},
        {name: 'screenPageViews'},
        {name: 'averageSessionDuration'},
        {name: 'bounceRate'},
        {name: 'engagedSessions'},
        {name: 'engagementRate'},
        {name: 'screenPageViewsPerSession'},
        {name: 'eventsPerSession'},
      ],
    }),
    gaPost(propertyId, accessToken, {
      dateRanges: dr,
      dimensions: [{name: 'date'}],
      metrics: [{name: 'totalUsers'}, {name: 'sessions'}, {name: 'screenPageViews'}],
      orderBys: [{dimension: {dimensionName: 'date'}}],
    }),
    gaPost(propertyId, accessToken, {
      dateRanges: today,
      dimensions: [{name: 'hour'}],
      metrics: [{name: 'totalUsers'}, {name: 'sessions'}],
      orderBys: [{dimension: {dimensionName: 'hour'}}],
    }),
    gaPost(propertyId, accessToken, {
      dateRanges: dr,
      dimensions: [{name: 'pagePath'}],
      metrics: [{name: 'screenPageViews'}, {name: 'totalUsers'}],
      orderBys: [{metric: {metricName: 'screenPageViews'}, desc: true}],
      limit: 20,
    }),
    gaPost(propertyId, accessToken, {
      dateRanges: dr,
      dimensions: [{name: 'landingPage'}],
      metrics: [{name: 'sessions'}, {name: 'totalUsers'}, {name: 'bounceRate'}],
      orderBys: [{metric: {metricName: 'sessions'}, desc: true}],
      limit: 20,
    }),
    gaPost(propertyId, accessToken, {
      dateRanges: dr,
      dimensions: [{name: 'deviceCategory'}],
      metrics: [{name: 'sessions'}],
      orderBys: [{metric: {metricName: 'sessions'}, desc: true}],
    }),
    gaPost(propertyId, accessToken, {
      dateRanges: dr,
      dimensions: [{name: 'browser'}],
      metrics: [{name: 'sessions'}],
      orderBys: [{metric: {metricName: 'sessions'}, desc: true}],
      limit: 10,
    }),
    gaPost(propertyId, accessToken, {
      dateRanges: dr,
      dimensions: [{name: 'operatingSystem'}],
      metrics: [{name: 'sessions'}],
      orderBys: [{metric: {metricName: 'sessions'}, desc: true}],
      limit: 10,
    }),
    gaPost(propertyId, accessToken, {
      dateRanges: dr,
      dimensions: [{name: 'country'}],
      metrics: [{name: 'totalUsers'}, {name: 'sessions'}],
      orderBys: [{metric: {metricName: 'sessions'}, desc: true}],
      limit: 20,
    }),
    gaPost(propertyId, accessToken, {
      dateRanges: dr,
      dimensions: [{name: 'city'}, {name: 'country'}],
      metrics: [{name: 'totalUsers'}, {name: 'sessions'}],
      orderBys: [{metric: {metricName: 'sessions'}, desc: true}],
      limit: 20,
    }),
    gaPost(propertyId, accessToken, {
      dateRanges: dr,
      dimensions: [{name: 'sessionSource'}, {name: 'sessionMedium'}],
      metrics: [{name: 'sessions'}, {name: 'totalUsers'}],
      orderBys: [{metric: {metricName: 'sessions'}, desc: true}],
      limit: 20,
    }),
    gaPost(propertyId, accessToken, {
      dateRanges: dr,
      dimensions: [{name: 'sessionDefaultChannelGroup'}],
      metrics: [{name: 'sessions'}, {name: 'totalUsers'}, {name: 'engagementRate'}],
      orderBys: [{metric: {metricName: 'sessions'}, desc: true}],
    }),
    gaPost(propertyId, accessToken, {
      dateRanges: dr,
      dimensions: [{name: 'newVsReturning'}],
      metrics: [{name: 'totalUsers'}],
    }),
    gaPost(propertyId, accessToken, {
      dateRanges: dr,
      dimensions: [{name: 'eventName'}],
      metrics: [{name: 'eventCount'}, {name: 'totalUsers'}],
      orderBys: [{metric: {metricName: 'eventCount'}, desc: true}],
      limit: 20,
    }),
    gaPost(propertyId, accessToken, {
      dateRanges: dr,
      dimensions: [{name: 'sessionSourceMedium'}],
      metrics: [{name: 'sessions'}, {name: 'totalUsers'}],
      dimensionFilter: {
        filter: {
          fieldName: 'sessionMedium',
          stringFilter: {matchType: 'EXACT', value: 'referral'},
        },
      },
      orderBys: [{metric: {metricName: 'sessions'}, desc: true}],
      limit: 20,
    }),
  ])

  return {
    activeUsers,
    overview,
    timeSeries,
    hourlyToday,
    topPages,
    landingPages,
    devices,
    browsers,
    operatingSystems,
    countries,
    cities,
    trafficSources,
    channels,
    newVsReturning,
    topEvents,
    referrers,
  }
}

async function fetchEventParams(
  propertyId: string,
  accessToken: string,
  eventName: string,
  dateRange: DateRangeInput,
): Promise<{rows?: unknown[]}> {
  const dr = [{startDate: dateRange.startDate, endDate: dateRange.endDate}]

  // Fetch event metadata to discover custom dimensions
  const metaRes = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}/metadata`,
    {headers: {Authorization: `Bearer ${accessToken}`}},
  )
  const meta = metaRes.ok
    ? ((await metaRes.json()) as {dimensions?: {apiName: string; category?: string}[]})
    : {dimensions: []}

  const customDims = (meta.dimensions ?? [])
    .filter((d) => d.apiName.startsWith('customEvent:') && d.category === 'EVENT')
    .map((d) => d.apiName)

  const BATCH = 5
  const allRows: unknown[] = []

  for (let i = 0; i < customDims.length; i += BATCH) {
    if (i > 0) await new Promise((r) => setTimeout(r, 200))
    const batch = customDims.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map((dim) =>
        gaPost(propertyId, accessToken, {
          dateRanges: dr,
          dimensions: [{name: 'eventName'}, {name: dim}],
          metrics: [{name: 'eventCount'}],
          dimensionFilter: {
            filter: {fieldName: 'eventName', stringFilter: {matchType: 'EXACT', value: eventName}},
          },
          orderBys: [{metric: {metricName: 'eventCount'}, desc: true}],
          limit: 10,
        }).then((data: unknown) => {
          const d = data as {rows?: {dimensionValues?: {value: string}[]}[]}
          return (d.rows ?? []).map((row) => ({
            paramName: dim.replace('customEvent:', ''),
            paramValue: row.dimensionValues?.[1]?.value ?? '',
            eventCount: row.dimensionValues?.[0]?.value ?? 0,
          }))
        }),
      ),
    )
    for (const r of results) {
      if (r.status === 'fulfilled') allRows.push(...r.value)
    }
  }

  return {rows: allRows}
}

export async function runReport(request: Request): Promise<Response> {
  const studioOrigin = process.env.NEXT_PUBLIC_SANITY_STUDIO_URL ?? ''
  const corsHeaders = buildCorsHeaders(studioOrigin, request)

  if (request.method === 'OPTIONS') {
    return new Response(null, {status: 204, headers: corsHeaders})
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({error: 'Method not allowed'}), {
      status: 405,
      headers: {...corsHeaders, 'Content-Type': 'application/json'},
    })
  }

  const sid = parseSid(request.headers.get('cookie'))
  if (!sid) {
    return new Response(JSON.stringify({error: 'Unauthenticated'}), {
      status: 401,
      headers: {...corsHeaders, 'Content-Type': 'application/json'},
    })
  }

  const withinLimit = await checkRateLimit(sid)
  if (!withinLimit) {
    return new Response(JSON.stringify({error: 'Rate limit exceeded'}), {
      status: 429,
      headers: {...corsHeaders, 'Content-Type': 'application/json'},
    })
  }

  const clientId = process.env.YAYA_GA_OAUTH_CLIENT_ID!
  const clientSecret = process.env.YAYA_GA_OAUTH_CLIENT_SECRET!
  const encKey = process.env.GA_TOKEN_ENC_KEY!
  const propertyId = process.env.GA4_PROPERTY_ID!

  if (!clientId || !clientSecret || !encKey || !propertyId) {
    return new Response(JSON.stringify({error: 'Server misconfigured'}), {
      status: 500,
      headers: {...corsHeaders, 'Content-Type': 'application/json'},
    })
  }

  const accessToken = await getAccessToken(sid, encKey, clientId, clientSecret)
  if (!accessToken) {
    return new Response(JSON.stringify({error: 'Unauthenticated'}), {
      status: 401,
      headers: {...corsHeaders, 'Content-Type': 'application/json'},
    })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({error: 'Invalid JSON'}), {
      status: 400,
      headers: {...corsHeaders, 'Content-Type': 'application/json'},
    })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return new Response(JSON.stringify({error: 'Invalid request body'}), {
      status: 400,
      headers: {...corsHeaders, 'Content-Type': 'application/json'},
    })
  }

  try {
    let result: unknown
    if (parsed.data.mode === 'event-params') {
      result = await fetchEventParams(propertyId, accessToken, parsed.data.event, parsed.data.dateRange)
    } else {
      result = await fetchAllReports(propertyId, accessToken, parsed.data.dateRange)
    }
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {...corsHeaders, 'Content-Type': 'application/json'},
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({error: message}), {
      status: 502,
      headers: {...corsHeaders, 'Content-Type': 'application/json'},
    })
  }
}
