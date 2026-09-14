targetScope = 'resourceGroup'

param name string
param location string = resourceGroup().location
param tags object = {}

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
  }
}

output id string = workspace.id
output customerId string = workspace.properties.customerId
@secure()
output primarySharedKey string = workspace.listKeys().primarySharedKey
