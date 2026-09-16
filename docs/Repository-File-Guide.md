# Repository File Guide

**Project:** Cloud Workload Protection Readiness Analyzer  
**Repository:** `sdu-mad/azure-workload-protection-analyzer`  
**Purpose:** Explain what every tracked file contains, how the major parts connect, and where common changes should be made.

## 1. Repository at a Glance

The repository contains one full-stack application and the infrastructure required to run it securely on Azure:

1. A React and Vite frontend accepts Bicep source and displays the security score, category results, findings, evidence, and compiler diagnostics.
2. An Express API validates requests, applies limits and rate controls, and invokes the official Bicep compiler.
3. The compiler service builds submitted Bicep into an ARM JSON template inside an isolated temporary directory.
4. The semantic analyzer evaluates the compiled ARM resources against ten cloud workload protection rules.
5. Modular Bicep deploys the application to Azure Container Apps with Entra authentication, private ACR and Key Vault access, managed identity, monitoring, alerts, and a private ACR build pool.
6. GitHub Actions validates the project and supports immutable Azure deployments through workload identity federation.

### Runtime request flow

```text
Browser
  -> React UI
  -> POST /api/analyze
  -> Express validation and rate limiting
  -> isolated temporary Bicep project
  -> official Bicep CLI
  -> compiled ARM template
  -> semantic rule engine
  -> score, categories, findings, evidence, and diagnostics
  -> React dashboard
```

### Azure delivery flow

```text
GitHub Actions OIDC
  -> Azure subscription deployment
  -> private ACR Tasks agent pool
  -> immutable commit-SHA image
  -> Azure Container App revision
  -> health and readiness verification
```

## 2. Root Files

| File | What it holds |
|---|---|
| `.dockerignore` | Excludes local dependencies, build output, Git data, reports, and other unnecessary files from the Docker build context. This reduces image-build size and prevents local artifacts from entering the container build. |
| `.gitignore` | Defines generated files and local-only state that Git must not track, such as dependencies, build output, test reports, environment state, and editor files. |
| `Dockerfile` | Multi-stage production container definition. The build stage compiles the React client and Express server. The runtime stage installs and verifies the pinned Bicep CLI, applies Debian security updates, installs production Node dependencies, removes npm from the final runtime, runs as the non-root `node` user, and exposes the health check. |
| `README.md` | Main project introduction and operator/developer quick start. It explains the architecture, analyzer contract, rules, API, local development, Azure environments, Entra configuration, deployment, CI/CD, and documentation links. |
| `azure.yaml` | Azure Developer CLI project definition. It points AZD to the Bicep infrastructure and Container App service, configures the Docker context, and blocks provisioning when required Entra values are missing. |
| `eslint.config.js` | ESLint flat configuration for TypeScript, React hooks, React refresh, Node server files, tests, and generated-directory exclusions. |
| `index.html` | Vite HTML entry document. It contains the root DOM element into which React mounts the application and references the frontend entry module. |
| `package.json` | Node project manifest. It defines application metadata, local development/build/test scripts, production dependencies, and development tooling. |
| `package-lock.json` | Exact dependency-resolution lock file used by `npm ci`. It makes local, CI, and container dependency installation reproducible. |
| `playwright.config.ts` | Browser end-to-end test configuration. It supports local server startup or an externally deployed URL, optional authenticated storage state, Chromium execution, retries, traces, screenshots, videos, and CI reporting. |
| `tsconfig.json` | Root TypeScript project configuration and project references used to coordinate the client-side TypeScript build. |
| `tsconfig.app.json` | TypeScript settings for React application source, browser libraries, JSX, module resolution, strictness, and Vite-oriented compilation. |
| `tsconfig.node.json` | TypeScript settings for Node-executed configuration files such as Vite configuration. |
| `tsconfig.server.json` | TypeScript settings for the Express server and shared analyzer source used by the server build and server type-check. |
| `vite.config.ts` | Vite frontend build configuration. It enables the React plugin and proxies local `/api` requests to the Express development server on port 3001. |
| `vitest.config.ts` | Unit-test configuration. It includes analyzer, API, and infrastructure test files under `src`, `server`, and `infra`. |

## 3. Local Azure Developer CLI State

| File | What it holds |
|---|---|
| `.azure/.gitignore` | Prevents local AZD environment files and environment secrets from being committed. |
| `.azure/deployment-plan.md` | The authoritative dev deployment implementation record. It describes the target architecture, implementation constraints, application and infrastructure changes, security controls, test plan, live deployment proof, immutable image, RBAC, monitoring, and completion checklist. |

The actual AZD environment values are local and intentionally excluded. Entra secrets and subscription-specific state must never be added to source control.

## 4. GitHub Actions

| File | What it holds |
|---|---|
| `.github/workflows/ci.yml` | Continuous-integration quality gate for pushes and pull requests. It restores dependencies, runs linting and type checks, runs 19 unit/API/infrastructure tests, builds the application, compiles and formats Bicep, builds the container, scans HIGH/CRITICAL vulnerabilities with Trivy, uploads SARIF, generates an SPDX SBOM, and runs Chromium end-to-end tests. Third-party scanning is pinned to an immutable commit. |
| `.github/workflows/deploy.yml` | Manual environment deployment workflow. It signs into Azure through GitHub OIDC, configures AZD, previews and provisions infrastructure, obtains Bicep outputs, builds an immutable image with the private ACR Tasks agent pool, updates the Container App, checks health/readiness, and prints the deployed revision. The repository can describe dev and prod, while the completed operational deployment is dev. |

## 5. Frontend Application

| File | What it holds |
|---|---|
| `src/main.tsx` | Browser entry point. It creates the React root and renders the main `App` component, normally inside React strict mode. |
| `src/App.tsx` | Top-level application orchestration. It loads secure and insecure samples, tracks API status, submits analyses, displays compiler errors, and composes the editor, architecture, dashboard, and findings components. Its request ID guard ensures a slower old request cannot overwrite a newer analysis. |
| `src/api/client.ts` | Typed browser API client. It sends analysis requests, reads the rule catalog and health endpoint, parses JSON responses, and converts API/compiler errors into the `AnalysisApiError` consumed by the UI. |
| `src/components/ArchitectureDiagram.tsx` | React-rendered overview of the Azure resource relationships shown near the top of the application. |
| `src/components/BicepEditor.tsx` | Bicep source input component. It owns the text area/editor controls and the Analyze action while reflecting the loading state. |
| `src/components/FindingsPanel.tsx` | Detailed findings list. It displays rule severity, category, explanation, recommendation, and evidence emitted from the compiled template. |
| `src/components/ScoreCard.tsx` | Reusable overall-score presentation component that displays the numeric score and readiness status. |
| `src/components/SecurityDashboard.tsx` | Analysis summary dashboard. It combines the score card with compilation metadata and category-level security results. |
| `src/styles.css` | Complete visual styling for the page layout, responsive behavior, header, hero, editor, architecture graphic, score cards, findings, statuses, and accessibility-focused states. |
| `src/vite-env.d.ts` | Vite TypeScript declarations, including support for Vite environment types and importing Bicep samples as raw text. |

## 6. Analyzer Domain

| File | What it holds |
|---|---|
| `src/analyzer/types.ts` | Shared type model for rule statuses, security categories, ARM JSON values, rule definitions, findings, category scores, compiler diagnostics, analysis results, and multi-file Bicep projects. These types form the contract between compiler, analyzer, API, tests, and UI. |
| `src/analyzer/analyze.ts` | Scoring engine. It runs every semantic rule, converts rule status into earned weight, calculates the total and category scores, counts analyzed resources, and maps the numeric result to the overall readiness status. |
| `src/analyzer/rules.ts` | Core semantic security rule catalog. It recursively discovers ARM resources, handles nested deployment templates, performs case-insensitive property lookup, detects likely literal secrets, and implements CWP001-CWP010 for identity, registry, secrets, network, monitoring, reliability, and transport controls. |
| `src/analyzer/analyze.test.ts` | Analyzer unit tests using secure and insecure ARM fixtures. It verifies scores, resource discovery, and expected rule outcomes independently from the Bicep compiler. |

### Implemented rules

| Rule | Responsibility |
|---|---|
| `CWP001` | Require managed identity on Container Apps. |
| `CWP002` | Require the ACR administrator account to be disabled. |
| `CWP003` | Require Key Vault to use Azure RBAC authorization. |
| `CWP004` | Detect obvious literal secrets in the compiled template. |
| `CWP005` | Flag public Container App ingress for explicit review. |
| `CWP006` | Require centralized Container Apps logging through Log Analytics. |
| `CWP007` | Require Key Vault public network access to be disabled. |
| `CWP008` | Require ACR public network access to be disabled. |
| `CWP009` | Require liveness and readiness probes. |
| `CWP010` | Require insecure HTTP transport to be disabled. |

## 7. Express API and Compiler Service

| File | What it holds |
|---|---|
| `server/index.ts` | Production server entry point. It initializes telemetry first, creates the Express app with Key Vault readiness and static frontend hosting, listens on the configured port, and performs graceful shutdown for `SIGTERM` and `SIGINT`. |
| `server/app.ts` | Express application factory and API boundary. It applies Helmet, JSON limits, Zod request validation, path traversal protections, file/project size limits, external-module rejection, request rate limiting, health/readiness/rules/analyze endpoints, static React hosting, and explicit error responses. |
| `server/bicepCompiler.ts` | Official Bicep CLI integration. It creates an isolated temporary project, safely writes validated files, invokes Bicep with `build --stdout --no-restore`, enforces timeout/output limits, parses compiler diagnostics, analyzes the resulting ARM template, and deletes temporary files in all outcomes. |
| `server/keyVault.ts` | Key Vault readiness dependency. It uses `DefaultAzureCredential` during local development and managed identity in production, checks access with a five-second timeout, and caches readiness for 30 seconds. |
| `server/telemetry.ts` | Azure Monitor OpenTelemetry bootstrap. It enables Application Insights export when `APPLICATIONINSIGHTS_CONNECTION_STRING` is available. |
| `server/app.test.ts` | API tests for health, readiness, rules, successful analysis, invalid payloads, path restrictions, unsupported external modules, compiler diagnostics, body limits, and server error behavior. |

## 8. Analyzer Samples

| File | What it holds |
|---|---|
| `src/samples/insecure-workload.bicep` | Deliberately weak Azure workload used for demonstrations and negative tests. It contains patterns that trigger critical and warning results and currently scores 23. |
| `src/samples/secure-workload.bicep` | Hardened reference workload used to demonstrate recommended Bicep security settings. It satisfies all ten analyzer controls and scores 100. |

These files are analyzer inputs and teaching examples. They are different from the deployable project infrastructure under `infra`.

## 9. Browser End-to-End Tests

| File | What it holds |
|---|---|
| `e2e/analyzer.spec.ts` | Playwright user-flow tests. It verifies page rendering, insecure and secure sample analysis, score changes, compiler/error presentation, and key interactions in Chromium. It can run locally or against a deployed URL with optional authenticated browser state. |

## 10. Azure Infrastructure Entry Files

| File | What it holds |
|---|---|
| `infra/main.bicep` | Subscription-scoped infrastructure entry point. It validates environment inputs, creates deterministic unique names, creates the resource group, connects every module, selects dev/prod capacity and retention values, passes secure Entra configuration, and emits AZD/GitHub deployment outputs. |
| `infra/main.parameters.json` | Maps AZD environment values into the Bicep parameters: environment name, location, Entra client ID/secret, and alert email. It contains placeholders, not real credentials. |
| `infra/bicepconfig.json` | Bicep linter policy. It enables core analysis and raises important rules—literal admin names, artifacts parameters, hardcoded cloud URLs, secret outputs, and insecure secure-parameter defaults—to errors. |
| `infra/infra.test.ts` | Static infrastructure regression tests. It verifies private networking, authentication exclusions, telemetry/probes, supported alert settings, managed identity and scoped RBAC, and the private ACR build-agent/NAT design. |

## 11. Azure Infrastructure Modules

| File | What it holds |
|---|---|
| `infra/modules/network.bicep` | Creates the VNet and three purpose-specific subnets: Container Apps infrastructure, private endpoints, and ACR build agents. It also creates a Standard public IP and NAT gateway that provide controlled outbound access only for the private build-agent subnet. |
| `infra/modules/private-dns.bicep` | Creates private DNS zones for ACR and Key Vault and links them to the workload VNet so private endpoint names resolve internally. |
| `infra/modules/private-endpoints.bicep` | Creates ACR and Key Vault private endpoints in the private-endpoint subnet and associates each endpoint with its private DNS zone group. |
| `infra/modules/identity.bicep` | Creates the user-assigned managed identity used by the Container App for stable ACR and Key Vault access and outputs its resource, client, and principal IDs. |
| `infra/modules/container-registry.bicep` | Creates Premium ACR with administrator and public network access disabled. It also creates the VNet-connected ACR Tasks agent pool used to build images without opening the registry publicly. |
| `infra/modules/acr-pull-role.bicep` | Grants the Container App managed identity the built-in `AcrPull` role at the registry scope. It does not grant broader subscription or resource-group access. |
| `infra/modules/key-vault.bicep` | Creates the RBAC-enabled, private Key Vault with retention protections and grants the managed identity `Key Vault Secrets User` at vault scope. |
| `infra/modules/monitoring.bicep` | Creates Log Analytics and workspace-based Application Insights, applies environment-specific retention, and securely outputs the workspace key and Application Insights connection string for dependent modules. |
| `infra/modules/container-environment.bicep` | Creates the VNet-integrated Azure Container Apps managed environment and connects platform/application logs to Log Analytics. |
| `infra/modules/container-app.bicep` | Creates the application runtime. It configures external HTTPS ingress, managed identity, private ACR image pull, Key Vault and telemetry environment variables, Entra client secret storage, non-root/read-only hardening, resource limits, scaling, and startup/liveness/readiness probes. |
| `infra/modules/container-app-auth.bicep` | Adds the Container Apps built-in authentication configuration for the pre-created single-tenant Entra application. It redirects unauthenticated users to Entra and excludes only `/api/health` and `/api/ready`. |
| `infra/modules/alerts.bicep` | Creates the Azure Monitor action group, Container App server-error and restart metric alerts, and an Application Insights availability web test for the deployed URL. |

### Infrastructure dependency sequence

```text
Resource group
  -> network, private DNS, identity, ACR, Key Vault, monitoring
  -> private endpoints and RBAC assignments
  -> Container Apps environment
  -> Container App
  -> Entra auth configuration and alerts
```

Bicep infers most dependencies from resource/module output references. Explicit `dependsOn` is used only where deployment order is not fully represented by a direct property reference.

## 12. Documentation and Presentation Files

| File | What it holds |
|---|---|
| `docs/Azure-Portal-Deployment-Guide.docx` | Word-format operator guide for locating and reviewing the deployed Azure resources through the Azure portal. |
| `docs/Cloud-Workload-Protection-Analyzer-Project-Review.pptx` | Project-review presentation deck covering the problem, implementation, architecture, security controls, delivery, and demonstration story. |
| `docs/Cloud-Workload-Protection-Analyzer-Presentation-Notes.md` | Speaker notes for the presentation plus detailed Bicep questions and answers covering scope, naming, modules, identity, private networking, compiler trust, CI, rollback, and the relationship to Azure Policy and Defender for Cloud. |
| `docs/entra-app-registration.md` | Procedure for creating and configuring the single-tenant Microsoft Entra web application, client credential, callback URL, logout URL, and required environment values. |
| `docs/operations-runbook.md` | Operational response guide for health/readiness checks, Azure inspection commands, rollback, alerts, incidents, data handling, environment promotion, and Entra credential rotation. |
| `docs/threat-model.md` | Security threat model describing assets, trust boundaries, primary threats, implemented mitigations, and residual risks. |
| `docs/wiki/cloud-workload-protection-readiness-analyzer.md` | Long-form architecture and Bicep study guide. It explains Azure services, resource relationships, secure sample Bicep, deployment order, rule behavior, scoring, security properties, completion roadmap, interview questions, and demo guidance. |
| `docs/Repository-File-Guide.md` | Source version of this repository guide, suitable for GitHub review and future maintenance. |
| `docs/Repository-File-Guide.docx` | Formatted Word version of this guide for sharing, presentation preparation, and offline reading. |

## 13. Where to Make Common Changes

| Desired change | Primary files |
|---|---|
| Add or modify a security rule | `src/analyzer/rules.ts`, `src/analyzer/types.ts`, `src/analyzer/analyze.test.ts` |
| Change scoring or readiness thresholds | `src/analyzer/analyze.ts`, analyzer tests, `README.md` |
| Change the API contract or request limits | `server/app.ts`, `server/app.test.ts`, `src/api/client.ts`, shared types |
| Change Bicep compilation behavior | `server/bicepCompiler.ts`, API tests, `Dockerfile` |
| Change the UI layout or behavior | `src/App.tsx`, `src/components/*`, `src/styles.css`, E2E tests |
| Add a new Azure resource | `infra/main.bicep`, a new or existing `infra/modules/*.bicep`, `infra/infra.test.ts` |
| Change networking | `infra/modules/network.bicep`, `private-dns.bicep`, `private-endpoints.bicep` |
| Change authentication | `infra/modules/container-app-auth.bicep`, `docs/entra-app-registration.md`, deployment environment settings |
| Change runtime settings, probes, scale, or secrets | `infra/modules/container-app.bicep` |
| Change monitoring or alerts | `infra/modules/monitoring.bicep`, `infra/modules/alerts.bicep`, `docs/operations-runbook.md` |
| Change CI quality gates | `.github/workflows/ci.yml` |
| Change Azure deployment automation | `.github/workflows/deploy.yml`, `azure.yaml`, `infra/main.parameters.json` |
| Update demonstration content | sample Bicep files, presentation deck, presentation notes, wiki |

## 14. Files That Must Not Contain Secrets

No tracked file should contain an Entra client secret, Azure credential, access token, connection string, or local AZD environment value.

Secret-bearing values belong in:

- The local AZD environment, which is ignored by `.azure/.gitignore`.
- GitHub Environment secrets, especially `ENTRA_CLIENT_SECRET`.
- Azure Container App secrets created from secure Bicep parameters.
- Managed identity and RBAC wherever a secret can be avoided entirely.

## 15. Recommended Reading Order

For a new developer or reviewer:

1. `README.md`
2. `docs/Repository-File-Guide.md`
3. `src/App.tsx`
4. `server/app.ts`
5. `server/bicepCompiler.ts`
6. `src/analyzer/rules.ts`
7. `infra/main.bicep`
8. `infra/modules/network.bicep`
9. `infra/modules/container-app.bicep`
10. `.github/workflows/ci.yml`
11. `.github/workflows/deploy.yml`
12. `.azure/deployment-plan.md`
13. `docs/operations-runbook.md`
14. `docs/threat-model.md`
15. `docs/Cloud-Workload-Protection-Analyzer-Presentation-Notes.md`

This order follows the project from purpose, to request processing, to analysis, to Azure deployment, to operations and presentation.
