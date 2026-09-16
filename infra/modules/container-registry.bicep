targetScope = 'resourceGroup'

param name string
param location string = resourceGroup().location
param tags object = {}
param agentPoolName string
param agentPoolSubnetId string

resource registry 'Microsoft.ContainerRegistry/registries@2025-11-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Premium'
  }
  properties: {
    adminUserEnabled: false
    dataEndpointEnabled: false
    networkRuleBypassOptions: 'AzureServices'
    policies: {
      exportPolicy: {
        status: 'enabled'
      }
      quarantinePolicy: {
        status: 'disabled'
      }
      retentionPolicy: {
        days: 14
        status: 'enabled'
      }
      trustPolicy: {
        status: 'disabled'
        type: 'Notary'
      }
    }
    publicNetworkAccess: 'Disabled'
  }
}

resource agentPool 'Microsoft.ContainerRegistry/registries/agentPools@2025-03-01-preview' = {
  parent: registry
  name: agentPoolName
  location: location
  properties: {
    count: 1
    os: 'Linux'
    tier: 'S1'
    virtualNetworkSubnetResourceId: agentPoolSubnetId
  }
}

output id string = registry.id
output name string = registry.name
output loginServer string = registry.properties.loginServer
output agentPoolName string = agentPool.name
