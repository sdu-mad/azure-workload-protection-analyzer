# Cloud Workload Protection Readiness Analyzer

## Azure Architecture and Bicep Study Guide

This document explains the secure workload used by the **Cloud Workload Protection Readiness Analyzer**. It is intended for engineers learning Azure Infrastructure as Code, cloud security fundamentals, governance, and developer tooling.

> The analyzer and its Bicep templates are educational portfolio artifacts. They are not production security scanners and do not replace Microsoft Defender for Cloud, Azure Policy, template validation, threat modeling, or a professional security review.

## Intended Azure naming convention

| Scope or resource | Name |
| --- | --- |
| Subscription | `sub-sdusi-demo` |
| Resource group | `sdusi-analyzer-rg` |
| Container App | `sdusi-analyzer-app` |
| Container Registry | `sdusianalyzeracr` |
| Key Vault | `sdusi-analyzer-kv` |
| Log Analytics workspace | `sdusi-analyzer-law` |
| Container Apps Environment | `sdusi-analyzer-env` |

The React analyzer remains local-only. The Bicep file models a fictional workload that could be deployed separately into Azure.

> **Implementation update:** The repository now also contains an optional end-to-end full-stack deployment. A Node.js/TypeScript API performs authoritative analysis and serves the React portal from one Azure Container App. The Bicep file discussed below remains a fictional analyzer input, while deployable infrastructure lives under `infra/`.

## Full-stack implementation

The deployed application exposes:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/analyze` | Analyze supplied Bicep in memory |
| `GET` | `/api/rules` | Return rule metadata |
| `GET` | `/api/health` | Process liveness |
| `GET` | `/api/ready` | Key Vault-aware readiness |

The API validates request shape and size, rate-limits analysis requests, applies security headers, and never persists or logs submitted Bicep. Production Azure authentication uses a user-assigned managed identity; local development uses the developer's Azure credential chain only when Key Vault connectivity is configured.

Deployable resources are defined in `infra/` and include the required `AcrPull` and `Key Vault Secrets User` assignments. The Container App is publicly reachable for the portfolio portal, which is intentionally different from the internal ingress shown by the fictional secure sample.

---

## Architecture overview

```text
                         Azure Subscription
                         sub-sdusi-demo
                                |
                                v
                         Resource Group
                       sdusi-analyzer-rg
                                |
                                v
User / approved internal client
                                |
                                | Internal ingress
                                v
+-------------------------------------------------------+
| Container Apps Environment                            |
| sdusi-analyzer-env                                    |
|                                                       |
|   +-----------------------------------------------+   |
|   | Container App                                 |   |
|   | sdusi-analyzer-app                            |   |
|   |                                               |   |
|   | System-assigned Managed Identity              |   |
|   +----------------------+------------------------+   |
+--------------------------|----------------------------+
                           |
             +-------------+-------------+------------------+
             |                           |                  |
             v                           v                  v
+------------------------+   +----------------------+   +----------------------+
| Key Vault              |   | Azure Container     |   | Log Analytics        |
| sdusi-analyzer-kv      |   | Registry            |   | sdusi-analyzer-law   |
|                        |   | sdusianalyzeracr     |   |                      |
| Secrets/keys/certs     |   | Container images    |   | Logs and queries     |
+------------------------+   +----------------------+   +----------------------+
             ^                           ^
             |                           |
             +-----------+---------------+
                         |
                  Managed Identity
              authentication + Azure RBAC
```

Condensed view:

```text
User
  |
  v
Container App
  |----> Key Vault
  |----> Azure Container Registry
  |----> Log Analytics
  |----> Managed Identity
```

Managed identity is attached to the Container App rather than being a separate downstream data service. Logs flow through the Container Apps Environment. Because the sample uses `external: false`, a user needs an approved internal network route to reach the application.

---

# Secure Bicep walkthrough

The source file is:

```text
src/samples/secure-workload.bicep
```

## Deployment scope

```bicep
targetScope = 'resourceGroup'
```

This declares that the template deploys resources into an existing Azure resource group. For this project, that group is `sdusi-analyzer-rg`.

The template does not create the subscription or resource group. Select and create them before deploying:

```powershell
az account set --subscription sub-sdusi-demo

az group create `
  --name sdusi-analyzer-rg `
  --location eastus
```

Then deploy the template at resource-group scope:

```powershell
az deployment group create `
  --resource-group sdusi-analyzer-rg `
  --template-file .\src\samples\secure-workload.bicep
```

Resource-group scope limits the template to resources within that group. Subscription-scope resources, such as the resource group itself, would require a subscription-scope template.

## Location parameter

```bicep
param location string = resourceGroup().location
```

This line declares:

- `param`: a configurable deployment input.
- `location`: the parameter name.
- `string`: the parameter's data type.
- `resourceGroup().location`: the default value.

If `sdusi-analyzer-rg` is in `eastus`, the default location is `eastus`. It can be overridden during deployment:

```powershell
az deployment group create `
  --resource-group sdusi-analyzer-rg `
  --template-file .\src\samples\secure-workload.bicep `
  --parameters location=westus2
```

Using one location improves consistency and can reduce latency and cross-region data transfer. A production deployment must verify that every selected service and feature is available in the target region.

The file contains no Bicep variables. It has one parameter and five resource declarations.

---

## Azure Container Registry

```bicep
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
```

This declares an Azure Container Registry:

- `registry` is its Bicep symbolic name.
- `Microsoft.ContainerRegistry/registries` is the resource type.
- `2023-07-01` is the ARM API version.

The symbolic name is used only inside the Bicep template. It is not the deployed registry name.

```bicep
  name: 'sdusianalyzeracr'
```

This sets the deployed Azure resource name. ACR names must be globally unique and cannot contain hyphens. The resulting login server is similar to:

```text
sdusianalyzeracr.azurecr.io
```

Deployment fails if the name is unavailable.

```bicep
  location: location
```

This deploys the registry in the region selected through the `location` parameter.

```bicep
  sku: {
    name: 'Standard'
  }
```

This selects the Standard ACR service tier. The SKU affects storage, throughput, feature availability, and cost. Standard is appropriate for a general-purpose demonstration. Premium is commonly selected when production requirements include private endpoints or geo-replication.

```bicep
  properties: {
    adminUserEnabled: false
  }
```

This disables ACR's built-in administrator account. The administrator account provides broad, long-lived username/password credentials. Disabling it encourages stronger authentication methods:

- Managed identity
- Microsoft Entra service principals
- Repository-scoped tokens where appropriate

The closing braces end the `properties` object and registry declaration.

### What Azure Container Registry is

ACR is a private registry for OCI container images and related artifacts.

### Why it exists

The Container App needs a controlled location from which to pull:

```text
sdusianalyzeracr.azurecr.io/sdusi-analyzer-app:latest
```

### How it works

A build pipeline creates a container image, authenticates to ACR, and pushes it. Container Apps later authenticates and pulls that image to start a revision.

### Security benefits

- Private image storage
- Microsoft Entra authentication
- Azure RBAC
- Integration with image scanning and Defender for Cloud
- Ability to disable broad administrator credentials
- Optional private networking on supported tiers

### Cost considerations

- The registry SKU has a recurring charge.
- Additional storage and transfer may add cost.
- Geo-replication adds cost.
- Premium costs more than Standard.
- Untagged manifests and obsolete images should be cleaned up.

### Common production usage

CI/CD builds and scans an image, assigns an immutable version or digest, pushes it to ACR, and deploys that exact artifact.

### What breaks if it is removed

The Container App's registry and image expressions reference `registry`. Removing ACR without changing those expressions causes Bicep validation to fail. Even if the references were changed, the image would need to exist in another registry.

### Production gap: missing `AcrPull`

The template requests system-identity authentication but does not grant the Container App identity permission to pull images. A production template needs an `AcrPull` role assignment:

```bicep
resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, containerApp.id, 'AcrPull')
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions'
      '7f951dda-4ed3-4680-a7ca-43fe172d538d'
    )
    principalId: containerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}
```

Managed identity supplies authentication, but RBAC supplies authorization. Azure does not infer this role assignment automatically.

---

## Azure Key Vault

```bicep
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
```

This declares an Azure Key Vault:

- `keyVault` is its Bicep symbolic name.
- `Microsoft.KeyVault/vaults` is the resource type.
- `2023-07-01` is the ARM API version.

```bicep
  name: 'sdusi-analyzer-kv'
```

This sets the vault name. Key Vault names are globally unique because they form a public DNS name:

```text
https://sdusi-analyzer-kv.vault.azure.net/
```

```bicep
  location: location
```

This creates the vault in the selected Azure region.

```bicep
  properties: {
```

This starts the service-specific configuration.

```bicep
    tenantId: subscription().tenantId
```

This associates the vault with the Microsoft Entra tenant used by the deployment subscription. The tenant controls the identities that can authenticate to the vault.

An incorrect tenant ID can prevent intended users and workloads from authenticating.

```bicep
    enableRbacAuthorization: true
```

This enables Azure RBAC for Key Vault data-plane authorization. Relevant roles include:

- Key Vault Secrets User
- Key Vault Secrets Officer
- Key Vault Crypto User
- Key Vault Administrator

A workload that only reads secrets should normally receive `Key Vault Secrets User`, not a broad administrative role.

RBAC is preferable to legacy access policies for centralized governance, separation of duties, Azure Privileged Identity Management integration, and consistent role management.

```bicep
    enableSoftDelete: true
```

Soft delete retains deleted vault objects for a recovery period. It protects against accidental deletion, malicious deletion, deployment mistakes, and operator error.

A production vault should also consider:

```bicep
enablePurgeProtection: true
```

Purge protection prevents permanent deletion until the retention period ends.

```bicep
    sku: {
      family: 'A'
      name: 'standard'
    }
```

This selects the Standard Key Vault tier:

- `family: 'A'` is the Azure-defined SKU family.
- `name: 'standard'` selects standard software-protected operations.

Premium is appropriate when HSM-backed keys are required. The closing braces end the SKU, properties, and resource declaration.

### What Key Vault is

Key Vault is a managed service for secrets, cryptographic keys, and certificates.

### Why it exists

Sensitive values should not be stored in source control, Bicep literals, container images, or unprotected environment variables.

### How it works

An identity obtains an Entra token and sends a request to Key Vault. Key Vault evaluates RBAC and network policy before returning the requested object.

### Security benefits

- Central secret management
- Encryption
- Versioning and rotation workflows
- RBAC
- Auditable access
- Soft delete and purge protection
- Firewall and private endpoint support

### Cost considerations

- Charges are generally based on operations.
- Premium and HSM-backed operations cost more.
- Private endpoints introduce networking charges.
- Diagnostic logging produces Log Analytics ingestion.
- Excessive secret retrieval should be avoided through sound application design.

### Common production usage

Applications authenticate with managed identity and retrieve secrets at runtime or use supported platform-level Key Vault references.

### What breaks if it is removed

The Container App references:

```bicep
keyVault.properties.vaultUri
```

Removing the declaration causes Bicep validation to fail. The architecture also loses its central secret-management service.

### Production gaps

The sample does not:

- Create a secret.
- Configure a native Container Apps Key Vault secret reference.
- Assign `Key Vault Secrets User`.
- Disable public network access.
- Create a private endpoint.
- Enable purge protection.
- Configure diagnostic settings.

Passing the vault URI does not prove that the application can access a secret.

---

## Log Analytics workspace

```bicep
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
```

This declares a Log Analytics workspace:

- `logs` is the Bicep symbolic name.
- `Microsoft.OperationalInsights/workspaces` is the resource type.
- `2023-09-01` is the API version.

```bicep
  name: 'sdusi-analyzer-law'
```

This sets the workspace name.

```bicep
  location: location
```

This places the workspace in the selected region. Region affects data residency, compliance, query latency, and integration availability.

```bicep
  properties: {
    retentionInDays: 30
  }
```

This retains workspace data for 30 days.

- Too little retention can weaken investigations.
- Excessive retention can increase cost and retain sensitive telemetry longer than necessary.
- Production retention should follow security, legal, privacy, and compliance requirements.

The closing braces end the properties and resource declarations.

### What Log Analytics is

Log Analytics is Azure Monitor's centralized log store and query platform.

### Why it exists

It receives application and platform telemetry needed for operations and security investigations.

### How it works

Azure services send records to workspace tables. Operators query those records using Kusto Query Language and use them for alerts, dashboards, and investigations.

### Security benefits

- Central evidence collection
- Incident investigation
- Threat detection
- Cross-resource correlation
- Alerting and workbook support
- Microsoft Sentinel integration

### Cost considerations

- Ingested data is normally the main cost driver.
- Longer retention may cost more.
- Verbose debug logging can create unnecessary spend.
- Alerts, exports, and Microsoft Sentinel can add costs.
- Sampling and table plans can help control spending.

### Common production usage

Organizations centralize logs by environment or trust boundary, control workspace access with RBAC, configure retention, and create alerts for security and reliability signals.

### What breaks if it is removed

The Container Apps Environment references the workspace ID and key. Removing the resource without changing the environment causes Bicep validation to fail and removes centralized application logging.

---

## Container Apps Environment

```bicep
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
```

This declares an Azure Container Apps managed environment:

- `environment` is the Bicep symbolic name.
- `Microsoft.App/managedEnvironments` is the resource type.
- `2024-03-01` is the API version.

A managed environment provides a shared hosting, networking, logging, and isolation boundary for one or more Container Apps.

```bicep
  name: 'sdusi-analyzer-env'
  location: location
```

These properties set the environment name and region.

```bicep
  properties: {
    appLogsConfiguration: {
```

This begins the environment's application logging configuration.

```bicep
      destination: 'log-analytics'
```

This sends Container Apps application logs to Log Analytics. Disabling centralized logging weakens operational visibility and incident response.

```bicep
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
```

`logs.properties.customerId` reads the workspace ID from the `logs` resource. Because this is a symbolic reference, Bicep automatically determines that the workspace must exist before the environment.

The customer ID identifies the target workspace. It is not the Azure resource ID and is not itself a secret.

```bicep
        sharedKey: logs.listKeys().primarySharedKey
```

This invokes the workspace's `listKeys` operation and supplies the primary shared key used for log ingestion.

Security considerations:

- The shared key is sensitive.
- It should never be emitted as a Bicep output.
- The deployment identity needs permission to call `listKeys`.
- ARM evaluates this expression during deployment.
- The analyzer does not flag it because it is a resource expression rather than a quoted hardcoded value.

The closing braces end `logAnalyticsConfiguration`, `appLogsConfiguration`, `properties`, and the environment resource.

### What a Container Apps Environment is

It is the common operating boundary for one or more Container Apps.

### Why it exists

A Container App must belong to a managed environment. The environment supplies shared infrastructure for logging, networking, service discovery, revisions, and optional workload profiles.

### How it works

Azure provisions and manages the environment infrastructure. Apps deployed into it share selected environment-level capabilities while retaining app and revision configuration.

### Security benefits

- Workload boundary
- Internal ingress support
- Virtual-network integration options
- Central logging configuration
- Separation between development, test, and production

### Cost considerations

- Workloads and compute profiles drive most cost.
- Dedicated workload profiles create provisioned compute charges.
- Log ingestion adds cost.
- Private networking components can add cost.
- Consumption workloads may scale down when idle.

### Common production usage

Use separate environments for different lifecycle stages or trust boundaries. Do not place unrelated production and nonproduction workloads in the same environment without a deliberate design.

### What breaks if it is removed

The Container App references:

```bicep
environment.id
```

Without an environment, the Container App cannot be created.

---

## Container App

```bicep
resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
```

This declares the running workload:

- `containerApp` is the Bicep symbolic name.
- `Microsoft.App/containerApps` is the resource type.
- `2024-03-01` is the API version.

```bicep
  name: 'sdusi-analyzer-app'
  location: location
```

These properties set the Container App's Azure name and region.

### Managed identity

```bicep
  identity: {
    type: 'SystemAssigned'
  }
```

Azure creates a service principal associated with this Container App.

Properties of a system-assigned identity:

- Azure manages its credentials.
- No client secret is stored in the template.
- Its lifecycle is tied to the Container App.
- Deleting the app deletes the identity.
- It receives no permissions automatically.

This is safer than embedding a service-principal secret, but it still requires narrowly scoped RBAC assignments.

### Environment relationship

```bicep
  properties: {
    managedEnvironmentId: environment.id
```

This attaches the app to `sdusi-analyzer-env`. The expression resolves to the environment's full Azure resource ID.

The reference creates an implicit deployment dependency.

### Ingress

```bicep
    configuration: {
      ingress: {
        external: false
        targetPort: 8080
      }
```

`external: false` configures internal ingress.

Security implications:

- Internal ingress reduces direct Internet exposure.
- Public ingress is not automatically insecure.
- A public workload should add authentication, authorization, TLS, rate limiting, edge protection, and monitoring.
- An internal workload requires a valid private or environment-internal access path.

`targetPort: 8080` routes traffic to port 8080 in the container. The application must listen on that port. A mismatch can result in failed health checks or unreachable revisions.

The port number itself is neither secure nor insecure. Exposure, protocol, authentication, and application behavior determine the risk.

### Registry authentication

```bicep
      registries: [
        {
          server: registry.properties.loginServer
          identity: 'system'
        }
      ]
```

`server` retrieves ACR's login endpoint. The symbolic reference creates an implicit dependency on ACR.

`identity: 'system'` tells Container Apps to authenticate to ACR using the Container App's system-assigned identity.

This is preferred over:

```bicep
username: 'admin-user'
passwordSecretRef: 'acr-password'
```

The identity must still receive `AcrPull`.

### Revision template and image

```bicep
    template: {
      containers: [
        {
          name: 'sdusi-analyzer-app'
```

The `template` defines revision-scoped workload configuration. A revision is an immutable snapshot of the versioned application configuration.

`containers` is an array because a Container App can run the main container and optional sidecars.

The inner `name` identifies the container within the Container App.

```bicep
          image: '${registry.properties.loginServer}/sdusi-analyzer-app:latest'
```

This uses string interpolation to produce:

```text
sdusianalyzeracr.azurecr.io/sdusi-analyzer-app:latest
```

The image must already exist. Bicep and ARM do not build or push container images.

`latest` is acceptable for a simple demo but should not be used for controlled production releases because it is mutable. Prefer:

```bicep
image: '${registry.properties.loginServer}/sdusi-analyzer-app:1.0.3'
```

An image digest provides even stronger immutability:

```text
sdusianalyzeracr.azurecr.io/sdusi-analyzer-app@sha256:...
```

### Key Vault URI

```bicep
          env: [
            {
              name: 'KEY_VAULT_URI'
              value: keyVault.properties.vaultUri
            }
          ]
```

This creates an environment variable named `KEY_VAULT_URI` and assigns the vault endpoint:

```text
https://sdusi-analyzer-kv.vault.azure.net/
```

The URI is not a secret. It tells the application where the vault is.

The application must:

1. Use an Azure Identity credential.
2. Obtain a token through managed identity.
3. Request a named secret.
4. Have a suitable Key Vault role assignment.
5. Be permitted by Key Vault network controls.

Referencing `keyVault.properties.vaultUri` creates an implicit dependency on Key Vault.

The remaining braces close the environment-variable object, environment-variable array, container object, container array, revision template, properties object, and Container App declaration.

### What Azure Container Apps is

Azure Container Apps is a managed platform for HTTP services, APIs, background processors, microservices, and event-driven container workloads.

### Why it exists

It runs the workload image without requiring the team to manage Kubernetes control-plane infrastructure.

### How it works

Container Apps pulls the image, creates a revision, schedules replicas, routes traffic, and scales the workload according to its configuration.

### Security benefits

- Managed identity
- Internal ingress
- Private registry integration
- Revision isolation
- Secret references
- Managed TLS for supported ingress scenarios
- Environment and network isolation options

### Cost considerations

- Consumption workloads charge based on CPU and memory usage.
- Dedicated workload profiles create provisioned compute cost.
- Minimum replicas may create continuous cost.
- Log ingestion adds cost.
- Outbound networking may add cost.
- Scaling configuration affects both latency and spending.

### Common production usage

Container Apps commonly hosts APIs, web applications, microservices, queue consumers, scheduled jobs, and event processors.

### What breaks if it is removed

There is no running application. The registry, vault, environment, and workspace could still exist, but they would support no deployed workload.

---

# Resource relationships

## Container App to Container Apps Environment

```bicep
managedEnvironmentId: environment.id
```

The app runs inside the environment and uses its hosting, logging, networking, and service-discovery capabilities.

## Container App to Managed Identity

```bicep
identity: {
  type: 'SystemAssigned'
}
```

Azure attaches a service principal to the Container App. The app can request Entra tokens without storing credentials. RBAC must separately authorize access.

## Container App to Azure Container Registry

```bicep
server: registry.properties.loginServer
identity: 'system'
```

and:

```bicep
image: '${registry.properties.loginServer}/sdusi-analyzer-app:latest'
```

The app pulls its image from ACR using managed identity. The missing production relationship is:

```text
Container App identity -> AcrPull role assignment -> ACR
```

## Container App to Key Vault

```bicep
value: keyVault.properties.vaultUri
```

The application receives the vault endpoint. A complete production relationship is:

```text
Container App identity
  -> Key Vault Secrets User role
  -> Key Vault
  -> named secret
```

## Container App to Log Analytics

The relationship is indirect:

```text
Container App
  -> Container Apps Environment
  -> Log Analytics workspace
```

The environment forwards application logs to the configured workspace.

---

# Deployment execution

## Prerequisites

Before deployment:

1. `sub-sdusi-demo` must exist and be selected.
2. `sdusi-analyzer-rg` must exist.
3. Required Azure resource providers must be registered.
4. The deployment identity must have sufficient permissions.
5. ACR and Key Vault names must be globally available.
6. The container image must be built and pushed for the revision to become healthy.

## Bicep compilation

Bicep compiles into an ARM JSON template. Symbolic references become ARM expressions and dependency information.

Bicep is declarative: the file describes the desired final state rather than a sequence of commands.

## Effective deployment order

```text
Azure Container Registry ------------------+
                                           |
Key Vault ---------------------------------+--> Container App
                                           |
Log Analytics --> Container Apps Environment
```

### First wave

ARM can create these resources in parallel because they do not reference other declared resources:

- Azure Container Registry
- Key Vault
- Log Analytics workspace

### Second wave

The Container Apps Environment waits for Log Analytics because it references:

```bicep
logs.properties.customerId
logs.listKeys().primarySharedKey
```

### Third wave

The Container App waits for:

- The environment through `environment.id`
- ACR through `registry.properties.loginServer`
- Key Vault through `keyVault.properties.vaultUri`

The system-assigned identity is created as part of the Container App.

## Why explicit `dependsOn` is not required

Bicep infers dependencies from symbolic references. For example:

```bicep
managedEnvironmentId: environment.id
```

automatically means:

```text
containerApp depends on environment
```

This would be redundant:

```bicep
dependsOn: [
  environment
]
```

Explicit `dependsOn` is useful only when a genuine operational dependency exists but no property reference expresses it. Unnecessary dependencies serialize deployment and reduce parallelism.

## ARM processing

Azure Resource Manager:

1. Validates the compiled template.
2. Validates permissions and resource-provider availability.
3. Constructs a dependency graph.
4. Starts resources whose dependencies are satisfied.
5. Runs independent operations in parallel.
6. Evaluates deployment-time functions such as `listKeys()`.
7. Sends each definition to the appropriate resource provider.
8. Tracks operations and reports success or failure.

ARM does not:

- Build or push the container image.
- Grant `AcrPull` automatically.
- Grant Key Vault access automatically.
- Validate the application's runtime behavior.
- Prove that the workload uses Key Vault correctly.

---

# Analyzer rules

The implementation is located in:

```text
src/analyzer/rules.ts
src/analyzer/analyze.ts
```

The MVP uses regular expressions rather than the Bicep abstract syntax tree. It removes line and block comments before evaluating rules.

## Scoring

| Result | Credit |
| --- | ---: |
| Pass | 100% of rule weight |
| Warning | 50% of rule weight |
| Critical | 20% of rule weight |

Critical partial credit is a portfolio scoring decision that places the intentionally insecure sample near the requested demonstration score. A compliance assessment would normally award no credit for a failed control.

## CWP001: Managed Identity Enabled

**Weight:** 20
**Category:** Identity

The analyzer searches for:

```bicep
type: 'SystemAssigned'
```

Secure:

```bicep
identity: {
  type: 'SystemAssigned'
}
```

Insecure:

```bicep
// No identity block
```

or:

```bicep
env: [
  {
    name: 'CLIENT_SECRET'
    value: 'hardcoded-secret'
  }
]
```

Managed identity is preferred because Azure manages the credential lifecycle. The current rule does not verify that the identity belongs specifically to the Container App.

## CWP002: Container Registry Admin Account Disabled

**Weight:** 15
**Category:** Registry

Secure:

```bicep
properties: {
  adminUserEnabled: false
}
```

Insecure:

```bicep
properties: {
  adminUserEnabled: true
}
```

Disabling the administrator account avoids broad, long-lived credentials. Managed identity and RBAC provide stronger scoping and auditing.

The current rule does not verify that the property belongs to ACR, that the Container App uses managed identity, or that `AcrPull` exists.

## CWP003: Key Vault Referenced

**Weight:** 15
**Category:** Secrets

Secure:

```bicep
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'sdusi-analyzer-kv'
  location: location
  properties: {
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    sku: {
      family: 'A'
      name: 'standard'
    }
  }
}
```

Insecure:

```bicep
// No Key Vault resource
```

Key Vault is preferred because it centralizes secret protection, access control, auditability, recovery, and rotation.

The current rule checks only that a Key Vault resource declaration exists. It does not validate RBAC, secret references, networking, or purge protection.

## CWP004: Inline Secrets Not Present

**Weight:** 20
**Category:** Secrets

The analyzer searches for quoted literal properties beginning with:

- `password`
- `secret`
- `apiKey`
- `connectionString`

Secure:

```bicep
env: [
  {
    name: 'KEY_VAULT_URI'
    value: keyVault.properties.vaultUri
  }
]
```

Insecure:

```bicep
password: 'DemoPassword123!'
```

```bicep
apiKey: 'abc123'
```

```bicep
connectionString: 'Server=example;Password=secret'
```

Hardcoded secrets may leak through Git history, pull requests, build logs, deployment history, developer machines, screenshots, or generated templates.

The rule can miss names such as `token`, `credential`, or a generic `value`, and it can produce false positives. It is not entropy detection or taint analysis.

## CWP005: Container App Public Exposure Review

**Weight:** 15
**Category:** Network

Secure:

```bicep
ingress: {
  external: false
  targetPort: 8080
}
```

Requires review:

```bicep
ingress: {
  external: true
  targetPort: 8080
}
```

Internal ingress reduces attack surface. Public ingress can be legitimate but should be protected with authentication, authorization, TLS, rate limiting, WAF or gateway controls, and monitoring.

The rule cannot determine business intent and does not verify compensating controls.

## CWP006: Log Analytics Enabled

**Weight:** 15
**Category:** Monitoring

Secure:

```bicep
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'sdusi-analyzer-law'
  location: location
  properties: {
    retentionInDays: 30
  }
}
```

Insecure:

```bicep
// No Log Analytics workspace
```

Central telemetry supports troubleshooting, alerting, threat detection, and incident investigation.

The current rule only verifies workspace presence. It does not prove that the workload sends logs to it.

---

# Security property reference

| Property | Secure intent | Riskier alternative | Real-world implication |
| --- | --- | --- | --- |
| `targetScope: 'resourceGroup'` | Limit deployment scope | Broad scope without need | Smaller deployment blast radius |
| `location` | Consistent regional deployment | Unsupported or arbitrary regions | Availability, latency, and compliance concerns |
| ACR `sku: Standard` | General-purpose registry | Tier lacking required features | Premium may be required for private networking |
| `adminUserEnabled: false` | Identity-based access | `true` | Broad registry credentials become available |
| Key Vault `tenantId` | Correct Entra authority | Wrong hardcoded tenant | Intended identities cannot authenticate |
| `enableRbacAuthorization: true` | Central RBAC | Legacy access policies | Less consistent governance |
| `enableSoftDelete: true` | Recover deleted objects | Irrecoverable deletion | Greater impact from mistakes or attacks |
| Key Vault `sku: standard` | Standard secret operations | Wrong tier for HSM needs | May not meet cryptographic requirements |
| `retentionInDays: 30` | Investigation history | Too short or excessive | Security, privacy, compliance, and cost effects |
| `destination: 'log-analytics'` | Centralized logging | No destination | Reduced visibility |
| `customerId` | Correct workspace | Wrong workspace | Logs unavailable to intended operators |
| `sharedKey` | Authorized ingestion | Hardcoded literal key | Credential exposure |
| `type: 'SystemAssigned'` | Passwordless workload identity | Embedded client secret | Rotation and leakage risk |
| `managedEnvironmentId` | Correct hosting boundary | Missing or wrong environment | Failed deployment or wrong isolation boundary |
| `external: false` | Internal ingress | Unprotected public ingress | Larger attack surface |
| `targetPort: 8080` | Match app listener | Wrong port | Failed routing and health checks |
| Registry `identity: 'system'` | Managed identity authentication | Username/password | Secret-management burden |
| Image tag `latest` | Demo convenience | Mutable production artifact | Nonrepeatable deployments |
| `KEY_VAULT_URI` | Non-secret endpoint | Secret in environment value | Secret exposure |
| `keyVault.properties.vaultUri` | Derived resource reference | Hardcoded URI | Weaker dependency tracking and portability |

---

# Production-readiness backlog

The sample is intentionally focused. A production implementation should:

1. Add the ACR `AcrPull` role assignment.
2. Add the Key Vault `Key Vault Secrets User` role assignment.
3. Create or reference an actual secret.
4. Enable Key Vault purge protection.
5. Restrict Key Vault public network access.
6. Consider ACR Premium and private endpoints.
7. Use an immutable image tag or digest.
8. Configure CPU, memory, replica limits, and scaling.
9. Configure health probes.
10. Define revision and traffic behavior.
11. Add diagnostic settings where required.
12. Add governance tags.
13. Integrate Azure Policy and Defender for Cloud.
14. Define availability and disaster-recovery requirements.
15. Add Bicep linting, validation, tests, and a controlled deployment pipeline.

---

# End-to-end project completion roadmap

The original local-only analyzer MVP is complete. To turn it into a repeatable Azure Infrastructure-as-Code portfolio project, complete these phases in order.

## Definition of done

The expanded project is complete when a clean checkout can be:

1. Installed, built, linted, and tested.
2. Packaged into a production container.
3. Published to ACR with an immutable version.
4. Deployed through Bicep with required RBAC.
5. Verified in Azure without undocumented portal changes.
6. Demonstrated using the secure and insecure samples.
7. Removed safely through documented cleanup steps.

## Phase 1: Lock the MVP behavior

1. Run `npm install`, `npm run build`, and `npm run lint`.
2. Document the scoring model.
3. Confirm the secure sample scores 100.
4. Confirm the insecure sample scores 37.
5. Keep the educational-use disclaimer visible.

**Completion gate:** The current analyzer builds locally and its expected scores are documented.

## Phase 2: Add automated tests

1. Test each rule from CWP001 through CWP006 with isolated secure and insecure Bicep.
2. Test that public ingress produces a warning.
3. Test score boundaries at 49, 50, 69, 70, 84, and 85.
4. Test that line and block comments do not trigger findings.
5. Test both complete sample files.

**Completion gate:** One test command proves all rules, scoring, labels, and samples.

## Phase 3: Containerize the frontend

1. Add a multi-stage Dockerfile.
2. Build the Vite application in a Node build stage.
3. Serve only `dist` from a minimal runtime web server.
4. Configure SPA fallback.
5. Listen on port 8080.
6. Add a health endpoint.
7. Add `.dockerignore`.
8. Build and run the image locally.

**Completion gate:** The production image serves the analyzer at `http://localhost:8080`.

## Phase 4: Complete the Bicep architecture

1. Move deployable infrastructure into `infra/`.
2. Add parameter files for development.
3. Parameterize location, image tag, ingress mode, and environment metadata.
4. Create ACR, Key Vault, Log Analytics, Container Apps Environment, managed identity, role assignments, and Container App.
5. Prefer a user-assigned identity so `AcrPull` can exist before the first private image pull.
6. Assign `AcrPull` at ACR scope.
7. Assign `Key Vault Secrets User` only if a trusted server-side component needs it.
8. Enable Key Vault RBAC, soft delete, and purge protection.
9. Use an immutable image tag or digest.
10. Configure CPU, memory, replicas, scaling, health probes, revisions, and tags.
11. Output only nonsensitive resource information.

**Completion gate:** Bicep describes the complete architecture and authorization graph without portal-only configuration.

## Phase 5: Validate before deployment

1. Run the Bicep linter.
2. Compile every deployable Bicep file.
3. Run an ARM what-if deployment.
4. Review every proposed create, modify, and delete operation.
5. Confirm that no secret appears in code, parameters, outputs, or logs.
6. Confirm regional availability and deployment permissions.

**Completion gate:** Tests, frontend build, lint, Bicep compilation, and what-if all pass.

## Phase 6: Build and publish the release

1. Select a version such as `1.0.0` or a commit SHA.
2. Build the validated Dockerfile.
3. Push it through ACR Tasks or a controlled CI pipeline.
4. Record the immutable digest.
5. Scan the image using approved tooling.
6. Supply the approved tag or digest to Bicep.

**Completion gate:** ACR contains the approved immutable image.

## Phase 7: Deploy with Bicep

1. Confirm the development subscription and region.
2. Create `sdusi-analyzer-rg` if a subscription-scope entry point does not create it.
3. Deploy the reviewed Bicep and parameter file.
4. Resolve deployment failures in code rather than applying undocumented portal changes.
5. Record the deployment name, timestamp, image version, and result.

**Completion gate:** Bicep creates or updates the complete architecture successfully.

## Phase 8: Verify runtime behavior

1. Confirm the Container App revision is healthy.
2. Confirm it runs the intended image tag or digest.
3. Verify that ACR pulls use managed identity.
4. Verify effective `AcrPull` and Key Vault RBAC.
5. Verify logs arrive in `sdusi-analyzer-law`.
6. Verify the intended internal or external ingress behavior.
7. Confirm the secure sample scores 100.
8. Confirm the insecure sample scores 37.
9. Capture nonsensitive evidence.

**Completion gate:** Azure resource state and application behavior match the documented design.

## Phase 9: Security and governance review

1. Review Defender for Cloud recommendations.
2. Verify least-privilege RBAC.
3. Review Key Vault network exposure.
4. Confirm that no secret is delivered to browser code.
5. Review log retention and expected cost.
6. Document accepted demo risks and production gaps.

**Completion gate:** Implemented controls and accepted limitations are explicit.

## Phase 10: Portfolio handoff

1. Document local run, test, container, publish, validation, deployment, verification, and cleanup commands.
2. Include the architecture study guide and Word portal runbook.
3. Explain that the analyzer evaluates source text rather than deployed Azure state.
4. Prepare the five-minute demo and reviewer answers.
5. Prove the workflow from a clean checkout.
6. Delete the resource group when persistent resources are unnecessary.

**Completion gate:** Another engineer can reproduce the project without undocumented knowledge.

## Evidence to retain

- Successful automated tests
- Successful production frontend build
- Successful local container health check
- Successful Bicep compilation and what-if
- Versioned ACR image
- Successful ARM deployment
- Healthy Container App revision
- Recent Log Analytics records
- Analyzer scores of 100 and 37
- Architecture diagram and limitations

---

# Study guide

## Azure concepts learned

- Azure subscriptions and resource groups
- Resource providers and API versions
- Azure Container Registry
- Azure Key Vault
- Azure Monitor and Log Analytics
- Azure Container Apps
- Container Apps managed environments
- Managed identity
- Microsoft Entra authentication
- Azure RBAC authorization
- Internal and external ingress
- Resource IDs
- Data-plane and management-plane access
- Secret lifecycle management
- Logging retention and cost
- Private image authentication

## Bicep concepts learned

- `targetScope`
- Parameters and default values
- Resource declarations
- Symbolic resource names
- Azure resource types and API versions
- Nested objects and arrays
- String interpolation
- Resource property references
- Runtime functions such as `listKeys()`
- `resourceGroup()` and `subscription()`
- Implicit dependencies
- ARM template compilation
- Declarative deployment
- Parallel resource creation
- Idempotent desired state

## Cloud security concepts learned

- Remove long-lived credentials.
- Prefer managed identity.
- Apply least privilege through RBAC.
- Store secrets in a dedicated secret manager.
- Disable unnecessary administrator access.
- Reduce public network exposure.
- Centralize telemetry.
- Retain logs long enough for investigations.
- Use immutable deployment artifacts.
- Separate authentication from authorization.
- Apply defense in depth.
- Distinguish resource presence from secure configuration.
- Recognize that static pattern matching does not prove security.

---

# Interview questions and answers

## What is Bicep?

Bicep is a declarative language for defining Azure resources. It compiles to ARM JSON and provides concise syntax, symbolic references, type checking, modules, and dependency inference.

## Why use managed identity?

Managed identity lets an Azure resource authenticate to Entra-protected services without storing credentials. Azure manages the identity's credential lifecycle, while RBAC controls its access.

## Does managed identity automatically grant access?

No. Managed identity provides authentication. Role assignments such as `AcrPull` or `Key Vault Secrets User` provide authorization.

## Why disable the ACR administrator account?

The administrator account exposes broad, long-lived credentials. Managed identity and RBAC provide better scoping, auditing, and credential management.

## Why use Key Vault?

Key Vault centralizes secrets, keys, and certificates and provides encryption, RBAC, auditability, versioning, rotation support, and recovery features.

## Is a Key Vault URI a secret?

No. It identifies a vault. Accessing a secret still requires authentication, authorization, and permitted network access.

## Why is `external: false` more secure?

It removes direct public ingress and reduces attack surface. Clients must have an approved internal route.

## Is public ingress always insecure?

No. Public applications need public ingress. The design should then include authentication, TLS, edge protection, rate limiting, monitoring, and secure application controls.

## How does Bicep determine deployment order?

Symbolic resource references create implicit dependencies. ARM builds a dependency graph and deploys independent resources in parallel.

## Why avoid unnecessary `dependsOn`?

Redundant dependencies serialize operations that could run in parallel and make templates harder to maintain.

## What is wrong with `latest`?

`latest` is mutable. The same deployment definition can run different image contents at different times. Immutable tags or digests improve reproducibility and rollback.

## What is the difference between a Container App and its environment?

The Container App is the workload. The environment is the shared hosting, networking, logging, and isolation boundary that contains one or more apps.

---

# Demo reviewer questions and recommended answers

## Does the analyzer parse Bicep?

**Answer:** No. The MVP uses transparent regular-expression checks to demonstrate security-policy concepts. It removes comments and evaluates six deterministic patterns. A production evolution would use the Bicep compiler or syntax tree to scope checks to exact resources and support modules and expressions.

## Can the analyzer prove that a deployment is secure?

**Answer:** No. It is a readiness education tool, not a production security scanner. It does not evaluate runtime state, vulnerabilities, Azure Policy compliance, effective RBAC, network paths, or application security.

## Why does a failed rule receive partial credit?

**Answer:** The portfolio scoring model gives critical results 20% credit so the intentionally insecure sample lands near the requested demonstration score. This is a presentation choice, not a compliance standard. A production assessment would normally award zero credit for a failed control.

## Why is Key Vault presence insufficient?

**Answer:** A vault can exist without being used securely. Real assurance requires validation of RBAC, network controls, secret references, purge protection, diagnostic logging, and runtime access.

## Can the Container App pull its image?

**Answer:** Not from this sample alone. The image must already exist, and the managed identity needs `AcrPull` on ACR. The sample demonstrates identity-based registry configuration but intentionally omits the deployment pipeline and RBAC resource.

## Can the Container App read Key Vault secrets?

**Answer:** It receives the vault URI and has a managed identity, but the sample does not assign `Key Vault Secrets User` or create a secret reference. Those are documented production-hardening steps.

## Why use Log Analytics?

**Answer:** Security controls without observability are difficult to operate. Log Analytics centralizes telemetry for investigation, alerts, troubleshooting, and SIEM integration.

## Why is ingress internal?

**Answer:** The sample defaults to reduced exposure. If the business requires public access, external ingress should be intentionally enabled with authentication, edge protection, rate limiting, and monitoring.

## What should be built next?

**Answer:** Replace regex matching with AST-based Bicep analysis, add RBAC and network rules, support modules, explain evidence for each finding, add automated tests, and compare templates with Azure Policy or Defender for Cloud recommendations.

---

# Five-minute engineering demo

> This project is the Cloud Workload Protection Readiness Analyzer. It is a local React and TypeScript application that evaluates Azure Bicep against six introductory cloud security controls. It is intentionally an educational portfolio project rather than a production vulnerability scanner.
>
> The workload model runs inside the `sub-sdusi-demo` subscription and `sdusi-analyzer-rg` resource group. The primary runtime is an Azure Container App named `sdusi-analyzer-app`, hosted inside the `sdusi-analyzer-env` Container Apps Environment.
>
> The application image is stored in `sdusianalyzeracr`. The registry administrator account is disabled, and the Container App uses its system-assigned managed identity when pulling the image. This avoids registry passwords. In a production version, I would also create an explicit `AcrPull` role assignment.
>
> Sensitive application values belong in `sdusi-analyzer-kv`. The app receives the vault URI rather than an inline secret. It can use managed identity to request a token and retrieve authorized secrets. The demo creates the vault and enables RBAC and soft delete. Production hardening would add `Key Vault Secrets User`, purge protection, network restrictions, and a real secret reference.
>
> The Container Apps Environment forwards application logs to `sdusi-analyzer-law`. Centralized telemetry supports troubleshooting, threat detection, incident investigation, and alerting. The sample retains logs for 30 days, although actual retention should follow cost, compliance, and investigation requirements.
>
> Network exposure is minimized by setting Container Apps ingress to internal. Public ingress is not automatically insecure, but it should be an explicit decision accompanied by authentication, edge protection, rate limiting, and monitoring.
>
> From an Infrastructure-as-Code perspective, the template is declarative. The registry, vault, and workspace can deploy in parallel. The environment waits for the workspace because it references its ID and key. The Container App waits for the environment, registry, and vault because it references properties from each. Bicep infers those dependencies, so explicit `dependsOn` declarations are unnecessary.
>
> The analyzer evaluates managed identity, ACR administrator access, Key Vault presence, inline secrets, public ingress, and Log Analytics. It converts those findings into a weighted score and category dashboard. The secure sample scores 100, while the insecure sample demonstrates failures and remediation guidance.
>
> The central architectural lesson is defense in depth. Managed identity addresses credential management, RBAC supplies authorization, Key Vault protects sensitive values, internal ingress reduces exposure, ACR controls image distribution, and Log Analytics provides visibility. No individual setting makes the workload secure; readiness comes from combining identity, least privilege, secret management, network controls, and monitoring.
>
> The next evolution would introduce AST-based Bicep analysis, explicit RBAC validation, private networking checks, immutable-image validation, policy integration, and automated tests.
