import type {
  AnalysisResult,
  BicepProject,
  CompilerDiagnostic,
  SecurityRuleMetadata,
} from '../analyzer/types'

interface ApiError {
  error?: string
  diagnostics?: CompilerDiagnostic[]
}

export class AnalysisApiError extends Error {
  constructor(
    message: string,
    readonly diagnostics: CompilerDiagnostic[] = [],
  ) {
    super(message)
    this.name = 'AnalysisApiError'
  }
}

export interface HealthResponse {
  status: 'ok'
  service: string
  version: string
  timestamp: string
}

const parseResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiError
    throw new AnalysisApiError(
      body.error ?? `Request failed with status ${response.status}`,
      body.diagnostics,
    )
  }

  return response.json() as Promise<T>
}

export const analyzeWorkload = async (
  source: string | BicepProject,
): Promise<AnalysisResult> => {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      typeof source === 'string' ? { source } : source,
    ),
  })

  return parseResponse<AnalysisResult>(response)
}

export const getRules = async (): Promise<SecurityRuleMetadata[]> => {
  const response = await fetch('/api/rules')
  return parseResponse<SecurityRuleMetadata[]>(response)
}

export const getHealth = async (): Promise<HealthResponse> => {
  const response = await fetch('/api/health')
  return parseResponse<HealthResponse>(response)
}
