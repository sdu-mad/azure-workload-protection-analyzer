import { defineConfig, devices } from '@playwright/test'

const externalBaseUrl = process.env.E2E_BASE_URL
const storageState = process.env.PLAYWRIGHT_STORAGE_STATE

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 20_000,
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: externalBaseUrl ?? 'http://127.0.0.1:3001',
    storageState,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'npm run build && npm start',
        url: 'http://127.0.0.1:3001/api/health',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
