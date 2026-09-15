# Cloud Workload Protection Readiness Analyzer - Presentation Notes

## Objective

Present the completed production implementation: semantic Bicep compilation, authenticated Azure hosting, private dependencies, observability, supply-chain controls, and dev/prod delivery.

## Slide 1 - Production implementation

The analyzer is a full production-oriented system. A React portal submits Bicep projects to a Node API. The API invokes a pinned official Bicep compiler, analyzes the effective ARM template, and returns evidence-backed findings. Azure hosts the app behind Microsoft Entra authentication with private ACR and Key Vault connectivity.

## Slide 2 - Why compile Bicep

Raw-text regular expressions cannot resolve modules, variables, parameters, conditions, loops, or effective properties. Microsoft does not publish a supported native TypeScript AST library, so the Node service uses the official Bicep CLI and analyzes compiled ARM JSON. Local modules are supported; external registry and template-spec modules are rejected.

## Slide 3 - Secure analysis boundary

Each request is validated for file count, path safety, extensions, individual size, and total size. Files are written to an isolated temporary directory. Compilation has a timeout and output cap, runs with `--no-restore`, and the directory is deleted after success or failure. Submitted source is not logged or persisted.

## Slide 4 - Production Azure architecture

The public endpoint is protected by Container Apps built-in Microsoft Entra authentication. The Container Apps environment is VNet integrated. ACR Premium and Key Vault have private endpoints and private DNS. The user-assigned identity has only `AcrPull` and `Key Vault Secrets User` at resource scope.

## Slide 5 - Reliability and observability

Startup and liveness probes call `/api/health`; readiness calls `/api/ready` and checks Key Vault access. OpenTelemetry exports traces, requests, dependencies, and exceptions to workspace-based Application Insights. Log Analytics receives Container Apps system and console logs. Alerts cover failed requests, replica restarts, and synthetic availability.

## Slide 6 - Dev and prod

Both environments use the same modules and immutable image. Names derive from subscription, environment, and region. Dev can scale to zero and retains logs for 30 days. Prod keeps one replica, scales to four, and retains logs for 90 days.

## Slide 7 - Supply chain and delivery

CI restores from the lockfile, reviews dependency changes, lints, type-checks, tests, builds, compiles and formats Bicep, builds the production image, scans it with Trivy, creates an SPDX SBOM, and runs browser tests. Deployment uses GitHub OIDC, AZD preview, environment approval, immutable SHA tags, and post-deployment verification.

## Slide 8 - Rule framework

Ten rules evaluate effective ARM properties across identity, secrets, registry, network, monitoring, and reliability. Every result includes evidence. New rules implement the same metadata and evaluation contract, so the API catalog and scoring model remain consistent.

## Slide 9 - Demonstration

1. Sign in with Microsoft Entra ID.
2. Analyze the insecure sample and show score 23.
3. Analyze the secure sample and show score 100.
4. Submit a multi-file local module project.
5. Introduce a Bicep syntax error and show structured compiler diagnostics.
6. Show Application Insights and the active Container App revision.

## Bicep questions and answers

### Why is `main.bicep` subscription scoped?

It creates a separate resource group for each environment. Resource-group-scoped modules are deployed with `scope: resourceGroup`.

### How are resource names made unique?

The template combines the environment with `uniqueString(subscription().id, environmentName, location)`. ACR names remove hyphens and respect the 50-character limit; Key Vault names are truncated to 24 characters.

### Why ACR Premium?

Azure Container Registry private endpoints require the Premium SKU.

### Why a user-assigned identity?

It exists before the Container App revision and has a stable principal. This allows resource-scoped ACR and Key Vault RBAC before the real image is deployed.

### Why is public ingress still enabled?

Users need an internet-reachable application endpoint, but Microsoft Entra authentication blocks anonymous application access. Azure dependencies are private.

### Why is the Container Apps environment VNet integrated?

The app must resolve and reach the ACR and Key Vault private endpoints through private DNS and private IPs.

### Why are health paths excluded from authentication?

Container Apps platform probes and external availability tests need deterministic non-interactive endpoints. The endpoints disclose only service status and dependency availability.

### Why use `@secure()` for outputs and parameters?

Application Insights and Log Analytics connection material must cross module boundaries. Secure decorators prevent normal deployment logs and output display from exposing values.

### Why compile with `--no-restore`?

Anonymous analysis must not fetch external modules, access registries, or use ambient credentials. Local modules are enough for the supported request contract.

### How are modules supported?

The request contains an entrypoint and a map of validated relative files. The files retain their project paths in the temporary workspace, so normal relative module references compile.

### What is analyzed after compilation?

The service recursively traverses ARM resources, including nested deployment templates generated by Bicep modules, and evaluates effective resource types and properties.

### Why not use a TypeScript Bicep AST package?

Microsoft does not publish a supported native JavaScript/TypeScript parser with full Bicep semantics. The official compiler is the supported semantic boundary.

### How is the Bicep compiler trusted?

The production image downloads a pinned official release and validates its SHA-256 digest during the Docker build.

### How are dependencies expressed in Bicep?

Symbolic references and module outputs create implicit dependencies. Explicit `dependsOn` is reserved for ordering requirements that are not otherwise represented.

### Why use private DNS zones?

`privatelink.azurecr.io` and `privatelink.vaultcore.azure.net` map public service names to private endpoint addresses inside the workload VNet.

### How are dev and prod different without duplicating templates?

Conditional variables control scale, address space, and retention. Environment parameters and deterministic naming produce isolated resource groups from one codebase.

### What does CI validate for Bicep?

It compiles the subscription template, enforces the Bicep linter configuration, and verifies formatting for every Bicep file. The deployment workflow adds an Azure-backed preview before provisioning.

### Why separate provisioning and image deployment?

Infrastructure, identity, private endpoints, DNS, and RBAC must exist before the private image can be pulled. The deployment workflow provisions first, builds the immutable image in ACR, then updates the Container App.

### How is rollback handled?

Every image uses the Git commit SHA. Operations can update the Container App to a previously verified SHA and confirm readiness before closing the incident.

### Does this replace Azure Policy or Defender for Cloud?

No. It provides deterministic Bicep readiness feedback. Azure Policy, Defender for Cloud, image scanning, threat modeling, and human review remain separate production controls.
