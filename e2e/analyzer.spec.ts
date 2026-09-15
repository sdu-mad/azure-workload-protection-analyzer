import { expect, test } from '@playwright/test'

test.describe('Cloud Workload Protection Readiness Analyzer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('API online', { exact: true })).toBeVisible()
  })

  test('analyzes the insecure sample on startup', async ({ page }) => {
    await expect(
      page.getByLabel('Readiness score: 23 out of 100'),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Poor' })).toBeVisible()
    await expect(page.locator('article.finding')).toHaveCount(10)
    await expect(
      page.locator('article.finding').filter({ hasText: 'CWP004' }),
    ).toContainText('Critical')
  })

  test('loads and analyzes the secure sample', async ({ page }) => {
    await page.getByLabel('Sample workload').selectOption('secure')

    await expect(
      page.getByLabel('Readiness score: 100 out of 100'),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Ready for Protection' }),
    ).toBeVisible()
    await expect(page.locator('.severity-badge.severity-pass')).toHaveCount(10)
  })

  test('reanalyzes edited Bicep and reports public ingress', async ({ page }) => {
    await page.getByLabel('Sample workload').selectOption('secure')
    await expect(
      page.getByLabel('Readiness score: 100 out of 100'),
    ).toBeVisible()

    const editor = page.getByLabel('Bicep source code')
    const source = await editor.inputValue()
    await editor.fill(source.replace('external: false', 'external: true'))
    await page.getByRole('button', { name: 'Analyze workload' }).click()

    await expect(
      page.getByLabel('Readiness score: 95 out of 100'),
    ).toBeVisible()
    await expect(
      page.locator('article.finding').filter({ hasText: 'CWP005' }),
    ).toContainText('Warning')
  })

  test('exposes the live API contract', async ({ request }) => {
    const healthResponse = await request.get('/api/health')
    expect(healthResponse.ok()).toBeTruthy()
    await expect(healthResponse.json()).resolves.toMatchObject({
      status: 'ok',
      service: 'sdusi-analyzer-app',
    })

    const rulesResponse = await request.get('/api/rules')
    expect(rulesResponse.ok()).toBeTruthy()
    const catalog = await rulesResponse.json()
    expect(catalog).toHaveLength(10)
  })
})
