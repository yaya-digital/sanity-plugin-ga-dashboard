import type {
  AnalyticsData,
  BrowserData,
  ChannelData,
  CityData,
  CountryData,
  DateRange,
  DeviceCategory,
  EventData,
  EventParamRow,
  HourlyDataPoint,
  LandingPage,
  OsData,
  OverviewMetrics,
  ReferrerData,
  TimeSeriesDataPoint,
  TopPage,
  TrafficSource,
  UserTypeData,
} from '../types'

export async function fetchAnalyticsData(
  bffOrigin: string,
  dateRange: DateRange,
): Promise<AnalyticsData> {
  const res = await fetch(`${bffOrigin}/api/ga4/run-report`, {
    method: 'POST',
    credentials: 'include',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({dateRange}),
    cache: 'no-store',
  })
  if (res.status === 401) throw new Error('GA_UNAUTHENTICATED')
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(
      (err as {error?: string})?.error || `Analytics API error: ${res.status} ${res.statusText}`,
    )
  }
  return parseResponse(await res.json())
}

export async function fetchEventParams(
  bffOrigin: string,
  eventName: string,
  dateRange: DateRange,
): Promise<EventParamRow[]> {
  const res = await fetch(`${bffOrigin}/api/ga4/run-report`, {
    method: 'POST',
    credentials: 'include',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({mode: 'event-params', event: eventName, dateRange}),
    cache: 'no-store',
  })
  if (res.status === 401) throw new Error('GA_UNAUTHENTICATED')
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(
      (err as {error?: string})?.error || `Event params API error: ${res.status} ${res.statusText}`,
    )
  }
  const json = await res.json()
  return (json.rows ?? []) as EventParamRow[]
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const mv = (row: any, i: number): number => parseFloat(row?.metricValues?.[i]?.value ?? '0')
const dv = (row: any, i: number): string => row?.dimensionValues?.[i]?.value ?? ''

function totalOf(data: any): number {
  if (!data?.rows) return 0
  return data.rows.reduce((s: number, r: any) => s + mv(r, 0), 0)
}

function parseOverview(d: any): OverviewMetrics {
  const row = d?.rows?.[0]
  if (!row)
    return {
      totalUsers: 0,
      newUsers: 0,
      sessions: 0,
      pageViews: 0,
      avgSessionDuration: 0,
      bounceRate: 0,
      engagedSessions: 0,
      engagementRate: 0,
      pagesPerSession: 0,
      eventsPerSession: 0,
    }
  return {
    totalUsers: mv(row, 0),
    newUsers: mv(row, 1),
    sessions: mv(row, 2),
    pageViews: mv(row, 3),
    avgSessionDuration: mv(row, 4),
    bounceRate: mv(row, 5),
    engagedSessions: mv(row, 6),
    engagementRate: mv(row, 7),
    pagesPerSession: mv(row, 8),
    eventsPerSession: mv(row, 9),
  }
}

function parseTimeSeries(d: any): TimeSeriesDataPoint[] {
  if (!d?.rows) return []
  return d.rows.map((row: any) => {
    const s = dv(row, 0)
    return {
      date: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`,
      displayDate: `${s.slice(4, 6)}/${s.slice(6, 8)}`,
      users: mv(row, 0),
      sessions: mv(row, 1),
      pageViews: mv(row, 2),
    }
  })
}

function parseHourly(d: any): HourlyDataPoint[] {
  if (!d?.rows) return []
  return d.rows.map((row: any) => {
    const h = parseInt(dv(row, 0), 10)
    const suffix = h < 12 ? 'AM' : 'PM'
    const display = h === 0 ? '12AM' : h <= 12 ? `${h}${suffix}` : `${h - 12}${suffix}`
    return {hour: dv(row, 0), label: display, users: mv(row, 0), sessions: mv(row, 1)}
  })
}

function parseTopPages(d: any): TopPage[] {
  if (!d?.rows) return []
  return d.rows.map((row: any) => ({path: dv(row, 0), pageViews: mv(row, 0), users: mv(row, 1)}))
}

function parseLandingPages(d: any): LandingPage[] {
  if (!d?.rows) return []
  return d.rows.map((row: any) => ({
    path: dv(row, 0),
    sessions: mv(row, 0),
    users: mv(row, 1),
    bounceRate: mv(row, 2),
  }))
}

function parseWithPercentage(
  d: any,
  dimIdx: number,
  metricIdx: number,
): {name: string; sessions: number; percentage: number}[] {
  if (!d?.rows) return []
  const total = totalOf(d)
  return d.rows.map((row: any) => {
    const sessions = mv(row, metricIdx)
    return {
      name: dv(row, dimIdx),
      sessions,
      percentage: total > 0 ? Math.round((sessions / total) * 1000) / 10 : 0,
    }
  })
}

function parseDevices(d: any): DeviceCategory[] {
  return parseWithPercentage(d, 0, 0).map((x) => ({
    device: x.name,
    sessions: x.sessions,
    percentage: x.percentage,
  }))
}

function parseBrowsers(d: any): BrowserData[] {
  return parseWithPercentage(d, 0, 0).map((x) => ({
    browser: x.name,
    sessions: x.sessions,
    percentage: x.percentage,
  }))
}

function parseOS(d: any): OsData[] {
  return parseWithPercentage(d, 0, 0).map((x) => ({
    os: x.name,
    sessions: x.sessions,
    percentage: x.percentage,
  }))
}

function parseCountries(d: any): CountryData[] {
  if (!d?.rows) return []
  return d.rows.map((row: any) => ({country: dv(row, 0), users: mv(row, 0), sessions: mv(row, 1)}))
}

function parseCities(d: any): CityData[] {
  if (!d?.rows) return []
  return d.rows.map((row: any) => ({
    city: dv(row, 0),
    country: dv(row, 1),
    users: mv(row, 0),
    sessions: mv(row, 1),
  }))
}

function parseSources(d: any): TrafficSource[] {
  if (!d?.rows) return []
  return d.rows.map((row: any) => ({
    source: [dv(row, 0), dv(row, 1)].filter(Boolean).join(' / '),
    sessions: mv(row, 0),
    users: mv(row, 1),
  }))
}

function parseChannels(d: any): ChannelData[] {
  if (!d?.rows) return []
  return d.rows.map((row: any) => ({
    channel: dv(row, 0),
    sessions: mv(row, 0),
    users: mv(row, 1),
    engagementRate: mv(row, 2),
  }))
}

function parseNewVsReturning(d: any): UserTypeData[] {
  if (!d?.rows) return []
  const total = totalOf(d)
  return d.rows.map((row: any) => {
    const users = mv(row, 0)
    return {
      type: dv(row, 0),
      users,
      percentage: total > 0 ? Math.round((users / total) * 1000) / 10 : 0,
    }
  })
}

function parseEvents(d: any): EventData[] {
  if (!d?.rows) return []
  return d.rows.map((row: any) => ({name: dv(row, 0), count: mv(row, 0), usersCount: mv(row, 1)}))
}

function parseReferrers(d: any): ReferrerData[] {
  if (!d?.rows) return []
  return d.rows.map((row: any) => ({
    referrer: dv(row, 0) || '(direct)',
    sessions: mv(row, 0),
    users: mv(row, 1),
  }))
}

function parseActiveUsers(d: any): number {
  return parseInt(d?.rows?.[0]?.metricValues?.[0]?.value ?? '0', 10)
}

function parseResponse(raw: any): AnalyticsData {
  return {
    activeUsers: parseActiveUsers(raw.activeUsers),
    overview: parseOverview(raw.overview),
    timeSeries: parseTimeSeries(raw.timeSeries),
    hourlyToday: parseHourly(raw.hourlyToday),
    topPages: parseTopPages(raw.topPages),
    landingPages: parseLandingPages(raw.landingPages),
    devices: parseDevices(raw.devices),
    browsers: parseBrowsers(raw.browsers),
    operatingSystems: parseOS(raw.operatingSystems),
    countries: parseCountries(raw.countries),
    cities: parseCities(raw.cities),
    trafficSources: parseSources(raw.trafficSources),
    channels: parseChannels(raw.channels),
    newVsReturning: parseNewVsReturning(raw.newVsReturning),
    topEvents: parseEvents(raw.topEvents),
    referrers: parseReferrers(raw.referrers),
  }
}
