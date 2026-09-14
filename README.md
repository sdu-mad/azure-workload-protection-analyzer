# Cloud Workload Protection Readiness Analyzer

`sdusi-analyzer-app` is a full-stack React and Node.js portfolio project that evaluates Azure Bicep against six cloud workload protection readiness checks. One production container serves the React portal and a TypeScript API.

> This project is an educational static-readiness analyzer. It does not inspect deployed Azure resources, prove compliance, scan container images, or replace Microsoft Defender for Cloud, Azure Policy, threat modeling, or professional security review.

## Architecture

```text
Browser
   |
   | HTTPS
   v
Azure Container App: sdusi-analyzer-app
   |-- React/Vite portal
   |-- Node.js/Express API
   |-- Shared Bicep analyzer
   |
   +--> Azure Container Registry: sdusianalyzeracr
   +--> Azure Key Vault: sdusi-analyzer-kv
   +--> Log Analytics: sdusi-analyzer-law
```

The API and frontend use the same origin. Bicep source is processed in memory and is not persisted or logged.

## Features

- Bicep editor with secure and insecure sample workloads
- Server-side evaluation through `POST /api/analyze`
- Six deterministic security-readiness rules
- Weighted score, status, category dashboard, and findings
- Health and Key Vault-aware readiness endpoints
- Rule metadata endpoint
- Request validation, body-size limits, rate limiting, and security headers
- Automated analyzer and API tests
- Multi-stage production container
- AZD and modular Bicep infrastructure
- User-assigned managed identity with scoped ACR and Key Vault roles

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/analyze` | Analyze `{ "source": "<bicep>" }` |
| `GET` | `/api/rules` | Return rule metadata |
| `GET` | `/api/health` | Liveness check |
| `GET` | `/api/ready` | Readiness and Key Vault connectivity |

Requests to `/api/analyze` are limited to 200,000 source characters and 30 requests per minute per client. The API never returns Key Vault secret values.

## Scoring

| Rule | Check | Weight |
| --- | --- | ---: |
| CWP001 | System-assigned managed identity | 20 |
| CWP002 | ACR admin account disabled | 15 |
| CWP003 | Key Vault declared | 15 |
| CWP004 | No obvious inline secrets | 20 |
| CWP005 | Container App ingress exposure | 15 |
| CWP006 | Log Analytics declared | 15 |

A pass earns the full weight, a warning earns half, and a critical result retains 20% partial credit for the portfolio scoring model.

| Score | Status |
| ---: | --- |
| 0-49 | Poor |
| 50-69 | Needs Improvement |
| 70-84 | Good |
| 85-100 | Ready for Protection |

The secure sample scores 100. The intentionally insecure sample scores 37.

## Run locally

Prerequisite: Node.js 20.19+ or 22.12+.

```powershell
npm install
npm run dev
```

- Portal: `http://localhost:5173`
- API: `http://localhost:3001`
- Vite proxies `/api` requests to the local API.
- Without `KEY_VAULT_URI`, local readiness reports Key Vault as `not-configured` and remains ready.

## Validate

```powershell
npm run test
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
az bicep build --file .\infra\main.bicep
```

`npm run test:e2e` builds and starts the production application locally, then
runs the Playwright suite in Chromium. To run the same suite against the
deployed Container App instead:

```powershell
$env:E2E_BASE_URL = "https://sdusi-analyzer-app.proudpond-a98f7b2a.eastus.azurecontainerapps.io"
npm run test:e2e
Remove-Item Env:E2E_BASE_URL
```

The suite verifies the initial insecure analysis, secure sample analysis,
edited-Bicep analysis, all six findings, API connectivity, and the health and
rule-catalog contracts. Failure screenshots, videos, traces, and the HTML
report are written to ignored local artifact directories.

The GitHub Actions workflow at `.github/workflows/ci.yml` runs linting,
type-checking, unit/API tests, the production build, and Chromium E2E tests for
pull requests and pushes to `main`.

## Run the production bundle

```powershell
npm run build
$env:PORT = "8080"
npm start
```

Open `http://localhost:8080`.

## Build the container

```powershell
docker build -t sdusi-analyzer-app:1.0.0 .
docker run --rm -p 8080:8080 sdusi-analyzer-app:1.0.0
```

The container runs as the non-root Node user and exposes port 8080.

## Azure deployment

The project uses Azure Developer CLI with Bicep.

### Intended resources

| Resource | Name |
| --- | --- |
| Resource group | `sdusi-analyzer-rg` |
| Container App | `sdusi-analyzer-app` |
| Container Registry | `sdusianalyzeracr` |
| Key Vault | `sdusi-analyzer-kv` |
| Log Analytics | `sdusi-analyzer-law` |
| Container Apps Environment | `sdusi-analyzer-env` |
| User-assigned identity | `sdusi-analyzer-id` |

ACR and Key Vault names are globally unique. If either name is unavailable, update the corresponding value in `infra/main.bicep`.

### Prerequisites

- Azure CLI
- Azure Developer CLI
- Docker or another AZD-compatible container build environment
- Contributor access on the subscription
- User Access Administrator or Role Based Access Control Administrator for RBAC assignments

### Review the deployment

```powershell
az login
az account set --subscription 279a73de-ecee-43ab-83a2-ccab2c1c1711

az deployment sub what-if `
  --location eastus `
  --template-file .\infra\main.bicep `
  --parameters environmentName=dev location=eastus
```

Review every proposed resource operation before deployment.

### Deploy with AZD

```powershell
azd auth login
azd env new dev
azd env set AZURE_SUBSCRIPTION_ID 279a73de-ecee-43ab-83a2-ccab2c1c1711
azd env set AZURE_LOCATION eastus
azd provision --no-prompt

# Run this only after the AcrPull role assignment has propagated.
azd deploy --no-prompt
```

Keep provisioning and application deployment separate so the managed identity's
`AcrPull` assignment can propagate before the production revision starts. Deployment
creates billable Azure resources. The Container App uses public ingress because the
portal is intended to be reachable for a demonstration.

If the local Docker credential helper prevents `azd deploy`, build the same image in
Azure and update the Container App without enabling the ACR admin account:

```powershell
az acr build `
  --registry sdusianalyzeracr `
  --image sdusi-analyzer-app:1.0.0 `
  .

az containerapp update `
  --resource-group sdusi-analyzer-rg `
  --name sdusi-analyzer-app `
  --image sdusianalyzeracr.azurecr.io/sdusi-analyzer-app:1.0.0
```

### Current deployment

The validated development deployment is available at:

<https://sdusi-analyzer-app.proudpond-a98f7b2a.eastus.azurecontainerapps.io>

### Verify

```powershell
azd env get-values
```

Open the `WEB_URL` value and verify:

1. API status shows online.
2. The secure sample scores 100.
3. The insecure sample scores 37.
4. `/api/health` returns HTTP 200.
5. `/api/ready` reports Key Vault as available.
6. The active revision is healthy.
7. Logs arrive in `sdusi-analyzer-law`.

### Remove Azure resources

```powershell
azd down
```

Review the prompt carefully. Key Vault soft delete and purge protection can retain the vault after resource-group deletion.

## Project structure

```text
sdusi-analyzer-app/
├── .azure/
│   └── deployment-plan.md
├── docs/
├── infra/
│   ├── main.bicep
│   ├── main.parameters.json
│   └── modules/
├── server/
│   ├── app.ts
│   ├── app.test.ts
│   ├── index.ts
│   └── keyVault.ts
├── src/
│   ├── analyzer/
│   ├── api/
│   ├── components/
│   ├── samples/
│   ├── App.tsx
│   └── main.tsx
├── .dockerignore
├── Dockerfile
├── azure.yaml
├── package.json
└── README.md
```

## Documentation

- [Architecture and Bicep study guide](docs/wiki/cloud-workload-protection-readiness-analyzer.md)
- [Azure Portal deployment guide](docs/Azure-Portal-Deployment-Guide.docx)
- [Deployment plan](.azure/deployment-plan.md)

## Limitations

- Rules use regular expressions rather than the Bicep AST.
- Modules, symbolic evaluation, and effective Azure state are not analyzed.
- The API is intentionally anonymous for the public portfolio demo.
- Key Vault is used for managed-identity readiness validation; the browser receives no secret.
- The deployable app uses public ingress, while the fictional secure workload sample demonstrates internal ingress.
- A production service should add organizational authentication, private networking where appropriate, policy enforcement, image scanning, and operational alerting.
