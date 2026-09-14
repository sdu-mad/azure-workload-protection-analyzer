targetScope = 'resourceGroup'

param name string
param location string = resourceGroup().location
param tags object = {}
param workspaceCustomerId string
@secure()
param workspaceSharedKey string

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
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
    zoneRedundant: false
  }
}

output id string = environment.id
output name string = environment.name
