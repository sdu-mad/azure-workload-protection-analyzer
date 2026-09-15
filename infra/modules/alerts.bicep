targetScope = 'resourceGroup'

param namePrefix string
param tags object = {}
param containerAppId string
param applicationInsightsId string
param applicationUrl string
param alertEmail string = ''

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: '${namePrefix}-ag'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: take(replace(namePrefix, '-', ''), 12)
    enabled: true
    emailReceivers: empty(alertEmail)
      ? []
      : [
          {
            name: 'operations'
            emailAddress: alertEmail
            useCommonAlertSchema: true
          }
        ]
  }
}

resource serverErrors 'Microsoft.Insights/metricAlerts@2026-01-01' = {
  name: '${namePrefix}-server-errors'
  location: 'global'
  tags: tags
  properties: {
    description: 'Container App server errors exceeded the production threshold.'
    severity: 1
    enabled: true
    scopes: [
      applicationInsightsId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'serverErrors'
          metricNamespace: 'microsoft.insights/components'
          metricName: 'requests/failed'
          operator: 'GreaterThan'
          threshold: 5
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    autoMitigate: true
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

resource restarts 'Microsoft.Insights/metricAlerts@2026-01-01' = {
  name: '${namePrefix}-restarts'
  location: 'global'
  tags: tags
  properties: {
    description: 'Container App replicas are restarting repeatedly.'
    severity: 1
    enabled: true
    scopes: [
      containerAppId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'restartCount'
          metricNamespace: 'Microsoft.App/containerApps'
          metricName: 'RestartCount'
          operator: 'GreaterThan'
          threshold: 3
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    autoMitigate: true
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

resource availabilityTest 'Microsoft.Insights/webtests@2022-06-15' = {
  name: '${namePrefix}-availability'
  location: 'global'
  tags: union(tags, {
    'hidden-link:${applicationInsightsId}': 'Resource'
  })
  kind: 'ping'
  properties: {
    Name: '${namePrefix}-availability'
    SyntheticMonitorId: '${namePrefix}-availability'
    Enabled: true
    Frequency: 300
    Timeout: 30
    Kind: 'ping'
    RetryEnabled: true
    Locations: [
      {
        Id: 'us-fl-mia-edge'
      }
      {
        Id: 'us-tx-sn1-azr'
      }
    ]
    Configuration: {
      WebTest: '<WebTest Name="${namePrefix}-availability" Id="00000000-0000-0000-0000-000000000001" Enabled="True" CssProjectStructure="" CssIteration="" Timeout="30" WorkItemIds="" xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010" Description="" CredentialUserName="" CredentialPassword="" PreAuthenticate="True" Proxy="default" StopOnError="False" RecordedResultFile="" ResultsLocale=""><Items><Request Method="GET" Guid="00000000-0000-0000-0000-000000000002" Version="1.1" Url="${applicationUrl}/api/health" ThinkTime="0" Timeout="30" ParseDependentRequests="False" FollowRedirects="True" RecordResult="True" Cache="False" ResponseTimeGoal="0" Encoding="utf-8" ExpectedHttpStatusCode="200" ExpectedResponseUrl="" ReportingName="" IgnoreHttpStatusCode="False" /></Items></WebTest>'
    }
  }
}
