# Threat Model

## Assets

- Submitted Bicep source.
- Compiled ARM template.
- Azure identity and RBAC configuration.
- Container image and deployment pipeline.
- Application telemetry.

## Trust boundaries

1. Authenticated browser to Container Apps ingress.
2. Express API to isolated temporary compilation directory.
3. Node process to the pinned Bicep CLI.
4. Container App identity to ACR and Key Vault private endpoints.
5. GitHub Actions workload identity to Azure deployment scopes.

## Primary threats and controls

| Threat | Control |
|---|---|
| Anonymous use or abuse | Microsoft Entra built-in authentication and API rate limiting |
| Path traversal | Relative-path schema, segment validation, resolved-path containment check |
| Excessive resource use | File-count, per-file, total-size, compiler-output, and timeout limits |
| External module exfiltration | Reject `br:` and `ts:` modules; compile with `--no-restore` |
| Secret exposure | Managed identity, scoped RBAC, secret references, no source persistence or logging |
| Entra authentication credential theft | Environment-scoped GitHub secret, secure Bicep parameter, Container App secret, documented rotation |
| Dependency compromise | Lockfile restore, dependency review, container scan, SBOM |
| Compiler tampering | Pinned official Bicep binary and SHA-256 verification |
| Public Azure dependency access | ACR and Key Vault private endpoints with private DNS |
| Undetected failure | Health/readiness probes, Application Insights, alerts, immutable image tags |
| Deployment credential theft | GitHub OIDC workload identity; no client secret |

## Residual risks

- The public application endpoint remains internet reachable before Entra authentication.
- Compiler resource limits reduce but cannot eliminate denial-of-service risk.
- Container Apps built-in Entra authentication currently requires an application credential that must be rotated before expiry.
- Semantic rules cover defined controls but do not replace Azure Policy, Defender for Cloud, or human security review.
