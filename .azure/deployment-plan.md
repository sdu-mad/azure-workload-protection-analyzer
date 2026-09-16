# Dev Deployment Implementation Record

> **Status:** Deployed

Updated: 2026-09-16

## 1. Objective

Upgrade the Cloud Workload Protection Readiness Analyzer from an educational regex-based portfolio application to a production-oriented implementation and deploy the **dev** environment end to end. Production deployment is intentionally out of scope for this delivery.

The completed system will:

- Compile Bicep with the official Bicep compiler before analysis.
- Analyze the compiled ARM template rather than raw-text regular expressions.
- Resolve local Bicep modules and report compiler diagnostics.
- Protect the application with Microsoft Entra ID built-in Container Apps authentication.
- Use VNet integration and private endpoints for Azure Container Registry and Key Vault.
- Add Application Insights, alerts, availability monitoring, and production health probes.
- Add Bicep, security, dependency, container, and deployment-preview gates to CI.
- Support environment-specific naming, scale, retention, networking, and deployment parameters.
- Preserve the existing user experience while expanding the API contract for multi-file Bicep projects.

## 2. Delivery Mode

| Attribute | Decision |
|---|---|
| Workspace mode | Modify existing deployed application |
| Deployment recipe | Azure Developer CLI with modular Bicep |
| Environment | `dev` deployed; `prod` not executed |
| Runtime | Node.js 22 container on Azure Container Apps |
| Analyzer implementation | Official Bicep CLI compilation plus semantic ARM-template rule evaluation |
| Authentication | Container Apps built-in Microsoft Entra authentication |
| Network | External authenticated app; VNet-integrated environment; private ACR and Key Vault endpoints |
| Observability | Log Analytics and workspace-based Application Insights |
| Persistence | None for submitted Bicep; temporary compilation workspace deleted after every request |

## 3. Important Implementation Constraint

Microsoft does not publish a supported native JavaScript/TypeScript Bicep AST parser. The official parser is implemented in the .NET Bicep codebase.

To keep the existing Node.js application while using supported Bicep semantics, the production analyzer will:

1. Accept an entrypoint plus a validated map of local project files.
2. Write the files to an isolated temporary directory.
3. Invoke a pinned official Bicep CLI binary with `build --stdout --no-restore`.
4. Parse the compiled ARM JSON.
5. Evaluate rules against resource types and effective compiled properties.
6. Return structured compiler diagnostics when compilation fails.
7. Delete the temporary directory in a `finally` block.

External registry module restore will be disabled for anonymous analysis. Local relative modules will be supported. This prevents untrusted requests from triggering network fetches or credential use.

## 4. Application Changes

### Analyzer contract

- Replace `analyzeBicep(source)` with an asynchronous project analysis API.
- Support:
  - Backward-compatible `{ source }` requests.
  - Production `{ entrypoint, files }` requests for local modules.
- Enforce:
  - Maximum file count.
  - Maximum per-file and total project size.
  - Normalized relative paths only.
  - `.bicep` and `.json` file extensions only.
  - Compiler timeout and bounded output.
  - No external module restore.

### Semantic rules

The initial production rule set will evaluate compiled ARM resources for:

- Managed identity configuration.
- ACR admin account disabled.
- Key Vault declaration and RBAC authorization.
- Inline secret-like literal values.
- Public Container App ingress.
- Log Analytics / Container Apps logging.
- Minimum TLS and insecure transport settings where represented.
- Key Vault public network access.
- ACR public network access.
- Health and readiness probe configuration.

Rules will return evidence paths from the compiled template and compiler diagnostics.

### API and UI

- Make `/api/analyze` asynchronous.
- Return compilation status, diagnostics, analyzed resource count, and module-aware findings.
- Keep health endpoints anonymous for platform probes.
- Protect application and analysis endpoints with Container Apps built-in auth in Azure.
- Add UI support for compiler diagnostics and semantic-analysis metadata.
- Keep local development authentication disabled.

### Runtime packaging

- Pin and install the official Bicep CLI in the production image.
- Run as the non-root Node user.
- Keep a read-only application filesystem except for the OS temporary directory.
- Add a Docker health check against `/api/health`.

## 5. Azure Architecture

```text
Authenticated user
      |
      | HTTPS + Microsoft Entra ID
      v
Azure Container App (external ingress)
      |
      | VNet-integrated Container Apps environment
      |
      +--> ACR private endpoint + private DNS
      +--> Key Vault private endpoint + private DNS
      +--> Log Analytics + Application Insights
```

### Resources

| Resource | Dev | Prod |
|---|---|---|
| Resource group | Separate | Separate |
| Container App | 0-2 replicas | 1-4 replicas |
| Container Apps environment | VNet integrated | VNet integrated |
| ACR | Premium, private endpoint | Premium, private endpoint |
| Key Vault | RBAC, private endpoint | RBAC, private endpoint |
| Log Analytics | 30-day retention | 90-day retention |
| Application Insights | Enabled | Enabled |
| Alerts | Basic | Availability, failed requests, server errors, unhealthy revisions |

### Naming

- Derive globally unique resource names from subscription, environment name, and location with `uniqueString()`.
- Keep human-readable prefixes.
- Validate length and allowed characters.
- Remove hardcoded subscription IDs, resource names, and environment tags.

### Identity and RBAC

- Retain a user-assigned managed identity for stable ACR and Key Vault access.
- Grant `AcrPull` only at ACR scope.
- Grant `Key Vault Secrets User` only at Key Vault scope.
- Use managed identity in production and `DefaultAzureCredential` only for local development.
- Use workload identity federation for GitHub Actions Azure access; no client secrets.

### Microsoft Entra authentication

- Add a `Microsoft.App/containerApps/authConfigs` child resource.
- Parameterize the Entra client ID and OpenID issuer.
- Redirect unauthenticated browser requests to Microsoft Entra ID.
- Return HTTP 401 for unauthenticated API requests where appropriate.
- Keep `/api/health` and `/api/ready` available to Container Apps probes through auth exclusions or platform-compatible configuration.
- Do not commit app-registration credentials.
- Supply the Entra application credential through an environment-scoped secret and secure Bicep parameter; store it as a Container App secret and rotate it before expiry.

The Entra app registration is tenant-owned and will be created/configured through the dedicated app-registration workflow or supplied as deployment parameters.

## 6. Bicep Module Changes

| File / module | Planned change |
|---|---|
| `infra/main.bicep` | Environment-aware names, parameters, network, observability, auth wiring |
| `infra/main.parameters.json` | Add AZD environment mappings without secrets |
| `infra/modules/network.bicep` | VNet, Container Apps subnet, private-endpoint subnet |
| `infra/modules/private-dns.bicep` | ACR and Key Vault private DNS zones and VNet links |
| `infra/modules/private-endpoints.bicep` | ACR and Key Vault private endpoints and DNS groups |
| `infra/modules/container-registry.bicep` | Premium SKU, private access, retention and policy hardening |
| `infra/modules/key-vault.bicep` | Private access, RBAC, retention protections |
| `infra/modules/monitoring.bicep` | Log Analytics, Application Insights, action group, alerts |
| `infra/modules/container-environment.bicep` | VNet integration and logs |
| `infra/modules/container-app.bicep` | Real probes, auth inputs, hardened runtime, scale by environment |
| `infra/modules/container-app-auth.bicep` | Microsoft Entra built-in authentication |

## 7. CI/CD and Supply Chain

The GitHub workflow will add:

- `npm ci`
- lint and type-check
- unit/API tests
- production build
- Bicep formatting check and compilation
- Bicep linter configuration
- Docker build
- container vulnerability scan
- dependency review for pull requests
- SBOM generation
- artifact upload
- deployed E2E tests after environment deployment

A separate environment deployment workflow will:

- Use GitHub OIDC / Azure workload identity federation.
- Run subscription-scope `what-if`.
- Require GitHub Environment approval for prod.
- Deploy the same immutable image digest from dev to prod.
- Run post-deployment health, readiness, API, and browser verification.
- Preserve a rollback target.

## 8. Test Plan

### Unit tests

- Compiled ARM semantic rules.
- Resource and nested-resource discovery.
- Secure and insecure templates.
- Module-aware compilation.
- Compiler diagnostics.
- Path traversal rejection.
- File count and total-size limits.
- Timeout and compiler failure behavior.
- Secret-pattern false-positive and false-negative fixtures.

### API tests

- Backward-compatible single-source request.
- Multi-file project request.
- Invalid paths and unsupported extensions.
- Compiler error response.
- Health and readiness.
- Authentication header behavior where handled by the application.

### End-to-end tests

- Local unauthenticated development flow.
- Deployed authenticated browser flow.
- Secure/insecure/module sample results.
- Health/readiness contracts.
- Rule catalog and compiler metadata.

### Infrastructure tests

- `az bicep build`
- Bicep linter
- dev and prod parameter compilation
- subscription deployment `what-if`
- static assertions for private networking, RBAC scope, auth, probes, scale, and observability

## 9. Documentation and Presentation

- Rewrite README and wiki for authenticated production use.
- Add environment provisioning and app-registration instructions.
- Add operations, alert response, rollback, and incident runbooks.
- Add data-handling and threat-model documentation.
- Update the presentation and speaker notes to state the production architecture and semantic analyzer implementation without a portfolio/production distinction.

## 10. Cost and Impact

The selected target materially increases Azure cost:

- ACR Premium is required for private endpoints.
- VNet and private endpoints add hourly/data-processing costs.
- Prod keeps at least one Container App replica.
- Application Insights and 90-day Log Analytics retention add ingestion/retention costs.
- Availability tests and alerting may add monitoring costs.

Provisioning or replacing the current Container Apps environment network configuration may require a new environment because VNet configuration is immutable after creation. Deployment will be handled only after validation and explicit deployment approval.

## 11. Role Assignment Verification

- Status: Verified
- Identity checked: user-assigned Container App managed identity
- Roles confirmed: `AcrPull` at the registry scope; `Key Vault Secrets User` at the vault scope
- Issues: none; both assignments use data-plane roles and resource-level least-privilege scopes

## 12. Validation Proof

Validated on 2026-09-15 and deployed on 2026-09-16 against **Visual Studio Enterprise Subscription** (`279a73de-ecee-43ab-83a2-ccab2c1c1711`) in `eastus`.

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | Pass, 17 tests |
| `npm run build` | Pass |
| `npm run test:e2e` | Pass, 4 Chromium tests |
| `az bicep build --file .\infra\main.bicep --stdout` | Pass |
| Official Bicep formatting | Pass |
| `docker build --tag cwp-analyzer:local .` | Pass |
| Container health and semantic compilation | Pass; Bicep CLI 0.47.16, insecure score 23, secure score 100 |
| `azd show --output json` | Pass; `azure.yaml` parsed |
| `azd package --no-prompt` | Pass |
| `azd provision --preview --no-prompt` | Pass; subscription preview generated with no changes applied |
| Azure Policy assignment review | Pass; only the default Defender for Cloud assignment is present |
| Static RBAC review | Pass; resource-scoped `AcrPull` and `Key Vault Secrets User` |

The dev Entra registration and GitHub OIDC deployment identity are configured outside the repository. The client secret is stored only in the local AZD environment and GitHub `dev` Environment secret.

## 13. Dev Deployment Proof

| Item | Deployed value / result |
|---|---|
| Resource group | `rg-cwp-dev-h4vapl` |
| Region | `eastus` |
| Container App | `cwp-dev-h4vapl-app` |
| Application URL | `https://cwp-dev-h4vapl-app.thankfulsand-0457a63e.eastus.azurecontainerapps.io` |
| Revision | `cwp-dev-h4vapl-app--0000001`; healthy, running, one replica |
| Immutable image | `crdevh4vaplwbckofw.azurecr.io/cwp-analyzer:af33fa1d66c483ec6797d040ca6814d27c95879f` |
| Image digest | `sha256:0c667f055d2641ff7c99e664457deadf81aaa2ebe6a30d5e95ff063080eae4ab` |
| Private build | ACR Tasks run `ca2` on VNet-connected agent pool `devbuild`; succeeded |
| Health | `/api/health` returned HTTP 200 and `status: ok` anonymously |
| Readiness | `/api/ready` returned HTTP 200 and `status: ready`; Key Vault `available` |
| Authentication | Anonymous application and protected API requests redirect to the configured Microsoft Entra tenant |
| Entra callback | `/.auth/login/aad/callback` configured on `cwp-analyzer-dev`; ID-token issuance enabled |
| ACR RBAC | Container App user-assigned identity has `AcrPull` at registry scope |
| Key Vault RBAC | Container App user-assigned identity has `Key Vault Secrets User` at vault scope |
| Network posture | ACR and Key Vault public access disabled; private endpoints and private DNS deployed |
| Monitoring | Application Insights, action group, restart/server-error alerts, and availability web test deployed |
| Azure portal | `https://portal.azure.com/#@/resource/subscriptions/279a73de-ecee-43ab-83a2-ccab2c1c1711/resourceGroups/rg-cwp-dev-h4vapl/overview` |

## 14. Execution Checklist

### Phase 1 - Plan

- [x] Confirm full production target.
- [x] Confirm dev implementation and deployment scope.
- [x] Analyze current application and deployed infrastructure.
- [x] Research official Bicep compiler, Container Apps auth, networking, probes, and monitoring patterns.
- [x] Confirm Azure subscription, region, tenant app-registration approach, and cost acceptance.
- [x] Obtain implementation approval.

### Phase 2 - Implement

- [x] Add semantic compiler service and project request model.
- [x] Replace regex rules with compiled ARM semantic rules.
- [x] Add analyzer security controls and tests.
- [x] Update API and UI.
- [x] Harden the runtime image.
- [x] Add environment-aware Bicep architecture and deploy dev.
- [x] Add Entra auth configuration.
- [x] Add private networking.
- [x] Add Application Insights and alerts.
- [x] Add CI/CD and supply-chain gates.
- [x] Update documentation, runbooks, presentation, and speaker notes.

### Phase 3 - Validate

- [x] All validation checks pass.
  - [x] 1. AZD installation.
  - [x] 2. `azure.yaml` schema validation.
  - [x] 3. AZD environment setup.
  - [x] 4. Authentication check.
  - [x] 5. Subscription and location check.
  - [x] 6. Aspire pre-provisioning checks (not applicable).
  - [x] 7. Provision preview.
  - [x] 8. Build verification.
  - [x] 9. Docker build-context validation.
  - [x] 10. Package validation.
  - [x] 11. Azure Policy validation.
  - [x] 12. Aspire post-provisioning checks (not applicable).
- [x] Set plan status to `Ready for Validation`.
- [x] Invoke the Azure validation workflow.
- [x] Resolve all validation findings.

### Phase 4 - Deploy

- [x] Obtain explicit deployment approval.
- [x] Deploy dev infrastructure.
- [x] Build the immutable image through the private ACR agent pool.
- [x] Deploy and verify the healthy dev Container App revision.
- [x] Configure Entra callback and logout URLs.
- [x] Verify anonymous health/readiness and protected-route login redirects.
- [x] Verify live ACR and Key Vault RBAC.
- [x] Verify alerts and the availability web test.
- [x] Set status to `Deployed`.
- [ ] Complete one interactive Entra user sign-in; this requires the user to authenticate in a browser.

Production promotion and production verification are intentionally excluded from the current scope.
