import type { SecurityRule, SecurityRuleMetadata } from './types'

const removeComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const hasResourceType = (source: string, resourceType: string) => {
  const escapedType = resourceType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `resource\\s+\\w+\\s+'${escapedType}(?:\\/[^'@]+)?@[^']+'`,
    'i',
  ).test(removeComments(source))
}

export const securityRules: SecurityRule[] = [
  {
    id: 'CWP001',
    title: 'Managed Identity Enabled',
    description: 'The Container App uses a system-assigned managed identity.',
    recommendation:
      "Add an identity block with type: 'SystemAssigned' to the Container App.",
    weight: 20,
    category: 'Identity',
    evaluate: (source) =>
      /\btype\s*:\s*['"]SystemAssigned['"]/i.test(removeComments(source))
        ? 'pass'
        : 'critical',
  },
  {
    id: 'CWP002',
    title: 'Container Registry Admin Account Disabled',
    description: 'The Azure Container Registry admin account is disabled.',
    recommendation:
      'Set adminUserEnabled: false and use managed identity for registry access.',
    weight: 15,
    category: 'Registry',
    evaluate: (source) =>
      /\badminUserEnabled\s*:\s*false\b/i.test(removeComments(source))
        ? 'pass'
        : 'critical',
  },
  {
    id: 'CWP003',
    title: 'Key Vault Referenced',
    description: 'The workload declares an Azure Key Vault resource.',
    recommendation:
      'Declare a Microsoft.KeyVault/vaults resource and store sensitive values in it.',
    weight: 15,
    category: 'Secrets',
    evaluate: (source) =>
      hasResourceType(source, 'Microsoft.KeyVault/vaults')
        ? 'pass'
        : 'critical',
  },
  {
    id: 'CWP004',
    title: 'Inline Secrets Not Present',
    description: 'No obvious hardcoded secret values were found in the template.',
    recommendation:
      'Remove hardcoded credentials and reference Key Vault secrets at runtime.',
    weight: 20,
    category: 'Secrets',
    evaluate: (source) => {
      const code = removeComments(source)
      const inlineSecret =
        /\b(?:password|secret|apiKey|connectionString)\w*\s*:\s*['"][^'"]+['"]/i
      return inlineSecret.test(code) ? 'critical' : 'pass'
    },
  },
  {
    id: 'CWP005',
    title: 'Container App Public Exposure Review',
    description: 'Container App ingress is not publicly exposed.',
    recommendation:
      'Set external: false unless public ingress is an explicit workload requirement.',
    weight: 15,
    category: 'Network',
    evaluate: (source) =>
      /\bexternal\s*:\s*true\b/i.test(removeComments(source))
        ? 'warning'
        : 'pass',
  },
  {
    id: 'CWP006',
    title: 'Log Analytics Enabled',
    description: 'A Log Analytics workspace is declared for workload monitoring.',
    recommendation:
      'Declare a Microsoft.OperationalInsights/workspaces resource and connect it to the environment.',
    weight: 15,
    category: 'Monitoring',
    evaluate: (source) =>
      hasResourceType(source, 'Microsoft.OperationalInsights/workspaces')
        ? 'pass'
        : 'critical',
  },
]

export const ruleCatalog: SecurityRuleMetadata[] = securityRules.map((rule) => ({
  id: rule.id,
  title: rule.title,
  description: rule.description,
  recommendation: rule.recommendation,
  weight: rule.weight,
  category: rule.category,
}))
