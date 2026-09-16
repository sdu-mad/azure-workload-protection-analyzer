targetScope = 'resourceGroup'

param name string
param location string = resourceGroup().location
param tags object = {}
param addressSpace string = '10.20.0.0/16'
param containerAppsSubnetPrefix string = '10.20.0.0/23'
param privateEndpointsSubnetPrefix string = '10.20.2.0/27'
param buildAgentsSubnetPrefix string = '10.20.3.0/27'

resource vnet 'Microsoft.Network/virtualNetworks@2025-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        addressSpace
      ]
    }
  }
}

resource containerAppsSubnet 'Microsoft.Network/virtualNetworks/subnets@2025-07-01' = {
  parent: vnet
  name: 'container-apps'
  properties: {
    addressPrefix: containerAppsSubnetPrefix
    delegations: [
      {
        name: 'container-apps'
        properties: {
          serviceName: 'Microsoft.App/environments'
        }
      }
    ]
  }
}

resource privateEndpointsSubnet 'Microsoft.Network/virtualNetworks/subnets@2025-07-01' = {
  parent: vnet
  name: 'private-endpoints'
  properties: {
    addressPrefix: privateEndpointsSubnetPrefix
    privateEndpointNetworkPolicies: 'Disabled'
  }
}

resource buildAgentsSubnet 'Microsoft.Network/virtualNetworks/subnets@2025-07-01' = {
  parent: vnet
  name: 'acr-build-agents'
  properties: {
    addressPrefix: buildAgentsSubnetPrefix
  }
}

output id string = vnet.id
output name string = vnet.name
output containerAppsSubnetId string = containerAppsSubnet.id
output privateEndpointsSubnetId string = privateEndpointsSubnet.id
output buildAgentsSubnetId string = buildAgentsSubnet.id
