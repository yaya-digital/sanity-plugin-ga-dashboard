import {definePlugin} from 'sanity'
import {BarChartIcon} from '@sanity/icons'
import {GoogleAnalyticsTool} from './google-analytics-tool'
import type {GoogleAnalyticsPluginConfig} from './types'

export const googleAnalyticsPlugin = (config: GoogleAnalyticsPluginConfig = {}) =>
  definePlugin({
    name: 'ga-dashboard',
    tools: (prev) => {
      if (config.disabled) return prev
      return [
        ...prev,
        {
          name: 'ga-dashboard',
          title: 'Google Analytics',
          icon: BarChartIcon,
          component: () => GoogleAnalyticsTool(config),
        },
      ]
    },
  })()
