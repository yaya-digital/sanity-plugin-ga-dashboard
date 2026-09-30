import {useState, useEffect, useCallback, useRef} from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import type {AnalyticsData, DateRange, EventParamRow} from '../types'
import {claimSession, fetchAnalyticsData, fetchEventParams, storeSid} from '../utils/ga-api'

/* ─────────────────────────────────────────────
   Constants
───────────────────────────────────────────── */
const DATE_RANGES: {label: string; value: DateRange}[] = [
  {label: '7d', value: '7'},
  {label: '14d', value: '14'},
  {label: '30d', value: '30'},
  {label: '90d', value: '90'},
]

const PALETTE = ['#4f8ef7','#3ecf8e','#f6b93b','#e55353','#a55eea','#26c0d3','#fd9644','#20bf6b']

const DEVICE_COLORS: Record<string, string> = {
  desktop: '#4f8ef7', mobile: '#3ecf8e', tablet: '#f6b93b',
}
const CHANNEL_COLORS: Record<string, string> = {
  'Organic Search': '#3ecf8e', 'Direct': '#4f8ef7', 'Referral': '#f6b93b',
  'Organic Social': '#e55353', 'Email': '#a55eea', 'Paid Search': '#26c0d3', 'Display': '#fd9644',
}

const METRIC_INFO: Record<string, string> = {
  'Total Users':      'Unique users who visited your site in the selected period.',
  'New Users':        'First-time visitors — users who have never visited before.',
  'Sessions':         'Total browsing sessions. One user can have multiple sessions.',
  'Page Views':       'Total pages viewed, including repeated views of the same page.',
  'Avg. Duration':    'Average time a user spends in a single session.',
  'Bounce Rate':      'Percentage of sessions where the user left without any interaction.',
  'Engaged Sessions': 'Sessions lasting 10+ seconds, or with a conversion, or 2+ page views.',
  'Engagement Rate':  'Percentage of total sessions that were engaged sessions.',
  'Pages / Session':  'Average number of pages a user views per session.',
  'Events / Session': 'Average number of events (clicks, scrolls, etc.) fired per session.',
}

const SECTION_INFO: Record<string, string> = {
  'Users & Sessions Over Time': 'Daily breakdown of users, sessions and page views over the selected date range.',
  'Traffic by Hour — Today':    'How traffic is distributed across each hour of today.',
  'Channel Grouping':           'Which marketing channels are driving sessions (Organic, Direct, Social, etc.).',
  'Top Pages':                  'Most visited pages ranked by page view count.',
  'Top Landing Pages':          'First pages users arrive on, ranked by session count. High bounce rate may indicate poor landing experience.',
  'Devices':                    'Share of sessions split by device type (desktop, mobile, tablet).',
  'New vs Returning':           'Ratio of first-time visitors to users who have visited before.',
  'Browsers':                   'Which web browsers your visitors are using.',
  'Operating Systems':          'Which operating systems your visitors are running.',
  'Top Events':                 'All events fired on your site (clicks, scrolls, form submits, custom events).',
  'Top Countries':              'Countries your users are visiting from, ranked by user count.',
  'Top Cities':                 'Cities your users are visiting from, ranked by user count.',
  'Traffic Sources':            'Source and medium pairs showing where your traffic originates.',
  'Top Referrers':              'Specific pages on other websites that linked to your site.',
}

/* ─────────────────────────────────────────────
   Sidebar tabs
───────────────────────────────────────────── */
type Tab = 'overview' | 'traffic' | 'content' | 'audience' | 'geography' | 'events' | 'acquisition'

const TABS: {id: Tab; label: string; icon: string}[] = [
  {id: 'overview',     label: 'Overview',     icon: '▦'},
  {id: 'traffic',      label: 'Traffic',      icon: '↗'},
  {id: 'content',      label: 'Content',      icon: '≡'},
  {id: 'audience',     label: 'Audience',     icon: '◉'},
  {id: 'geography',    label: 'Geography',    icon: '⊕'},
  {id: 'events',       label: 'Events',       icon: '⚡'},
  {id: 'acquisition',  label: 'Acquisition',  icon: '⤴'},
]

/* ─────────────────────────────────────────────
   Formatters
───────────────────────────────────────────── */
const fNum = (n: number) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : n.toLocaleString()
const fDur = (s: number) => { const m = Math.floor(s/60); const sec = Math.round(s%60); return m > 0 ? `${m}m ${sec}s` : `${sec}s` }
const fPct = (v: number) => `${(v*100).toFixed(1)}%`
const fEngPct = (v: number) => `${(v*100).toFixed(0)}%`

/* ─────────────────────────────────────────────
   Global CSS (injected once)
───────────────────────────────────────────── */
const GLOBAL_CSS = `
@keyframes ga-spin   { to { transform: rotate(360deg); } }
@keyframes ga-pulse  { 0%,100%{box-shadow:0 0 0 3px rgba(62,207,142,.3)} 50%{box-shadow:0 0 0 7px rgba(62,207,142,.08)} }
@keyframes ga-fadein { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
@keyframes ga-shimmer { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
.ga-skel {
  background:linear-gradient(90deg,#f1f5f9 25%,#e8eef4 50%,#f1f5f9 75%);
  background-size:1200px 100%; animation:ga-shimmer 1.4s infinite linear; border-radius:4px;
}
.ga-tooltip-wrap { position:relative; display:inline-flex; align-items:center; }
.ga-tooltip-wrap .ga-tip {
  visibility:hidden; opacity:0; pointer-events:none;
  position:absolute; bottom:calc(100% + 6px); left:50%; transform:translateX(-50%);
  background:#1e293b; color:#f1f5f9; font-size:12px; line-height:1.5;
  padding:8px 12px; border-radius:7px; white-space:normal; width:220px;
  box-shadow:0 4px 16px rgba(0,0,0,.18); z-index:9999; transition:opacity .15s;
}
.ga-tooltip-wrap .ga-tip::after {
  content:''; position:absolute; top:100%; left:50%; transform:translateX(-50%);
  border:5px solid transparent; border-top-color:#1e293b;
}
.ga-tooltip-wrap:hover .ga-tip { visibility:visible; opacity:1; }
.ga-info-btn {
  width:16px; height:16px; border-radius:50%; border:1.5px solid #94a3b8;
  background:transparent; color:#94a3b8; font-size:10px; font-weight:700;
  cursor:default; display:inline-flex; align-items:center; justify-content:center;
  margin-left:6px; flex-shrink:0; line-height:1; padding:0;
}
.ga-info-btn:hover { border-color:#4f8ef7; color:#4f8ef7; }
.ga-tab-btn { border:none; background:none; cursor:pointer; width:100%; padding:0; }
.ga-tab-btn:focus { outline:none; }
.ga-date-btn { border:none; cursor:pointer; }
.ga-retry-btn { border:none; cursor:pointer; }
`

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */

function InfoIcon({text}: {text: string}) {
  return (
    <span className="ga-tooltip-wrap">
      <button className="ga-info-btn" tabIndex={-1}>i</button>
      <span className="ga-tip">{text}</span>
    </span>
  )
}

function Skel({w, h = 14, r = 4, style}: {w?: string|number; h?: number; r?: number; style?: React.CSSProperties}) {
  return <div className="ga-skel" style={{width: w ?? '100%', height: h, borderRadius: r, flexShrink:0, ...style}} />
}

function Panel({title, children, info, style}: {
  title?: string; children: React.ReactNode; info?: string; style?: React.CSSProperties
}) {
  return (
    <div style={{background:'#fff', border:'1px solid #e2e8f0', borderRadius:10,
      padding:'20px 22px', boxSizing:'border-box', ...style}}>
      {title && (
        <div style={{display:'flex', alignItems:'center', marginBottom:16}}>
          <span style={{fontSize:13, fontWeight:600, color:'#1e293b', letterSpacing:'0.01em'}}>{title}</span>
          {info && <InfoIcon text={info} />}
        </div>
      )}
      {children}
    </div>
  )
}

function SectionLabel({children}: {children: React.ReactNode}) {
  return <div style={{fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14}}>{children}</div>
}

function DataTable({headers, rows, empty = 'No data', loading, skeletonRows = 6}: {
  headers: {label: string; align?: 'left'|'right'; width?: string}[]
  rows: (string | React.ReactNode)[][]
  empty?: string
  loading?: boolean
  skeletonRows?: number
}) {
  return (
    <div style={{width:'100%', overflowX:'auto'}}>
      <table style={{width:'100%', borderCollapse:'collapse', fontSize:13, tableLayout:'fixed'}}>
        <thead>
          <tr>
            {headers.map((h,i) => (
              <th key={i} style={{padding:'6px 10px', textAlign:h.align??'left', color:'#94a3b8',
                fontWeight:600, fontSize:11, borderBottom:'1px solid #f1f5f9',
                textTransform:'uppercase', letterSpacing:'0.05em', width:h.width, whiteSpace:'nowrap'}}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({length: skeletonRows}).map((_,ri) => (
              <tr key={ri} style={{borderBottom:'1px solid #f8fafc'}}>
                {headers.map((_h,ci) => (
                  <td key={ci} style={{padding:'9px 10px'}}>
                    <Skel w={ci === 0 ? `${60 + (ri * 7) % 30}%` : '70%'} h={12} />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr><td colSpan={headers.length} style={{padding:'28px', textAlign:'center', color:'#cbd5e1', fontSize:13}}>{empty}</td></tr>
          ) : rows.map((row,ri) => (
            <tr key={ri} style={{borderBottom:'1px solid #f8fafc', transition:'background .1s'}}
              onMouseEnter={e => (e.currentTarget.style.background='#f8fafc')}
              onMouseLeave={e => (e.currentTarget.style.background='')}>
              {row.map((cell,ci) => (
                <td key={ci} style={{padding:'9px 10px', textAlign:headers[ci]?.align??'left',
                  color:ci===0?'#334155':ci===1?'#1e293b':'#94a3b8',
                  fontWeight:ci===1?600:400, verticalAlign:'middle'}}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Donut({data, colors, info, loading}: {
  data: {name: string; value: number; percentage: number}[]
  colors: string[]
  info?: string
  loading?: boolean
}) {
  if (loading) return (
    <div>
      <div style={{display:'flex',justifyContent:'center',padding:'16px 0'}}>
        <div className="ga-skel" style={{width:120,height:120,borderRadius:'50%'}} />
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:4}}>
        {Array.from({length:3}).map((_,i) => (
          <div key={i} style={{display:'flex',alignItems:'center',gap:8}}>
            <div className="ga-skel" style={{width:8,height:8,borderRadius:2,flexShrink:0}} />
            <Skel w={`${50 + i * 12}%`} h={11} />
            <Skel w={30} h={11} style={{marginLeft:'auto'}} />
          </div>
        ))}
      </div>
    </div>
  )
  if (data.length === 0) return <div style={{color:'#cbd5e1',fontSize:13,padding:'20px 0',textAlign:'center'}}>No data</div>
  return (
    <div>
      <div style={{height:180}}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
              innerRadius={48} outerRadius={76} paddingAngle={2}>
              {data.map((_,i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => fNum(Number(v))}
              contentStyle={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:7,fontSize:13}} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {info && <div style={{fontSize:12,color:'#94a3b8',textAlign:'center',marginBottom:12}}>{info}</div>}
      <div style={{display:'flex',flexDirection:'column',gap:7}}>
        {data.map((d,i) => (
          <div key={d.name} style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:9,height:9,borderRadius:2,background:colors[i%colors.length],flexShrink:0}} />
            <span style={{flex:1,fontSize:13,color:'#475569',textTransform:'capitalize'}}>{d.name}</span>
            <span style={{fontSize:12,color:'#cbd5e1'}}>{d.percentage}%</span>
            <span style={{fontSize:13,fontWeight:600,color:'#1e293b',minWidth:40,textAlign:'right'}}>{fNum(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricCard({label, value, sub, color, info, loading}: {
  label: string; value: string; sub?: string; color: string; info?: string; loading?: boolean
}) {
  return (
    <div style={{flex:'1 1 140px', minWidth:132, background:'#fff', border:'1px solid #e2e8f0',
      borderRadius:10, padding:'16px 18px', boxSizing:'border-box', transition:'box-shadow .15s'}}
      onMouseEnter={e => (e.currentTarget.style.boxShadow='0 4px 14px rgba(0,0,0,.07)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow='')}>
      <div style={{display:'flex',alignItems:'center',marginBottom:10}}>
        <span style={{fontSize:11,color:'#94a3b8',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',flex:1}}>{label}</span>
        {info && <InfoIcon text={info} />}
      </div>
      {loading
        ? <><Skel w="55%" h={22} r={5} />{sub && <Skel w="40%" h={11} style={{marginTop:6}} />}</>
        : <><div style={{fontSize:26,fontWeight:700,color,lineHeight:1,marginBottom:sub?4:0}}>{value}</div>
            {sub && <div style={{fontSize:12,color:'#94a3b8',marginTop:3}}>{sub}</div>}</>
      }
    </div>
  )
}

function ActiveBadge({count, loading}: {count: number; loading?: boolean}) {
  return (
    <div style={{display:'inline-flex',alignItems:'center',gap:10,background:'#f0fdf9',
      border:'1px solid #a7f3d0',borderRadius:10,padding:'12px 20px',marginBottom:20}}>
      <div style={{width:10,height:10,borderRadius:'50%',background:'#10b981',
        animation:'ga-pulse 2s infinite',flexShrink:0}} />
      {loading
        ? <Skel w={80} h={20} r={5} />
        : <span style={{fontSize:22,fontWeight:700,color:'#065f46'}}>{count.toLocaleString()}</span>
      }
      <span style={{fontSize:13,color:'#047857'}}>users active right now</span>
      <InfoIcon text="Real-time count of users active on your site in the last 30 minutes." />
    </div>
  )
}

function PathCell({path}: {path: string}) {
  return (
    <span title={path} style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',
      whiteSpace:'nowrap',color:'#4f8ef7',fontSize:13}}>
      {path}
    </span>
  )
}

function EmptyTab() {
  return <div style={{display:'flex',justifyContent:'center',alignItems:'center',minHeight:300,color:'#cbd5e1',fontSize:14}}>No data to display</div>
}

function SkeletonChart({height}: {height: number}) {
  return (
    <div style={{position:'relative',height,overflow:'hidden'}}>
      <Skel w="100%" h={height} r={6} />
      <div style={{position:'absolute',bottom:0,left:0,right:0,display:'flex',justifyContent:'space-between',
        padding:'0 4px 6px',gap:4,pointerEvents:'none'}}>
        {Array.from({length:7}).map((_,i) => <Skel key={i} w={32} h={10} r={3} />)}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   Connect UI
───────────────────────────────────────────── */
const CLAIM_POLL_MS = 1500
const CLAIM_TIMEOUT_MS = 180000

function newNonce(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return String(Date.now()) + Math.random().toString(36).slice(2)
  }
}

function ConnectUI({bffOrigin, onConnected}: {bffOrigin: string; onConnected: () => void}) {
  const stopPolling = useRef<() => void>(() => {})
  useEffect(() => () => stopPolling.current(), [])

  // The popup ends on the BFF's origin, so the Studio can neither read its
  // cookie nor rely on window.closed (COOP severs the handle). Poll the BFF
  // with a nonce instead; the callback stashes the session ID under it.
  const handleConnect = () => {
    stopPolling.current()
    const nonce = newNonce()
    window.open(`${bffOrigin}/api/auth/google/login?nonce=${encodeURIComponent(nonce)}`, 'ga-oauth', 'width=600,height=700')
    const timer = setInterval(() => {
      claimSession(bffOrigin, nonce)
        .then((sid) => {
          if (!sid) return
          stopPolling.current()
          storeSid(sid)
          onConnected()
        })
        .catch(() => {})
    }, CLAIM_POLL_MS)
    const timeout = setTimeout(() => stopPolling.current(), CLAIM_TIMEOUT_MS)
    stopPolling.current = () => {
      clearInterval(timer)
      clearTimeout(timeout)
      stopPolling.current = () => {}
    }
  }
  return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',minHeight:'100vh',background:'#f8fafc'}}>
      <style>{GLOBAL_CSS}</style>
      <div style={{maxWidth:440,width:'100%',background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:40,textAlign:'center'}}>
        <h2 style={{margin:'0 0 8px',fontSize:20,fontWeight:700,color:'#1e293b'}}>Connect Google Analytics</h2>
        <p style={{margin:'0 0 28px',fontSize:14,color:'#64748b',lineHeight:1.6}}>
          Sign in with the Google account that has access to this property.
        </p>
        <button
          onClick={handleConnect}
          style={{padding:'12px 28px',background:'#4f8ef7',color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:'pointer'}}
        >
          Connect Google Analytics
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   Tab views
───────────────────────────────────────────── */
function OverviewTab({data, loading}: {data: AnalyticsData; loading?: boolean}) {
  return (
    <div style={{animation:'ga-fadein .25s ease'}}>
      <ActiveBadge count={data.activeUsers} loading={loading} />

      <SectionLabel>Key Metrics</SectionLabel>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:24}}>
        {([
          ['Total Users',      fNum(data.overview.totalUsers),            '#4f8ef7'],
          ['New Users',        fNum(data.overview.newUsers),               '#3ecf8e'],
          ['Sessions',         fNum(data.overview.sessions),               '#f6b93b'],
          ['Page Views',       fNum(data.overview.pageViews),              '#e55353'],
          ['Avg. Duration',    fDur(data.overview.avgSessionDuration),     '#a55eea'],
          ['Bounce Rate',      fPct(data.overview.bounceRate),             '#fd9644'],
        ] as [string,string,string][]).map(([l,v,c]) => (
          <MetricCard key={l} label={l} value={v} color={c} info={METRIC_INFO[l]} loading={loading} />
        ))}
      </div>

      <SectionLabel>Engagement</SectionLabel>
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        {([
          ['Engaged Sessions',  fNum(data.overview.engagedSessions),         '#26c0d3'],
          ['Engagement Rate',   fEngPct(data.overview.engagementRate),       '#3ecf8e'],
          ['Pages / Session',   data.overview.pagesPerSession.toFixed(1),    '#8b5cf6'],
          ['Events / Session',  data.overview.eventsPerSession.toFixed(1),   '#f59e0b'],
        ] as [string,string,string][]).map(([l,v,c]) => (
          <MetricCard key={l} label={l} value={v} color={c} info={METRIC_INFO[l]} loading={loading} />
        ))}
      </div>
    </div>
  )
}

function TrafficTab({data, loading}: {data: AnalyticsData; loading?: boolean}) {
  const channelBar = data.channels.map(c => ({name:c.channel, Sessions:c.sessions, Users:c.users}))
  return (
    <div style={{animation:'ga-fadein .25s ease', display:'flex', flexDirection:'column', gap:20}}>
      <Panel title="Users, Sessions & Page Views" info={SECTION_INFO['Users & Sessions Over Time']}>
        {loading
          ? <SkeletonChart height={300} />
          : <div style={{height:300}}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.timeSeries} margin={{top:4,right:8,left:0,bottom:0}}>
                  <defs>
                    {[['gU','#4f8ef7'],['gS','#3ecf8e'],['gP','#e55353']].map(([id,c]) => (
                      <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={c} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={c} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="displayDate" fontSize={11} tick={{fill:'#94a3b8'}} axisLine={false} tickLine={false} />
                  <YAxis fontSize={11} tick={{fill:'#94a3b8'}} axisLine={false} tickLine={false} width={36} />
                  <Tooltip contentStyle={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:7,fontSize:13}} cursor={{stroke:'#f1f5f9'}} />
                  <Legend wrapperStyle={{fontSize:13,paddingTop:10}} />
                  <Area type="monotone" dataKey="users"     name="Users"    stroke="#4f8ef7" fill="url(#gU)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="sessions"  name="Sessions" stroke="#3ecf8e" fill="url(#gS)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="pageViews" name="Pages"    stroke="#e55353" fill="url(#gP)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
        }
      </Panel>

      <Panel title="Traffic by Hour — Today" info={SECTION_INFO['Traffic by Hour — Today']}>
        {loading
          ? <SkeletonChart height={220} />
          : <div style={{height:220}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.hourlyToday} margin={{top:4,right:8,left:0,bottom:0}} barSize={12} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" fontSize={11} tick={{fill:'#94a3b8'}} axisLine={false} tickLine={false} interval={1} />
                  <YAxis fontSize={11} tick={{fill:'#94a3b8'}} axisLine={false} tickLine={false} width={32} />
                  <Tooltip contentStyle={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:7,fontSize:13}} />
                  <Legend wrapperStyle={{fontSize:13,paddingTop:8}} />
                  <Bar dataKey="users"    name="Users"    fill="#4f8ef7" radius={[3,3,0,0]} />
                  <Bar dataKey="sessions" name="Sessions" fill="#3ecf8e" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
        }
      </Panel>

      <Panel title="Channel Grouping" info={SECTION_INFO['Channel Grouping']}>
        {loading
          ? <SkeletonChart height={200} />
          : <div style={{height:Math.max(200, data.channels.length * 46)}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={channelBar} layout="vertical" margin={{top:4,right:24,left:8,bottom:0}} barSize={11}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" fontSize={11} tick={{fill:'#94a3b8'}} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" fontSize={12} tick={{fill:'#475569'}} axisLine={false} tickLine={false} width={130} />
                  <Tooltip contentStyle={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:7,fontSize:13}} />
                  <Legend wrapperStyle={{fontSize:13,paddingTop:8}} />
                  <Bar dataKey="Sessions" radius={[0,3,3,0]}>
                    {channelBar.map((e,i) => <Cell key={i} fill={CHANNEL_COLORS[e.name] ?? PALETTE[i%PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
        }
      </Panel>
    </div>
  )
}

function ContentTab({data, loading}: {data: AnalyticsData; loading?: boolean}) {
  return (
    <div style={{animation:'ga-fadein .25s ease', display:'flex', flexDirection:'column', gap:20}}>
      <Panel title="Top Pages" info={SECTION_INFO['Top Pages']}>
        <DataTable loading={loading}
          headers={[{label:'Page Path'},{label:'Views',align:'right',width:'72px'},{label:'Users',align:'right',width:'62px'}]}
          rows={data.topPages.map(p => [<PathCell key={p.path} path={p.path}/>, fNum(p.pageViews), fNum(p.users)])}
        />
      </Panel>
      <Panel title="Top Landing Pages" info={SECTION_INFO['Top Landing Pages']}>
        <DataTable loading={loading}
          headers={[{label:'Landing Page'},{label:'Sessions',align:'right',width:'80px'},{label:'Bounce',align:'right',width:'68px'}]}
          rows={data.landingPages.map(p => [<PathCell key={p.path} path={p.path}/>, fNum(p.sessions), fPct(p.bounceRate)])}
        />
      </Panel>
    </div>
  )
}

function AudienceTab({data, loading}: {data: AnalyticsData; loading?: boolean}) {
  return (
    <div style={{animation:'ga-fadein .25s ease', display:'flex', flexDirection:'column', gap:20}}>
      <div style={{display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:12}}>
        <Panel title="Devices" info={SECTION_INFO['Devices']}>
          <Donut loading={loading}
            data={data.devices.map(d => ({name:d.device,value:d.sessions,percentage:d.percentage}))}
            colors={data.devices.map(d => DEVICE_COLORS[d.device.toLowerCase()] ?? '#4f8ef7')}
          />
        </Panel>
        <Panel title="New vs Returning" info={SECTION_INFO['New vs Returning']}>
          <Donut loading={loading}
            data={data.newVsReturning.map(d => ({name:d.type,value:d.users,percentage:d.percentage}))}
            colors={['#4f8ef7','#3ecf8e']}
          />
        </Panel>
        <Panel title="Browsers" info={SECTION_INFO['Browsers']}>
          <Donut loading={loading}
            data={data.browsers.map(d => ({name:d.browser,value:d.sessions,percentage:d.percentage}))}
            colors={PALETTE}
          />
        </Panel>
        <Panel title="Operating Systems" info={SECTION_INFO['Operating Systems']}>
          <Donut loading={loading}
            data={data.operatingSystems.map(d => ({name:d.os,value:d.sessions,percentage:d.percentage}))}
            colors={PALETTE}
          />
        </Panel>
      </div>
    </div>
  )
}

function GeographyTab({data, loading}: {data: AnalyticsData; loading?: boolean}) {
  return (
    <div style={{animation:'ga-fadein .25s ease', display:'flex', flexDirection:'column', gap:20}}>
      <Panel title="Top Countries" info={SECTION_INFO['Top Countries']}>
        <DataTable loading={loading}
          headers={[{label:'Country'},{label:'Users',align:'right',width:'70px'},{label:'Sessions',align:'right',width:'78px'}]}
          rows={data.countries.map(c => [c.country, fNum(c.users), fNum(c.sessions)])}
        />
      </Panel>
      <Panel title="Top Cities" info={SECTION_INFO['Top Cities']}>
        <DataTable loading={loading}
          headers={[{label:'City'},{label:'Country',width:'110px'},{label:'Users',align:'right',width:'65px'},{label:'Sessions',align:'right',width:'75px'}]}
          rows={data.cities.map(c => [
            c.city,
            <span key={c.city} style={{fontSize:12,color:'#94a3b8'}}>{c.country}</span>,
            fNum(c.users),
            fNum(c.sessions),
          ])}
        />
      </Panel>
    </div>
  )
}

function EventsTab({data, loading, bffOrigin, dateRange}: {data: AnalyticsData; loading?: boolean; bffOrigin: string; dateRange: DateRange}) {
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null)
  const [paramRows, setParamRows] = useState<EventParamRow[]>([])
  const [paramsLoading, setParamsLoading] = useState(false)
  const [paramsError, setParamsError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedEvent) { setParamRows([]); return }
    let cancelled = false
    setParamsLoading(true)
    setParamsError(null)
    fetchEventParams(bffOrigin, selectedEvent, dateRange)
      .then(rows => { if (!cancelled) setParamRows(rows) })
      .catch(err => { if (!cancelled) setParamsError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setParamsLoading(false) })
    return () => { cancelled = true }
  }, [selectedEvent, bffOrigin, dateRange])

  if (!loading && data.topEvents.length === 0) return <EmptyTab />
  return (
    <div style={{animation:'ga-fadein .25s ease', display:'flex', flexDirection:'column', gap:20}}>
      <Panel title="Top Events" info={SECTION_INFO['Top Events']}>
        <DataTable loading={loading}
          headers={[{label:'Event Name'},{label:'Count',align:'right',width:'80px'},{label:'Users',align:'right',width:'70px'}]}
          rows={data.topEvents.map(e => [
            <span key={e.name}
              onClick={() => setSelectedEvent(prev => prev === e.name ? null : e.name)}
              style={{cursor:'pointer', color: selectedEvent === e.name ? '#4f8ef7' : '#334155',
                fontWeight: selectedEvent === e.name ? 600 : 400,
                borderBottom: selectedEvent === e.name ? '1.5px solid #4f8ef7' : '1px dashed #cbd5e1',
                paddingBottom:1, transition:'all .15s'}}>
              {e.name}
            </span>,
            fNum(e.count),
            fNum(e.usersCount),
          ])}
        />
      </Panel>

      {selectedEvent && (
        <Panel title={`Parameters — ${selectedEvent}`}
          info="Custom event parameters sent with this event. Each row shows a parameter key, its value, and how many times that value was recorded."
          style={{borderColor: '#4f8ef7', borderWidth:1.5}}>
          {paramsError ? (
            <div style={{padding:16, color:'#dc2626', fontSize:13}}>{paramsError}</div>
          ) : (
            <DataTable loading={paramsLoading}
              headers={[{label:'Parameter'},{label:'Value'},{label:'Count', align:'right', width:'80px'}]}
              rows={paramRows.map(r => [r.paramKey, r.paramValue, fNum(r.count)])}
              empty="No parameters recorded for this event"
              skeletonRows={4}
            />
          )}
        </Panel>
      )}
    </div>
  )
}

function AcquisitionTab({data, loading}: {data: AnalyticsData; loading?: boolean}) {
  return (
    <div style={{animation:'ga-fadein .25s ease', display:'flex', flexDirection:'column', gap:20}}>
      <Panel title="Traffic Sources" info={SECTION_INFO['Traffic Sources']}>
        <DataTable loading={loading}
          headers={[{label:'Source / Medium'},{label:'Sessions',align:'right',width:'82px'},{label:'Users',align:'right',width:'65px'}]}
          rows={data.trafficSources.map(s => [s.source||'(direct)', fNum(s.sessions), fNum(s.users)])}
        />
      </Panel>
      <Panel title="Top Referrers" info={SECTION_INFO['Top Referrers']}>
        <DataTable loading={loading}
          headers={[{label:'Referrer'},{label:'Sessions',align:'right',width:'82px'},{label:'Users',align:'right',width:'65px'}]}
          rows={data.referrers.map(r => [
            <span key={r.referrer} title={r.referrer} style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:13}}>{r.referrer}</span>,
            fNum(r.sessions),
            fNum(r.users),
          ])}
        />
      </Panel>
    </div>
  )
}

/* ─────────────────────────────────────────────
   Main Dashboard
───────────────────────────────────────────── */
export function Dashboard({bffOrigin}: {bffOrigin: string}) {
  const [data, setData]           = useState<AnalyticsData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [unauthenticated, setUnauthenticated] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>('30')
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const loadData = useCallback(async () => {
    try {
      setLoading(true); setError(null); setUnauthenticated(false)
      setData(await fetchAnalyticsData(bffOrigin, dateRange))
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'GA_UNAUTHENTICATED') {
        setUnauthenticated(true)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch analytics')
      }
    } finally {
      setLoading(false)
    }
  }, [bffOrigin, dateRange])

  useEffect(() => { loadData() }, [loadData])

  if (unauthenticated) return <ConnectUI bffOrigin={bffOrigin} onConnected={loadData} />

  const H = 'calc(100vh - 51px)'

  if (loading && !data) return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',minHeight:'100vh',flexDirection:'column',gap:14,background:'#f8fafc'}}>
      <div style={{width:36,height:36,border:'3px solid #e2e8f0',borderTopColor:'#4f8ef7',borderRadius:'50%',animation:'ga-spin .8s linear infinite'}} />
      <div style={{color:'#94a3b8',fontSize:14}}>Loading analytics…</div>
      <style>{GLOBAL_CSS}</style>
    </div>
  )

  if (error && !data) return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:H,background:'#f8fafc'}}>
      <style>{GLOBAL_CSS}</style>
      <div style={{maxWidth:480,width:'100%',background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:32}}>
        <div style={{fontWeight:700,color:'#dc2626',marginBottom:8,fontSize:15}}>Failed to load analytics</div>
        <div style={{fontSize:13,color:'#64748b',marginBottom:20,lineHeight:1.6}}>{error}</div>
        <button className="ga-retry-btn" onClick={loadData}
          style={{padding:'9px 22px',background:'#4f8ef7',color:'#fff',borderRadius:7,cursor:'pointer',fontSize:13,fontWeight:600}}>
          Retry
        </button>
      </div>
    </div>
  )

  if (!data) return null

  return (
    <div style={{height:H,background:'#f8fafc',overflow:'hidden',
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      display:'flex',justifyContent:'center',alignItems:'stretch'}}>
    <style>{GLOBAL_CSS}</style>
    <div style={{display:'flex',width:'100%',height:'100%',overflow:'hidden',
      boxShadow:'0 0 0 1px #e2e8f0'}}>

      {/* ═══ Sidebar ═══ */}
      <div style={{width:180,background:'#fff',borderRight:'1px solid #e2e8f0',
        display:'flex',flexDirection:'column',flexShrink:0,overflow:'hidden'}}>

        <div style={{padding:'20px 16px 16px',borderBottom:'1px solid #f1f5f9'}}>
          <div style={{fontSize:13,fontWeight:700,color:'#1e293b',letterSpacing:'0.01em'}}>Analytics</div>
          <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>Google Analytics 4</div>
        </div>

        <div style={{padding:'12px 12px 8px'}}>
          <div style={{fontSize:10,fontWeight:700,color:'#cbd5e1',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>Date Range</div>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {DATE_RANGES.map(r => (
              <button key={r.value} className="ga-date-btn" onClick={() => setDateRange(r.value)}
                style={{padding:'4px 8px',fontSize:11,fontWeight:dateRange===r.value?700:400,borderRadius:5,
                  border:dateRange===r.value?'1.5px solid #4f8ef7':'1.5px solid #e2e8f0',
                  background:dateRange===r.value?'#eff6ff':'#fff',
                  color:dateRange===r.value?'#4f8ef7':'#64748b',cursor:'pointer'}}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <nav style={{flex:1,overflow:'auto',padding:'8px 8px'}}>
          <div style={{fontSize:10,fontWeight:700,color:'#cbd5e1',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6,paddingLeft:8}}>Sections</div>
          {TABS.map(tab => {
            const active = activeTab === tab.id
            return (
              <button key={tab.id} className="ga-tab-btn" onClick={() => setActiveTab(tab.id)}
                style={{display:'flex',alignItems:'center',gap:9,padding:'9px 10px',borderRadius:7,marginBottom:2,
                  background:active?'#eff6ff':'transparent',
                  color:active?'#4f8ef7':'#64748b',
                  fontWeight:active?600:400,fontSize:13}}>
                <span style={{fontSize:14,opacity:0.8}}>{tab.icon}</span>
                <span>{tab.label}</span>
                {active && <span style={{marginLeft:'auto',width:4,height:4,borderRadius:'50%',background:'#4f8ef7'}} />}
              </button>
            )
          })}
        </nav>

        <div style={{padding:'12px',borderTop:'1px solid #f1f5f9'}}>
          <button className="ga-retry-btn" onClick={loadData}
            style={{width:'100%',padding:'8px',background:'#f8fafc',border:'1px solid #e2e8f0',
              borderRadius:7,fontSize:12,color:loading?'#94a3b8':'#475569',cursor:'pointer',
              display:'flex',alignItems:'center',justifyContent:'center',gap:6,fontWeight:500}}>
            {loading
              ? <><div style={{width:12,height:12,border:'2px solid #e2e8f0',borderTopColor:'#4f8ef7',borderRadius:'50%',animation:'ga-spin .8s linear infinite'}} />Refreshing…</>
              : <>↻ Refresh</>}
          </button>
        </div>
      </div>

      {/* ═══ Main content ═══ */}
      <div style={{flex:1,overflow:'auto',overflowX:'hidden',padding:'24px 28px'}}>

        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:22}}>
          <div>
            <h2 style={{margin:0,fontSize:18,fontWeight:700,color:'#1e293b'}}>
              {TABS.find(t => t.id === activeTab)?.label}
            </h2>
            <div style={{fontSize:12,color:'#94a3b8',marginTop:3}}>Last {dateRange} days</div>
          </div>
          {error && (
            <div style={{background:'#fffbeb',border:'1px solid #fcd34d',borderRadius:7,padding:'8px 14px',fontSize:12,color:'#92400e'}}>
              ⚠ Showing cached data
            </div>
          )}
        </div>

        {activeTab === 'overview'     && <OverviewTab     data={data} loading={loading} />}
        {activeTab === 'traffic'      && <TrafficTab      data={data} loading={loading} />}
        {activeTab === 'content'      && <ContentTab      data={data} loading={loading} />}
        {activeTab === 'audience'     && <AudienceTab     data={data} loading={loading} />}
        {activeTab === 'geography'    && <GeographyTab    data={data} loading={loading} />}
        {activeTab === 'events'       && <EventsTab       data={data} loading={loading} bffOrigin={bffOrigin} dateRange={dateRange} />}
        {activeTab === 'acquisition'  && <AcquisitionTab  data={data} loading={loading} />}
      </div>
    </div>
    </div>
  )
}
