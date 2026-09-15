targetScope = 'resourceGroup'

param location string = resourceGroup().location

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'sdusianalyzeracr'
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Disabled'
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'sdusi-analyzer-kv'
  location: location
  properties: {
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    publicNetworkAccess: 'Disabled'
    sku: {
      family: 'A'
      name: 'standard'
    }
  }
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'sdusi-analyzer-law'
  location: location
  properties: {
    retentionInDays: 30
  }
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'sdusi-analyzer-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'sdusi-analyzer-app'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: {
        external: false
        allowInsecure: false
        targetPort: 8080
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'sdusi-analyzer-app'
          image: '${registry.properties.loginServer}/sdusi-analyzer-app:latest'
          env: [
            {
              name: 'KEY_VAULT_URI'
              value: keyVault.properties.vaultUri
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 8080
              }
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/ready'
                port: 8080
              }
            }
          ]
        }
      ]
    }
  }
}
