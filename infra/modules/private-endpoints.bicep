targetScope = 'resourceGroup'

param namePrefix string
param location string = resourceGroup().location
param tags object = {}
param subnetId string
param registryId string
param registryDnsZoneId string
param keyVaultId string
param keyVaultDnsZoneId string

resource registryEndpoint 'Microsoft.Network/privateEndpoints@2025-07-01' = {
  name: '${namePrefix}-acr-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: subnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'registry'
        properties: {
          privateLinkServiceId: registryId
          groupIds: [
            'registry'
          ]
        }
      }
    ]
  }
}

resource registryDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2025-07-01' = {
  parent: registryEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'registry'
        properties: {
          privateDnsZoneId: registryDnsZoneId
        }
      }
    ]
  }
}

resource keyVaultEndpoint 'Microsoft.Network/privateEndpoints@2025-07-01' = {
  name: '${namePrefix}-kv-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: subnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'vault'
        properties: {
          privateLinkServiceId: keyVaultId
          groupIds: [
            'vault'
          ]
        }
      }
    ]
  }
}

resource keyVaultDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2025-07-01' = {
  parent: keyVaultEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'vault'
        properties: {
          privateDnsZoneId: keyVaultDnsZoneId
        }
      }
    ]
  }
}
