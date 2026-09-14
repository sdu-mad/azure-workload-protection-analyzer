targetScope = 'subscription'

@description('Azure Developer CLI environment name used for resource tagging.')
param environmentName string

@description('Azure region for all workload resources.')
param location string = 'eastus'

@description('Resource group that contains the analyzer workload.')
param resourceGroupName string = 'sdusi-analyzer-rg'

var tags = {
  'azd-env-name': environmentName
  application: 'sdusi-analyzer'
  environment: 'development'
  purpose: 'portfolio'
}

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module identity './modules/identity.bicep' = {
  name: 'identity'
  scope: resourceGroup
  params: {
    name: 'sdusi-analyzer-id'
    location: location
    tags: tags
  }
}

module registry './modules/container-registry.bicep' = {
  name: 'containerRegistry'
  scope: resourceGroup
  params: {
    name: 'sdusianalyzeracr'
    location: location
    tags: tags
  }
}

module keyVault './modules/key-vault.bicep' = {
  name: 'keyVault'
  scope: resourceGroup
  params: {
    name: 'sdusi-analyzer-kv'
    location: location
    tags: tags
    identityPrincipalId: identity.outputs.principalId
  }
}

module monitoring './modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: resourceGroup
  params: {
    name: 'sdusi-analyzer-law'
    location: location
    tags: tags
  }
}

module registryAccess './modules/acr-pull-role.bicep' = {
  name: 'registryAccess'
  scope: resourceGroup
  params: {
    name: 'sdusianalyzeracr'
    principalId: identity.outputs.principalId
    registryId: registry.outputs.id
  }
}

module containerEnvironment './modules/container-environment.bicep' = {
  name: 'containerEnvironment'
  scope: resourceGroup
  params: {
    name: 'sdusi-analyzer-env'
    location: location
    tags: tags
    workspaceCustomerId: monitoring.outputs.customerId
    workspaceSharedKey: monitoring.outputs.primarySharedKey
  }
}

module web './modules/container-app.bicep' = {
  name: 'web'
  scope: resourceGroup
  dependsOn: [
    registryAccess
  ]
  params: {
    name: 'sdusi-analyzer-app'
    location: location
    tags: union(tags, {
      'azd-service-name': 'web'
    })
    environmentId: containerEnvironment.outputs.id
    identityId: identity.outputs.id
    identityClientId: identity.outputs.clientId
    registryLoginServer: registry.outputs.loginServer
    keyVaultUri: keyVault.outputs.uri
  }
}

output AZURE_RESOURCE_GROUP string = resourceGroup.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = registry.outputs.loginServer
output AZURE_CONTAINER_REGISTRY_NAME string = registry.outputs.name
output AZURE_KEY_VAULT_NAME string = keyVault.outputs.name
output AZURE_LOG_ANALYTICS_WORKSPACE_ID string = monitoring.outputs.id
output AZURE_CONTAINER_APPS_ENVIRONMENT_NAME string = containerEnvironment.outputs.name
output SERVICE_WEB_NAME string = web.outputs.name
output WEB_URL string = web.outputs.url
