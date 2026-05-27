import type React from 'react'
import {Dashboard} from './components/dashboard'
import type {GoogleAnalyticsPluginConfig} from './types'

export function GoogleAnalyticsTool({bffOrigin}: GoogleAnalyticsPluginConfig) {
  if (!bffOrigin) return <SetupGuide />
  return <Dashboard bffOrigin={bffOrigin} />
}

function SetupGuide() {
  const mono: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12,
    background: '#f4f4f5',
    padding: '2px 6px',
    borderRadius: 4,
    color: '#333',
  }
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: 40,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 600,
          width: '100%',
          background: '#fff',
          border: '1px solid #e8e8e8',
          borderRadius: 12,
          padding: 36,
        }}
      >
        <h2 style={{margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#111'}}>
          Google Analytics Setup Required
        </h2>
        <p style={{margin: '0 0 24px', fontSize: 14, color: '#777'}}>
          Set <code style={mono}>SANITY_STUDIO_GA_BFF_ORIGIN</code> in your Studio environment to
          the base URL of your web app (e.g. <code style={mono}>https://customer.com</code>).
        </p>
        <div
          style={{
            background: '#1e1e2e',
            borderRadius: 8,
            padding: '14px 18px',
            marginBottom: 20,
          }}
        >
          <pre
            style={{
              margin: 0,
              fontSize: 12,
              color: '#cdd6f4',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              lineHeight: 1.6,
            }}
          >
            {`SANITY_STUDIO_GA_BFF_ORIGIN=https://customer.com\nSANITY_STUDIO_GA_PROPERTY_ID=123456789`}
          </pre>
        </div>
        <p style={{margin: 0, fontSize: 13, color: '#777', lineHeight: 1.6}}>
          Once configured, click <strong>Connect Google Analytics</strong> in the dashboard to
          authorise with the Google account that has Viewer access to the GA4 property.
        </p>
      </div>
    </div>
  )
}
