# Operations Runbook

## Service

Cloud Workload Protection Readiness Analyzer on Azure Container Apps.

## Health model

| Endpoint | Purpose | Expected response |
|---|---|---|
| `/api/health` | Process liveness | HTTP 200, `status: ok` |
| `/api/ready` | Traffic readiness and Key Vault access | HTTP 200, `status: ready` |

Container Apps startup and liveness probes use `/api/health`. The readiness probe uses `/api/ready`.

## First response

1. Confirm the active revision and running state.
2. Check `/api/health` and `/api/ready`.
3. Review Container Apps system logs for image pulls, probe failures, scaling, and restarts.
4. Review Application Insights failed requests, exceptions, dependencies, and end-to-end traces.
5. Confirm private DNS resolution for ACR and Key Vault from the deployment network.
6. Confirm the managed identity still has `AcrPull` and `Key Vault Secrets User`.
7. Confirm the environment-specific Entra application credential has not expired.

## Useful commands

```powershell
$resourceGroup = azd env get-value AZURE_RESOURCE_GROUP
$appName = azd env get-value SERVICE_WEB_NAME

az containerapp show `
  --resource-group $resourceGroup `
  --name $appName `
  --query "{revision:properties.latestRevisionName,status:properties.runningStatus,image:properties.template.containers[0].image}"

az containerapp revision list `
  --resource-group $resourceGroup `
  --name $appName `
  --output table

az containerapp logs show `
  --resource-group $resourceGroup `
  --name $appName `
  --follow
```

## Rollback

Deployments use immutable commit-SHA image tags. To roll back:

1. Identify the previous known-good image or revision.
2. Update the Container App to the known-good image digest/tag.
3. Wait for readiness to pass.
4. Re-run health, readiness, API, and browser checks.
5. Record the rollback reason and affected commit.

```powershell
az containerapp update `
  --resource-group $resourceGroup `
  --name $appName `
  --image "<registry>.azurecr.io/cwp-analyzer:<known-good-sha>"
```

## Alert response

### Failed request alert

- Inspect Application Insights `requests`, `exceptions`, and `dependencies`.
- Correlate with `operation_Id`.
- Check whether failures are compilation errors from user input or service failures.
- Compilation failures should return HTTP 422 and must not appear as unhandled exceptions.

### Restart alert

- Inspect Container Apps system logs.
- Check memory and CPU metrics.
- Verify the Bicep compiler timeout and project size limits.
- Confirm the temporary filesystem is writable and has free space.

### Readiness failures

- Query Key Vault availability and private endpoint state.
- Verify private DNS zone links.
- Confirm the identity role assignment and Key Vault firewall settings.

## Data handling

- Submitted Bicep project files are written only to an isolated OS temporary directory.
- External Bicep registry and template-spec modules are rejected.
- The compiler runs with `--no-restore`.
- Temporary files are deleted after success or failure.
- Source is not logged or persisted.

## Environment promotion

- Deploy and verify `dev`.
- Promote the same immutable image SHA to `prod`.
- Production requires GitHub Environment approval.
- Do not rebuild the image between environments.

## Entra credential rotation

1. Add a replacement credential to the environment's Entra application before the current credential expires.
2. Update the matching GitHub Environment secret named `ENTRA_CLIENT_SECRET`.
3. Redeploy and verify an interactive sign-in plus `/api/health` and `/api/ready`.
4. Remove the superseded Entra credential only after the new revision is healthy.
