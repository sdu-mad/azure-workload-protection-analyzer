import {
  DefaultAzureCredential,
  ManagedIdentityCredential,
  type TokenCredential,
} from '@azure/identity'
import { SecretClient } from '@azure/keyvault-secrets'

export type KeyVaultStatus = 'available' | 'not-configured' | 'unavailable'

export interface KeyVaultReadiness {
  status: KeyVaultStatus
}

const CACHE_DURATION_MS = 30_000

const createCredential = (
  environment: NodeJS.ProcessEnv,
): TokenCredential => {
  if (environment.NODE_ENV !== 'production') {
    return new DefaultAzureCredential()
  }

  const clientId = environment.AZURE_CLIENT_ID
  return clientId
    ? new ManagedIdentityCredential(clientId)
    : new ManagedIdentityCredential()
}

export const createKeyVaultReadinessCheck = (
  environment: NodeJS.ProcessEnv = process.env,
) => {
  const vaultUrl = environment.KEY_VAULT_URI
  let cached:
    | {
        result: KeyVaultReadiness
        expiresAt: number
      }
    | undefined

  return async (): Promise<KeyVaultReadiness> => {
    if (!vaultUrl) {
      return {
        status:
          environment.NODE_ENV === 'production'
            ? 'unavailable'
            : 'not-configured',
      }
    }

    if (cached && cached.expiresAt > Date.now()) {
      return cached.result
    }

    try {
      const client = new SecretClient(vaultUrl, createCredential(environment))
      await client
        .listPropertiesOfSecrets({
          abortSignal: AbortSignal.timeout(5_000),
        })
        .byPage({ maxPageSize: 1 })
        .next()
      cached = {
        result: { status: 'available' },
        expiresAt: Date.now() + CACHE_DURATION_MS,
      }
    } catch {
      cached = {
        result: { status: 'unavailable' },
        expiresAt: Date.now() + CACHE_DURATION_MS,
      }
    }

    return cached.result
  }
}
