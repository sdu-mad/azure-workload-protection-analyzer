targetScope = 'resourceGroup'

param location string = resourceGroup().location

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'sdusianalyzeracr'
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
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
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'sdusi-analyzer-app'
  location: location
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
      }
      secrets: [
        {
          name: 'database-password'
          password: 'DemoPassword123!'
        }
      ]
      registries: [
        {
          server: registry.properties.loginServer
          username: registry.listCredentials().username
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'sdusi-analyzer-app'
          image: '${registry.properties.loginServer}/sdusi-analyzer-app:latest'
        }
      ]
    }
  }
}
