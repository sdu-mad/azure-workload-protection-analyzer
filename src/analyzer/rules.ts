import type {
  ArmTemplate,
  JsonValue,
  RuleEvaluation,
  SecurityRule,
  SecurityRuleMetadata,
} from './types'

interface ArmResource {
  type?: string
  name?: string
  identity?: {
    type?: string
  }
  properties?: Record<string, JsonValue>
  resources?: ArmResource[]
}

const pass = (...evidence: string[]): RuleEvaluation => ({
  status: 'pass',
  evidence,
})

const warning = (...evidence: string[]): RuleEvaluation => ({
  status: 'warning',
  evidence,
})

const critical = (...evidence: string[]): RuleEvaluation => ({
  status: 'critical',
  evidence,
})

const isObject = (value: JsonValue | undefined): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const resourceLabel = (resource: ArmResource) =>
  `${resource.type ?? 'unknown'} '${resource.name ?? 'unnamed'}'`

const collectResources = (
  template: ArmTemplate | Record<string, JsonValue>,
): ArmResource[] => {
  const resources = Array.isArray(template.resources)
    ? (template.resources.filter(isObject) as ArmResource[])
    : []

  return resources.flatMap((resource) => {
    const nested = Array.isArray(resource.resources)
      ? resource.resources.flatMap((child) =>
          isObject(child as JsonValue)
            ? [child as ArmResource, ...collectResources(child as Record<string, JsonValue>)]
            : [],
        )
      : []
    const deploymentTemplate =
      resource.type?.toLowerCase() === 'microsoft.resources/deployments' &&
      isObject(resource.properties?.template)
        ? collectResources(resource.properties.template)
        : []

    return [resource, ...nested, ...deploymentTemplate]
  })
}

const findResources = (template: ArmTemplate, type: string) =>
  collectResources(template).filter(
    (resource) => resource.type?.toLowerCase() === type.toLowerCase(),
  )

const property = (
  value: Record<string, JsonValue> | undefined,
  name: string,
): JsonValue | undefined => {
  if (!value) return undefined
  const key = Object.keys(value).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  )
  return key ? value[key] : undefined
}

const findSecretLiterals = (
  value: JsonValue,
  path = '$',
  findings: string[] = [],
): string[] => {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      findSecretLiterals(item, `${path}[${index}]`, findings),
    )
    return findings
  }

  if (!isObject(value)) return findings

  const objectName = value.name
  const objectValue = value.value ?? value.password
  if (
    typeof objectName === 'string' &&
    /(?:password|secret|apiKey|connectionString|token)/i.test(objectName) &&
    typeof objectValue === 'string' &&
    objectValue.length > 0 &&
    !objectValue.startsWith('[')
  ) {
    findings.push(`${path}.${'value' in value ? 'value' : 'password'}`)
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`
    if (
      /(?:password|secret|apiKey|connectionString|token)/i.test(key) &&
      typeof child === 'string' &&
      child.length > 0 &&
      !child.startsWith('[') &&
      !/^https?:\/\//i.test(child)
    ) {
      findings.push(childPath)
    }
    findSecretLiterals(child, childPath, findings)
  }

  return findings
}

export const countArmResources = (template: ArmTemplate) =>
  collectResources(template).length

export const securityRules: SecurityRule[] = [
  {
    id: 'CWP001',
    title: 'Managed Identity Enabled',
    description: 'Every Container App uses a managed identity.',
    recommendation:
      "Configure a system-assigned or user-assigned identity on every Container App.",
    weight: 15,
    category: 'Identity',
    evaluate: ({ template }) => {
      const apps = findResources(template, 'Microsoft.App/containerApps')
      const missing = apps.filter(
        (app) => !app.identity?.type?.toLowerCase().includes('assigned'),
      )
      return apps.length > 0 && missing.length === 0
        ? pass(...apps.map(resourceLabel))
        : critical(
            ...(missing.length > 0
              ? missing.map(resourceLabel)
              : ['No Container App resource was found.']),
          )
    },
  },
  {
    id: 'CWP002',
    title: 'Container Registry Admin Account Disabled',
    description: 'Azure Container Registry administrator access is disabled.',
    recommendation:
      'Set adminUserEnabled to false and use managed identity with AcrPull.',
    weight: 10,
    category: 'Registry',
    evaluate: ({ template }) => {
      const registries = findResources(
        template,
        'Microsoft.ContainerRegistry/registries',
      )
      const insecure = registries.filter(
        (registry) => property(registry.properties, 'adminUserEnabled') !== false,
      )
      return registries.length > 0 && insecure.length === 0
        ? pass(...registries.map(resourceLabel))
        : critical(
            ...(insecure.length > 0
              ? insecure.map(resourceLabel)
              : ['No Azure Container Registry resource was found.']),
          )
    },
  },
  {
    id: 'CWP003',
    title: 'Key Vault Uses Azure RBAC',
    description: 'Key Vault is declared and uses Azure RBAC authorization.',
    recommendation:
      'Deploy Key Vault with enableRbacAuthorization set to true.',
    weight: 10,
    category: 'Secrets',
    evaluate: ({ template }) => {
      const vaults = findResources(template, 'Microsoft.KeyVault/vaults')
      const insecure = vaults.filter(
        (vault) =>
          property(vault.properties, 'enableRbacAuthorization') !== true,
      )
      return vaults.length > 0 && insecure.length === 0
        ? pass(...vaults.map(resourceLabel))
        : critical(
            ...(insecure.length > 0
              ? insecure.map(resourceLabel)
              : ['No Key Vault resource was found.']),
          )
    },
  },
  {
    id: 'CWP004',
    title: 'Inline Secrets Not Present',
    description:
      'The compiled deployment template contains no obvious literal secret values.',
    recommendation:
      'Remove literal credentials and use managed identity or Key Vault references.',
    weight: 15,
    category: 'Secrets',
    evaluate: ({ template }) => {
      const secretPaths = findSecretLiterals(template)
      return secretPaths.length === 0
        ? pass('No literal secret-like properties were found.')
        : critical(...secretPaths.slice(0, 10))
    },
  },
  {
    id: 'CWP005',
    title: 'Container App Public Exposure Review',
    description: 'Container App public ingress is explicitly reviewed.',
    recommendation:
      'Use internal ingress unless public access is a documented requirement protected by authentication.',
    weight: 10,
    category: 'Network',
    evaluate: ({ template }) => {
      const apps = findResources(template, 'Microsoft.App/containerApps')
      const publicApps = apps.filter((app) => {
        const configuration = property(app.properties, 'configuration')
        const ingress = isObject(configuration)
          ? property(configuration, 'ingress')
          : undefined
        return isObject(ingress) && property(ingress, 'external') === true
      })
      return publicApps.length === 0
        ? pass('No public Container App ingress was found.')
        : warning(...publicApps.map(resourceLabel))
    },
  },
  {
    id: 'CWP006',
    title: 'Centralized Container Logging Enabled',
    description:
      'The Container Apps environment sends platform and console logs to Log Analytics.',
    recommendation:
      'Configure appLogsConfiguration with the log-analytics destination.',
    weight: 10,
    category: 'Monitoring',
    evaluate: ({ template }) => {
      const environments = findResources(
        template,
        'Microsoft.App/managedEnvironments',
      )
      const configured = environments.filter((environment) => {
        const logs = property(environment.properties, 'appLogsConfiguration')
        return (
          isObject(logs) &&
          property(logs, 'destination')?.toString().toLowerCase() ===
            'log-analytics'
        )
      })
      return configured.length > 0
        ? pass(...configured.map(resourceLabel))
        : critical('No Log Analytics-connected Container Apps environment was found.')
    },
  },
  {
    id: 'CWP007',
    title: 'Key Vault Public Network Access Disabled',
    description: 'Key Vault does not accept traffic through its public endpoint.',
    recommendation:
      "Set publicNetworkAccess to 'Disabled' and use a private endpoint.",
    weight: 10,
    category: 'Network',
    evaluate: ({ template }) => {
      const vaults = findResources(template, 'Microsoft.KeyVault/vaults')
      const publicVaults = vaults.filter(
        (vault) =>
          property(vault.properties, 'publicNetworkAccess') !== 'Disabled',
      )
      return vaults.length > 0 && publicVaults.length === 0
        ? pass(...vaults.map(resourceLabel))
        : critical(
            ...(publicVaults.length > 0
              ? publicVaults.map(resourceLabel)
              : ['No Key Vault resource was found.']),
          )
    },
  },
  {
    id: 'CWP008',
    title: 'Registry Public Network Access Disabled',
    description: 'Azure Container Registry uses private network access.',
    recommendation:
      "Use the Premium SKU, set publicNetworkAccess to 'Disabled', and add a private endpoint.",
    weight: 10,
    category: 'Registry',
    evaluate: ({ template }) => {
      const registries = findResources(
        template,
        'Microsoft.ContainerRegistry/registries',
      )
      const publicRegistries = registries.filter(
        (registry) =>
          property(registry.properties, 'publicNetworkAccess') !== 'Disabled',
      )
      return registries.length > 0 && publicRegistries.length === 0
        ? pass(...registries.map(resourceLabel))
        : critical(
            ...(publicRegistries.length > 0
              ? publicRegistries.map(resourceLabel)
              : ['No Azure Container Registry resource was found.']),
          )
    },
  },
  {
    id: 'CWP009',
    title: 'Liveness and Readiness Probes Configured',
    description:
      'Every Container App container defines liveness and readiness probes.',
    recommendation:
      'Configure liveness against /api/health and readiness against /api/ready.',
    weight: 5,
    category: 'Reliability',
    evaluate: ({ template }) => {
      const apps = findResources(template, 'Microsoft.App/containerApps')
      const invalid = apps.filter((app) => {
        const appTemplate = property(app.properties, 'template')
        const containers = isObject(appTemplate)
          ? property(appTemplate, 'containers')
          : undefined
        if (!Array.isArray(containers) || containers.length === 0) return true
        return containers.some((container) => {
          if (!isObject(container)) return true
          const probes = property(container, 'probes')
          if (!Array.isArray(probes)) return true
          const types = probes
            .filter(isObject)
            .map((probe) => property(probe, 'type')?.toString().toLowerCase())
          return !types.includes('liveness') || !types.includes('readiness')
        })
      })
      return apps.length > 0 && invalid.length === 0
        ? pass(...apps.map(resourceLabel))
        : critical(
            ...(invalid.length > 0
              ? invalid.map(resourceLabel)
              : ['No Container App resource was found.']),
          )
    },
  },
  {
    id: 'CWP010',
    title: 'Insecure HTTP Disabled',
    description: 'Container App ingress does not allow insecure HTTP.',
    recommendation: 'Set allowInsecure to false for every ingress endpoint.',
    weight: 5,
    category: 'Network',
    evaluate: ({ template }) => {
      const apps = findResources(template, 'Microsoft.App/containerApps')
      const insecure = apps.filter((app) => {
        const configuration = property(app.properties, 'configuration')
        const ingress = isObject(configuration)
          ? property(configuration, 'ingress')
          : undefined
        return !isObject(ingress) || property(ingress, 'allowInsecure') !== false
      })
      return apps.length > 0 && insecure.length === 0
        ? pass(...apps.map(resourceLabel))
        : critical(
            ...(insecure.length > 0
              ? insecure.map(resourceLabel)
              : ['No Container App resource was found.']),
          )
    },
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
