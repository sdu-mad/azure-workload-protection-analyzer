targetScope = 'subscription'

@minLength(2)
@maxLength(24)
@allowed([
  'dev'
  'prod'
])
@description('Deployment environment. Production uses higher availability and retention defaults.')
param environmentName string

@description('Azure region for all workload resources.')
param location string = 'eastus'

@minLength(36)
@maxLength(36)
@description('Client ID of the pre-created single-tenant Microsoft Entra web application.')
param entraClientId string

@secure()
@description('Client secret of the pre-created Microsoft Entra web application.')
param entraClientSecret string

@description('OpenID Connect issuer for the tenant that owns the Entra application.')
param entraOpenIdIssuer string = '${environment().authentication.loginEndpoint}${tenant().tenantId}/v2.0'

@description('Optional operations email address for Azure Monitor action group notifications.')
param alertEmail string = ''

var isProduction = environmentName == 'prod'
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var namePrefix = 'cwp-${environmentName}-${take(resourceToken, 6)}'
var resourceGroupName = 'rg-${namePrefix}'
var registryName = take(replace('cr${environmentName}${resourceToken}', '-', ''), 50)
var keyVaultName = take('kv-${environmentName}-${resourceToken}', 24)
var logAnalyticsName = take('log-${namePrefix}', 63)
var applicationInsightsName = take('appi-${namePrefix}', 255)
var addressSpace = isProduction ? '10.30.0.0/16' : '10.20.0.0/16'
var containerAppsSubnetPrefix = isProduction ? '10.30.0.0/23' : '10.20.0.0/23'
var privateEndpointsSubnetPrefix = isProduction ? '10.30.2.0/27' : '10.20.2.0/27'

var tags = {
  'azd-env-name': environmentName
  application: 'cloud-workload-protection-analyzer'
  environment: environmentName
  managedBy: 'bicep'
  dataClassification: 'no-persistence'
}

resource resourceGroup 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module network './modules/network.bicep' = {
  name: 'network'
  scope: resourceGroup
  params: {
    name: '${namePrefix}-vnet'
    location: location
    tags: tags
    addressSpace: addressSpace
    containerAppsSubnetPrefix: containerAppsSubnetPrefix
    privateEndpointsSubnetPrefix: privateEndpointsSubnetPrefix
  }
}

module privateDns './modules/private-dns.bicep' = {
  name: 'privateDns'
  scope: resourceGroup
  params: {
    virtualNetworkId: network.outputs.id
    linkNamePrefix: namePrefix
  }
}

module identity './modules/identity.bicep' = {
  name: 'identity'
  scope: resourceGroup
  params: {
    name: '${namePrefix}-id'
    location: location
    tags: tags
  }
}

module registry './modules/container-registry.bicep' = {
  name: 'containerRegistry'
  scope: resourceGroup
  params: {
    name: registryName
    location: location
    tags: tags
  }
}

module keyVault './modules/key-vault.bicep' = {
  name: 'keyVault'
  scope: resourceGroup
  params: {
    name: keyVaultName
    location: location
    tags: tags
    identityPrincipalId: identity.outputs.principalId
  }
}

module monitoring './modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: resourceGroup
  params: {
    workspaceName: logAnalyticsName
    applicationInsightsName: applicationInsightsName
    location: location
    tags: tags
    retentionInDays: isProduction ? 90 : 30
  }
}

module privateEndpoints './modules/private-endpoints.bicep' = {
  name: 'privateEndpoints'
  scope: resourceGroup
  params: {
    namePrefix: namePrefix
    location: location
    tags: tags
    subnetId: network.outputs.privateEndpointsSubnetId
    registryId: registry.outputs.id
    registryDnsZoneId: privateDns.outputs.acrZoneId
    keyVaultId: keyVault.outputs.id
    keyVaultDnsZoneId: privateDns.outputs.keyVaultZoneId
  }
}

module registryAccess './modules/acr-pull-role.bicep' = {
  name: 'registryAccess'
  scope: resourceGroup
  params: {
    name: registryName
    principalId: identity.outputs.principalId
    registryId: registry.outputs.id
  }
}

module containerEnvironment './modules/container-environment.bicep' = {
  name: 'containerEnvironment'
  scope: resourceGroup
  params: {
    name: '${namePrefix}-env'
    location: location
    tags: tags
    workspaceCustomerId: monitoring.outputs.workspaceCustomerId
    workspaceSharedKey: monitoring.outputs.workspaceSharedKey
    infrastructureSubnetId: network.outputs.containerAppsSubnetId
  }
}

module web './modules/container-app.bicep' = {
  name: 'web'
  scope: resourceGroup
  dependsOn: [
    privateEndpoints
    registryAccess
  ]
  params: {
    name: '${namePrefix}-app'
    location: location
    tags: union(tags, {
      'azd-service-name': 'web'
    })
    environmentId: containerEnvironment.outputs.id
    identityId: identity.outputs.id
    identityClientId: identity.outputs.clientId
    registryLoginServer: registry.outputs.loginServer
    keyVaultUri: keyVault.outputs.uri
    applicationInsightsConnectionString: monitoring.outputs.applicationInsightsConnectionString
    entraClientSecret: entraClientSecret
    minReplicas: isProduction ? 1 : 0
    maxReplicas: isProduction ? 4 : 2
  }
}

module authentication './modules/container-app-auth.bicep' = {
  name: 'authentication'
  scope: resourceGroup
  params: {
    containerAppName: web.outputs.name
    clientId: entraClientId
    openIdIssuer: entraOpenIdIssuer
  }
}

module alerts './modules/alerts.bicep' = {
  name: 'alerts'
  scope: resourceGroup
  params: {
    namePrefix: namePrefix
    location: location
    tags: tags
    containerAppId: web.outputs.id
    applicationInsightsId: monitoring.outputs.applicationInsightsId
    applicationUrl: web.outputs.url
    alertEmail: alertEmail
  }
}

output AZURE_RESOURCE_GROUP string = resourceGroup.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = registry.outputs.loginServer
output AZURE_CONTAINER_REGISTRY_NAME string = registry.outputs.name
output AZURE_KEY_VAULT_NAME string = keyVault.outputs.name
output AZURE_LOG_ANALYTICS_WORKSPACE_ID string = monitoring.outputs.workspaceId
output AZURE_APPLICATION_INSIGHTS_NAME string = applicationInsightsName
output AZURE_CONTAINER_APPS_ENVIRONMENT_NAME string = containerEnvironment.outputs.name
output SERVICE_WEB_NAME string = web.outputs.name
output SERVICE_WEB_IDENTITY_PRINCIPAL_ID string = identity.outputs.principalId
output WEB_URL string = web.outputs.url
