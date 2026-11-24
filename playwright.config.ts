import { defineConfig } from '@playwright/test'

const allBrowsers = process.env.PLAYWRIGHT_ALL_BROWSERS === '1'

export default defineConfig({
  testDir: './tests',
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL } },
    ...(allBrowsers ? [
      { name: 'firefox', use: { browserName: 'firefox' as const } },
      { name: 'webkit', use: { browserName: 'webkit' as const } },
    ] : []),
  ],
  use: {
    baseURL: 'http://127.0.0.1:4317',
    viewport: { width: 1100, height: 850 },
  },
  webServer: [{
    command: 'npm run build:demo && npm exec vite preview -- --host 127.0.0.1 --port 4317 --strictPort',
    url: 'http://127.0.0.1:4317',
    reuseExistingServer: false,
  }, {
    command: 'npm run dev -- --host 127.0.0.1 --port 4318 --strictPort',
    url: 'http://127.0.0.1:4318/tests/fixture.html',
    reuseExistingServer: false,
  }],
})
