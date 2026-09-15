targetScope = 'resourceGroup'

param name string
param location string = resourceGroup().location
param tags object = {}
param workspaceCustomerId string
@secure()
param workspaceSharedKey string
param infrastructureSubnetId string

resource environment 'Microsoft.App/managedEnvironments@2026-01-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspaceCustomerId
        sharedKey: workspaceSharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: infrastructureSubnetId
      internal: false
    }
    zoneRedundant: false
  }
}

output id string = environment.id
output name string = environment.name
