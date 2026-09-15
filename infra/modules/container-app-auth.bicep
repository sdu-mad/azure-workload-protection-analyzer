targetScope = 'resourceGroup'

param containerAppName string
param clientId string
param openIdIssuer string

resource app 'Microsoft.App/containerApps@2026-01-01' existing = {
  name: containerAppName
}

resource auth 'Microsoft.App/containerApps/authConfigs@2026-01-01' = {
  parent: app
  name: 'current'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      excludedPaths: [
        '/api/health'
        '/api/ready'
      ]
      redirectToProvider: 'azureactivedirectory'
      unauthenticatedClientAction: 'RedirectToLoginPage'
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: clientId
          clientSecretSettingName: 'microsoft-provider-authentication-secret'
          openIdIssuer: openIdIssuer
        }
        validation: {
          defaultAuthorizationPolicy: {
            allowedApplications: []
          }
        }
      }
    }
    login: {
      tokenStore: {
        enabled: false
      }
    }
  }
}
