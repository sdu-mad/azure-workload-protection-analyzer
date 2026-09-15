# Cloud Workload Protection Readiness Analyzer

The Cloud Workload Protection Readiness Analyzer is a production-oriented React and Node.js application that compiles Azure Bicep with the official Bicep compiler and evaluates the resulting ARM template against evidence-backed workload protection rules.

The production architecture uses Microsoft Entra authentication, a VNet-integrated Azure Container Apps environment, private endpoints for Azure Container Registry and Key Vault, managed identity, Application Insights, Log Analytics, alerts, immutable image tags, and dev/prod deployment controls.

## Architecture

```text
Authenticated browser
        |
        | HTTPS + Microsoft Entra ID
        v
Azure Container App
        |-- React/Vite portal
        |-- Node.js/Express API
        |-- Official Bicep CLI
        |-- Compiled ARM semantic analyzer
        |
        +--> ACR private endpoint
        +--> Key Vault private endpoint
        +--> Application Insights + Log Analytics
```

Submitted projects are compiled in isolated temporary directories. External Bicep registry and template-spec modules are rejected, the compiler runs with `--no-restore`, and temporary files are removed after every request.

## Production controls

- Microsoft Entra built-in authentication for Azure-hosted access
- User-assigned managed identity for ACR and Key Vault
- ACR administrator credentials disabled
- ACR Premium and Key Vault private endpoints with private DNS
- Real liveness and readiness probes
- Application Insights OpenTelemetry instrumentation
- Log Analytics retention by environment
- Azure Monitor alerts and availability checks
- Bounded request, project, compiler-output, and execution limits
- Pinned official Bicep CLI with SHA-256 verification in the container image
- GitHub OIDC deployment authentication with no client secret
- Dependency review, container scanning, and SBOM generation

## Semantic analysis

The API accepts either one Bicep file or a local multi-file project.

### Single file

```json
{
  "source": "targetScope = 'resourceGroup'\n..."
}
```

### Local project

```json
{
  "entrypoint": "main.bicep",
  "files": {
    "main.bicep": "module app './modules/app.bicep' = { name: 'app' }",
    "modules/app.bicep": "resource app 'Microsoft.App/containerApps@2026-01-01' = { ... }"
  }
}
```

The production analyzer:

1. Validates paths, extensions, file count, and total size.
2. Rejects external `br:` and `ts:` module references.
3. Compiles the entrypoint with the official Bicep CLI.
4. Returns structured compiler diagnostics on failure.
5. Recursively discovers resources emitted through local modules.
6. Evaluates effective ARM properties and returns evidence paths.

## Rules

| Rule | Control | Weight |
|---|---|---:|
| CWP001 | Managed identity enabled | 15 |
| CWP002 | ACR admin account disabled | 10 |
| CWP003 | Key Vault uses Azure RBAC | 10 |
| CWP004 | No literal inline secrets | 15 |
| CWP005 | Public ingress reviewed | 10 |
| CWP006 | Centralized Container Apps logging | 10 |
| CWP007 | Key Vault public access disabled | 10 |
| CWP008 | ACR public access disabled | 10 |
| CWP009 | Liveness and readiness probes | 5 |
| CWP010 | Insecure HTTP disabled | 5 |

A pass earns full weight, a warning earns half, and a critical finding earns 20% partial credit.

| Score | Status |
|---:|---|
| 0-49 | Poor |
| 50-69 | Needs Improvement |
| 70-84 | Good |
| 85-100 | Ready for Protection |

The secure sample scores 100. The intentionally insecure sample scores 23.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/analyze` | Compile and analyze a Bicep file or local project |
| `GET` | `/api/rules` | Return rule metadata |
| `GET` | `/api/health` | Process liveness |
| `GET` | `/api/ready` | Key Vault-aware traffic readiness |

Azure authentication excludes only `/api/health` and `/api/ready` so platform probes and availability tests can run without interactive login.

## Local development

Prerequisites:

- Node.js 22
- Azure CLI with Bicep installed, or a standalone Bicep CLI

```powershell
npm ci
npm run dev
```

- Portal: `http://localhost:5173`
- API: `http://localhost:3001`
- Authentication is disabled locally.
- Set `BICEP_CLI_PATH` to use a standalone Bicep executable.
- Without `KEY_VAULT_URI`, local readiness reports Key Vault as `not-configured`.

## Validation

```powershell
npm run lint
npm run typecheck
npm test
npm run build
az bicep build --file .\infra\main.bicep --stdout
npx playwright install chromium
npm run test:e2e
docker build -t cwp-analyzer:local .
```

## Azure environments

The infrastructure supports `dev` and `prod`.

| Setting | Dev | Prod |
|---|---:|---:|
| Minimum replicas | 0 | 1 |
| Maximum replicas | 2 | 4 |
| Log retention | 30 days | 90 days |
| Entra authentication | Required | Required |
| VNet and private endpoints | Enabled | Enabled |

Resource names are derived from the environment, subscription, and region. ACR and Key Vault names are globally unique without manual edits.

## Entra application

Create a single-tenant web app registration for each environment and configure:

- Redirect URI: `https://<container-app-host>/.auth/login/aad/callback`
- Front-channel logout: `https://<container-app-host>/.auth/logout`
- ID tokens enabled

Set the client ID in the AZD environment:

```powershell
azd env set ENTRA_CLIENT_ID "<application-client-id>"
azd env set ENTRA_CLIENT_SECRET "<application-client-secret>"
azd env set AZURE_ALERT_EMAIL "<operations-email>"
```

For GitHub deployments, store `ENTRA_CLIENT_SECRET` as an environment secret, not as a repository variable.

See [Microsoft Entra app registration](docs/entra-app-registration.md).

## Provision and deploy

The deployment workflow uses a self-hosted runner with access to the private deployment network and authenticates to Azure with GitHub OIDC.

Manual preparation:

```powershell
azd auth login
azd env new dev
azd env set AZURE_SUBSCRIPTION_ID "<subscription-id>"
azd env set AZURE_LOCATION "eastus"
azd env set ENTRA_CLIENT_ID "<dev-application-client-id>"
azd env set ENTRA_CLIENT_SECRET "<dev-application-client-secret>"
azd env set AZURE_ALERT_EMAIL "<operations-email>"
```

Always run validation and preview before deployment:

```powershell
azd provision --preview --no-prompt
```

Provisioning and deployment are intentionally separate. The GitHub `Deploy` workflow builds an immutable commit-SHA image in ACR, updates the Container App, and verifies health and readiness.

## CI/CD

`.github/workflows/ci.yml` runs:

- dependency restore and dependency review
- lint and type-check
- unit/API/infrastructure tests
- production build
- Bicep compilation and formatting checks
- production container build
- Trivy vulnerability scan
- SPDX JSON SBOM generation
- Chromium end-to-end tests

`.github/workflows/deploy.yml` uses:

- GitHub Environment approval for production
- Azure workload identity federation
- AZD preview and provisioning
- immutable image tags
- post-deployment health/readiness verification

## Documentation

- [Production implementation plan](.azure/deployment-plan.md)
- [Operations runbook](docs/operations-runbook.md)
- [Threat model](docs/threat-model.md)
- [Microsoft Entra app registration](docs/entra-app-registration.md)
- [Architecture and Bicep study guide](docs/wiki/cloud-workload-protection-readiness-analyzer.md)
- [Presentation notes](docs/Cloud-Workload-Protection-Analyzer-Presentation-Notes.md)

## Project structure

```text
├── .azure/
├── .github/workflows/
├── docs/
├── e2e/
├── infra/
│   ├── main.bicep
│   ├── bicepconfig.json
│   └── modules/
├── server/
│   ├── app.ts
│   ├── bicepCompiler.ts
│   ├── keyVault.ts
│   └── telemetry.ts
├── src/
│   ├── analyzer/
│   ├── api/
│   ├── components/
│   └── samples/
├── Dockerfile
├── azure.yaml
└── package.json
```

## Security scope

This analyzer provides deterministic infrastructure-readiness checks. It complements but does not replace Azure Policy, Microsoft Defender for Cloud, container image scanning, threat modeling, penetration testing, or professional security review.
