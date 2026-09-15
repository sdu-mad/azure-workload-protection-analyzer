import { describe, expect, it } from 'vitest'
import { analyzeArmTemplate } from './analyze'
import type { ArmTemplate } from './types'

const analyze = (template: ArmTemplate) =>
  analyzeArmTemplate(template, {
    entrypoint: 'main.bicep',
    fileCount: 1,
  })
const secureTemplate: ArmTemplate = {
  $schema:
    'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
  contentVersion: '1.0.0.0',
  resources: [
    {
      type: 'Microsoft.ContainerRegistry/registries',
      name: 'secureRegistry',
      properties: {
        adminUserEnabled: false,
        publicNetworkAccess: 'Disabled',
      },
    },
    {
      type: 'Microsoft.KeyVault/vaults',
      name: 'secureVault',
      properties: {
        enableRbacAuthorization: true,
        publicNetworkAccess: 'Disabled',
      },
    },
    {
      type: 'Microsoft.App/managedEnvironments',
      name: 'secureEnvironment',
      properties: {
        appLogsConfiguration: {
          destination: 'log-analytics',
        },
      },
    },
    {
      type: 'Microsoft.App/containerApps',
      name: 'secureApp',
      identity: {
        type: 'UserAssigned',
      },
      properties: {
        configuration: {
          ingress: {
            external: false,
            allowInsecure: false,
          },
        },
        template: {
          containers: [
            {
              name: 'secureApp',
              probes: [
                { type: 'Liveness' },
                { type: 'Readiness' },
              ],
            },
          ],
        },
      },
    },
  ],
}

const insecureTemplate: ArmTemplate = {
  $schema:
    'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
  contentVersion: '1.0.0.0',
  resources: [
    {
      type: 'Microsoft.ContainerRegistry/registries',
      name: 'insecureRegistry',
      properties: {
        adminUserEnabled: true,
        publicNetworkAccess: 'Enabled',
      },
    },
    {
      type: 'Microsoft.App/managedEnvironments',
      name: 'insecureEnvironment',
      properties: {},
    },
    {
      type: 'Microsoft.App/containerApps',
      name: 'insecureApp',
      properties: {
        configuration: {
          ingress: {
            external: true,
            allowInsecure: true,
          },
          secrets: [
            {
              name: 'database-password',
              value: 'DemoPassword123!',
            },
          ],
        },
        template: {
          containers: [{ name: 'insecureApp' }],
        },
      },
    },
  ],
}

describe('semantic ARM analysis', () => {
  it('scores a hardened compiled template at 100', () => {
    const result = analyze(secureTemplate)

    expect(result.score).toBe(100)
    expect(result.status).toBe('Ready for Protection')
    expect(result.findings).toHaveLength(10)
    expect(result.compilation.resourceCount).toBe(4)
    expect(result.findings.every((finding) => finding.evidence.length > 0)).toBe(
      true,
    )
  })

  it('reports critical and warning findings from effective properties', () => {
    const result = analyze(insecureTemplate)

    expect(result.score).toBe(23)
    expect(result.status).toBe('Poor')
    expect(result.findings.find((finding) => finding.id === 'CWP004')).toMatchObject(
      {
        severity: 'critical',
      },
    )
    expect(result.findings.find((finding) => finding.id === 'CWP005')).toMatchObject(
      {
        severity: 'warning',
      },
    )
  })

  it('discovers resources emitted through nested deployment templates', () => {
    const nested = analyze({
      resources: [
        {
          type: 'Microsoft.Resources/deployments',
          name: 'module',
          properties: {
            template: secureTemplate,
          },
        },
      ],
    })

    expect(nested.compilation.resourceCount).toBe(5)
    expect(nested.score).toBe(100)
  })
})
