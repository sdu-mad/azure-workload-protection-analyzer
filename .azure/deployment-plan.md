# Azure Deployment Plan

> **Status:** Deployed

Generated: 2026-09-13

---

## 1. Project Overview

**Goal:** Expand the Cloud Workload Protection Readiness Analyzer from a browser-only MVP into an Azure-ready full-stack portfolio application. One Azure Container App will serve the React portal and a Node.js/TypeScript API, analyze Bicep on the server, expose health and rule metadata endpoints, verify Key Vault connectivity through managed identity, and deploy through repeatable Bicep Infrastructure as Code.

**Path:** Add Components

The analyzer remains an educational static-readiness tool. It will not claim to scan deployed Azure state or replace Microsoft Defender for Cloud, Azure Policy, image scanning, or professional security review.

---

## 2. Requirements

| Attribute | Value |
|-----------|-------|
| Classification | Portfolio development |
| Scale | Small; single Container App, 0.5 vCPU, 1 GiB, 0-2 replicas |
| Budget | Cost-optimized |
| Subscription | Visual Studio Enterprise Subscription (`279a73de-ecee-43ab-83a2-ccab2c1c1711`) |
| Tenant | `d2f91667-b16e-493b-af5c-62a4034bb8a5` |
| Location | `eastus` |
| Topology | Single container serving React portal and Node.js API |
| Database | None |
| Authentication | None for the portfolio demo |
| API persistence | None; requests are stateless |

### Backend API contract

| Method and path | Purpose |
|-----------------|---------|
| `POST /api/analyze` | Validate request size and analyze supplied Bicep on the server |
| `GET /api/rules` | Return public rule IDs, descriptions, categories, weights, and recommendations |
| `GET /api/health` | Liveness response without checking external dependencies |
| `GET /api/ready` | Readiness response including configured Key Vault connectivity |

The readiness endpoint will never return secret values. Key Vault checks are disabled locally unless explicitly configured. Production uses a user-assigned managed identity; local development uses `DefaultAzureCredential`.

---

## 3. Components Detected

| Component | Type | Technology | Path |
|-----------|------|------------|------|
| Analyzer portal | Frontend | React 19, TypeScript, Vite | `src/` |
| Analysis engine | Shared library | TypeScript and regular-expression rules | `src/analyzer/` |
| Sample workloads | Demo content | Azure Bicep | `src/samples/` |
| Existing secure workload | Educational IaC sample | Azure Bicep | `src/samples/secure-workload.bicep` |
| Documentation | Wiki and Word runbook | Markdown and DOCX | `docs/` |
| Backend API | New component | Node.js, TypeScript, Express | `server/` |
| Production container | New component | Multi-stage Docker and Nginx-free Node static serving | `Dockerfile` |
| Deployable infrastructure | New component | AZD with modular Bicep | `infra/`, `azure.yaml` |
| Automated tests | New component | Vitest and Supertest | `src/**/*.test.ts`, `server/**/*.test.ts` |

### Existing validation

- The current frontend compiles successfully.
- ESLint passes.
- Secure sample expected score: 100.
- Insecure sample expected score: 37 under the selected partial-credit model.
- No backend, API tests, Dockerfile, Azure Developer CLI configuration, or deployable `infra/` tree currently exists.

---

## 4. Recipe Selection

**Selected:** AZD with Bicep

**Rationale:**

- AZD is the default fit for a new Azure-ready containerized application.
- Bicep preserves the project's Infrastructure-as-Code learning goal.
- `azd up` can provision the infrastructure, build/publish the container, configure the registry link, and deploy the application.
- A two-phase Container Apps pattern avoids the system-identity/ACR circular dependency.
- Environment values and deployment outputs are managed consistently.

The educational Bicep files under `src/samples/` remain analyzer inputs. Deployable Bicep will live under `infra/` so demonstration input is not confused with real infrastructure.

---

## 5. Architecture

**Stack:** One public Azure Container App on the Consumption plan

```text
Browser
   |
   | HTTPS
   v
Azure Container App: sdusi-analyzer-app
   |-- Serves React/Vite static assets
   |-- Hosts Node.js/TypeScript API
   |-- Executes the shared Bicep analyzer
   |
   +--> Azure Key Vault: sdusi-analyzer-kv
   |      Managed identity; connectivity/readiness only
   |
   +--> Azure Container Registry: sdusianalyzeracr
   |      AcrPull through managed identity
   |
   +--> Log Analytics: sdusi-analyzer-law
          Container and platform logs
```

### Service mapping

| Component | Azure service | SKU or configuration |
|-----------|---------------|----------------------|
| React portal and API | Azure Container Apps | Consumption, 0.5 vCPU, 1 GiB, 0-2 replicas |
| Container image | Azure Container Registry | Basic for cost optimization; admin disabled |
| Runtime configuration check | Azure Key Vault | Standard, RBAC, soft delete, purge protection |
| Central logs | Log Analytics workspace | 30-day retention |
| Hosting boundary | Container Apps Environment | Consumption |
| Workload identity | User-assigned managed identity | `sdusi-analyzer-id`; avoids first-deployment ACR dependency cycle |

### Security decisions

- API and portal share one origin, so CORS is unnecessary.
- JSON request bodies are capped and validated.
- Bicep source is processed in memory and is never persisted or logged.
- Responses use security headers.
- Production authentication to Azure uses `ManagedIdentityCredential` with the user-assigned client ID.
- Local Azure authentication uses `DefaultAzureCredential`.
- The runtime identity receives `AcrPull` at ACR scope.
- The runtime identity receives `Key Vault Secrets User` at Key Vault scope.
- ACR administrator access remains disabled.
- Key Vault uses RBAC, soft delete, and purge protection.
- No secret value is returned to the browser.
- The app uses an immutable deployment image tag generated by AZD/deployment tooling.
- Public ingress is required for the portfolio portal; this is documented as an intentional difference from the fictional secure workload sample.

### Analyzer integrity improvements

- Move shared rule metadata into serializable definitions usable by frontend and backend.
- Keep rule evaluation deterministic.
- Add tests for every rule, comments, malformed input, request limits, score boundaries, and both samples.
- Frontend calls `POST /api/analyze`; it no longer treats browser-only analysis as the authoritative path.
- A development-only Vite proxy forwards `/api` to the local API.
- API failures are surfaced in the UI rather than silently falling back to local success.

---

## 6. Provisioning Limit Checklist

The Microsoft.App quota extension returned no quota rows for this subscription and region. The required fallback was used: current Azure resource inventory plus official service limits. Current `eastus` count is zero for every planned resource type.

| Resource type | Number to deploy | Total after deployment | Limit or quota | Notes |
|---------------|------------------|------------------------|----------------|-------|
| `Microsoft.App/managedEnvironments` | 1 | 1 | 15 environments per region by default | Official Container Apps quota documentation; within limit |
| `Microsoft.App/containerApps` | 1 | 1 | No fixed app-count limit; 100 Consumption cores per environment default | Planned app uses at most 1 core across two 0.5-core replicas |
| `Microsoft.ContainerRegistry/registries` | 1 | 1 | No quota row or fixed subscription count exposed for this plan | Basic registry; one-resource deployment is not capacity constrained |
| `Microsoft.KeyVault/vaults` | 1 | 1 | 1,000 standard vaults per subscription per region | Official Azure service limits; within limit |
| `Microsoft.OperationalInsights/workspaces` | 1 | 1 | 250 workspaces per subscription per region | Official Azure service limits; within limit |
| `Microsoft.ManagedIdentity/userAssignedIdentities` | 1 | 1 | 1,000 user-assigned identities per subscription | Official Azure service limits; within limit |
| `Microsoft.Authorization/roleAssignments` | 2 | Existing count plus 2 | 4,000 role assignments per subscription | AcrPull and Key Vault Secrets User; within limit |

**Status:** All planned resources are within documented limits.

**Capacity note:** Regional service availability and transient platform capacity are still checked during validation and deployment. No quota increase is required for this small portfolio workload.

---

## 7. Execution Checklist

### Phase 1: Planning

- [x] Analyze workspace
- [x] Gather requirements
- [x] Confirm subscription and location
- [x] Prepare resource inventory
- [x] Fetch quotas and validate capacity
- [x] Scan codebase
- [x] Select recipe
- [x] Plan architecture
- [x] User approved this plan

### Phase 2: Execution

- [x] Load selected service and AZD references
- [x] Refactor analyzer metadata for API serialization
- [x] Implement `POST /api/analyze`
- [x] Implement `GET /api/rules`
- [x] Implement `GET /api/health`
- [x] Implement Key Vault-aware `GET /api/ready`
- [x] Add request validation, size limits, security headers, and explicit error responses
- [x] Integrate the React portal with the API
- [x] Add frontend loading, connectivity, and failure states
- [x] Add analyzer and API tests
- [x] Add a multi-stage production Dockerfile and `.dockerignore`
- [x] Add local combined development scripts
- [x] Generate AZD configuration
- [x] Generate modular Bicep for ACR, Key Vault, Log Analytics, environment, identity, RBAC, and Container App
- [x] Add health and readiness endpoints and container health check
- [x] Update README, wiki, and deployment documentation
- [x] Verify the production portal and API bundle locally
- [x] Update plan status to `Ready for Validation`

### Phase 3: Validation

- [x] Invoke the Azure validation workflow
- [x] 1. AZD installation
- [x] 2. `azure.yaml` schema validation
- [x] 3. AZD environment setup
- [x] 4. AZD authentication check
- [x] 5. Subscription and location check
- [x] 6. Aspire pre-provisioning checks (not applicable)
- [x] 7. Provision preview
- [x] 8. Build verification
- [x] 9. Docker build-context validation
- [x] 10. Package validation
- [x] 11. Azure Policy validation
- [x] 12. Aspire post-provisioning checks (not applicable)
- [x] Static RBAC review
- [x] Confirm no secrets or credentials are committed
- [x] Populate validation proof
- [x] Set status to `Validated`

### Phase 4: Deployment

- [x] Invoke the Azure deployment workflow
- [x] Review cost and high-impact operations before deployment
- [x] Provision infrastructure
- [x] Build and publish the image
- [x] Deploy the Container App revision
- [x] Verify portal, API, Key Vault readiness, RBAC, image identity, and Log Analytics
- [x] Record endpoint and deployment evidence
- [x] Set status to `Deployed`

---

## 8. Validation Proof

| Check | Command | Result | Timestamp |
|-------|---------|--------|-----------|
| Unit and API tests | `npm run test` | Pass: 22 tests | 2026-09-13 |
| Lint | `npm run lint` | Pass | 2026-09-13 |
| TypeScript and production build | `npm run build` | Pass | 2026-09-13 |
| Bicep compilation | `az bicep build --file infra/main.bicep --stdout` | Pass | 2026-09-13 |
| Production runtime | Health, readiness, rules, analysis, and portal requests on port 8080 | Pass; secure score 100 | 2026-09-13 |
| AZD installation | `azd version` | Pass: 1.22.1; upgrade recommended | 2026-09-13 |
| AZD environment | `azd env get-values` | Pass: subscription and eastus configured | 2026-09-13 |
| Docker context | Confirmed `Dockerfile` and `package-lock.json` | Pass | 2026-09-13 |
| Static RBAC review | Reviewed role assignments in `infra/modules` | Pass: AcrPull and Key Vault Secrets User at resource scopes | 2026-09-13 |
| AZD authentication | `azd auth login --check-status` | Pass | 2026-09-13 |
| Provision preview | `azd provision --preview --no-prompt` | Pass: six Azure resources planned, no changes applied | 2026-09-13 |
| Docker image | `docker build --tag sdusi-analyzer-app:validation .` | Pass | 2026-09-13 |
| Container runtime | Production container on port 18080 | Pass: portal, health, readiness contract, and secure score 100 | 2026-09-13 |
| Package validation | `azd package --no-prompt` | Pass | 2026-09-13 |
| Azure Policy validation | Policy assignment review plus successful preview | Pass: Microsoft cloud security benchmark assignment; no preview conflict | 2026-09-13 |

**Validation status:** All planned application, container, infrastructure, packaging, policy, and preview checks passed before deployment.

---

## 9. Deployment Evidence

| Check | Result | Timestamp |
|-------|--------|-----------|
| Azure infrastructure | Provisioning succeeded in `sdusi-analyzer-rg` | 2026-09-14 |
| Production image | ACR cloud build `ca1` succeeded; `sdusianalyzeracr.azurecr.io/sdusi-analyzer-app:1.0.0` | 2026-09-14 |
| Container App revision | `sdusi-analyzer-app--0000001` is healthy, running, and receives 100% of traffic | 2026-09-14 |
| Public endpoint | `https://sdusi-analyzer-app.proudpond-a98f7b2a.eastus.azurecontainerapps.io` returned HTTP 200 and loaded the portal | 2026-09-14 |
| Health API | `GET /api/health` returned `status: ok` | 2026-09-14 |
| Readiness API | `GET /api/ready` returned `status: ready`; Key Vault returned `status: available` | 2026-09-14 |
| Rule catalog | `GET /api/rules` returned all six CWP rules | 2026-09-14 |
| Secure analysis | `POST /api/analyze` returned score 100 and `Ready for Protection` | 2026-09-14 |
| Insecure analysis | `POST /api/analyze` returned score 37 and `Poor` | 2026-09-14 |
| Managed identity | Principal `d37f0169-96eb-4644-9496-ba8d750c13aa` has `AcrPull` on ACR and `Key Vault Secrets User` on Key Vault | 2026-09-14 |
| Log Analytics | `ContainerAppConsoleLogs_CL` contains the production revision startup record on port 8080 | 2026-09-14 |
| Browser E2E | Four Playwright tests passed against both the local production server and deployed Container App | 2026-09-14 |
| CI quality gate | `.github/workflows/ci.yml` runs lint, type-check, unit/API tests, build, and Chromium E2E | 2026-09-14 |

**Deployment status:** The full-stack analyzer is deployed and operational. The application image was built remotely with ACR Tasks after the local Docker credential helper encountered a memory error; ACR admin access remained disabled.

---

## 9. Files to Generate or Modify

| File or path | Purpose | Status |
|--------------|---------|--------|
| `.azure/deployment-plan.md` | Deployment source of truth | Ready for validation |
| `server/` | Node.js/TypeScript API and Azure integration | Complete |
| `src/api/` | Typed frontend API client | Complete |
| `src/**/*.test.ts` | Analyzer tests | Complete |
| `server/**/*.test.ts` | API tests | Complete |
| `Dockerfile` | Production full-stack image | Complete; Docker runtime unavailable locally |
| `.dockerignore` | Minimal, safe container context | Complete |
| `azure.yaml` | AZD service configuration | Complete |
| `infra/main.bicep` | Main Azure deployment entry point | Complete |
| `infra/main.parameters.json` | AZD environment parameter mapping | Complete |
| `infra/modules/` | ACR, identity, RBAC, Key Vault, monitoring, and Container Apps modules | Complete |
| `README.md` | Full-stack local and Azure instructions | Complete |
| `docs/wiki/cloud-workload-protection-readiness-analyzer.md` | Updated architecture and API guide | Complete |

---

## 10. Next Steps

1. Run the mandatory Azure validation workflow.
2. Review validation evidence and unresolved environmental limitations.
3. Request a separate deployment confirmation before creating billable Azure resources.
