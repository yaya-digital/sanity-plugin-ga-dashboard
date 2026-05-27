export type DateRange = '7' | '14' | '30' | '90'

export interface OverviewMetrics {
  totalUsers: number
  newUsers: number
  sessions: number
  pageViews: number
  avgSessionDuration: number
  bounceRate: number
  engagedSessions: number
  engagementRate: number
  pagesPerSession: number
  eventsPerSession: number
}

export interface TimeSeriesDataPoint {
  date: string
  displayDate: string
  users: number
  sessions: number
  pageViews: number
}

export interface HourlyDataPoint {
  hour: string
  label: string
  users: number
  sessions: number
}

export interface TopPage {
  path: string
  pageViews: number
  users: number
}

export interface LandingPage {
  path: string
  sessions: number
  users: number
  bounceRate: number
}

export interface DeviceCategory {
  device: string
  sessions: number
  percentage: number
}

export interface BrowserData {
  browser: string
  sessions: number
  percentage: number
}

export interface OsData {
  os: string
  sessions: number
  percentage: number
}

export interface CountryData {
  country: string
  users: number
  sessions: number
}

export interface CityData {
  city: string
  country: string
  users: number
  sessions: number
}

export interface TrafficSource {
  source: string
  sessions: number
  users: number
}

export interface ChannelData {
  channel: string
  sessions: number
  users: number
  engagementRate: number
}

export interface UserTypeData {
  type: string
  users: number
  percentage: number
}

export interface EventData {
  name: string
  count: number
  usersCount: number
}

export interface EventParamRow {
  paramKey: string
  paramValue: string
  count: number
}

export interface ReferrerData {
  referrer: string
  sessions: number
  users: number
}

export interface AnalyticsData {
  activeUsers: number
  overview: OverviewMetrics
  timeSeries: TimeSeriesDataPoint[]
  hourlyToday: HourlyDataPoint[]
  topPages: TopPage[]
  landingPages: LandingPage[]
  devices: DeviceCategory[]
  browsers: BrowserData[]
  operatingSystems: OsData[]
  countries: CountryData[]
  cities: CityData[]
  trafficSources: TrafficSource[]
  channels: ChannelData[]
  newVsReturning: UserTypeData[]
  topEvents: EventData[]
  referrers: ReferrerData[]
}

export interface GoogleAnalyticsPluginConfig {
  bffOrigin?: string
  propertyId?: string
  disabled?: boolean
}
