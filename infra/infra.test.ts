import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) =>
  readFileSync(join(process.cwd(), 'infra', path), 'utf8')

describe('production Bicep architecture', () => {
  it('derives environment-specific globally unique names', () => {
    const main = read('main.bicep')
    expect(main).toContain('uniqueString(subscription().id, environmentName, location)')
    expect(main).toContain("'dev'")
    expect(main).toContain("'prod'")
    expect(main).not.toContain("environment: 'development'")
  })

  it('uses private ACR and Key Vault access', () => {
    expect(read('modules/container-registry.bicep')).toContain(
      "publicNetworkAccess: 'Disabled'",
    )
    expect(read('modules/container-registry.bicep')).toContain("name: 'Premium'")
    expect(read('modules/key-vault.bicep')).toContain(
      "publicNetworkAccess: 'Disabled'",
    )
    const endpoints = read('modules/private-endpoints.bicep')
    expect(endpoints).toContain("'registry'")
    expect(endpoints).toContain("'vault'")
  })

  it('uses health and readiness APIs for platform probes', () => {
    const app = read('modules/container-app.bicep')
    expect(app).toContain("path: '/api/health'")
    expect(app).toContain("path: '/api/ready'")
  })

  it('enables Entra authentication while excluding platform probes', () => {
    const auth = read('modules/container-app-auth.bicep')
    const app = read('modules/container-app.bicep')
    expect(auth).toContain("unauthenticatedClientAction: 'RedirectToLoginPage'")
    expect(auth).toContain(
      "clientSecretSettingName: 'microsoft-provider-authentication-secret'",
    )
    expect(app).toContain("name: 'microsoft-provider-authentication-secret'")
    expect(auth).toContain("'/api/health'")
    expect(auth).toContain("'/api/ready'")
  })

  it('connects Application Insights through a secret reference', () => {
    const app = read('modules/container-app.bicep')
    expect(app).toContain("secretRef: 'applicationinsights-connection-string'")
    expect(read('modules/monitoring.bicep')).toContain(
      "resource applicationInsights 'Microsoft.Insights/components@2020-02-02'",
    )
  })

  it('uses Azure-supported alert aggregation and regional web tests', () => {
    const alerts = read('modules/alerts.bicep')
    expect(alerts).toContain("metricName: 'requests/failed'")
    expect(alerts).toContain("timeAggregation: 'Count'")
    expect(alerts).toContain('location: location')
  })
})
